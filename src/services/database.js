/**
 * SQLite Database Service Layer
 * Stores patients and EMR records persistently on the server.
 */

const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');

const DB_PATH = path.join(__dirname, '../../data/emr-local.db');

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
        chief TEXT DEFAULT '',
        hpi TEXT DEFAULT '',
        past TEXT DEFAULT '',
        exam TEXT DEFAULT '',
        lab TEXT DEFAULT '',
        diag TEXT DEFAULT '',
        diff TEXT DEFAULT '',
        plan TEXT DEFAULT '',
        summary TEXT DEFAULT '',
        diagnosis TEXT DEFAULT '',
        analysis TEXT DEFAULT '',
        treatment TEXT DEFAULT '',
        signed TEXT DEFAULT '',
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
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        FOREIGN KEY (patientId) REFERENCES patients(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_records_patient_id ON records(patientId);
      CREATE INDEX IF NOT EXISTS idx_records_disease ON records(disease);
      CREATE INDEX IF NOT EXISTS idx_records_created_at ON records(createdAt);
      CREATE INDEX IF NOT EXISTS idx_patients_created_at ON patients(createdAt);
    `);
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

  saveRecord(record) {
    const now = new Date().toISOString();
    const id = record.id || crypto.randomUUID();
    const existing = this.getRecordById(id);

    if (existing) {
      this._db.prepare(`
        UPDATE records SET disease = ?, type = ?, chief = ?, hpi = ?, past = ?, 
        exam = ?, lab = ?, diag = ?, diff = ?, plan = ?,
        summary = ?, diagnosis = ?, analysis = ?, treatment = ?, signed = ?,
        chiefSummary = ?, chiefDiagnosis = ?, chiefAnalysis = ?, chiefTreatment = ?, chiefSigned = ?,
        preopDiagnosis = ?, preopIndication = ?, preopPlan = ?, preopPreparation = ?, preopRisk = ?, preopSigned = ?, updatedAt = ?
        WHERE id = ?
      `).run(
        record.disease,
        record.type || 'firstCourse',
        record.chief || '',
        record.hpi || '',
        record.past || '',
        record.exam || '',
        record.lab || '',
        record.diag || '',
        record.diff || '',
        record.plan || '',
        record.summary || '',
        record.diagnosis || '',
        record.analysis || '',
        record.treatment || '',
        record.signed || '',
        record.chiefSummary || '',
        record.chiefDiagnosis || '',
        record.chiefAnalysis || '',
        record.chiefTreatment || '',
        record.chiefSigned || '',
        record.preopDiagnosis || '',
        record.preopIndication || '',
        record.preopPlan || '',
        record.preopPreparation || '',
        record.preopRisk || '',
        record.preopSigned || '',
        now,
        id
      );
    } else {
      this._db.prepare(`
        INSERT INTO records (id, patientId, disease, type, chief, hpi, past, exam, lab, diag, diff, plan, summary, diagnosis, analysis, treatment, signed, chiefSummary, chiefDiagnosis, chiefAnalysis, chiefTreatment, chiefSigned, preopDiagnosis, preopIndication, preopPlan, preopPreparation, preopRisk, preopSigned, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        record.patientId,
        record.disease,
        record.type || 'firstCourse',
        record.chief || '',
        record.hpi || '',
        record.past || '',
        record.exam || '',
        record.lab || '',
        record.diag || '',
        record.diff || '',
        record.plan || '',
        record.summary || '',
        record.diagnosis || '',
        record.analysis || '',
        record.treatment || '',
        record.signed || '',
        record.chiefSummary || '',
        record.chiefDiagnosis || '',
        record.chiefAnalysis || '',
        record.chiefTreatment || '',
        record.chiefSigned || '',
        record.preopDiagnosis || '',
        record.preopIndication || '',
        record.preopPlan || '',
        record.preopPreparation || '',
        record.preopRisk || '',
        record.preopSigned || '',
        now,
        now
      );
    }

    return id;
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

  close() {
    if (this._db) {
      this._db.close();
    }
  }
}

// Singleton
const db = new EMRDatabase();

module.exports = db;
