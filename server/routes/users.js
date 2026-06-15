const express = require('express');
const mongoose = require('mongoose');
const Product = require('../models/Product');
const User = require('../models/User');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

router.delete('/me', authenticateToken, async (req, res) => {
  try {
    const userEmail = req.user.email;
    const userId = req.user.userId;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Invalid user ID in token.' });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    if (user.email !== userEmail) {
      return res.status(403).json({ message: 'Token does not match user record.' });
    }

    await Product.deleteMany({ user_email: userEmail });
    await User.findByIdAndDelete(userId);

    return res.status(200).json({ message: 'Account deleted successfully.' });
  } catch (error) {
    console.error('Delete account error:', error);
    return res.status(500).json({ message: 'Failed to delete account.', error: error.message });
  }
});

module.exports = router;
