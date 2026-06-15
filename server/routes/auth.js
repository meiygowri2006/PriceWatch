const express = require('express');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');
const { sendOtpEmail, isEmailConfigured } = require('../utils/email');
const { signToken, authenticateToken } = require('../middleware/auth');

const router = express.Router();
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const OTP_EXPIRY_MS = 10 * 60 * 1000;
const BCRYPT_ROUNDS = 12;

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizeEmail(email) {
  return email.toLowerCase().trim();
}

function isDbConnected() {
  return mongoose.connection.readyState === 1;
}

function ensureJwtSecret() {
  if (!process.env.JWT_SECRET) {
    const error = new Error('JWT_SECRET is not configured on the server.');
    error.statusCode = 500;
    error.code = 'JWT_NOT_CONFIGURED';
    throw error;
  }
}

function handleRouteError(res, error, fallbackMessage) {
  console.error(fallbackMessage, error);

  const status = error.statusCode || 500;
  const payload = {
    message: error.publicMessage || error.message || fallbackMessage
  };

  if (error.code) {
    payload.code = error.code;
  }

  if (process.env.NODE_ENV !== 'production' && error.message) {
    payload.error = error.message;
  }

  return res.status(status).json(payload);
}

router.get('/config', (req, res) => {
  res.json({
    googleClientId: process.env.GOOGLE_CLIENT_ID || ''
  });
});

router.post('/send-otp', async (req, res) => {
  try {
    if (!isDbConnected()) {
      return res.status(503).json({
        message: 'Database is not connected. Please try again shortly.',
        code: 'DB_NOT_CONNECTED'
      });
    }

    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: 'Email is required.' });
    }

    const normalizedEmail = normalizeEmail(email);

    if (!isValidEmail(normalizedEmail)) {
      return res.status(400).json({ message: 'Please enter a valid email address.' });
    }

    if (!isEmailConfigured()) {
      return res.status(503).json({
        message: 'Email service is not configured. Set EMAIL_USER and EMAIL_PASS in the server .env file.',
        code: 'EMAIL_NOT_CONFIGURED'
      });
    }

    const existingUser = await User.findOne({ email: normalizedEmail });

    if (existingUser) {
      if (existingUser.googleId && !existingUser.password) {
        return res.status(409).json({
          message: 'This email is linked to Google sign-in. Please use "Sign in with Google".',
          code: 'GOOGLE_ACCOUNT'
        });
      }

      if (existingUser.isVerified && existingUser.password) {
        return res.status(409).json({
          message: 'An account with this email already exists. Please sign in instead.',
          code: 'ACCOUNT_EXISTS'
        });
      }

      if (existingUser.isVerified && !existingUser.password) {
        return res.status(200).json({
          message: 'Email already verified. Please set your password to complete registration.',
          email: normalizedEmail,
          requiresPasswordSetup: true
        });
      }
    }

    const otpCode = generateOtp();
    const otpExpires = new Date(Date.now() + OTP_EXPIRY_MS);
    let isNewUser = false;

    if (existingUser) {
      existingUser.otpCode = otpCode;
      existingUser.otpExpires = otpExpires;
      await existingUser.save();
    } else {
      isNewUser = true;
      const user = new User({
        email: normalizedEmail,
        otpCode,
        otpExpires,
        isVerified: false
      });
      await user.save();
    }

    try {
      await sendOtpEmail(normalizedEmail, otpCode);
    } catch (emailError) {
      console.error('OTP email delivery failed:', emailError);

      if (isNewUser) {
        await User.deleteOne({ email: normalizedEmail });
      }

      return res.status(503).json({
        message: 'Unable to send verification email. Please verify EMAIL_USER, EMAIL_PASS, and SMTP settings in your .env file.',
        code: 'EMAIL_SEND_FAILED'
      });
    }

    return res.status(200).json({
      message: 'Verification code sent. Please check your inbox.',
      email: normalizedEmail
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        message: 'An account with this email already exists.',
        code: 'ACCOUNT_EXISTS'
      });
    }

    return handleRouteError(res, error, 'Failed to send verification code.');
  }
});

router.post('/verify-otp', async (req, res) => {
  try {
    if (!isDbConnected()) {
      return res.status(503).json({
        message: 'Database is not connected. Please try again shortly.',
        code: 'DB_NOT_CONNECTED'
      });
    }

    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ message: 'Email and OTP are required.' });
    }

    const normalizedEmail = normalizeEmail(email);
    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      return res.status(404).json({
        message: 'No registration found for this email. Please request a new code.',
        code: 'USER_NOT_FOUND'
      });
    }

    if (user.isVerified && !user.password) {
      return res.status(200).json({
        message: 'Email already verified. Please set your password.',
        email: normalizedEmail,
        requiresPasswordSetup: true
      });
    }

    if (user.isVerified && user.password) {
      return res.status(409).json({
        message: 'This account is already complete. Please sign in instead.',
        code: 'ACCOUNT_COMPLETE'
      });
    }

    if (!user.otpCode || !user.otpExpires) {
      return res.status(400).json({
        message: 'No active verification code found. Please request a new one.',
        code: 'OTP_MISSING'
      });
    }

    if (user.otpExpires < new Date()) {
      return res.status(400).json({
        message: 'Verification code has expired. Please request a new one.',
        code: 'OTP_EXPIRED'
      });
    }

    if (user.otpCode !== String(otp).trim()) {
      return res.status(400).json({
        message: 'Invalid verification code. Please try again.',
        code: 'OTP_INVALID'
      });
    }

    user.isVerified = true;
    user.otpCode = null;
    user.otpExpires = null;
    await user.save();

    return res.status(200).json({
      message: 'Email verified successfully. Please set your password.',
      email: normalizedEmail
    });
  } catch (error) {
    return handleRouteError(res, error, 'OTP verification failed.');
  }
});

router.post('/complete-registration', async (req, res) => {
  try {
    if (!isDbConnected()) {
      return res.status(503).json({
        message: 'Database is not connected. Please try again shortly.',
        code: 'DB_NOT_CONNECTED'
      });
    }

    ensureJwtSecret();

    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }

    const normalizedEmail = normalizeEmail(email);

    if (!isValidEmail(normalizedEmail)) {
      return res.status(400).json({ message: 'Please enter a valid email address.' });
    }

    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters.' });
    }

    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      return res.status(404).json({
        message: 'Registration not found. Please start again.',
        code: 'USER_NOT_FOUND'
      });
    }

    if (!user.isVerified) {
      return res.status(403).json({
        message: 'Please verify your email before setting a password.',
        code: 'EMAIL_NOT_VERIFIED'
      });
    }

    if (user.password) {
      return res.status(409).json({
        message: 'This account is already set up. Please sign in instead.',
        code: 'ACCOUNT_COMPLETE'
      });
    }

    user.password = await bcrypt.hash(password, BCRYPT_ROUNDS);
    await user.save();

    const token = signToken(user);

    return res.status(200).json({
      message: 'Account created successfully.',
      token,
      user: user.toSafeJSON()
    });
  } catch (error) {
    return handleRouteError(res, error, 'Failed to complete registration.');
  }
});

router.post('/login', async (req, res) => {
  try {
    if (!isDbConnected()) {
      return res.status(503).json({
        message: 'Database is not connected. Please try again shortly.',
        code: 'DB_NOT_CONNECTED'
      });
    }

    ensureJwtSecret();

    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }

    const normalizedEmail = normalizeEmail(email);
    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    if (user.googleId && !user.password) {
      return res.status(403).json({
        message: 'Please complete your account by setting a password.',
        requiresPasswordSetup: true,
        email: normalizedEmail
      });
    }

    if (!user.isVerified) {
      return res.status(403).json({
        message: 'Please verify your email before signing in.',
        requiresVerification: true,
        email: normalizedEmail
      });
    }

    if (!user.password) {
      return res.status(403).json({
        message: 'Please complete your account by setting a password.',
        requiresPasswordSetup: true,
        email: normalizedEmail
      });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    const token = signToken(user);

    return res.status(200).json({
      message: 'Login successful.',
      token,
      user: user.toSafeJSON()
    });
  } catch (error) {
    return handleRouteError(res, error, 'Login failed.');
  }
});

router.post('/google', async (req, res) => {
  try {
    if (!isDbConnected()) {
      return res.status(503).json({
        message: 'Database is not connected. Please try again shortly.',
        code: 'DB_NOT_CONNECTED'
      });
    }

    ensureJwtSecret();

    if (!process.env.GOOGLE_CLIENT_ID) {
      return res.status(503).json({
        message: 'Google sign-in is not configured. Set GOOGLE_CLIENT_ID in your .env file.',
        code: 'GOOGLE_NOT_CONFIGURED'
      });
    }

    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({ message: 'Google ID token is required.' });
    }

    let payload;
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken,
        audience: process.env.GOOGLE_CLIENT_ID
      });
      payload = ticket.getPayload();
    } catch (verifyError) {
      console.error('Google token verification failed:', verifyError);
      return res.status(401).json({
        message: 'Invalid or expired Google token. Please try signing in again.',
        code: 'GOOGLE_TOKEN_INVALID'
      });
    }

    const googleId = payload.sub;
    const email = payload.email?.toLowerCase().trim();

    if (!email) {
      return res.status(400).json({ message: 'Google account does not have a valid email.' });
    }

    const user = await User.findOne({ $or: [{ googleId }, { email }] });

    if (user && user.password) {
      if (!user.googleId) {
        user.googleId = googleId;
      }
      user.isVerified = true;
      user.otpCode = null;
      user.otpExpires = null;
      await user.save();

      const token = signToken(user);

      return res.status(200).json({
        message: 'Login successful.',
        token,
        user: user.toSafeJSON()
      });
    }

    if (user && !user.password) {
      return res.status(200).json({
        message: 'Google email verified. Please set a password to complete your account.',
        requiresPasswordSetup: true,
        email,
        googleId
      });
    }

    return res.status(200).json({
      message: 'Google email verified. Please create a password to finish registration.',
      requiresPasswordSetup: true,
      isNewUser: true,
      email,
      googleId
    });
  } catch (error) {
    return handleRouteError(res, error, 'Google authentication failed.');
  }
});

router.post('/complete-google-registration', async (req, res) => {
  try {
    if (!isDbConnected()) {
      return res.status(503).json({
        message: 'Database is not connected. Please try again shortly.',
        code: 'DB_NOT_CONNECTED'
      });
    }

    ensureJwtSecret();

    if (!process.env.GOOGLE_CLIENT_ID) {
      return res.status(503).json({
        message: 'Google sign-in is not configured. Set GOOGLE_CLIENT_ID in your .env file.',
        code: 'GOOGLE_NOT_CONFIGURED'
      });
    }

    const { email, password, idToken, username, avatar } = req.body;

    if (!email || !password || !idToken || !username) {
      return res.status(400).json({
        message: 'Email, username, password, and Google ID token are required.'
      });
    }

    const normalizedEmail = normalizeEmail(email);
    const trimmedUsername = String(username).trim();

    if (!isValidEmail(normalizedEmail)) {
      return res.status(400).json({ message: 'Please enter a valid email address.' });
    }

    if (trimmedUsername.length < 3) {
      return res.status(400).json({ message: 'Username must be at least 3 characters.' });
    }

    if (!/^[a-zA-Z0-9_]+$/.test(trimmedUsername)) {
      return res.status(400).json({ message: 'Username may only contain letters, numbers, and underscores.' });
    }

    const allowedAvatars = ['male', 'female', 'student'];
    const selectedAvatar = allowedAvatars.includes(avatar) ? avatar : 'male';

    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters.' });
    }

    let payload;
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken,
        audience: process.env.GOOGLE_CLIENT_ID
      });
      payload = ticket.getPayload();
    } catch (verifyError) {
      console.error('Google token verification failed:', verifyError);
      return res.status(401).json({
        message: 'Invalid or expired Google token. Please sign up with Google again.',
        code: 'GOOGLE_TOKEN_INVALID'
      });
    }

    const googleId = payload.sub;
    const tokenEmail = payload.email?.toLowerCase().trim();

    if (tokenEmail !== normalizedEmail) {
      return res.status(400).json({
        message: 'Email does not match your Google account.',
        code: 'EMAIL_MISMATCH'
      });
    }

    let user = await User.findOne({ $or: [{ googleId }, { email: normalizedEmail }] });

    if (user && user.password) {
      return res.status(409).json({
        message: 'An account with this email already exists. Please sign in instead.',
        code: 'ACCOUNT_EXISTS'
      });
    }

    const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);

    if (user) {
      user.email = normalizedEmail;
      user.googleId = googleId;
      user.username = trimmedUsername;
      user.avatar = selectedAvatar;
      user.password = hashedPassword;
      user.isVerified = true;
      user.otpCode = null;
      user.otpExpires = null;
    } else {
      user = new User({
        email: normalizedEmail,
        googleId,
        username: trimmedUsername,
        avatar: selectedAvatar,
        password: hashedPassword,
        isVerified: true
      });
    }

    await user.save();

    const token = signToken(user);

    return res.status(201).json({
      message: 'Account created successfully.',
      token,
      user: user.toSafeJSON()
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        message: 'An account with this email already exists.',
        code: 'ACCOUNT_EXISTS'
      });
    }

    return handleRouteError(res, error, 'Failed to complete Google registration.');
  }
});

router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);

    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    res.json({ user: user.toSafeJSON() });
  } catch (error) {
    return handleRouteError(res, error, 'Failed to fetch user profile.');
  }
});

router.patch('/profile', authenticateToken, async (req, res) => {
  try {
    const { avatar } = req.body;
    const allowedAvatars = ['male', 'female', 'student'];

    if (!allowedAvatars.includes(avatar)) {
      return res.status(400).json({ message: 'Invalid avatar selection.' });
    }

    const user = await User.findById(req.user.userId);

    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    user.avatar = avatar;
    await user.save();

    res.json({ message: 'Profile updated.', user: user.toSafeJSON() });
  } catch (error) {
    return handleRouteError(res, error, 'Failed to update profile.');
  }
});

module.exports = router;
