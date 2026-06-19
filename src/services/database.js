/**
 * SQLite Database Service Layer
 * Stores patients and EMR records persistently on the server.
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const DB_PATH = path.join(__dirname, '../../data/emr-local.db');
const DB_DIR = path.dirname(DB_PATH);

// Ensure data directory exists before opening the database
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const { RECORD_DATA_COLUMNS } = require('../data/recordColumns');

// P3: validate SQL identifiers before interpolation. Current sources are
// hardcoded arrays (safe), but this guards against future dynamic column
// names from Registry input. Fail-closed: throws on any non-conforming char.
const _IDENT_RE = /^[a-zA-Z0-9_]+$/;
function _validateIdent(name) {
  if (typeof name !== 'string' || !_IDENT_RE.test(name)) {
    throw new Error(`Invalid SQL identifier: ${JSON.stringify(name)}`);
  }
  return name;
}


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

    this._db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
    `);

    // P2: column additions, category backfill, and type/category indexes
    // are now handled by versioned migrations (v1) in _runMigrations() below.
    // Backfill category for legacy records
    try {
      this._db.exec("UPDATE records SET category = 'clinicalRecords' WHERE category IS NULL OR category = ''");
    } catch { /* ignore */ }

    // P2: versioned migrations. The base CREATE TABLE IF NOT EXISTS above
    // plus the B4 PRAGMA-driven ALTER loop already bring any DB to the
    // current schema idempotently. The schema_version table records which
    // migrations have run, so future schema changes can be added as new
    // versioned steps without re-running everything on every boot. Each
    // migration runs inside a transaction; a crash mid-migration leaves the
    // version untouched so it re-runs cleanly.
    this._runMigrations();
  }

  /** Versioned migration runner. Each migration is a function executed in a
   *  transaction; on success its version is recorded in schema_version. */
  _runMigrations() {
    this._db.exec(`
      CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER PRIMARY KEY,
        appliedAt TEXT NOT NULL
      );
    `);
    const applied = new Set(
      this._db.prepare('SELECT version FROM schema_version').all().map(r => r.version)
    );
    const migrations = this._migrations();
    const setVersion = this._db.prepare(
      'INSERT INTO schema_version (version, appliedAt) VALUES (?, ?)'
    );
    for (const m of migrations) {
      if (applied.has(m.version)) continue;
      const tx = this._db.transaction(() => {
        m.run(this._db);
        setVersion.run(m.version, new Date().toISOString());
      });
      tx();
    }
  }

  /** Migration definitions. v1 is the baseline that captures the schema as
   *  it existed before versioning (additive ALTERs + indexes). Existing DBs
   *  that predate this system will run v1 once to get recorded; brand-new DBs
   *  also run v1 (ALTERs are no-ops since columns already exist in CREATE
   *  TABLE, indexes are IF NOT EXISTS). Future schema changes append here. */
  _migrations() {
    return [
      {
        version: 1,
        run: (db) => {
          // Add any RECORD_DATA_COLUMNS missing from the table (B4 logic,
          // now inside a transaction).
          const existingCols = new Set(
            db.prepare('PRAGMA table_info(records)').all().map(c => c.name)
          );
          for (const col of RECORD_DATA_COLUMNS) {
            if (!existingCols.has(col)) {
              _validateIdent(col);
              db.exec(`ALTER TABLE records ADD COLUMN ${col} TEXT DEFAULT ''`);
            }
          }
          // category column (non-empty default, not in RECORD_DATA_COLUMNS)
          if (!existingCols.has('category')) {
            db.exec("ALTER TABLE records ADD COLUMN category TEXT DEFAULT 'clinicalRecords'");
          }
          // Backfill category for legacy records
          db.exec("UPDATE records SET category = 'clinicalRecords' WHERE category IS NULL OR category = ''");
          // Indexes (IF NOT EXISTS so safe to re-run)
          db.exec(`
            CREATE INDEX IF NOT EXISTS idx_records_type ON records(type);
            CREATE INDEX IF NOT EXISTS idx_records_category ON records(category);
          `);
        },
      },
      {
        version: 2,
        run: (db) => {
          // A4: drop orphan chiefNotes column (never referenced, always empty)
          const cols = new Set(
            db.prepare('PRAGMA table_info(records)').all().map(c => c.name)
          );
          if (cols.has('chiefNotes')) {
            db.exec('ALTER TABLE records DROP COLUMN chiefNotes');
          }
        },
      },
    ];
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

  // P1: server-side filtering + pagination. Backward compatible — calling
  // getRecords(patientId) with no options behaves exactly as before (SELECT *
  // all rows for that patient). opts.type / opts.category add WHERE filters;
  // opts.limit / opts.offset add pagination. Values are parameterized (safe).
  getRecords(patientId, opts = {}) {
    const where = [];
    const params = [];
    if (patientId) { where.push('patientId = ?'); params.push(patientId); }
    if (opts.type) { where.push('type = ?'); params.push(opts.type); }
    if (opts.category) { where.push('category = ?'); params.push(opts.category); }
    // A1: default to lightweight columns for list views;
    // pass opts.full = true to get all data columns (e.g. for full inspection).
    const selectCols = opts.full
      ? '*'
      : 'id, patientId, disease, type, category, content, createdAt, updatedAt';
    let sql = `SELECT ${selectCols} FROM records`;
    if (where.length > 0) sql += ' WHERE ' + where.join(' AND ');
    sql += ' ORDER BY createdAt DESC';
    if (opts.limit) {
      const limit = parseInt(opts.limit, 10);
      if (Number.isFinite(limit) && limit > 0) {
        sql += ' LIMIT ?';
        params.push(limit);
        const offset = parseInt(opts.offset, 10);
        if (Number.isFinite(offset) && offset > 0) {
          sql += ' OFFSET ?';
          params.push(offset);
        }
      }
    }
    return this._db.prepare(sql).all(...params);
  }

  getRecordById(id) {
    return this._db.prepare('SELECT * FROM records WHERE id = ?').get(id);
  }

  saveRecord(record, typeConfig) {
    const now = new Date().toISOString();
    const isUpdate = !!record.id;
    const id = isUpdate ? record.id : crypto.randomUUID();

    // Auto-generate SQL from RECORD_DATA_COLUMNS
    const dataValues = RECORD_DATA_COLUMNS.map(c => record[c] || '');

    // Build content JSON: prefer registry-driven, fallback to old switch/case
    const content = typeConfig
      ? this._buildRecordContentFromRegistry(record, typeConfig)
      : this._buildRecordContent(record);

    if (isUpdate) {
      const setClauses = [
        'disease = ?', 'type = ?', 'category = ?', 'content = ?',
        ...RECORD_DATA_COLUMNS.map(c => `${_validateIdent(c)} = ?`),
        'updatedAt = ?'
      ];
      const params = [
        record.disease,
        record.type || 'firstCourse',
        record.category || 'clinicalRecords',
        JSON.stringify(content),
        ...dataValues,
        now,
        id
      ];
      this._db.prepare(`UPDATE records SET ${setClauses.join(', ')} WHERE id = ?`).run(...params);
    } else {
      const insertCols = ['id', 'patientId', 'disease', 'type', 'category', 'content', ...RECORD_DATA_COLUMNS, 'createdAt', 'updatedAt'];
      insertCols.forEach(_validateIdent);
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
