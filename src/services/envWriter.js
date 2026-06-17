/**
 * Environment File Writer Service
 * Reads and updates .env file for model configuration sync.
 */

const fs = require("fs");
const path = require("path");

const ENV_PATH = path.join(__dirname, "../../.env");

// Provider to env variable prefix mapping
const PROVIDER_PREFIX_MAP = {
  openai: "OPENAI",
  claude: "CLAUDE",
  gemini: "GEMINI",
  deepseek: "DEEPSEEK",
  ollama: "OLLAMA",
};

// Default .env template (used if file doesn't exist)
const DEFAULT_ENV_TEMPLATE = `# AI API Keys (服务端代理，Key 不会暴露到前端)
OPENAI_API_KEY=
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o

CLAUDE_API_KEY=
CLAUDE_BASE_URL=https://api.anthropic.com
CLAUDE_MODEL=claude-sonnet-4-20250514

GEMINI_API_KEY=
GEMINI_BASE_URL=https://generativelanguage.googleapis.com/v1beta
GEMINI_MODEL=gemini-2.5-flash

DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat

OLLAMA_API_KEY=
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2

# 服务端默认提供商 (openai / claude / gemini / deepseek / ollama)
DEFAULT_PROVIDER=openai

# 端口
PORT=8000
`;

/**
 * Read .env file and parse into key-value object
 * Preserves comments and empty lines for rewriting
 */
function readEnvFile() {
  if (!fs.existsSync(ENV_PATH)) {
    // Create default .env file if it doesn't exist
    fs.writeFileSync(ENV_PATH, DEFAULT_ENV_TEMPLATE, "utf-8");
  }

  const content = fs.readFileSync(ENV_PATH, "utf-8");
  const lines = content.split("\n");
  const vars = {};

  for (const line of lines) {
    const trimmed = line.trim();
    // Skip comments and empty lines
    if (!trimmed || trimmed.startsWith("#")) continue;

    // Parse KEY=VALUE
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (match) {
      vars[match[1]] = match[2];
    }
  }

  return { vars, lines };
}

/**
 * Write .env file from lines array
 */
function writeEnvFile(lines) {
  const content = lines.join("\n");
  fs.writeFileSync(ENV_PATH, content, "utf-8");
}

/**
 * Update or add a variable in the lines array
 * Returns new lines array
 */
function upsertVariable(lines, key, value) {
  const prefix = `${key}=`;
  let found = false;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith(prefix) || trimmed === `${key}=`) {
      lines[i] = `${key}=${value}`;
      found = true;
      break;
    }
  }

  if (!found) {
    // Find the provider section comment and insert after it
    const providerPrefix = key.split("_")[0];
    let insertIndex = lines.length;

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (
        trimmed.startsWith(`# ${providerPrefix}`) ||
        trimmed.startsWith(`# ${providerPrefix.toLowerCase()}`)
      ) {
        // Find the end of this section (next comment or empty line)
        insertIndex = i + 1;
        while (insertIndex < lines.length) {
          const next = lines[insertIndex].trim();
          if (next.startsWith("#") || next === "") break;
          insertIndex++;
        }
        break;
      }
    }

    lines.splice(insertIndex, 0, `${key}=${value}`);
  }

  return lines;
}

/**
 * Update model configuration in .env file
 * @param {string} provider - Provider name (openai, claude, gemini, deepseek, ollama)
 * @param {object} config - Configuration object { baseUrl, model, apiKey }
 * @returns {object} - { success: boolean, error?: string }
 */
function updateEnvConfig(provider, config) {
  try {
    const prefix = PROVIDER_PREFIX_MAP[provider];
    if (!prefix) {
      return { success: false, error: `Unknown provider: ${provider}` };
    }

    const { vars, lines } = readEnvFile();

    // Update variables
    if (config.apiKey !== undefined) {
      upsertVariable(lines, `${prefix}_API_KEY`, config.apiKey);
    }
    if (config.baseUrl !== undefined) {
      upsertVariable(lines, `${prefix}_BASE_URL`, config.baseUrl);
    }
    if (config.model !== undefined) {
      upsertVariable(lines, `${prefix}_MODEL`, config.model);
    }

    // Update DEFAULT_PROVIDER
    upsertVariable(lines, "DEFAULT_PROVIDER", provider);

    // Write back
    writeEnvFile(lines);

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Get current .env configuration for all providers
 */
function getAllEnvConfig() {
  const { vars } = readEnvFile();
  const config = {};

  for (const [providerName, prefix] of Object.entries(PROVIDER_PREFIX_MAP)) {
    config[providerName] = {
      apiKey: vars[`${prefix}_API_KEY`] || "",
      baseUrl: vars[`${prefix}_BASE_URL`] || "",
      model: vars[`${prefix}_MODEL`] || "",
    };
  }

  config.defaultProvider = vars["DEFAULT_PROVIDER"] || "openai";
  return config;
}

module.exports = {
  updateEnvConfig,
  getAllEnvConfig,
  ENV_PATH,
};
