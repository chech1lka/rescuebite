const nodemailer = require("nodemailer");
const env = require("../config/env");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: env.EMAIL_USER,
    pass: env.EMAIL_PASS,
  },
});

// ─── Send verification email ──────────────────────────────────────────────────
const sendVerificationEmail = async (to, token) => {
  const link = `http://localhost:3000/auth/verify-email?token=${token}`;
  await transporter.sendMail({
    from: `"RescueBite" <${env.EMAIL_USER}>`,
    to,
    subject: "Verify your RescueBite account",
    html: `
      <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto">
        <h2 style="color:#00CEC9">🥗 Welcome to RescueBite!</h2>
        <p>Click the button below to verify your email address:</p>
        <a href="${link}" style="display:inline-block;padding:12px 24px;background:#00CEC9;color:white;text-decoration:none;border-radius:6px;font-weight:bold">
          Verify Email
        </a>
        <p style="color:#636E72;font-size:12px;margin-top:20px">
          Link expires in 24 hours. If you didn't register, ignore this email.
        </p>
      </div>
    `,
  });
};

// ─── Send password reset email ────────────────────────────────────────────────
const sendPasswordResetEmail = async (to, token) => {
  const link = `http://localhost:3000/auth/reset-password?token=${token}`;
  await transporter.sendMail({
    from: `"RescueBite" <${env.EMAIL_USER}>`,
    to,
    subject: "Reset your RescueBite password",
    html: `
      <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto">
        <h2 style="color:#E17055">🔐 Password Reset</h2>
        <p>Click the button below to reset your password:</p>
        <a href="${link}" style="display:inline-block;padding:12px 24px;background:#E17055;color:white;text-decoration:none;border-radius:6px;font-weight:bold">
          Reset Password
        </a>
        <p style="color:#636E72;font-size:12px;margin-top:20px">
          Link expires in 1 hour. If you didn't request this, ignore this email.
        </p>
      </div>
    `,
  });
};

// ─── Send order confirmation ──────────────────────────────────────────────────
const sendOrderConfirmation = async (to, order) => {
  await transporter.sendMail({
    from: `"RescueBite" <${env.EMAIL_USER}>`,
    to,
    subject: `Order Confirmed — #${order.id.slice(0, 8).toUpperCase()}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto">
        <h2 style="color:#00B894">✅ Order Confirmed!</h2>
        <p>Your order has been placed successfully.</p>
        <div style="background:#F8F9FA;padding:16px;border-radius:8px;margin:16px 0">
          <p><strong>Order ID:</strong> #${order.id.slice(0, 8).toUpperCase()}</p>
          <p><strong>Total:</strong> ${order.totalPrice}₸</p>
          <p><strong>Delivery type:</strong> ${order.deliveryType}</p>
          <p><strong>Status:</strong> ${order.status}</p>
        </div>
        <p style="color:#636E72;font-size:12px">Thank you for helping reduce food waste! 🌱</p>
      </div>
    `,
  });
};

// ─── Send vendor approval notification ───────────────────────────────────────
const sendVendorApprovedEmail = async (to, storeName) => {
  await transporter.sendMail({
    from: `"RescueBite" <${env.EMAIL_USER}>`,
    to,
    subject: "Your RescueBite vendor account is approved!",
    html: `
      <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto">
        <h2 style="color:#6C5CE7">🎉 You're approved!</h2>
        <p>Your store <strong>${storeName}</strong> has been approved by our team.</p>
        <p>You can now start listing food items and reduce waste in Almaty!</p>
        <p style="color:#636E72;font-size:12px">Welcome to the RescueBite family 🥗</p>
      </div>
    `,
  });
};

// ─── Send auction won notification ────────────────────────────────────────────
const sendAuctionWonEmail = async (to, auctionData) => {
  await transporter.sendMail({
    from: `"RescueBite" <${env.EMAIL_USER}>`,
    to,
    subject: "🏆 You won the auction!",
    html: `
      <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto">
        <h2 style="color:#FDCB6E">🏆 Auction Won!</h2>
        <p>Congratulations! You won the flash auction.</p>
        <div style="background:#F8F9FA;padding:16px;border-radius:8px;margin:16px 0">
          <p><strong>Item:</strong> ${auctionData.listingName}</p>
          <p><strong>Your winning bid:</strong> ${auctionData.winningBid}₸</p>
          <p><strong>Order created automatically</strong></p>
        </div>
        <p style="color:#636E72;font-size:12px">Pick up your order before it expires! 🏃</p>
      </div>
    `,
  });
};

module.exports = {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendOrderConfirmation,
  sendVendorApprovedEmail,
  sendAuctionWonEmail,
};
