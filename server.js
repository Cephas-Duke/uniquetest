const express = require('express');
const axios = require('axios');
const admin = require('firebase-admin');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

// =========================================================
// 1. SETUP FIREBASE ADMIN (Connects Server to Database)
// =========================================================
let serviceAccount;
try {
  // We try/catch this so the app doesn't crash if the key is missing during local tests
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log("✅ Firebase Admin Initialized");
  } else {
    console.log("⚠️ Warning: FIREBASE_SERVICE_ACCOUNT missing. Bank features won't write to DB.");
  }
} catch (e) {
  console.error("❌ Firebase Init Error:", e.message);
}

// Use this to talk to the database
const db = admin.firestore();

// =========================================================
// 2. APP CONFIGURATION
// =========================================================
const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json()); // Parse JSON bodies
app.use(cors()); // Allow cross-origin requests
app.use(express.static(__dirname)); // Serve your HTML/CSS files

// =========================================================
// 3. HELPER FUNCTIONS
// =========================================================

// Helper: Determine Current School Term (You can change this manually here)
const getCurrentContext = () => {
  return { year: 2025, term: 2 };
};

// Helper: Format phone for SMS (Your existing code)
function formatPhone(phone) {
  if (phone.startsWith("07")) return "254" + phone.slice(1);
  if (phone.startsWith("+")) return phone.slice(1);
  if (phone.startsWith("254")) return phone;
  return phone; 
}

// Middleware: Check Bank Password (Security for I&M)
const authenticateBank = (req, res, next) => {
  const bankUser = process.env.BANK_USERNAME;
  const bankPass = process.env.BANK_PASSWORD;

  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ resultCode: 1, message: "Missing Authorization Header" });
  }

  // Decode "Basic base64string"
  const auth = Buffer.from(authHeader.split(' ')[1], 'base64').toString().split(':');
  const user = auth[0];
  const pass = auth[1];

  if (user === bankUser && pass === bankPass) {
    next();
  } else {
    res.status(401).json({ resultCode: 1, message: "Invalid Credentials" });
  }
};

// =========================================================
// 4. EXISTING ROUTES (Frontend & SMS)
// =========================================================

// Main page route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'receipts.html'));
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Heriwadi System Running (SMS + Bank Integrated)',
    timestamp: new Date().toISOString()
  });
});

// POST: Send SMS (Your existing logic)
app.post("/send-sms", async (req, res) => {
  const { phone, message } = req.body;
  const formattedPhone = formatPhone(phone);

  const smsPayload = {
    mobile: formattedPhone,
    message: message,
    partnerID: "371",
    shortcode: "HCS-SCHOOL",
    apikey: "817ed995ee8b687ff0c17b7d64dde6d3" // Note: In future, move this to Environment Variables
  };

  try {
    console.log("Sending SMS...", formattedPhone);
    const response = await axios.post("https://isms.celcomafrica.com/api/services/sendsms", smsPayload, {
      headers: { 'Content-Type': 'application/json' }
    });
    console.log("SMS Success:", response.data);
    res.json({ success: true, data: response.data });
  } catch (error) {
    console.error("SMS Failed:", error.response?.data || error.message);
    res.status(500).json({ success: false, error: error.response?.data || error.message });
  }
});

// =========================================================
// 5. NEW BANK INTEGRATION ROUTES
// =========================================================

[cite_start]// ENDPOINT A: VALIDATE STUDENT [cite: 122]
// Bank asks: "Does student with this ID exist?"
app.post('/api/validate', authenticateBank, async (req, res) => {
  try {
    const { customerRef } = req.body; // The student name/ID sent by bank
    const { year, term } = getCurrentContext();
    
    console.log(`🏦 Bank Validating: ${customerRef}`);

    // Check the correct collection: e.g., students_2025_term_2
    const snapshot = await db.collection(`students_${year}_term_${term}`)
                             .where('name', '==', customerRef).get();

    if (snapshot.empty) {
      [cite_start]// Response for "Student Not Found" [cite: 142]
      return res.json({
        resultCode: 1,
        message: "Student not found",
        customerName: "",
        customerRef: customerRef
      });
    }

    const studentData = snapshot.docs[0].data();
    
    [cite_start]// Response for "Success" [cite: 135]
    return res.json({
      resultCode: 0,
      message: "Customer found",
      customerName: studentData.name,
      customerRef: customerRef
    });

  } catch (error) {
    console.error("Validation Error:", error);
    return res.status(500).json({ resultCode: 1, message: "Internal Server Error" });
  }
});

[cite_start]// ENDPOINT B: RECEIVE PAYMENT [cite: 164]
// Bank says: "Here is the money."
app.post('/api/payment', authenticateBank, async (req, res) => {
  try {
    const paymentData = req.body;
    const { year, term } = getCurrentContext();
    
    [cite_start]// 1. Extract Data from Bank Payload [cite: 204]
    const amount = parseFloat(paymentData.amount);
    const transRef = paymentData.transactionReference;
    const customerRef = paymentData.additions?.customerRef; // Student Name
    const paymentMode = paymentData.paymentType || "BANK";
    const transactionDate = paymentData.transactionDate || new Date().toISOString();

    if (!customerRef) {
      return res.json({ resultCode: 1, resultDesc: "Missing Student Name" });
    }

    console.log(`💰 Processing Payment: ${amount} for ${customerRef}`);

    // 2. Update Database Securely (Transaction)
    await db.runTransaction(async (t) => {
      // Find the student
      const studentQuery = await db.collection(`students_${year}_term_${term}`)
                                   .where('name', '==', customerRef).get();
      
      if (studentQuery.empty) throw new Error(`Student ${customerRef} not found`);

      const studentDoc = studentQuery.docs[0];
      const studentData = studentDoc.data();

      // Calculate new balance
      const currentPaid = (studentData.paid || 0) + amount;
      const newBalance = studentData.total - currentPaid;

      // Create Receipt Record
      const receiptRef = db.collection(`receipts_${year}_term_${term}`).doc();
      const newReceipt = {
        name: studentData.name,
        class: studentData.class,
        studentId: studentDoc.id,
        paid: amount,
        balance: newBalance,
        mode: paymentMode,
        notes: `Bank Auto-Post: ${transRef}`,
        date: transactionDate,
        receiptNumber: transRef,
        term: term,
        year: year,
        source: "BANK_INTEGRATION",
        feeStructure: { // Preserve snapshot of fees
             tuition: studentData.tuition || 0,
             total: studentData.total || 0
        }
      };

      // Commit updates
      t.update(studentDoc.ref, { paid: currentPaid, balance: newBalance });
      t.set(receiptRef, newReceipt);
    });

    [cite_start]// 3. Success Response [cite: 210]
    return res.json({
      resultCode: 0,
      resultDesc: "Payment received successfully",
      erpRefId: transRef
    });

  } catch (error) {
    console.error("Payment Processing Failed:", error);
    return res.json({
      resultCode: 1,
      resultDesc: error.message || "Internal Error",
      erpRefId: null
    });
  }
});

// =========================================================
// 6. START SERVER
// =========================================================
app.listen(port, '0.0.0.0', () => {
  console.log(`🚀 Heriwadi System running on port ${port}`);
  console.log(`📱 SMS Service Active`);
  console.log(`🏦 Bank Integration Active`);
});
