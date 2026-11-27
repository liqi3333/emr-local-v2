/**
 * AI Service Layer
 *
 * Supports three providers:
 *   - OpenAI-compatible (OpenAI, Azure, Ollama, etc.)
 *   - Anthropic Claude
 *   - Google Gemini
 *
 * Exports:
 *   callAI(provider, model, messages, apiKey, baseUrl, onStats?) → string
 *   streamAI(provider, model, messages, apiKey, baseUrl, onStats?) → AsyncGenerator<string>
 *
 *   onStats is called with normalized Ollama timing data when available.
 */

// ──────────────────────────────────────────────
//  Default configurations from environment
// ──────────────────────────────────────────────
const DEFAULTS = {
  openai: {
    baseUrl: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
    model: process.env.OPENAI_MODEL || "gpt-5.4",
    apiKey: process.env.OPENAI_API_KEY || "",
  },
  claude: {
    baseUrl: "https://api.anthropic.com",
    model: process.env.CLAUDE_MODEL || "claude-sonnet-4-6",
    apiKey: process.env.CLAUDE_API_KEY || "",
  },
  gemini: {
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
    apiKey: process.env.GEMINI_API_KEY || "",
  },
  deepseek: {
    baseUrl: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com/v1",
    model: process.env.DEEPSEEK_MODEL || "deepseek-v4-flash",
    apiKey: process.env.DEEPSEEK_API_KEY || "",
  },
  ollama: {
    baseUrl: process.env.OLLAMA_BASE_URL || "http://localhost:11434/v1",
    model: process.env.OLLAMA_MODEL || "qwen3:1.7b",
    apiKey: process.env.OLLAMA_API_KEY || "",
  },
};

// ──────────────────────────────────────────────
//  Helpers – build request payload per provider
// ──────────────────────────────────────────────

/**
 * Normalise provider string (accept "openai", "claude", "gemini").
 * Falls back to DEFAULT_PROVIDER env or "openai".
 */
function resolveProvider(provider) {
  const p = (
    provider ||
    process.env.DEFAULT_PROVIDER ||
    "openai"
  ).toLowerCase();
  if (p === "anthropic") return "claude";
  if (p === "deepseek" || p === "ollama") return p;
  if (!["openai", "claude", "gemini", "deepseek", "ollama"].includes(p)) return "openai";
  return p;
}

/**
 * Build the fetch URL, headers, and body for a given provider.
 */
function buildRequest({
  provider: rawProvider,
  model,
  messages,
  apiKey,
  baseUrl,
  stream = false,
}) {
  const provider = resolveProvider(rawProvider);
  const config = DEFAULTS[provider];
  const resolvedKey = apiKey || config.apiKey;
  const resolvedBase = baseUrl || config.baseUrl;
  const resolvedModel = model || config.model;

  let url, headers, body;

  switch (provider) {
    case "ollama": {
      // Use Ollama's native /api/chat endpoint so the final chunk contains
      // timing stats (prompt_eval_duration, eval_duration, etc.). The OpenAI
      // compatibility layer does not expose those fields.
      const nativeBase = (
        process.env.OLLAMA_NATIVE_BASE_URL ||
        resolvedBase.replace(/\/v1\/?$/, "")
      ).replace(/\/+$/, "");
      url = `${nativeBase}/api/chat`;
      headers = { "Content-Type": "application/json" };
      if (resolvedKey) headers.Authorization = `Bearer ${resolvedKey}`;
      body = {
        model: resolvedModel,
        messages,
        stream,
      };
      // qwen3 等模型默认开启「思考」，在 CPU 推理下会先输出上千个隐藏
      // reasoning token（且 content 始终为空，导致生成失败/看似无响应）。
      // 默认关闭；需要质量优先时在 .env 设置 OLLAMA_THINK=true。
      if (process.env.OLLAMA_THINK !== "true") {
        body.think = false;
      }
      break;
    }

    // ──── OpenAI / DeepSeek ────
    case "openai":
    case "deepseek": {
      url = `${resolvedBase.replace(/\/+$/, "")}/chat/completions`;
      headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resolvedKey}`,
      };
      body = {
        model: resolvedModel,
        messages,
        stream,
      };
      break;
    }

    // ──── Anthropic Claude ────
    case "claude": {
      url = `${resolvedBase.replace(/\/+$/, "")}/v1/messages`;
      headers = {
        "Content-Type": "application/json",
        "x-api-key": resolvedKey,
        "anthropic-version": "2023-06-01",
      };
      // Claude separates system prompt from messages
      let system;
      const claudeMessages = messages
        .filter((m) => {
          if (m.role === "system") {
            system = m.content;
            return false;
          }
          return true;
        })
        .map((m) => ({
          role: m.role === "assistant" ? "assistant" : "user",
          content: m.content,
        }));
      body = {
        model: resolvedModel,
        messages: claudeMessages,
        max_tokens: 4096,
        stream,
      };
      if (system) body.system = system;
      break;
    }

    // ──── Google Gemini ────
    case "gemini": {
      const endpoint = stream ? "streamGenerateContent" : "generateContent";
      // Remove trailing slash from baseUrl if present
      const cleanBase = resolvedBase.replace(/\/+$/, "");
      const altParam = stream ? "&alt=sse" : "";
      url = `${cleanBase}/models/${resolvedModel}:${endpoint}?key=${resolvedKey}${altParam}`;
      headers = { "Content-Type": "application/json" };

      // Gemini uses {contents} instead of {messages}, system_instruction is separate
      let systemInstruction;
      const contents = messages
        .filter((m) => {
          if (m.role === "system") {
            systemInstruction = m.content;
            return false;
          }
          return true;
        })
        .map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        }));

      body = {
        contents,
        generationConfig: {
          maxOutputTokens: 4096,
          temperature: 0.7,
        },
      };
      if (systemInstruction) {
        body.system_instruction = { parts: [{ text: systemInstruction }] };
      }
      break;
    }

    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }

  return { url, headers, body };
}

/**
 * Extract response text from provider-specific JSON response (non-streaming).
 */
function extractResponseText(provider, data) {
  switch (provider) {
    case "openai":
    case "deepseek":
      return data.choices?.[0]?.message?.content || "";
    case "ollama":
      return data.message?.content || "";
    case "claude":
      return data.content?.map((c) => c.text).join("") || "";
    case "gemini":
      return (
        data.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || ""
      );
    default:
      return "";
  }
}

/**
 * Extract a text chunk from a single SSE data line (streaming).
 * Returns null if the line is not a text-carrying event.
 */
function extractStreamChunk(provider, parsed) {
  if (!parsed) return null;

  switch (provider) {
    case "openai":
    case "deepseek": {
      const choice = parsed.choices?.[0];
      if (!choice) return null;
      // Finish reason indicates end
      if (choice.finish_reason) return null;
      return choice.delta?.content || null;
    }
    case "ollama": {
      // Native Ollama puts the text in message.content. The final done:true
      // chunk usually has empty content, but keep it if the model sent a token.
      return parsed.message?.content || null;
    }
    case "claude": {
      if (parsed.type === "content_block_delta" && parsed.delta?.text) {
        return parsed.delta.text;
      }
      return null;
    }
    case "gemini": {
      // Streaming returns array [{$ref, candidates}], non-streaming returns object
      const chunk = Array.isArray(parsed) ? parsed[0] : parsed;
      const text = chunk?.candidates?.[0]?.content?.parts?.[0]?.text;
      return text || null;
    }
    default:
      return null;
  }
}

/**
 * Normalize Ollama native stats. Durations are nanoseconds in the API;
 * convert to milliseconds and compute tokens/second.
 */
function normalizeOllamaStats(data) {
  const ms = (ns) => (typeof ns === "number" && Number.isFinite(ns) ? ns / 1e6 : null);
  const evalCount = typeof data.eval_count === "number" ? data.eval_count : null;
  const evalDurationMs = ms(data.eval_duration);
  return {
    provider: "ollama",
    totalDurationMs: ms(data.total_duration),
    loadDurationMs: ms(data.load_duration),
    promptEvalCount: typeof data.prompt_eval_count === "number" ? data.prompt_eval_count : null,
    promptEvalDurationMs: ms(data.prompt_eval_duration),
    evalCount,
    evalDurationMs,
    tokensPerSecond: evalCount != null && evalDurationMs
      ? evalCount / (evalDurationMs / 1000)
      : null,
  };
}

// ──────────────────────────────────────────────
//  SSE line reader (async generator)
// ──────────────────────────────────────────────

async function* readSSEStream(body, provider, onStats) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  // Parses one line. Returns { done: true } for the end sentinel, { chunk }
  // for a text chunk, or null when the line carries no text.
  const handleLine = (line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("event:")) return null;

    let payload;
    if (trimmed.startsWith("data:")) {
      payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") return { done: true };
    } else if (provider === "ollama") {
      // Native Ollama streams NDJSON (one JSON object per line).
      payload = trimmed;
    } else {
      return null;
    }

    try {
      const parsed = JSON.parse(payload);
      if (provider === "ollama" && parsed.done && onStats) {
        onStats(normalizeOllamaStats(parsed));
      }
      const chunk = extractStreamChunk(provider, parsed);
      return chunk ? { chunk } : null;
    } catch {
      // Skip malformed JSON lines
      return null;
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      // Keep the last partial line in the buffer
      buffer = lines.pop() || "";

      for (const line of lines) {
        const result = handleLine(line);
        if (!result) continue;
        if (result.done) return;
        if (result.chunk) yield result.chunk;
      }
    }

    // Process remaining buffer content
    if (buffer.trim()) {
      const result = handleLine(buffer);
      if (result && !result.done && result.chunk) yield result.chunk;
    }
  } finally {
    reader.releaseLock();
  }
}

// ──────────────────────────────────────────────
//  Exported API
// ──────────────────────────────────────────────

const { mockCallAI, mockStreamAI } = require("./ai-mock");

function hasApiKey(provider, apiKey) {
  const resolved = resolveProvider(provider);
  // Ollama 是本地服务，不需要 API Key
  if (resolved === "ollama") return true;
  if (apiKey) return true;
  const config = DEFAULTS[resolved];
  if (config && config.apiKey) return true;
  return false;
}

async function callAI(provider, model, messages, apiKey, baseUrl, onStats = null) {

  // Use mock mode if no API key
  if (!hasApiKey(provider, apiKey)) {
    return mockCallAI(messages);
  }

  const resolvedProvider = resolveProvider(provider);
  const { url, headers, body } = buildRequest({
    provider,
    model,
    messages,
    apiKey,
    baseUrl,
    stream: false,
  });

  let lastError;

  // Simple retry: attempt up to 2 times
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(300_000), // 5 min timeout (本地小模型 CPU 推理较慢)
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new Error(
          `[${resolvedProvider}] HTTP ${response.status}: ${response.statusText} — ${errorText.slice(0, 200)}`,
        );
      }

      const data = await response.json();
      if (resolvedProvider === "ollama" && onStats) {
        onStats(normalizeOllamaStats(data));
      }
      const text = extractResponseText(resolvedProvider, data);
      if (!text) {
        throw new Error(`[${resolvedProvider}] Empty response from API`);
      }
      return text;
    } catch (err) {
      lastError = err;
      if (attempt === 0) {
        // Wait 1s before retrying on first failure
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }

  throw lastError;
}

/**
 * Streaming AI call.
 * Returns an AsyncGenerator that yields text chunks.
 */
async function* streamAI(provider, model, messages, apiKey, baseUrl, onStats = null) {

  // Use mock mode if no API key
  if (!hasApiKey(provider, apiKey)) {
    yield* mockStreamAI(messages);
    return;
  }

  const resolvedProvider = resolveProvider(provider);
  const { url, headers, body } = buildRequest({
    provider,
    model,
    messages,
    apiKey,
    baseUrl,
    stream: true,
  });

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(600_000), // 10 min timeout (流式输出，本地模型较慢)
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(
      `[${resolvedProvider}] HTTP ${response.status}: ${response.statusText} — ${errorText.slice(0, 200)}`,
    );
  }

  if (!response.body) {
    throw new Error(
      `[${resolvedProvider}] Response body is null (streaming not supported)`,
    );
  }

  yield* readSSEStream(response.body, resolvedProvider, onStats);
}

module.exports = { callAI, streamAI, resolveProvider, hasApiKey };
