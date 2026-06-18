require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const apiRouter = require('./src/routes/api');
const crudRouter = require('./src/routes/crud');
const promptsRouter = require('./src/routes/prompts');
const recordTypesRouter = require('./src/routes/recordTypes');
const settingsRouter = require('./src/routes/settings');
const diseasesRouter = require('./src/routes/diseases');
const knowledgeRouter = require('./src/routes/knowledge');
const evolutionRouter = require('./src/routes/evolution');
const { ensureDefaultRegistry, migrateLegacyTypes } = require('./src/services/recordRegistry');
const { ensureDefaultDiseaseCategories } = require('./src/services/diseaseRegistry');

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
app.use('/api', diseasesRouter);
app.use('/api', knowledgeRouter);
app.use('/api', evolutionRouter);

// ── Prompt editor page ──
app.get('/prompts', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'prompts.html'));
});

// ── Record type manager page ──
app.get('/record-types', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'record-types.html'));
});

// ── Disease manager page ──
app.get('/diseases', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'diseases.html'));
});

// ── SPA fallback: all unknown routes → index.html ──
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Initialize registry on startup ──
ensureDefaultRegistry();
migrateLegacyTypes();
ensureDefaultDiseaseCategories();

// ── Start server ──
app.listen(PORT, () => {
  console.log(`[EMR v2] Server running on http://localhost:${PORT}`);
});
