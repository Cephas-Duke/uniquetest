const express = require('express');
const axios = require('axios');
const admin = require('firebase-admin');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(cors());
app.use(express.static(__dirname));

// =========================================================
// 1. SAFE FIREBASE SETUP
// =========================================================
let db = null;

try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const keyString = process.env.FIREBASE_SERVICE_ACCOUNT.replace(/^"|"$/g, '');
    const serviceAccount = JSON.parse(keyString);
    
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    
    db = admin.firestore();
    console.log("✅ Firebase Admin Initialized Successfully");
  } else {
    console.error("⚠️ CRITICAL: FIREBASE_SERVICE_ACCOUNT environment variable is missing.");
  }
} catch (e) {
  console.error("❌ Firebase Init Error. Check your JSON key format.", e.message);
}

// =========================================================
// 2. HELPER FUNCTIONS
// =========================================================
const getCurrentContext = () => {
  return { year: 2025, term: 2 };
};

const authenticateBank = (req, res, next) => {
  const bankUser = process.env.BANK_USERNAME;
  const bankPass = process.env.BANK_PASSWORD;
  const authHeader = req.headers.authorization;

  if (!bankUser || !bankPass) {
    console.error("⚠️ Bank credentials not set in Environment Variables");
    return res.status(500).json({ resultCode: 1, message: "Server Config Error" });
  }

  if (!authHeader) return res.status(401).json({ resultCode: 1, message: "Missing Authorization" });

  const auth = Buffer.from(authHeader.split(' ')[1], 'base64').toString().split(':');
  if (auth[0] === bankUser && auth[1] === bankPass) {
    next();
  } else {
    res.status(401).json({ resultCode: 1, message: "Invalid Credentials" });
  }
};

// =========================================================
// 3. CELCOM AFRICA SMS ENDPOINT
// =========================================================
app.post('/send-sms', async (req, res) => {
    const { phone, message } = req.body;

    if (!phone || !message) {
        return res.status(400).json({ success: false, error: "Missing phone or message" });
    }

    // Celcom Credentials from .env
    const apikey = process.env.CELCOM_API_KEY;
    const partnerID = process.env.CELCOM_PARTNER_ID;
    const shortcode = process.env.CELCOM_SHORTCODE;

    if (!apikey || !partnerID || !shortcode) {
        console.log("⚠️ Celcom Credentials missing in .env. SMS Logged only:", message);
        return res.json({ success: true, message: "SMS Logged (Simulation Mode)" });
    }

    try {
        console.log(`📨 Sending Celcom SMS to ${phone}...`);
        
        // Celcom Africa API Endpoint
        const url = 'https://isms.celcomafrica.com/api/services/sendsms/';
        
        const payload = {
            apikey: apikey,
            partnerID: partnerID,
            message: message,
            shortcode: shortcode,
            mobile: phone
        };

        const response = await axios.post(url, payload, {
            headers: { 'Content-Type': 'application/json' }
        });

        console.log("✅ Celcom Response:", response.data);
        return res.json({ success: true, data: response.data });

    } catch (error) {
        console.error("❌ SMS Failed:", error.message);
        return res.status(500).json({ success: false, error: "SMS Gateway Error" });
    }
});

// =========================================================
// 4. BANK API ROUTES
// =========================================================

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'receipts.html'));
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    database_connected: !!db,
    timestamp: new Date().toISOString()
  });
});

app.post('/api/validate', authenticateBank, async (req, res) => {
  if (!db) return res.status(500).json({ resultCode: 1, message: "Database not connected" });

  try {
    const { customerRef } = req.body;
    const { year, term } = getCurrentContext();
    
    const snapshot = await db.collection(`students_${year}_term_${term}`)
                             .where('name', '==', customerRef).get();

    if (snapshot.empty) {
      return res.json({ resultCode: 1, message: "Student not found" });
    }

    return res.json({
      resultCode: 0,
      message: "Customer found",
      customerName: snapshot.docs[0].data().name,
      customerRef: customerRef
    });
  } catch (error) {
    console.error("Validation Error:", error);
    return res.status(500).json({ resultCode: 1, message: "Internal Error" });
  }
});

app.post('/api/payment', authenticateBank, async (req, res) => {
  if (!db) return res.status(500).json({ resultCode: 1, message: "Database not connected" });

  try {
    const paymentData = req.body;
    const { year, term } = getCurrentContext();
    const amount = parseFloat(paymentData.amount);
    const transRef = paymentData.transactionReference;
    const customerRef = paymentData.additions?.customerRef;

    await db.runTransaction(async (t) => {
      const q = await db.collection(`students_${year}_term_${term}`)
                        .where('name', '==', customerRef).get();
      if (q.empty) throw new Error(`Student ${customerRef} not found`);

      const studentDoc = q.docs[0];
      const newBalance = studentDoc.data().total - ((studentDoc.data().paid || 0) + amount);

      const receiptRef = db.collection(`receipts_${year}_term_${term}`).doc();
      t.set(receiptRef, {
        name: customerRef,
        paid: amount,
        balance: newBalance,
        receiptNumber: transRef,
        date: paymentData.transactionDate || new Date().toISOString(),
        mode: paymentData.paymentType || "BANK",
        term, year
      });
      t.update(studentDoc.ref, { 
        paid: (studentDoc.data().paid || 0) + amount, 
        balance: newBalance 
      });
    });

    return res.json({ resultCode: 0, resultDesc: "Success", erpRefId: transRef });
  } catch (error) {
    console.error("Payment Error:", error);
    return res.json({ resultCode: 1, resultDesc: error.message, erpRefId: null });
  }
});

// Start Server
app.listen(port, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${port}`);
});
