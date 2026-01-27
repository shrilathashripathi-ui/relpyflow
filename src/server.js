const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const instagramRoutes = require('./routes/instagram');
const automationRoutes = require('./routes/automation');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(cookieParser());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/instagram', instagramRoutes);
app.use('/api/automation', automationRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'ReplyFlow API is running' });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`✅ ReplyFlow server running on port ${PORT}`);
});