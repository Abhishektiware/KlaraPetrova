// server.js
// Express server handling payment verification webhook for KlaraPetrova

require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const { activateUserPlan } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());

/**
 * POST /api/payment/verify
 * Expected payload (Razorpay/UPI webhook example):
 * {
 *   payment_id: string,
 *   user_id: string,
 *   plan_id: string, // corresponds to keys in plans.js
 *   amount: number,   // amount in rupees
 *   status: string   // should be "paid" for successful transactions
 * }
 */
app.post('/api/payment/verify', (req, res) => {
  const { payment_id, user_id, plan_id, amount, status } = req.body;

  // Basic validation
  if (!payment_id || !user_id || !plan_id || typeof amount !== 'number' || !status) {
    return res.status(400).json({ success: false, message: 'Invalid payload' });
  }

  if (status !== 'paid') {
    return res.status(400).json({ success: false, message: 'Payment not completed' });
  }

  try {
    activateUserPlan(user_id, plan_id, payment_id);
    return res.json({ success: true, message: 'Plan activated' });
  } catch (err) {
    console.error('Payment verification error:', err);
    return res.status(400).json({ success: false, message: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Payment verification server listening on port ${PORT}`);
});
