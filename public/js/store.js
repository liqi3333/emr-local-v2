/**
 * Central state management — lightweight observable store.
 * Usage: import { store } from './store.js'
 */
class Store {
  constructor() {
    this._listeners = new Map();
    this._state = {
      currentPatient: null,   // Patient object or null
      currentDisease: null,   // string or null
      emrData: null,          // { chief, hpi, past, exam, lab, diag, diff, plan } or null
      attendingData: null,    // { summary, diagnosis, analysis, treatment, signed } or null
      chiefData: null,        // { chiefSummary, chiefDiagnosis, chiefAnalysis, chiefTreatment, chiefSigned } or null
      preopData: null,        // { preopDiagnosis, preopIndication, preopPlan, preopPreparation, preopRisk, preopSigned } or null
      discussionData: null,   // { discussionParticipants, discussionCaseSummary, discussionDiagnosis, discussionContent, discussionConclusion, discussionSigned } or null
      surgeryData: null,      // { surgeryName, surgerySurgeon, surgeryAssistant, surgeryAnesthesia, surgeryProcess, surgeryFindings, surgerySigned } or null
      dischargeData: null,    // { dischargeAdmissionDate, dischargeDate, dischargeDiagnosis, dischargeTreatment, dischargeOutcome, dischargeAdvice, dischargeSigned } or null
      chatMessages: [],       // [{ role, content, timestamp }]
      loading: false,         // boolean
      loadingLabel: '',       // e.g. "生成病历中..."
      error: null,            // string or null
      patients: [],           // Patient[] (loaded from DB)
      records: [],            // EMRRecord[] (loaded from DB)
      searchQuery: '',        // disease search filter
      sidebarCollapsed: false,
      activeTab: 'firstCourse', // DEPRECATED: kept for backward compat, use activeType instead
      toastMessage: null,     // { type: 'success'|'error'|'info', text }

      // ─── Registry-driven state (Phase 4) ───
      recordRegistry: null,   // { categories: [...] } from API, null until loaded
      activeCategory: 'clinicalRecords', // current category ID
      activeType: 'firstCourse',         // current type ID within active category
      currentRecordId: null,             // ID of the record being edited (null = new)

      // ─── Disease catalog state ───
      diseaseCategories: null, // Array of category objects from /api/diseases, null until loaded
    };
  }

  get state() {
    return this._state;
  }

  /**
   * Partial state update — merges and notifies.
   * @param {Partial<import('./store').State>} partial
   */
  setState(partial) {
    const prevState = { ...this._state };
    const changedKeys = [];

    for (const [key, value] of Object.entries(partial)) {
      if (!Object.is(this._state[key], value)) {
        this._state[key] = value;
        changedKeys.push(key);
      }
    }

    if (changedKeys.length > 0) {
      this._notify(changedKeys, prevState);
    }
  }

  /** Reset state to defaults (except patients/records from DB and registry) */
  reset() {
    const prevState = { ...this._state };
    const keep = {
      patients: this._state.patients,
      records: this._state.records,
      recordRegistry: this._state.recordRegistry,
      diseaseCategories: this._state.diseaseCategories,
    };

    // A6 fix: dynamically clear ALL type storeKeys from registry.
    // Previously only emrData was reset, leaving attendingData/chiefData/
    // preopData/discussionData/surgeryData/dischargeData + 6 consent/nursing
    // slots residual → wrong-patient documentation risk on patient switch.
    const dataSlots = {};
    const reg = this._state.recordRegistry;
    if (reg && Array.isArray(reg.categories)) {
      for (const cat of reg.categories) {
        for (const t of cat.types) {
          if (t.storeKey) dataSlots[t.storeKey] = null;
        }
      }
    }
    // Fallback: if registry not loaded yet, clear known legacy slots
    if (Object.keys(dataSlots).length === 0) {
      [
        'emrData', 'attendingData', 'chiefData', 'preopData',
        'discussionData', 'surgeryData', 'dischargeData',
        'surgeryConsentData', 'bloodTransfusionConsentData', 'anesthesiaConsentData',
        'nursingAssessmentData', 'nursingPlanData', 'nursingRecordSheetData',
      ].forEach(k => { dataSlots[k] = null; });
    }

    this._state = {
      currentPatient: null,
      currentDisease: null,
      ...dataSlots,
      chatMessages: [],
      loading: false,
      loadingLabel: '',
      error: null,
      searchQuery: '',
      sidebarCollapsed: false,
      toastMessage: null,
      activeCategory: 'clinicalRecords',
      activeType: 'firstCourse',
      currentRecordId: null,
      ...keep,
    };
    this._notify(Object.keys(this._state), prevState);
  }

  /**
   * Clear ALL type data slots (emrData, attendingData, ...) while keeping
   * currentPatient, registry, patients list, etc.
   * Used when switching patients to prevent wrong-patient residual data (A6).
   */
  clearAllTypeData() {
    const prevState = { ...this._state };
    const slots = {};
    const reg = this._state.recordRegistry;
    if (reg && Array.isArray(reg.categories)) {
      for (const cat of reg.categories) {
        for (const t of cat.types) {
          if (t.storeKey) slots[t.storeKey] = null;
        }
      }
    }
    if (Object.keys(slots).length === 0) {
      [
        'emrData', 'attendingData', 'chiefData', 'preopData',
        'discussionData', 'surgeryData', 'dischargeData',
        'surgeryConsentData', 'bloodTransfusionConsentData', 'anesthesiaConsentData',
        'nursingAssessmentData', 'nursingPlanData', 'nursingRecordSheetData',
      ].forEach(k => { slots[k] = null; });
    }
    this._state = { ...this._state, ...slots, currentRecordId: null };
    this._notify([...Object.keys(slots), 'currentRecordId'], prevState);
  }

  /**
   * Subscribe to state changes.
   * @param {string} key   - State key to watch, or '*' for all
   * @param {Function} fn  - Callback(newValue, oldValue)
   * @returns {Function} unsubscribe
   */
  subscribe(key, fn) {
    if (!this._listeners.has(key)) {
      this._listeners.set(key, new Set());
    }
    this._listeners.get(key).add(fn);
    return () => this._listeners.get(key)?.delete(fn);
  }

  /** Show a toast notification (auto-dismiss after 3s) */
  toast(type, text) {
    this.setState({ toastMessage: { type, text } });
    setTimeout(() => {
      if (this._state.toastMessage?.text === text) {
        this.setState({ toastMessage: null });
      }
    }, 3000);
  }

  // ─── Registry-driven helpers ───

  /** Get the type config object for a typeId from the registry */
  getTypeConfig(typeId) {
    const reg = this._state.recordRegistry;
    if (!reg) return null;
    for (const cat of reg.categories) {
      const found = cat.types.find(t => t.id === typeId);
      if (found) return found;
    }
    return null;
  }

  /** Get the category config object for a categoryId from the registry */
  getCategoryConfig(categoryId) {
    const reg = this._state.recordRegistry;
    if (!reg) return null;
    return reg.categories.find(c => c.id === categoryId) || null;
  }

  /** Get data for the currently active type (reads from the appropriate store key) */
  getActiveTypeData() {
    const typeConfig = this.getTypeConfig(this._state.activeType);
    if (!typeConfig) return null;
    return this._state[typeConfig.storeKey] || null;
  }

  /** Set data for a given typeId (writes to the appropriate store key) */
  setTypeData(typeId, data) {
    const typeConfig = this.getTypeConfig(typeId);
    if (typeConfig) {
      // A6: stamp current patient id on data for cross-patient save guard.
      // _patientId is a client-only marker; it is never sent to the backend
      // (EmrPreview._saveRecord builds the record by iterating registry
      // fields only, so this key stays in memory).
      if (data && typeof data === 'object' && this._state.currentPatient?.id) {
        data = { ...data, _patientId: this._state.currentPatient.id };
      }
      this.setState({ [typeConfig.storeKey]: data });
    }
  }

  /**
   * Set active type and sync backward-compat activeTab.
   * Call this when user clicks a type tab.
   */
  setActiveType(typeId) {
    const typeConfig = this.getTypeConfig(typeId);
    const categoryId = typeConfig
      ? this._findCategoryForType(typeId)
      : this._state.activeCategory;
    this.setState({
      activeType: typeId,
      activeCategory: categoryId || this._state.activeCategory,
      activeTab: typeId, // backward compat for old EmrPreview.js
    });
  }

  /** Find which category contains the given typeId */
  _findCategoryForType(typeId) {
    const reg = this._state.recordRegistry;
    if (!reg) return null;
    for (const cat of reg.categories) {
      if (cat.types.some(t => t.id === typeId)) return cat.id;
    }
    return null;
  }

  _notify(changedKeys, prevState) {
    const allListeners = this._listeners.get('*');
    if (allListeners) {
      [...allListeners].forEach((fn) => fn(this._state, prevState));
    }

    for (const key of changedKeys) {
      const fns = this._listeners.get(key);
      if (fns && fns.size > 0) {
        [...fns].forEach((fn) => fn(this._state[key], prevState[key]));
      }
    }
  }
}

export const store = new Store();
