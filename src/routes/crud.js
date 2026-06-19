/**
 * Patient & EMR Records CRUD API Routes
 */

const { Router } = require('express');
const db = require('../services/database');
const { findType } = require('../services/recordRegistry');
const { RECORD_DATA_COLUMNS } = require('../data/recordColumns');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const router = Router();

// ──────────────────────────────────────────────
//  Patient Routes
// ──────────────────────────────────────────────

/**
 * GET /api/patients - Get patients with optional pagination
 * Query params: limit, offset (both optional)
 */
router.get('/patients', (req, res) => {
  try {
    const { limit, offset } = req.query;
    const patients = db.getPatients({ limit, offset });
    res.json({ patients });
  } catch (err) {
    console.error('[GET /api/patients]', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/patients/:id - Get patient by ID
 */
router.get('/patients/:id', (req, res) => {
  try {
    const patient = db.getPatientById(req.params.id);
    if (!patient) {
      return res.status(404).json({ error: 'Patient not found' });
    }
    res.json({ patient });
  } catch (err) {
    console.error('[GET /api/patients/:id]', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/patients - Create or update patient
 */
router.post('/patients', (req, res) => {
  try {
    const { name, gender, age, bedNo, phone, idCard, address, id } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }

    const patientId = db.savePatient({
      id,
      name,
      gender: gender || '',
      age: age || 0,
      bedNo: bedNo || '',
      phone: phone || '',
      idCard: idCard || '',
      address: address || '',
    });

    const patient = db.getPatientById(patientId);
    res.json({ patient });
  } catch (err) {
    console.error('[POST /api/patients]', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/patients/:id - Delete patient and all related records
 */
router.delete('/patients/:id', (req, res) => {
  try {
    const patient = db.getPatientById(req.params.id);
    if (!patient) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    db.deletePatient(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error('[DELETE /api/patients/:id]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
//  EMR Records Routes
// ──────────────────────────────────────────────

/**
 * GET /api/records - Get records with optional filters
 * Query params: patientId, type, category, limit, offset (all optional)
 */
router.get('/records', (req, res) => {
  try {
    const { patientId, type, category, limit, offset } = req.query;
    const records = db.getRecords(patientId, { type, category, limit, offset });
    res.json({ records });
  } catch (err) {
    console.error('[GET /api/records]', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/records/:id - Get record by ID
 */
router.get('/records/:id', (req, res) => {
  try {
    const record = db.getRecordById(req.params.id);
    if (!record) {
      return res.status(404).json({ error: 'Record not found' });
    }
    res.json({ record });
  } catch (err) {
    console.error('[GET /api/records/:id]', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/records - Create or update record
 */
router.post('/records', (req, res) => {
  try {
    // A1: only meta fields are explicitly destructured; the 77 data columns
    // are extracted dynamically from RECORD_DATA_COLUMNS (single source of
    // truth shared with database.js). Previously each field was hand-listed
    // in both the destructure and the saveRecord object → adding a field
    // required editing 3 places.
    const { patientId, disease, type, category, id } = req.body;

    if (!patientId || !disease) {
      return res.status(400).json({ error: 'patientId and disease are required' });
    }

    // S1-4: reject non-UUID id to prevent silent data overwrite.
    // A client-provided id that is not a valid UUID would be treated as an
    // UPDATE by saveRecord(), silently matching 0 rows or — worse — matching
    // a different patient's record if the id happens to collide.
    if (id !== undefined && !UUID_RE.test(id)) {
      return res.status(400).json({ error: '无效的记录 ID 格式' });
    }

    // Verify patient exists
    const patient = db.getPatientById(patientId);
    if (!patient) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    // B1+B3: look up registry for authoritative category and typeConfig.
    // Falls back to body.category / undefined typeConfig if type not in
    // registry (e.g. legacy type deleted from registry) — preserves backward
    // compat so old records can still be saved.
    const resolvedType = type || 'firstCourse';
    const regResult = findType(resolvedType);
    const authoritativeCategory = regResult ? regResult.category.id : (category || 'clinicalRecords');
    const typeConfig = regResult ? regResult.type : undefined;

    // A1: dynamically build the record from RECORD_DATA_COLUMNS.
    const record = {
      id,
      patientId,
      disease,
      type: resolvedType,
      category: authoritativeCategory,
      ...RECORD_DATA_COLUMNS.reduce((acc, col) => {
        acc[col] = req.body[col] || '';
        return acc;
      }, {}),
    };

    const recordId = db.saveRecord(record, typeConfig);

    const saved = db.getRecordById(recordId);
    res.json({ record: saved });
  } catch (err) {
    console.error('[POST /api/records]', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/records/:id - Delete record
 */
router.delete('/records/:id', (req, res) => {
  try {
    const record = db.getRecordById(req.params.id);
    if (!record) {
      return res.status(404).json({ error: 'Record not found' });
    }

    db.deleteRecord(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error('[DELETE /api/records/:id]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
//  Statistics Route
// ──────────────────────────────────────────────

/**
 * GET /api/stats - Get system statistics
 */
router.get('/stats', (req, res) => {
  try {
    const stats = db.getStats();
    res.json(stats);
  } catch (err) {
    console.error('[GET /api/stats]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
