const nodemailer = require('nodemailer');

let transporter = null;

function isEmailConfigured() {
  return Boolean(process.env.EMAIL_USER && process.env.EMAIL_PASS);
}

function getTransporter() {
  if (!isEmailConfigured()) {
    throw new Error('Email service is not configured. Set EMAIL_USER and EMAIL_PASS in your .env file.');
  }

  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: Number(process.env.EMAIL_PORT) || 587,
    secure: process.env.EMAIL_SECURE === 'true',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });

  return transporter;
}

async function sendOtpEmail(to, otpCode) {
  const mailOptions = {
    from: `"PriceWatch" <${process.env.EMAIL_USER}>`,
    to,
    subject: 'Your PriceWatch verification code',
    text: `Your PriceWatch verification code is: ${otpCode}\n\nThis code expires in 10 minutes.`,
    html: `
      <div style="font-family: 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px;">
        <h2 style="color: #111827; margin-top: 0; font-size: 20px;">Verify your email</h2>
        <p style="color: #6b7280; font-size: 15px;">Enter this code to continue creating your PriceWatch account:</p>
        <p style="font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #1e40af; text-align: center; margin: 28px 0;">${otpCode}</p>
        <p style="color: #9ca3af; font-size: 13px;">This code expires in 10 minutes. If you did not request this, you can safely ignore this email.</p>
      </div>
    `
  };

  await getTransporter().sendMail(mailOptions);
}

module.exports = { sendOtpEmail, isEmailConfigured };
