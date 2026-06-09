/**
 * Database persistence layer — Backend API + IndexedDB fallback.
 * Uses backend API when available, falls back to IndexedDB for offline mode.
 * Usage: import { db } from './db.js'
 */

const API_BASE = '/api';

// ─── IndexedDB (offline fallback) ───
const DB_NAME = "emr-local-v2";
const DB_VERSION = 1;
const STORE_PATIENTS = "patients";
const STORE_RECORDS = "records";

class IndexedDBFallback {
  constructor() {
    this._db = null;
    this._readyPromise = this._init();
  }

  async _init() {
    this._db = await new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_PATIENTS)) {
          const ps = db.createObjectStore(STORE_PATIENTS, { keyPath: "id" });
          ps.createIndex("name", "name", { unique: false });
          ps.createIndex("createdAt", "createdAt", { unique: false });
        }
        if (!db.objectStoreNames.contains(STORE_RECORDS)) {
          const rs = db.createObjectStore(STORE_RECORDS, { keyPath: "id" });
          rs.createIndex("patientId", "patientId", { unique: false });
          rs.createIndex("disease", "disease", { unique: false });
          rs.createIndex("createdAt", "createdAt", { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async _ensureReady() {
    if (!this._db) await this._readyPromise;
  }

  async _do(mode, storeName, callback) {
    await this._ensureReady();
    return new Promise((resolve, reject) => {
      const tx = this._db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);
      const req = callback(store);
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
    });
  }

  async getPatients() {
    return this._do("readonly", STORE_PATIENTS, (store) => store.getAll()).then(
      (res) => res || [],
    );
  }

  async savePatient(patient) {
    const now = new Date().toISOString();
    const data = {
      ...patient,
      id: patient.id || crypto.randomUUID(),
      createdAt: patient.createdAt || now,
      updatedAt: now,
    };
    await this._do("readwrite", STORE_PATIENTS, (store) => store.put(data));
    return data.id;
  }

  async deletePatient(id) {
    await this._do("readwrite", STORE_PATIENTS, (store) => store.delete(id));
    const records = await this.getRecords(id);
    for (const r of records) {
      await this.deleteRecord(r.id);
    }
  }

  async getRecords(patientId) {
    const all = await this._do("readonly", STORE_RECORDS, (store) =>
      store.getAll(),
    ).then((res) => res || []);
    if (patientId) return all.filter((r) => r.patientId === patientId);
    return all;
  }

  async saveRecord(record) {
    const now = new Date().toISOString();
    const data = {
      ...record,
      id: record.id || crypto.randomUUID(),
      createdAt: record.createdAt || now,
      updatedAt: now,
    };
    await this._do("readwrite", STORE_RECORDS, (store) => store.put(data));
    return data.id;
  }

  async deleteRecord(id) {
    await this._do("readwrite", STORE_RECORDS, (store) => store.delete(id));
  }

  async ensureSamplePatient() {
    const patients = await this.getPatients();
    if (patients.length === 0) {
      const id = await this.savePatient({
        name: "示例患者",
        gender: "男",
        age: 45,
        bedNo: "12",
      });
      return id;
    }
    return patients[0].id;
  }
}

// ─── Backend API ───
class BackendAPI {
  async _fetch(url, options = {}) {
    const res = await fetch(`${API_BASE}${url}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
  }

  async getPatients() {
    const data = await this._fetch('/patients');
    return data.patients || [];
  }

  async getPatientById(id) {
    const data = await this._fetch(`/patients/${id}`);
    return data.patient;
  }

  async savePatient(patient) {
    const data = await this._fetch('/patients', {
      method: 'POST',
      body: JSON.stringify(patient),
    });
    return data.patient.id;
  }

  async deletePatient(id) {
    await this._fetch(`/patients/${id}`, { method: 'DELETE' });
  }

  async getRecords(patientId) {
    const query = patientId ? `?patientId=${patientId}` : '';
    const data = await this._fetch(`/records${query}`);
    return data.records || [];
  }

  async getRecordById(id) {
    const data = await this._fetch(`/records/${id}`);
    return data.record;
  }

  async saveRecord(record) {
    const data = await this._fetch('/records', {
      method: 'POST',
      body: JSON.stringify(record),
    });
    return data.record.id;
  }

  async deleteRecord(id) {
    await this._fetch(`/records/${id}`, { method: 'DELETE' });
  }

  async getStats() {
    return this._fetch('/stats');
  }

  async ensureSamplePatient() {
    const patients = await this.getPatients();
    if (patients.length === 0) {
      const id = await this.savePatient({
        name: "示例患者",
        gender: "男",
        age: 45,
        bedNo: "12",
      });
      return id;
    }
    return patients[0].id;
  }
}

// ─── Main DB class with automatic fallback ───
class EMRDatabase {
  constructor() {
    this._backend = new BackendAPI();
    this._offline = new IndexedDBFallback();
    this._useBackend = true; // Will be set to false if backend unavailable
  }

  async _checkBackend() {
    try {
      await this._backend.getPatients();
      this._useBackend = true;
    } catch {
      this._useBackend = false;
      console.log('[DB] Backend unavailable, using IndexedDB fallback');
    }
  }

  async getPatients() {
    await this._checkBackend();
    if (this._useBackend) {
      return this._backend.getPatients();
    }
    return this._offline.getPatients();
  }

  async getPatientById(id) {
    await this._checkBackend();
    if (this._useBackend) {
      return this._backend.getPatientById(id);
    }
    const patients = await this._offline.getPatients();
    return patients.find(p => p.id === id);
  }

  async savePatient(patient) {
    await this._checkBackend();
    if (this._useBackend) {
      return this._backend.savePatient(patient);
    }
    return this._offline.savePatient(patient);
  }

  async deletePatient(id) {
    await this._checkBackend();
    if (this._useBackend) {
      return this._backend.deletePatient(id);
    }
    return this._offline.deletePatient(id);
  }

  async getRecords(patientId) {
    await this._checkBackend();
    if (this._useBackend) {
      return this._backend.getRecords(patientId);
    }
    return this._offline.getRecords(patientId);
  }

  async getRecordById(id) {
    await this._checkBackend();
    if (this._useBackend) {
      return this._backend.getRecordById(id);
    }
    const records = await this._offline.getRecords();
    return records.find(r => r.id === id);
  }

  async saveRecord(record) {
    await this._checkBackend();
    if (this._useBackend) {
      return this._backend.saveRecord(record);
    }
    return this._offline.saveRecord(record);
  }

  async deleteRecord(id) {
    await this._checkBackend();
    if (this._useBackend) {
      return this._backend.deleteRecord(id);
    }
    return this._offline.deleteRecord(id);
  }

  async getStats() {
    await this._checkBackend();
    if (this._useBackend) {
      return this._backend.getStats();
    }
    // Offline fallback - basic stats
    const patients = await this._offline.getPatients();
    const records = await this._offline.getRecords();
    return {
      patientCount: patients.length,
      recordCount: records.length,
      diseaseStats: [],
    };
  }

  async ensureSamplePatient() {
    await this._checkBackend();
    if (this._useBackend) {
      return this._backend.ensureSamplePatient();
    }
    return this._offline.ensureSamplePatient();
  }

  /** Check if using backend */
  isUsingBackend() {
    return this._useBackend;
  }
}

export const db = new EMRDatabase();
