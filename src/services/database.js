/**
 * SQLite Database Service Layer
 * Stores patients and EMR records persistently on the server.
 */

const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');

const DB_PATH = path.join(__dirname, '../../data/emr-local.db');

// Single source of truth for record columns — add new columns here only
// INSERT/UPDATE SQL is auto-generated from this array
const RECORD_DATA_COLUMNS = [
  'chief', 'hpi', 'past', 'exam', 'lab', 'diag', 'diff', 'plan', 'workup',
  'summary', 'supplementHistory', 'diagnosis', 'analysis', 'treatment', 'signed',
  'chiefSummary', 'chiefDiagnosis', 'chiefAnalysis', 'chiefTreatment', 'chiefSigned',
  'preopDiagnosis', 'preopIndication', 'preopPlan', 'preopPreparation', 'preopRisk', 'preopSigned',
  'discussionParticipants', 'discussionCaseSummary', 'discussionDiagnosis', 'discussionContent', 'discussionConclusion', 'discussionSigned',
  'surgeryName', 'surgerySurgeon', 'surgeryAssistant', 'surgeryAnesthesia', 'surgeryProcess', 'surgeryFindings', 'surgerySigned',
  'dischargeAdmissionDate', 'dischargeDate', 'dischargeDiagnosis', 'dischargeTreatment', 'dischargeOutcome', 'dischargeAdvice', 'dischargeSigned',
  // Consent forms
  'surgeryIndication', 'surgeryRisks', 'alternatives', 'patientSignature', 'consentDate',
  'bloodType', 'transfusionReason', 'bloodProducts', 'transfusionRisks',
  'anesthesiaType', 'anesthesiaRisks', 'patientCondition',
  // Nursing records
  'admissionTime', 'vitalSigns', 'skinCondition', 'mobility', 'nutrition', 'mentalStatus',
  'riskAssessment', 'nursingDiagnosis', 'goals', 'interventions', 'evaluation',
  'healthEducation', 'dischargePlan', 'recordDate', 'recordTime', 'intakeOutput',
  'medication', 'nursingInterventions', 'nurseSignature',
];

class EMRDatabase {
  constructor() {
    this._db = null;
    this._init();
  }

  _init() {
    this._db = new Database(DB_PATH);
    this._db.pragma('journal_mode = WAL');
    this._db.pragma('foreign_keys = ON');
    this._createTables();
    this._ensureSampleData();
  }

  _createTables() {
    this._db.exec(`
      CREATE TABLE IF NOT EXISTS patients (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        gender TEXT DEFAULT '',
        age INTEGER DEFAULT 0,
        bedNo TEXT DEFAULT '',
        phone TEXT DEFAULT '',
        idCard TEXT DEFAULT '',
        address TEXT DEFAULT '',
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS records (
        id TEXT PRIMARY KEY,
        patientId TEXT NOT NULL,
        disease TEXT NOT NULL,
        type TEXT DEFAULT 'firstCourse',
        content TEXT DEFAULT '{}',
        chief TEXT DEFAULT '',
        hpi TEXT DEFAULT '',
        past TEXT DEFAULT '',
        exam TEXT DEFAULT '',
        lab TEXT DEFAULT '',
        diag TEXT DEFAULT '',
        diff TEXT DEFAULT '',
        plan TEXT DEFAULT '',
        workup TEXT DEFAULT '',
        summary TEXT DEFAULT '',
        diagnosis TEXT DEFAULT '',
        analysis TEXT DEFAULT '',
        treatment TEXT DEFAULT '',
        signed TEXT DEFAULT '',
        supplementHistory TEXT DEFAULT '',
        chiefSummary TEXT DEFAULT '',
        chiefDiagnosis TEXT DEFAULT '',
        chiefAnalysis TEXT DEFAULT '',
        chiefTreatment TEXT DEFAULT '',
        chiefSigned TEXT DEFAULT '',
        preopDiagnosis TEXT DEFAULT '',
        preopIndication TEXT DEFAULT '',
        preopPlan TEXT DEFAULT '',
        preopPreparation TEXT DEFAULT '',
        preopRisk TEXT DEFAULT '',
        preopSigned TEXT DEFAULT '',
        discussionParticipants TEXT DEFAULT '',
        discussionCaseSummary TEXT DEFAULT '',
        discussionDiagnosis TEXT DEFAULT '',
        discussionContent TEXT DEFAULT '',
        discussionConclusion TEXT DEFAULT '',
        discussionSigned TEXT DEFAULT '',
        surgeryName TEXT DEFAULT '',
        surgerySurgeon TEXT DEFAULT '',
        surgeryAssistant TEXT DEFAULT '',
        surgeryAnesthesia TEXT DEFAULT '',
        surgeryProcess TEXT DEFAULT '',
        surgeryFindings TEXT DEFAULT '',
        surgerySigned TEXT DEFAULT '',
        dischargeAdmissionDate TEXT DEFAULT '',
        dischargeDate TEXT DEFAULT '',
        dischargeDiagnosis TEXT DEFAULT '',
        dischargeTreatment TEXT DEFAULT '',
        dischargeOutcome TEXT DEFAULT '',
        dischargeAdvice TEXT DEFAULT '',
        dischargeSigned TEXT DEFAULT '',
        category TEXT DEFAULT 'clinicalRecords',
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        FOREIGN KEY (patientId) REFERENCES patients(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_records_patient_id ON records(patientId);
      CREATE INDEX IF NOT EXISTS idx_records_disease ON records(disease);
      CREATE INDEX IF NOT EXISTS idx_records_created_at ON records(createdAt);
      CREATE INDEX IF NOT EXISTS idx_patients_created_at ON patients(createdAt);
    `);

    // Add new columns for consent/nursing records (safe to run multiple times)
    const newColumns = [
      'surgeryIndication', 'surgeryRisks', 'alternatives', 'patientSignature', 'consentDate',
      'bloodType', 'transfusionReason', 'bloodProducts', 'transfusionRisks',
      'anesthesiaType', 'anesthesiaRisks', 'patientCondition',
      'admissionTime', 'vitalSigns', 'skinCondition', 'mobility', 'nutrition', 'mentalStatus',
      'riskAssessment', 'nursingDiagnosis', 'goals', 'interventions', 'evaluation',
      'healthEducation', 'dischargePlan', 'recordDate', 'recordTime', 'intakeOutput',
      'medication', 'nursingInterventions', 'nurseSignature',
    ];
    for (const col of newColumns) {
      try {
        this._db.exec(`ALTER TABLE records ADD COLUMN ${col} TEXT DEFAULT ''`);
      } catch { /* column already exists */ }
    }

    this._db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
    `);
    // Add workup column for existing databases
    try {
      this._db.exec('ALTER TABLE records ADD COLUMN workup TEXT DEFAULT \'\'');
    } catch { /* column already exists */ }
    // Add supplementHistory column for existing databases
    try {
      this._db.exec('ALTER TABLE records ADD COLUMN supplementHistory TEXT DEFAULT \'\'');
    } catch { /* column already exists */ }
    // Add category column for existing databases
    try {
      this._db.exec("ALTER TABLE records ADD COLUMN category TEXT DEFAULT 'clinicalRecords'");
    } catch { /* column already exists */ }
    // Backfill category for legacy records
    try {
      this._db.exec("UPDATE records SET category = 'clinicalRecords' WHERE category IS NULL OR category = ''");
    } catch { /* ignore */ }
  }

  _ensureSampleData() {
    const count = this._db.prepare('SELECT COUNT(*) as count FROM patients').get();
    if (count.count === 0) {
      const now = new Date().toISOString();
      const id = crypto.randomUUID();
      this._db.prepare(`
        INSERT INTO patients (id, name, gender, age, bedNo, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(id, '示例患者', '男', 45, '12', now, now);
    }
  }

  // ─── Patients ───

  getPatients() {
    return this._db.prepare('SELECT * FROM patients ORDER BY createdAt DESC').all();
  }

  getPatientById(id) {
    return this._db.prepare('SELECT * FROM patients WHERE id = ?').get(id);
  }

  savePatient(patient) {
    const now = new Date().toISOString();
    const id = patient.id || crypto.randomUUID();
    const existing = this.getPatientById(id);

    if (existing) {
      this._db.prepare(`
        UPDATE patients SET name = ?, gender = ?, age = ?, bedNo = ?, 
        phone = ?, idCard = ?, address = ?, updatedAt = ?
        WHERE id = ?
      `).run(
        patient.name,
        patient.gender || '',
        patient.age || 0,
        patient.bedNo || '',
        patient.phone || '',
        patient.idCard || '',
        patient.address || '',
        now,
        id
      );
    } else {
      this._db.prepare(`
        INSERT INTO patients (id, name, gender, age, bedNo, phone, idCard, address, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        patient.name,
        patient.gender || '',
        patient.age || 0,
        patient.bedNo || '',
        patient.phone || '',
        patient.idCard || '',
        patient.address || '',
        now,
        now
      );
    }

    return id;
  }

  deletePatient(id) {
    const deleteRecords = this._db.prepare('DELETE FROM records WHERE patientId = ?');
    const deletePatient = this._db.prepare('DELETE FROM patients WHERE id = ?');

    const transaction = this._db.transaction(() => {
      deleteRecords.run(id);
      deletePatient.run(id);
    });

    transaction();
  }

  // ─── EMR Records ───

  getRecords(patientId) {
    if (patientId) {
      return this._db.prepare(
        'SELECT * FROM records WHERE patientId = ? ORDER BY createdAt DESC'
      ).all(patientId);
    }
    return this._db.prepare('SELECT * FROM records ORDER BY createdAt DESC').all();
  }

  getRecordById(id) {
    return this._db.prepare('SELECT * FROM records WHERE id = ?').get(id);
  }

  saveRecord(record, typeConfig) {
    const now = new Date().toISOString();
    const id = record.id || crypto.randomUUID();
    const existing = this.getRecordById(id);

    // Auto-generate SQL from RECORD_DATA_COLUMNS
    const dataValues = RECORD_DATA_COLUMNS.map(c => record[c] || '');

    // Build content JSON: prefer registry-driven, fallback to old switch/case
    const content = typeConfig
      ? this._buildRecordContentFromRegistry(record, typeConfig)
      : this._buildRecordContent(record);

    if (existing) {
      const setClauses = [
        'disease = ?', 'type = ?',
        ...RECORD_DATA_COLUMNS.map(c => `${c} = ?`),
        'updatedAt = ?'
      ];
      const params = [
        record.disease,
        record.type || 'firstCourse',
        ...dataValues,
        now,
        id
      ];
      this._db.prepare(`UPDATE records SET ${setClauses.join(', ')} WHERE id = ?`).run(...params);
    } else {
      const insertCols = ['id', 'patientId', 'disease', 'type', 'category', 'content', ...RECORD_DATA_COLUMNS, 'createdAt', 'updatedAt'];
      const placeholders = insertCols.map(() => '?').join(', ');
      const params = [
        id,
        record.patientId,
        record.disease,
        record.type || 'firstCourse',
        record.category || 'clinicalRecords',
        JSON.stringify(content),
        ...dataValues,
        now,
        now
      ];
      this._db.prepare(`INSERT INTO records (${insertCols.join(', ')}) VALUES (${placeholders})`).run(...params);
    }

    return id;
  }

  _buildRecordContentFromRegistry(record, typeConfig) {
    const content = {};
    if (typeConfig && Array.isArray(typeConfig.fields)) {
      for (const field of typeConfig.fields) {
        if (field.enabled === false) continue;
        content[field.key] = record[field.key] || '';
      }
    }
    return content;
  }

  _buildRecordContent(record) {
    const type = record.type || 'firstCourse';

    switch (type) {
      case 'firstCourse':
        return {
          chief: record.chief || '',
          hpi: record.hpi || '',
          past: record.past || '',
          exam: record.exam || '',
          lab: record.lab || '',
          diag: record.diag || '',
          workup: record.workup || '',
          diff: record.diff || '',
          plan: record.plan || ''
        };
      case 'attendingRound':
        return {
          summary: record.summary || '',
          supplementHistory: record.supplementHistory || '',
          diagnosis: record.diagnosis || '',
          analysis: record.analysis || '',
          treatment: record.treatment || '',
          signed: record.signed || ''
        };
      case 'chiefRound':
        return {
          chiefSummary: record.chiefSummary || '',
          chiefDiagnosis: record.chiefDiagnosis || '',
          chiefAnalysis: record.chiefAnalysis || '',
          chiefTreatment: record.chiefTreatment || '',
          chiefSigned: record.chiefSigned || ''
        };
      case 'preop':
        return {
          preopDiagnosis: record.preopDiagnosis || '',
          preopIndication: record.preopIndication || '',
          preopPlan: record.preopPlan || '',
          preopPreparation: record.preopPreparation || '',
          preopRisk: record.preopRisk || '',
          preopSigned: record.preopSigned || ''
        };
      case 'discussion':
        return {
          discussionParticipants: record.discussionParticipants || '',
          discussionCaseSummary: record.discussionCaseSummary || '',
          discussionDiagnosis: record.discussionDiagnosis || '',
          discussionContent: record.discussionContent || '',
          discussionConclusion: record.discussionConclusion || '',
          discussionSigned: record.discussionSigned || ''
        };
      case 'surgery':
        return {
          surgeryName: record.surgeryName || '',
          surgerySurgeon: record.surgerySurgeon || '',
          surgeryAssistant: record.surgeryAssistant || '',
          surgeryAnesthesia: record.surgeryAnesthesia || '',
          surgeryProcess: record.surgeryProcess || '',
          surgeryFindings: record.surgeryFindings || '',
          surgerySigned: record.surgerySigned || ''
        };
      case 'discharge':
        return {
          dischargeAdmissionDate: record.dischargeAdmissionDate || '',
          dischargeDate: record.dischargeDate || '',
          dischargeDiagnosis: record.dischargeDiagnosis || '',
          dischargeTreatment: record.dischargeTreatment || '',
          dischargeOutcome: record.dischargeOutcome || '',
          dischargeAdvice: record.dischargeAdvice || '',
          dischargeSigned: record.dischargeSigned || ''
        };
      case 'surgeryConsent':
        return {
          surgeryName: record.surgeryName || '',
          surgeryIndication: record.surgeryIndication || '',
          surgeryRisks: record.surgeryRisks || '',
          alternatives: record.alternatives || '',
          patientSignature: record.patientSignature || '',
          consentDate: record.consentDate || ''
        };
      case 'bloodTransfusionConsent':
        return {
          bloodType: record.bloodType || '',
          transfusionReason: record.transfusionReason || '',
          bloodProducts: record.bloodProducts || '',
          transfusionRisks: record.transfusionRisks || '',
          alternatives: record.alternatives || '',
          patientSignature: record.patientSignature || '',
          consentDate: record.consentDate || ''
        };
      case 'anesthesiaConsent':
        return {
          anesthesiaType: record.anesthesiaType || '',
          surgeryName: record.surgeryName || '',
          anesthesiaRisks: record.anesthesiaRisks || '',
          alternatives: record.alternatives || '',
          patientCondition: record.patientCondition || '',
          patientSignature: record.patientSignature || '',
          consentDate: record.consentDate || ''
        };
      case 'nursingAssessment':
        return {
          admissionTime: record.admissionTime || '',
          vitalSigns: record.vitalSigns || '',
          skinCondition: record.skinCondition || '',
          mobility: record.mobility || '',
          nutrition: record.nutrition || '',
          mentalStatus: record.mentalStatus || '',
          riskAssessment: record.riskAssessment || '',
          nursingDiagnosis: record.nursingDiagnosis || ''
        };
      case 'nursingPlan':
        return {
          nursingDiagnosis: record.nursingDiagnosis || '',
          goals: record.goals || '',
          interventions: record.interventions || '',
          evaluation: record.evaluation || '',
          healthEducation: record.healthEducation || '',
          dischargePlan: record.dischargePlan || ''
        };
      case 'nursingRecordSheet':
        return {
          recordDate: record.recordDate || '',
          recordTime: record.recordTime || '',
          vitalSigns: record.vitalSigns || '',
          intakeOutput: record.intakeOutput || '',
          medication: record.medication || '',
          nursingInterventions: record.nursingInterventions || '',
          patientCondition: record.patientCondition || '',
          nurseSignature: record.nurseSignature || ''
        };
      default:
        return {};
    }
  }

  deleteRecord(id) {
    this._db.prepare('DELETE FROM records WHERE id = ?').run(id);
  }

  // ─── Statistics ───

  getStats() {
    const patientCount = this._db.prepare('SELECT COUNT(*) as count FROM patients').get();
    const recordCount = this._db.prepare('SELECT COUNT(*) as count FROM records').get();
    const diseaseStats = this._db.prepare(`
      SELECT disease, COUNT(*) as count 
      FROM records 
      GROUP BY disease 
      ORDER BY count DESC 
      LIMIT 10
    `).all();

    return {
      patientCount: patientCount.count,
      recordCount: recordCount.count,
      diseaseStats,
    };
  }

  // ─── Settings ───

  getSetting(key) {
    const row = this._db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return row ? row.value : null;
  }

  setSetting(key, value) {
    const now = new Date().toISOString();
    this._db.prepare(`
      INSERT INTO settings (key, value, updatedAt)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt
    `).run(key, value, now);
  }

  close() {
    if (this._db) {
      this._db.close();
    }
  }
}

// Singleton
const db = new EMRDatabase();

module.exports = db;
