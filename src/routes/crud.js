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
    const { patientId, disease, type, 
      chief, hpi, past, exam, lab, diag, workup, diff, plan, 
      summary, supplementHistory, diagnosis, analysis, treatment, signed, 
      chiefSummary, chiefDiagnosis, chiefAnalysis, chiefTreatment, chiefSigned, 
      preopDiagnosis, preopIndication, preopPlan, preopPreparation, preopRisk, preopSigned,
      discussionParticipants, discussionCaseSummary, discussionDiagnosis, discussionContent, discussionConclusion, discussionSigned,
      surgeryName, surgerySurgeon, surgeryAssistant, surgeryAnesthesia, surgeryProcess, surgeryFindings, surgerySigned,
      dischargeAdmissionDate, dischargeDate, dischargeDiagnosis, dischargeTreatment, dischargeOutcome, dischargeAdvice, dischargeSigned,
      surgeryIndication, surgeryRisks, alternatives, patientSignature, consentDate,
      bloodType, transfusionReason, bloodProducts, transfusionRisks,
      anesthesiaType, anesthesiaRisks, patientCondition,
      admissionTime, vitalSigns, skinCondition, mobility, nutrition, mentalStatus,
      riskAssessment, nursingDiagnosis, goals, interventions, evaluation,
      healthEducation, dischargePlan, recordDate, recordTime, intakeOutput,
      medication, nursingInterventions, nurseSignature,
      id } = req.body;

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
      workup: workup || '',
      diff: diff || '',
      plan: plan || '',
      summary: summary || '',
      supplementHistory: supplementHistory || '',
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
      discussionParticipants: discussionParticipants || '',
      discussionCaseSummary: discussionCaseSummary || '',
      discussionDiagnosis: discussionDiagnosis || '',
      discussionContent: discussionContent || '',
      discussionConclusion: discussionConclusion || '',
      discussionSigned: discussionSigned || '',
      surgeryName: surgeryName || '',
      surgerySurgeon: surgerySurgeon || '',
      surgeryAssistant: surgeryAssistant || '',
      surgeryAnesthesia: surgeryAnesthesia || '',
      surgeryProcess: surgeryProcess || '',
      surgeryFindings: surgeryFindings || '',
      surgerySigned: surgerySigned || '',
      dischargeAdmissionDate: dischargeAdmissionDate || '',
      dischargeDate: dischargeDate || '',
      dischargeDiagnosis: dischargeDiagnosis || '',
      dischargeTreatment: dischargeTreatment || '',
      dischargeOutcome: dischargeOutcome || '',
      dischargeAdvice: dischargeAdvice || '',
      dischargeSigned: dischargeSigned || '',
      surgeryIndication: surgeryIndication || '',
      surgeryRisks: surgeryRisks || '',
      alternatives: alternatives || '',
      patientSignature: patientSignature || '',
      consentDate: consentDate || '',
      bloodType: bloodType || '',
      transfusionReason: transfusionReason || '',
      bloodProducts: bloodProducts || '',
      transfusionRisks: transfusionRisks || '',
      anesthesiaType: anesthesiaType || '',
      anesthesiaRisks: anesthesiaRisks || '',
      patientCondition: patientCondition || '',
      admissionTime: admissionTime || '',
      vitalSigns: vitalSigns || '',
      skinCondition: skinCondition || '',
      mobility: mobility || '',
      nutrition: nutrition || '',
      mentalStatus: mentalStatus || '',
      riskAssessment: riskAssessment || '',
      nursingDiagnosis: nursingDiagnosis || '',
      goals: goals || '',
      interventions: interventions || '',
      evaluation: evaluation || '',
      healthEducation: healthEducation || '',
      dischargePlan: dischargePlan || '',
      recordDate: recordDate || '',
      recordTime: recordTime || '',
      intakeOutput: intakeOutput || '',
      medication: medication || '',
      nursingInterventions: nursingInterventions || '',
      nurseSignature: nurseSignature || '',
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
