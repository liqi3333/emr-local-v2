require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const apiRouter = require('./src/routes/api');
const crudRouter = require('./src/routes/crud');

const app = express();
const PORT = process.env.PORT || 8000;

// ── CORS ──
app.use(cors({
  origin: true,
  credentials: true,
}));

// ── Body parsing ──
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Static files ──
app.use(express.static(path.join(__dirname, 'public')));

// ── API routes ──
app.use('/api', apiRouter);
app.use('/api', crudRouter);

// ── SPA fallback: all unknown routes → index.html ──
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Start server ──
app.listen(PORT, () => {
  console.log(`[EMR v2] Server running on http://localhost:${PORT}`);
});
