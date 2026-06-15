const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    default: null
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  otpCode: {
    type: String,
    default: null
  },
  otpExpires: {
    type: Date,
    default: null
  },
  googleId: {
    type: String,
    default: null,
    sparse: true
  },
  username: {
    type: String,
    default: null,
    trim: true,
    sparse: true,
    unique: true
  },
  avatar: {
    type: String,
    enum: ['male', 'female', 'student'],
    default: 'male'
  }
}, { timestamps: true });

userSchema.methods.toSafeJSON = function () {
  return {
    id: this._id,
    email: this.email,
    username: this.username,
    avatar: this.avatar,
    isVerified: this.isVerified
  };
};

module.exports = mongoose.model('User', userSchema);
