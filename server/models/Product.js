// models/Product.js
const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  user_email: { 
    type: String, 
    required: true 
  },
  product_name: { 
    type: String, 
    required: true 
  },
  product_url: { 
    type: String, 
    required: true 
  },
  target_price: { 
    type: Number, 
    required: true 
  },
  current_price: { 
    type: Number 
  },
  price_history: [{
    price: Number,
    date: { 
      type: Date, 
      default: Date.now 
    }
  }]
}, { timestamps: true });

module.exports = mongoose.model('Product', productSchema);