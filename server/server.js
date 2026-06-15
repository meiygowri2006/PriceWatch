// server/server.js
require('dotenv').config();
const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const cors = require('cors');
const Product = require('./models/Product');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const { authenticateToken } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
// Middleware — CORS must be registered before API routes
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../client')));

// Database Connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('🟢 Node.js successfully connected to MongoDB!'))
  .catch(err => console.error('🔴 Connection failed:', err.message));

// Auth routes
app.use('/api/auth', authRoutes);

// User routes
app.use('/api/users', userRoutes);

// ---------------------------------------------------
// API Route 1: Add a new product to track (POST)
// ---------------------------------------------------
app.post('/api/products', authenticateToken, async (req, res) => {
  try {
    const { product_name, product_url, target_price } = req.body;
    const user_email = req.user.email;

    if (!product_name || !product_url || !target_price) {
      return res.status(400).json({ message: 'All fields are required.' });
    }

    const newProduct = new Product({
      user_email,
      product_name,
      product_url,
      target_price,
      current_price: null
    });

    await newProduct.save();
    res.status(201).json({ message: 'Product added successfully!', product: newProduct });
  } catch (error) {
    res.status(500).json({ message: 'Server error saving product.', error: error.message });
  }
});

// ---------------------------------------------------
// API Route 2: Get tracked products for logged-in user (GET)
// ---------------------------------------------------
app.get('/api/products', authenticateToken, async (req, res) => {
  try {
    const products = await Product.find({ user_email: req.user.email }).sort({ createdAt: -1 });
    res.status(200).json(products);
  } catch (error) {
    res.status(500).json({ message: 'Server error fetching products.', error: error.message });
  }
});

// ---------------------------------------------------
// API Route 3: Delete a tracked product (DELETE)
// ---------------------------------------------------
app.delete('/api/products/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid product ID.' });
    }

    const deletedProduct = await Product.findOneAndDelete({
      _id: id,
      user_email: req.user.email
    });

    if (!deletedProduct) {
      return res.status(404).json({ message: 'Product not found.' });
    }

    res.status(200).json({ message: 'Product deleted successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error deleting product.', error: error.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
