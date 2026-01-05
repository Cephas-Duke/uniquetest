<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>H.C.S | School Office Management</title>
  <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" />
  <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.28/jspdf.plugin.autotable.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>

  <style>
    :root {
      --primary-color: #005fa3; --secondary-color: #004080; --accent-color: #00a8e8;
      --light-color: #f8f9fa; --dark-color: #343a40; --success-color: #28a745;
      --danger-color: #dc3545; --warning-color: #ffc107; --info-color: #17a2b8;
      --border-radius: 8px; --box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }
    body { font-family: 'Roboto', sans-serif; background-color: #f5f7fa; margin: 0; }
    header { background: linear-gradient(135deg, var(--primary-color), var(--secondary-color)); color: white; padding: 1rem; text-align: center; }
    nav { background: var(--secondary-color); padding: 0.75rem; display: flex; gap: 1rem; justify-content: center; }
    nav a { color: white; text-decoration: none; padding: 0.5rem 1rem; border-radius: 4px; }
    nav a.active { background: var(--accent-color); }
    .container { max-width: 1100px; margin: 2rem auto; padding: 0 1rem; }
    .card { background: white; border-radius: var(--border-radius); box-shadow: var(--box-shadow); padding: 1.5rem; margin-bottom: 1.5rem; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1rem; }
    .form-group { margin-bottom: 1rem; }
    label { display: block; margin-bottom: 0.4rem; font-weight: 500; }
    input, select { width: 100%; padding: 0.75rem; border: 1px solid #ddd; border-radius: var(--border-radius); }
    .btn { padding: 0.75rem 1.5rem; border: none; border-radius: var(--border-radius); cursor: pointer; color: white; font-weight: bold; }
    .btn-success { background: var(--success-color); }
    .receipt-preview { background: #fffde7; border: 2px dashed #fbc02d; padding: 1rem; margin-top: 1rem; border-radius: var(--border-radius); }
    table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
    th, td { border: 1px solid #eee; padding: 10px; text-align: left; }
    th { background: var(--primary-color); color: white; }
    .modal { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 100; justify-content: center; align-items: center; }
    .modal.show { display: flex; }
    .modal-content { background: white; padding: 2rem; border-radius: 8px; width: 90%; max-width: 600px; }
  </style>
</head>
<body>

<header>
    <h1>Heriwadi Christian Schools Ltd</h1>
    <p>Fee Management System</p>
</header>

<nav>
    <a href="index.html">Dashboard</a>
    <a href="receipts.html" class="active">Receipts</a>
    <a href="students.html">Students</a>
</nav>

<div class="container">
    <div class="card">
        <h2>Issue New Receipt</h2>
        <form id="receiptForm">
            <div class="grid">
                <div class="form-group">
                    <label>Student Name</label>
                    <input type="text" id="studentInput" list="studentList" required placeholder="Search student...">
                    <datalist id="studentList"></datalist>
                </div>
                <div class="form-group">
                    <label>Amount Paid (KES)</label>
                    <input type="number" id="amountPaid" required>
                </div>
                <div class="form-group">
                    <label>Payment Mode</label>
                    <select id="paymentMode">
                        <option value="M-Pesa">M-Pesa</option>
                        <option value="Cash">Cash</option>
                        <option value="Bank">Bank</option>
                    </select>
                </div>
            </div>
            <button type="submit" class="btn btn-success" id="submitBtn">Save & Send SMS</button>
        </form>

        <div id="receiptPreview" class="receipt-preview" style="display: none;">
            <h3 style="color: #f57f17;"><i class="fas fa-print"></i> Receipt Confirmation</h3>
            <div id="previewContent"></div>
            <button class="btn" style="background: #333; margin-top: 10px;" onclick="location.reload()">Done / Clear</button>
        </div>
    </div>

    <div class="card">
        <h3>Recent Transactions</h3>
        <div id="receiptTableContainer"></div>
    </div>
</div>

<script src="https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js"></script>
<script src="https://www.gstatic.com/firebasejs/8.10.1/firebase-firestore.js"></script>
<script>
    const firebaseConfig = {
      apiKey: "AIzaSyBAA6zY40EwbTmWUx1op1cx52C3y0RK3m0",
      authDomain: "heriwadi-manager.firebaseapp.com",
      projectId: "heriwadi-manager",
      storageBucket: "heriwadi-manager.appspot.com",
      messagingSenderId: "654632910809",
      appId: "1:654632910809:web:7c65613d2510402a6663c8"
    };
    firebase.initializeApp(firebaseConfig);
    const db = firebase.firestore();

    let currentTerm = 2; // Adjust as needed
    let currentYear = 2025;

    const getStudentsColl = () => db.collection(`students_${currentYear}_term_${currentTerm}`);
    const getReceiptsColl = () => db.collection(`receipts_${currentYear}_term_${currentTerm}`);

    const FEE_ITEMS = [
        {key: 'tuition', label: 'Tuition'}, {key: 'adm', label: 'Admission'},
        {key: 'medical', label: 'Medical'}, {key: 'lunch', label: 'Lunch'},
        {key: 'uniform', label: 'Uniform'}, {key: 'assessment', label: 'Assessment Fee'},
        {key: 'transport', label: 'Transport'}, {key: 'trip', label: 'Trip'}, 
        {key: 'graduation', label: 'Graduation'}
    ];

    async function populateStudents() {
        const list = document.getElementById('studentList');
        const snap = await getStudentsColl().orderBy('name').get();
        snap.forEach(doc => {
            const s = doc.data();
            const opt = document.createElement('option');
            opt.value = `${s.name} (${s.class})`;
            list.appendChild(opt);
        });
    }

    // --- FIX: Updated SMS Logic to match your server.js ---
    async function sendSMS(phoneNumber, message) {
        try {
            const response = await fetch("/send-sms", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ phoneNumber, message }) // Key changed from phone to phoneNumber
            });
            return await response.json();
        } catch (e) { console.error("SMS Fetch Failed", e); }
    }

    document.getElementById('receiptForm').onsubmit = async (e) => {
        e.preventDefault();
        const btn = document.getElementById('submitBtn');
        btn.disabled = true;
        
        const input = document.getElementById('studentInput').value;
        const paid = parseFloat(document.getElementById('amountPaid').value);
        const mode = document.getElementById('paymentMode').value;
        const name = input.split(' (')[0];

        try {
            const sSnap = await getStudentsColl().where('name', '==', name).get();
            if(sSnap.empty) throw new Error("Student not found");
            
            const sDoc = sSnap.docs[0];
            const sData = sDoc.data();
            
            // Logic: Arrears logic (simplified for this example, adjust if you have a cf function)
            const newPaidTotal = (sData.paid || 0) + paid;
            const newBalance = sData.total - newPaidTotal;
            const rNum = `RCP-${Date.now().toString().slice(-6)}`;

            await db.runTransaction(async t => {
                t.update(sDoc.ref, { paid: newPaidTotal, balance: newBalance });
                t.set(getReceiptsColl().doc(), {
                    name, class: sData.class, paid, balance: newBalance,
                    mode, date: new Date().toISOString(), receiptNumber: rNum
                });
            });

            // SMS Trigger
            if(sData.phone) {
                const msg = `Dear Parent, we have received KES ${paid} for ${name}. New Balance: KES ${newBalance}. Ref: ${rNum}. Thank you.`;
                sendSMS(sData.phone, msg);
            }

            // --- FIX: Sync Balance in Preview ---
            document.getElementById('receiptPreview').style.display = 'block';
            document.getElementById('previewContent').innerHTML = `
                <p><strong>Student:</strong> ${name}</p>
                <p><strong>Amount Paid:</strong> KES ${paid.toLocaleString()}</p>
                <p><strong>Balance:</strong> KES ${newBalance.toLocaleString()}</p>
                <p><strong>Receipt No:</strong> ${rNum}</p>
                <hr>
                <button class="btn btn-success" onclick="printReceiptDirect('${name}', ${paid}, ${newBalance}, '${rNum}', '${sData.class}', ${JSON.stringify(sData).replace(/"/g, '&quot;')})">Print Receipt Now</button>
            `;
            
            updateReceiptTable();
        } catch(err) { alert(err.message); }
        btn.disabled = false;
    };

    function printReceiptDirect(name, paidNow, finalTotalBal, rNum, sClass, sDataStr) {
        const sData = typeof sDataStr === 'string' ? JSON.parse(sDataStr) : sDataStr;
        const printWindow = window.open('', '', 'height=800,width=900');
        
        // Waterfall logic for rows
        let remaining = paidNow;
        let runningPaid = (sData.paid || 0) - paidNow;
        
        let tableRows = "";
        FEE_ITEMS.forEach(item => {
            const charged = sData[item.key] || 0;
            const alreadyPaid = Math.min(charged, runningPaid);
            runningPaid -= alreadyPaid;
            
            const dueBeforeThis = charged - alreadyPaid;
            const paidThisTime = Math.min(dueBeforeThis, remaining);
            remaining -= paidThisTime;
            
            const itemBal = dueBeforeThis - paidThisTime;

            // --- FIX: Showing all items regardless of charge ---
            tableRows += `
                <tr>
                    <td>${item.label}</td>
                    <td>${charged.toLocaleString()}</td>
                    <td>${paidThisTime.toLocaleString()}</td>
                    <td>${itemBal.toLocaleString()}</td>
                </tr>
            `;
        });

        printWindow.document.write(`
            <html>
            <head>
                <style>
                    body { font-family: sans-serif; padding: 20px; }
                    .header { text-align: center; border-bottom: 2px solid #000; margin-bottom: 20px; }
                    table { width: 100%; border-collapse: collapse; }
                    th, td { border: 1px solid #000; padding: 8px; text-align: left; }
                    .total { font-weight: bold; background: #eee; }
                </style>
            </head>
            <body>
                <div class="header">
                    <h2>HERIWADI CHRISTIAN SCHOOLS LTD</h2>
                    <p>OFFICIAL RECEIPT</p>
                </div>
                <p><strong>Receipt:</strong> ${rNum} | <strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
                <p><strong>Student:</strong> ${name} | <strong>Class:</strong> ${sClass}</p>
                <table>
                    <thead><tr><th>Item</th><th>Charged</th><th>Paid</th><th>Balance</th></tr></thead>
                    <tbody>${tableRows}</tbody>
                    <tfoot>
                        <tr class="total"><td colspan="2">TOTAL PAID NOW</td><td colspan="2">KES ${paidNow.toLocaleString()}</td></tr>
                        <tr class="total"><td colspan="2">OVERALL BALANCE</td><td colspan="2">KES ${finalTotalBal.toLocaleString()}</td></tr>
                    </tfoot>
                </table>
            </body>
            </html>
        `);
        printWindow.document.close();
        printWindow.print();
    }

    async function updateReceiptTable() {
        const container = document.getElementById('receiptTableContainer');
        const snap = await getReceiptsColl().orderBy('date', 'desc').limit(10).get();
        let html = `<table><thead><tr><th>Date</th><th>Student</th><th>Paid</th><th>Bal</th><th>Action</th></tr></thead><tbody>`;
        snap.forEach(doc => {
            const r = doc.data();
            html += `
                <tr>
                    <td>${new Date(r.date).toLocaleDateString()}</td>
                    <td>${r.name}</td>
                    <td>${r.paid}</td>
                    <td>${r.balance || 0}</td>
                    <td><button onclick="alert('Use Print Preview above for new receipts')">View</button></td>
                </tr>
            `;
        });
        html += `</tbody></table>`;
        container.innerHTML = html;
    }

    window.onload = () => {
        populateStudents();
        updateReceiptTable();
    };
</script>
</body>
</html>
