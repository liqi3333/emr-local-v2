/**
 * Backend API client — communicates with the Express proxy server.
 * All AI calls go through the backend to keep API keys secure.
 * Usage: import { api } from './services/api.js'
 */

const BASE = '/api';
const TIMEOUT = 60_000; // 60s for non-streaming calls
const STREAM_TIMEOUT = 120_000; // 120s for streaming calls

/** Helper: fetch with timeout */
async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`请求超时（${timeoutMs / 1000}秒），请检查网络或模型配置`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** Get active model config from localStorage (shared with Settings panel) */
function getModelConfig() {
  try {
    const activeId = localStorage.getItem('activeModelId') || '';
    if (activeId === '__offline__') return null;
    const models = JSON.parse(localStorage.getItem('models') || '[]');
    const active = models.find((m) => m.id === activeId) || models[0];
    if (!active) return null;
    return {
      provider: active.provider || 'openai',
      model: active.modelName || 'gpt-4o',
      apiKey: active.apiKey || '',
      baseUrl: active.baseUrl || '',
    };
  } catch {
    return null;
  }
}

/**
 * Non-streaming chat completion via backend proxy.
 * @param {{ role: string, content: string }[]} messages
 * @param {object} [overrides]
 * @returns {Promise<{ content: string }>}
 */
export async function chatCompletion(messages, overrides = {}) {
  const cfg = getModelConfig();
  const res = await fetchWithTimeout(`${BASE}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages,
      provider: overrides.provider || cfg?.provider,
      model: overrides.model || cfg?.model,
      apiKey: overrides.apiKey || cfg?.apiKey,
      baseUrl: overrides.baseUrl || cfg?.baseUrl,
    }),
  }, TIMEOUT);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

/**
 * Streaming chat completion via backend SSE proxy.
 * @param {{ role: string, content: string }[]} messages
 * @param {(chunk: string) => void} onChunk - called with each text chunk
 * @param {object} [overrides]
 * @returns {Promise<string>} full response text
 */
export async function chatStream(messages, onChunk, overrides = {}) {
  const cfg = getModelConfig();
  const res = await fetchWithTimeout(`${BASE}/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages,
      provider: overrides.provider || cfg?.provider,
      model: overrides.model || cfg?.model,
      apiKey: overrides.apiKey || cfg?.apiKey,
      baseUrl: overrides.baseUrl || cfg?.baseUrl,
    }),
  }, STREAM_TIMEOUT);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return _readSSEStream(res, onChunk);
}

/**
 * Get preop summary template for a disease.
 * @param {string} disease
 * @returns {Promise<{template: object|null}>}
 */
export async function getPreopTemplate(disease) {
  const res = await fetchWithTimeout(`${BASE}/templates/preop/${encodeURIComponent(disease)}`, {}, TIMEOUT);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

/**
 * Generate structured EMR for a disease (non-streaming).
 * @param {string} disease
 * @param {object} [patientInfo]
 * @param {object} [overrides]
 * @returns {Promise<{ emr: object|null, content: string, parseError?: boolean }>}
 */
export async function generateEMR(disease, patientInfo = {}, overrides = {}) {
  const cfg = getModelConfig();
  const res = await fetchWithTimeout(`${BASE}/emr/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      disease,
      patientInfo,
      provider: overrides.provider || cfg?.provider,
      model: overrides.model || cfg?.model,
      apiKey: overrides.apiKey || cfg?.apiKey,
      baseUrl: overrides.baseUrl || cfg?.baseUrl,
    }),
  }, TIMEOUT);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

/**
 * Generate structured attending round record (non-streaming).
 * @param {string} disease
 * @param {object} [patientInfo]
 * @param {object} [overrides]
 * @returns {Promise<{ emr: object|null, content: string, parseError?: boolean }>}
 */
export async function generateAttendingRound(disease, patientInfo = {}, emrData = {}, overrides = {}) {
  const cfg = getModelConfig();
  const res = await fetchWithTimeout(`${BASE}/attending/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      disease,
      patientInfo,
      emrData,
      provider: overrides.provider || cfg?.provider,
      model: overrides.model || cfg?.model,
      apiKey: overrides.apiKey || cfg?.apiKey,
      baseUrl: overrides.baseUrl || cfg?.baseUrl,
    }),
  }, TIMEOUT);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function generateChiefRound(disease, patientInfo = {}, emrData = {}, attendingData = {}, overrides = {}) {
  const cfg = getModelConfig();
  const res = await fetchWithTimeout(`${BASE}/chief/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      disease,
      patientInfo,
      emrData,
      attendingData,
      provider: overrides.provider || cfg?.provider,
      model: overrides.model || cfg?.model,
      apiKey: overrides.apiKey || cfg?.apiKey,
      baseUrl: overrides.baseUrl || cfg?.baseUrl,
    }),
  }, TIMEOUT);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

/**
 * Generate structured preop summary (术前小结).
 * @param {string} disease
 * @param {object} [patientInfo]
 * @param {object} [emrData]
 * @param {object} [attendingData]
 * @param {object} [overrides]
 * @returns {Promise<{ emr: object|null, content: string, parseError?: boolean }>}
 */
export async function generatePreop(disease, patientInfo = {}, emrData = {}, attendingData = {}, overrides = {}) {
  const cfg = getModelConfig();
  const res = await fetchWithTimeout(`${BASE}/preop/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      disease,
      patientInfo,
      emrData,
      attendingData,
      provider: overrides.provider || cfg?.provider,
      model: overrides.model || cfg?.model,
      apiKey: overrides.apiKey || cfg?.apiKey,
      baseUrl: overrides.baseUrl || cfg?.baseUrl,
    }),
  }, TIMEOUT);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

/**
 * Generate structured preop discussion (术前讨论).
 * @param {string} disease
 * @param {object} [patientInfo]
 * @param {object} [emrData]
 * @param {object} [attendingData]
 * @param {object} [preopData]
 * @param {object} [overrides]
 * @returns {Promise<{ emr: object|null, content: string, parseError?: boolean }>}
 */
export async function generateDiscussion(disease, patientInfo = {}, emrData = {}, attendingData = {}, preopData = {}, overrides = {}) {
  const cfg = getModelConfig();
  const res = await fetchWithTimeout(`${BASE}/discussion/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      disease,
      patientInfo,
      emrData,
      attendingData,
      preopData,
      provider: overrides.provider || cfg?.provider,
      model: overrides.model || cfg?.model,
      apiKey: overrides.apiKey || cfg?.apiKey,
      baseUrl: overrides.baseUrl || cfg?.baseUrl,
    }),
  }, TIMEOUT);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

/**
 * Generate structured surgery record (手术记录).
 * @param {string} disease
 * @param {object} [patientInfo]
 * @param {object} [emrData]
 * @param {object} [preopData]
 * @param {object} [overrides]
 * @returns {Promise<{ emr: object|null, content: string, parseError?: boolean }>}
 */
export async function generateSurgery(disease, patientInfo = {}, emrData = {}, preopData = {}, overrides = {}) {
  const cfg = getModelConfig();
  const res = await fetchWithTimeout(`${BASE}/surgery/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      disease,
      patientInfo,
      emrData,
      preopData,
      provider: overrides.provider || cfg?.provider,
      model: overrides.model || cfg?.model,
      apiKey: overrides.apiKey || cfg?.apiKey,
      baseUrl: overrides.baseUrl || cfg?.baseUrl,
    }),
  }, TIMEOUT);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

/**
 * Generate structured discharge summary (出院小结).
 * @param {string} disease
 * @param {object} [patientInfo]
 * @param {object} [emrData]
 * @param {object} [preopData]
 * @param {object} [surgeryData]
 * @param {object} [overrides]
 * @returns {Promise<{ emr: object|null, content: string, parseError?: boolean }>}
 */
export async function generateDischarge(disease, patientInfo = {}, emrData = {}, preopData = {}, surgeryData = {}, overrides = {}) {
  const cfg = getModelConfig();
  const res = await fetchWithTimeout(`${BASE}/discharge/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      disease,
      patientInfo,
      emrData,
      preopData,
      surgeryData,
      provider: overrides.provider || cfg?.provider,
      model: overrides.model || cfg?.model,
      apiKey: overrides.apiKey || cfg?.apiKey,
      baseUrl: overrides.baseUrl || cfg?.baseUrl,
    }),
  }, TIMEOUT);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

/**
 * Generate structured EMR with streaming.
 * @param {string} disease
 * @param {object} [patientInfo]
 * @param {(chunk: string) => void} onChunk
 * @param {object} [overrides]
 * @returns {Promise<void>}
 */
export async function generateEMRStream(disease, patientInfo = {}, onChunk, overrides = {}) {
  const cfg = getModelConfig();
  const res = await fetchWithTimeout(`${BASE}/emr/generate/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      disease,
      patientInfo,
      provider: overrides.provider || cfg?.provider,
      model: overrides.model || cfg?.model,
      apiKey: overrides.apiKey || cfg?.apiKey,
      baseUrl: overrides.baseUrl || cfg?.baseUrl,
    }),
  }, STREAM_TIMEOUT);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  await _readSSEStream(res, onChunk);
}

/** Internal: read SSE stream from response */
async function _readSSEStream(response, onChunk) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === '[DONE]') return fullText;

        try {
          const parsed = JSON.parse(payload);
          if (parsed.error) throw new Error(parsed.error);
          if (parsed.content) {
            fullText += parsed.content;
            if (onChunk) onChunk(parsed.content);
          }
        } catch (e) {
          if (e instanceof SyntaxError) continue; // skip malformed lines
          throw e; // propagate backend errors
        }
      }
    }
    // Process residual buffer
    if (buffer.trim()) {
      const trimmed = buffer.trim();
      if (trimmed.startsWith('data:')) {
        const payload = trimmed.slice(5).trim();
        if (payload !== '[DONE]') {
          try {
            const parsed = JSON.parse(payload);
            if (parsed.error) throw new Error(parsed.error);
            if (parsed.content) {
              fullText += parsed.content;
              if (onChunk) onChunk(parsed.content);
            }
          } catch (e) {
            if (e instanceof SyntaxError) { /* skip */ } else throw e;
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return fullText;
}

/**
 * Get attending round template for a disease.
 * @param {string} disease
 * @returns {Promise<{template: object|null}>}
 */
export async function getAttendingTemplate(disease) {
  const res = await fetchWithTimeout(`${BASE}/templates/attending/${encodeURIComponent(disease)}`, {}, TIMEOUT);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

/**
 * Get chief round template for a disease.
 * @param {string} disease
 * @returns {Promise<{template: object|null}>}
 */
export async function getChiefTemplate(disease) {
  const res = await fetchWithTimeout(`${BASE}/templates/chief/${encodeURIComponent(disease)}`, {}, TIMEOUT);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

/**
 * Get discussion template for a disease.
 * @param {string} disease
 * @returns {Promise<{template: object|null}>}
 */
export async function getDiscussionTemplate(disease) {
  const res = await fetchWithTimeout(`${BASE}/templates/discussion/${encodeURIComponent(disease)}`, {}, TIMEOUT);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

/**
 * Get surgery template for a disease.
 * @param {string} disease
 * @returns {Promise<{template: object|null}>}
 */
export async function getSurgeryTemplate(disease) {
  const res = await fetchWithTimeout(`${BASE}/templates/surgery/${encodeURIComponent(disease)}`, {}, TIMEOUT);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

/**
 * Get discharge template for a disease.
 * @param {string} disease
 * @returns {Promise<{template: object|null}>}
 */
export async function getDischargeTemplate(disease) {
  const res = await fetchWithTimeout(`${BASE}/templates/discharge/${encodeURIComponent(disease)}`, {}, TIMEOUT);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}
