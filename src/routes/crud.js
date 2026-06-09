/**
 * Patient & EMR Records CRUD API Routes
 */

const { Router } = require('express');
const db = require('../services/database');

const router = Router();

// ──────────────────────────────────────────────
//  Patient Routes
// ──────────────────────────────────────────────

/**
 * GET /api/patients - Get all patients
 */
router.get('/patients', (req, res) => {
  try {
    const patients = db.getPatients();
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
 * GET /api/records - Get all records (optionally filter by patientId)
 */
router.get('/records', (req, res) => {
  try {
    const { patientId } = req.query;
    const records = db.getRecords(patientId);
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
    const { patientId, disease, type, chief, hpi, past, exam, lab, diag, diff, plan, summary, diagnosis, analysis, treatment, signed, chiefSummary, chiefDiagnosis, chiefAnalysis, chiefTreatment, chiefSigned, preopDiagnosis, preopIndication, preopPlan, preopPreparation, preopRisk, preopSigned, id } = req.body;

    if (!patientId || !disease) {
      return res.status(400).json({ error: 'patientId and disease are required' });
    }

    // Verify patient exists
    const patient = db.getPatientById(patientId);
    if (!patient) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    const recordId = db.saveRecord({
      id,
      patientId,
      disease,
      type: type || 'firstCourse',
      chief: chief || '',
      hpi: hpi || '',
      past: past || '',
      exam: exam || '',
      lab: lab || '',
      diag: diag || '',
      diff: diff || '',
      plan: plan || '',
      summary: summary || '',
      diagnosis: diagnosis || '',
      analysis: analysis || '',
      treatment: treatment || '',
      signed: signed || '',
      chiefSummary: chiefSummary || '',
      chiefDiagnosis: chiefDiagnosis || '',
      chiefAnalysis: chiefAnalysis || '',
      chiefTreatment: chiefTreatment || '',
      chiefSigned: chiefSigned || '',
      preopDiagnosis: preopDiagnosis || '',
      preopIndication: preopIndication || '',
      preopPlan: preopPlan || '',
      preopPreparation: preopPreparation || '',
      preopRisk: preopRisk || '',
      preopSigned: preopSigned || '',
    });

    const record = db.getRecordById(recordId);
    res.json({ record });
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
