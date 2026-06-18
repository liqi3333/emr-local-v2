/**
 * Template Evolution API Routes (F3)
 *
 *   GET    /api/evolution                       list all evolutions
 *   GET    /api/evolution/:disease/:typeId      get evolution history
 *   POST   /api/evolution/:disease/:typeId      trigger evolution analysis
 *   DELETE /api/evolution/:disease/:typeId      delete evolution history
 */
const { Router } = require('express');
const evolution = require('../services/templateEvolution');

const router = Router();

router.get('/evolution', (req, res) => {
  try {
    res.json({ evolutions: evolution.listEvolutions() });
  } catch (err) {
    console.error('[GET /api/evolution]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/evolution/:disease/:typeId', (req, res) => {
  try {
    const result = evolution.getEvolution(req.params.disease, req.params.typeId);
    res.json(result);
  } catch (err) {
    console.error('[GET /evolution/:disease/:typeId]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/evolution/:disease/:typeId', async (req, res) => {
  try {
    const { provider, model, apiKey, baseUrl } = req.body || {};
    const result = await evolution.evolveTemplate(
      req.params.disease, req.params.typeId,
      { provider, model, apiKey, baseUrl }
    );
    if (result.error === 'insufficient_samples') {
      return res.status(400).json(result);
    }
    res.json(result);
  } catch (err) {
    console.error('[POST /evolution/:disease/:typeId]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/evolution/:disease/:typeId', (req, res) => {
  try {
    const result = evolution.deleteEvolution(req.params.disease, req.params.typeId);
    res.json(result);
  } catch (err) {
    console.error('[DELETE /evolution/:disease/:typeId]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
