/**
 * Knowledge Base API Routes (F1: RAG)
 *
 *   GET    /api/knowledge                      list diseases with KB
 *   GET    /api/knowledge/:disease             get assembled KB text
 *   GET    /api/knowledge/:disease/files       list files for a disease
 *   GET    /api/knowledge/:disease/file/:name  read one file
 *   POST   /api/knowledge/:disease             { filename, content } save
 *   DELETE /api/knowledge/:disease/file/:name  delete a file
 */
const { Router } = require('express');
const knowledge = require('../services/knowledge');

const router = Router();

// List all diseases that have a knowledge base
router.get('/knowledge', (req, res) => {
  try {
    res.json({ diseases: knowledge.listKnowledge() });
  } catch (err) {
    console.error('[GET /api/knowledge]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Get assembled knowledge text for a disease
router.get('/knowledge/:disease', (req, res) => {
  try {
    const result = knowledge.getKnowledge(req.params.disease);
    res.json(result);
  } catch (err) {
    console.error('[GET /api/knowledge/:disease]', err.message);
    res.status(400).json({ error: err.message });
  }
});

// List files for a disease
router.get('/knowledge/:disease/files', (req, res) => {
  try {
    res.json({ files: knowledge.listDiseaseFiles(req.params.disease) });
  } catch (err) {
    console.error('[GET /api/knowledge/:disease/files]', err.message);
    res.status(400).json({ error: err.message });
  }
});

// Read a single file
router.get('/knowledge/:disease/file/:name', (req, res) => {
  try {
    const content = knowledge.readKnowledgeFile(req.params.disease, req.params.name);
    if (content === null) {
      return res.status(404).json({ error: '文件不存在' });
    }
    res.json({ disease: req.params.disease, filename: req.params.name, content });
  } catch (err) {
    console.error('[GET /api/knowledge/:disease/file/:name]', err.message);
    res.status(400).json({ error: err.message });
  }
});

// Save (create/overwrite) a knowledge file
router.post('/knowledge/:disease', (req, res) => {
  try {
    const { filename, content } = req.body;
    if (!filename) return res.status(400).json({ error: 'filename is required' });
    if (content == null) return res.status(400).json({ error: 'content is required' });
    const result = knowledge.saveKnowledgeFile(req.params.disease, filename, String(content));
    res.json(result);
  } catch (err) {
    console.error('[POST /api/knowledge/:disease]', err.message);
    res.status(400).json({ error: err.message });
  }
});

// Delete a knowledge file
router.delete('/knowledge/:disease/file/:name', (req, res) => {
  try {
    const result = knowledge.deleteKnowledgeFile(req.params.disease, req.params.name);
    res.json(result);
  } catch (err) {
    console.error('[DELETE /api/knowledge/:disease/file/:name]', err.message);
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
