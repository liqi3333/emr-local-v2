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
      activeTab: 'firstCourse', // current EMR tab: 'firstCourse'|'attendingRound'|'chiefRound'|'preop'|'discussion'|'surgery'|'discharge'
      toastMessage: null,     // { type: 'success'|'error'|'info', text }
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

  /** Reset state to defaults (except patients/records from DB) */
  reset() {
    const prevState = { ...this._state };
    const keep = { patients: this._state.patients, records: this._state.records };
    this._state = {
      currentPatient: null,
      currentDisease: null,
      emrData: null,
      chatMessages: [],
      loading: false,
      loadingLabel: '',
      error: null,
      searchQuery: '',
      sidebarCollapsed: false,
      toastMessage: null,
      ...keep,
    };
    this._notify(Object.keys(this._state), prevState);
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
