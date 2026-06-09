/**
 * AI Service Layer
 *
 * Supports three providers:
 *   - OpenAI-compatible (OpenAI, Azure, Ollama, etc.)
 *   - Anthropic Claude
 *   - Google Gemini
 *
 * Exports:
 *   callAI(provider, model, messages, apiKey, baseUrl) → string
 *   streamAI(provider, model, messages, apiKey, baseUrl) → AsyncGenerator<string>
 */

// ──────────────────────────────────────────────
//  Default configurations from environment
// ──────────────────────────────────────────────
const DEFAULTS = {
  openai: {
    baseUrl: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
    model: process.env.OPENAI_MODEL || "gpt-4o",
    apiKey: process.env.OPENAI_API_KEY || "",
  },
  claude: {
    baseUrl: "https://api.anthropic.com",
    model: process.env.CLAUDE_MODEL || "claude-sonnet-4-20250514",
    apiKey: process.env.CLAUDE_API_KEY || "",
  },
  gemini: {
    baseUrl: "https://generativelanguage.googleapis.com",
    model: process.env.GEMINI_MODEL || "gemini-2.0-flash",
    apiKey: process.env.GEMINI_API_KEY || "",
  },
  deepseek: {
    baseUrl: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com/v1",
    model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
    apiKey: process.env.DEEPSEEK_API_KEY || "",
  },
  ollama: {
    baseUrl: process.env.OLLAMA_BASE_URL || "http://localhost:11434/v1",
    model: process.env.OLLAMA_MODEL || "qwen2.5:1.5b",
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
      url = `${resolvedBase.replace(/\/+$/, "")}/chat/completions`;
      headers = { "Content-Type": "application/json" };
      if (resolvedKey) headers.Authorization = `Bearer ${resolvedKey}`;
      body = {
        model: resolvedModel,
        messages,
        stream,
      };
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
      url = `${cleanBase}/models/${resolvedModel}:${endpoint}?key=${resolvedKey}`;
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

      body = { contents };
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
    case "ollama":
      return data.choices?.[0]?.message?.content || "";
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
    case "deepseek":
    case "ollama": {
      const choice = parsed.choices?.[0];
      if (!choice) return null;
      // Finish reason indicates end
      if (choice.finish_reason) return null;
      return choice.delta?.content || null;
    }
    case "claude": {
      if (parsed.type === "content_block_delta" && parsed.delta?.text) {
        return parsed.delta.text;
      }
      return null;
    }
    case "gemini": {
      const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
      return text || null;
    }
    default:
      return null;
  }
}

// ──────────────────────────────────────────────
//  SSE line reader (async generator)
// ──────────────────────────────────────────────

async function* readSSEStream(body, provider) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      // Keep the last partial line in the buffer
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();

        // Skip empty lines and event type lines (data is what we need)
        if (!trimmed || trimmed.startsWith("event:")) continue;
        if (!trimmed.startsWith("data:")) continue;

        // Extract the JSON payload after "data: "
        const payload = trimmed.slice(5).trim();

        // OpenAI sends "[DONE]" as the final signal
        if (payload === "[DONE]") return;

        try {
          const parsed = JSON.parse(payload);
          const chunk = extractStreamChunk(provider, parsed);
          if (chunk) yield chunk;
        } catch {
          // Skip malformed JSON lines
        }
      }
    }

    // Process remaining buffer content
    if (buffer.trim()) {
      const trimmed = buffer.trim();
      if (trimmed.startsWith("data:")) {
        const payload = trimmed.slice(5).trim();
        if (payload !== "[DONE]") {
          try {
            const parsed = JSON.parse(payload);
            const chunk = extractStreamChunk(provider, parsed);
            if (chunk) yield chunk;
          } catch {
            // ignore
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// ──────────────────────────────────────────────
//  Exported API
// ──────────────────────────────────────────────

/**
 * Non-streaming AI call.
 * Returns the full response text.
 */
const { getTemplate } = require("../data/templates");

/** Mock response for when no API key is configured */
function mockCallAI(messages) {
  // Extract the last user message or system prompt
  const lastMsg = messages
    .filter((m) => m.role === "user" || m.role === "system")
    .pop();
  const text = lastMsg?.content || "";

  // If the prompt looks like an EMR generation request, return structured JSON
  if (
    text.includes("电子病历") ||
    text.includes("主诉") ||
    text.includes("chief")
  ) {
    const diseaseMatch =
      text.match(/["\u201c\u201d]([^\u201c\u201d"]+)["\u201c\u201d]/) ||
      text.match(/疾病["\u201c\u201d]?([^，。,.！\n]+)/);
    const disease = diseaseMatch ? diseaseMatch[1].trim() : "示例疾病";

    // Check for a professional template first
    const template = getTemplate(disease);
    if (template) {
      return JSON.stringify(template);
    }

    // Fallback to generic mock response
    return JSON.stringify({
      chief: `${disease}患者因「腹痛」就诊，疼痛位于右下腹，呈持续性钝痛，伴恶心、呕吐。`,
      hpi: `患者于3天前无明显诱因出现上腹部隐痛，1天前转移至右下腹，呈持续性钝痛，伴恶心、呕吐2次，为胃内容物。无畏寒、发热。查体：T 37.8℃，右下腹麦氏点压痛阳性，反跳痛阳性。`,
      past: "既往体健，否认高血压、糖尿病史。否认手术外伤史。否认药物过敏史。",
      exam: "T 37.8℃ P 88次/分 R 20次/分 BP 120/80mmHg。腹部平坦，未见胃肠蠕动波及腹壁静脉曲张。右下腹麦氏点压痛阳性，反跳痛阳性，腹肌稍紧张。结肠充气试验阳性。",
      lab: "血常规：WBC 12.5×10^9/L，NEUT% 85%。CRP 35mg/L。腹部B超提示：阑尾增粗，直径约0.8cm，壁厚约0.3cm，可见粪石。",
      diag: disease,
      diff: "1. 急性胃肠炎\n2. 右侧输尿管结石\n3. 异位妊娠破裂（育龄期女性）\n4. 肠系膜淋巴结炎",
      plan: "1. 完善术前检查：凝血功能、心电图、胸片\n2. 急诊行腹腔镜阑尾切除术\n3. 术后抗感染治疗：头孢替安 2g ivgtt bid\n4. 术后禁食、补液、对症支持治疗",
    });
  }

  return `（模拟回复）您的问题是：${text.slice(0, 100)}。请在 .env 中配置 API Key 或通过前端界面添加模型以获得 AI 真实回复。`;
}

/** Mock streaming — yields chunks progressively */
async function* mockStreamAI(messages) {
  const full = mockCallAI(messages);
  // Yield in small chunks to simulate streaming
  const chunkSize = 3;
  for (let i = 0; i < full.length; i += chunkSize) {
    yield full.slice(i, i + chunkSize);
    await new Promise((r) => setTimeout(r, 15));
  }
}

function hasApiKey(provider, apiKey) {
  if (provider && resolveProvider(provider) === "ollama") return true;
  if (apiKey) return true;
  const config = DEFAULTS[resolveProvider(provider)];
  return !!(config && config.apiKey);
}

async function callAI(provider, model, messages, apiKey, baseUrl) {
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
        signal: AbortSignal.timeout(120_000), // 2 min timeout
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new Error(
          `[${resolvedProvider}] HTTP ${response.status}: ${response.statusText} — ${errorText.slice(0, 200)}`,
        );
      }

      const data = await response.json();
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
async function* streamAI(provider, model, messages, apiKey, baseUrl) {
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
    signal: AbortSignal.timeout(180_000), // 3 min timeout
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

  yield* readSSEStream(response.body, resolvedProvider);
}

module.exports = { callAI, streamAI, resolveProvider };
