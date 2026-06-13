/**
 * Database persistence layer — Backend API only.
 * All data is stored in the backend SQLite database.
 * Usage: import { db } from './db.js'
 */

const API_BASE = '/api';

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

class EMRDatabase {
  constructor() {
    this._backend = new BackendAPI();
  }

  async getPatients()             { return this._backend.getPatients(); }
  async getPatientById(id)        { return this._backend.getPatientById(id); }
  async savePatient(patient)      { return this._backend.savePatient(patient); }
  async deletePatient(id)         { return this._backend.deletePatient(id); }
  async getRecords(patientId)     { return this._backend.getRecords(patientId); }
  async getRecordById(id)         { return this._backend.getRecordById(id); }
  async saveRecord(record)        { return this._backend.saveRecord(record); }
  async deleteRecord(id)          { return this._backend.deleteRecord(id); }
  async getStats()                { return this._backend.getStats(); }
  async ensureSamplePatient()     { return this._backend.ensureSamplePatient(); }
}

export const db = new EMRDatabase();
