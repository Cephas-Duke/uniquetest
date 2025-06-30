const express = require('express');
const axios = require('axios');
const app = express();
const port = process.env.PORT || 3000; // Use cloud port or default to 3000

// Middleware to parse JSON bodies
app.use(express.json());

// Serve static files (e.g., receipts.html, CSS, JS)
app.use(express.static('.'));

// Simple authentication middleware (optional)
const adminAuth = (req, res, next) => {
  const auth = req.headers.authorization;
  // Username: admin, Password: school2024
  const validAuth = 'Basic ' + Buffer.from('admin:school2024').toString('base64');
  
  if (auth === validAuth) {
    next();
  } else {
    res.setHeader('WWW-Authenticate', 'Basic realm="Heriwadi School System"');
    res.status(401).json({ error: 'Authentication required' });
  }
};

// Format phone to international format for Kenya
function formatPhone(phone) {
  if (phone.startsWith("07")) return "254" + phone.slice(1);
  if (phone.startsWith("+")) return phone.slice(1);
  if (phone.startsWith("254")) return phone;
  return phone; // fallback
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Heriwadi School Management System is running',
    timestamp: new Date().toISOString()
  });
});

// Main page route
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/receipts.html');
});

// Protected admin route (optional - uncomment to enable authentication)
// app.get('/admin', adminAuth, (req, res) => {
//   res.sendFile(__dirname + '/receipts.html');
// });

// POST endpoint to handle SMS sending
app.post("/send-sms", async (req, res) => {
  const { phone, message } = req.body;
  const formattedPhone = formatPhone(phone);

  const smsPayload = {
    mobile: formattedPhone,
    message: message,
    partnerID: "371",
    shortcode: "HCS-SCHOOL",
    apikey: "817ed995ee8b687ff0c17b7d64dde6d3"
  };

  try {
    console.log("Sending SMS with payload:", smsPayload);
    
    const response = await axios.post("https://isms.celcomafrica.com/api/services/sendsms", smsPayload, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log("SMS Sent Successfully:", response.data);
    res.json({ success: true, data: response.data });
  } catch (error) {
    console.error("SMS Sending Failed:", error.response?.data || error.message);
    res.status(500).json({ 
      success: false, 
      error: error.response?.data || error.message 
    });
  }
});

// POST endpoint for school fee payment notification
app.post("/notify-fee-payment", async (req, res) => {
  const { studentName, amount, parentPhone, receiptNumber, balance } = req.body;
  
  const message = `Dear parent to ${studentName}, we have received KES ${amount}. Balance: KES ${balance}. Thank you Heriwadi Christian Schools`;
  
  try {
    const formattedPhone = formatPhone(parentPhone);
    
    const smsPayload = {
      mobile: formattedPhone,
      message: message,
      partnerID: "371",
      shortcode: "HCS-SCHOOL",
      apikey: "817ed995ee8b687ff0c17b7d64dde6d3"
    };

    console.log("Sending fee payment notification:", smsPayload);
    
    const response = await axios.post("https://isms.celcomafrica.com/api/services/sendsms", smsPayload, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log("Fee payment notification sent:", response.data);
    res.json({ 
      success: true, 
      message: "Fee payment notification sent successfully",
      smsData: response.data 
    });
  } catch (error) {
    console.error("Failed to send fee payment notification:", error.response?.data || error.message);
    res.status(500).json({ 
      success: false, 
      error: error.response?.data || error.message 
    });
  }
});

// CORS middleware for cross-origin requests (important for cloud deployment)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Start the server
app.listen(port, '0.0.0.0', () => {
  console.log(`🚀 Heriwadi School Management System is running!`);
  console.log(`📱 SMS Service: Active`);
  console.log(`🌐 Server: http://localhost:${port}`);
  console.log(`📅 Started: ${new Date().toLocaleString()}`);
});