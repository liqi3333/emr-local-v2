require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const apiRouter = require('./src/routes/api');
const crudRouter = require('./src/routes/crud');
const promptsRouter = require('./src/routes/prompts');
const recordTypesRouter = require('./src/routes/recordTypes');
const settingsRouter = require('./src/routes/settings');
const { ensureDefaultRegistry, migrateLegacyTypes } = require('./src/services/recordRegistry');

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
app.use('/api', promptsRouter);
app.use('/api', recordTypesRouter);
app.use('/api', settingsRouter);

// ── Prompt editor page ──
app.get('/prompts', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'prompts.html'));
});

// ── Record type manager page ──
app.get('/record-types', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'record-types.html'));
});

// ── SPA fallback: all unknown routes → index.html ──
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Initialize registry on startup ──
ensureDefaultRegistry();
migrateLegacyTypes();

// ── Start server ──
app.listen(PORT, () => {
  console.log(`[EMR v2] Server running on http://localhost:${PORT}`);
});
