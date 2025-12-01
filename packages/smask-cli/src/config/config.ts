import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { getConfigPath, getAppDir } from "../util/paths.js";

/**
 * Model-specific configuration
 */
export interface GeminiConfig {
  apiKey?: string | undefined;
  oauthToken?: string | undefined;
  refreshToken?: string | undefined;
}

export interface OpenAIConfig {
  apiKey?: string | undefined;
}

export interface AnthropicConfig {
  apiKey?: string | undefined;
}

/**
 * Main application configuration
 */
export interface SmaskConfig {
  defaultModel?: string | undefined;
  models?: {
    gemini?: GeminiConfig | undefined;
    openai?: OpenAIConfig | undefined;
    anthropic?: AnthropicConfig | undefined;
  } | undefined;
}

/**
 * Read the configuration file.
 * Returns an empty object if the file doesn't exist or is invalid.
 */
export function readConfig(): SmaskConfig {
  const configPath = getConfigPath();
  if (!existsSync(configPath)) {
    return {};
  }
  try {
    const raw = readFileSync(configPath, "utf8");
    const parsed = JSON.parse(raw) as SmaskConfig;
    return parsed;
  } catch {
    return {};
  }
}

/**
 * Write the configuration to disk.
 */
export function writeConfig(config: SmaskConfig): void {
  const configPath = getConfigPath();
  ensureDir(configPath);
  writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");
}

/**
 * Update specific fields in the configuration.
 */
export function updateConfig(patch: Partial<SmaskConfig>): SmaskConfig {
  const current = readConfig();
  const next: SmaskConfig = { ...current };

  if (patch.defaultModel !== undefined) {
    const trimmed = patch.defaultModel.trim();
    if (trimmed) {
      next.defaultModel = trimmed;
    } else {
      delete next.defaultModel;
    }
  }

  if (patch.models !== undefined) {
    next.models = {
      ...current.models,
      ...patch.models,
    };
  }

  writeConfig(next);
  return next;
}

/**
 * Get the default model name, or undefined if not set.
 */
export function getDefaultModel(): string | undefined {
  return readConfig().defaultModel;
}

/**
 * Set the default model.
 */
export function setDefaultModel(modelName: string): void {
  updateConfig({ defaultModel: modelName });
}

/**
 * Get the Gemini API key from config or environment.
 */
export function getGeminiApiKey(): string | undefined {
  return process.env["GEMINI_API_KEY"] ?? readConfig().models?.gemini?.apiKey;
}

/**
 * Set the Gemini API key in the config.
 */
export function setGeminiApiKey(apiKey: string): void {
  const config = readConfig();
  updateConfig({
    models: {
      ...config.models,
      gemini: {
        ...config.models?.gemini,
        apiKey: apiKey.trim(),
      },
    },
  });
}

/**
 * Get the Gemini OAuth tokens from config.
 */
export function getGeminiOAuthTokens(): { accessToken?: string | undefined; refreshToken?: string | undefined } {
  const geminiConfig = readConfig().models?.gemini;
  return {
    accessToken: geminiConfig?.oauthToken,
    refreshToken: geminiConfig?.refreshToken,
  };
}

/**
 * Set the Gemini OAuth tokens in the config.
 */
export function setGeminiOAuthTokens(accessToken: string, refreshToken?: string): void {
  const config = readConfig();
  const existingRefreshToken = config.models?.gemini?.refreshToken;
  const newRefreshToken = refreshToken ?? existingRefreshToken;
  
  const geminiConfig: GeminiConfig = {
    ...config.models?.gemini,
    oauthToken: accessToken,
  };
  
  if (newRefreshToken) {
    geminiConfig.refreshToken = newRefreshToken;
  }
  
  updateConfig({
    models: {
      ...config.models,
      gemini: geminiConfig,
    },
  });
}

/**
 * Clear all Gemini credentials.
 */
export function clearGeminiCredentials(): void {
  const config = readConfig();
  if (config.models?.gemini) {
    const { apiKey: _a, oauthToken: _b, refreshToken: _c, ...rest } = config.models.gemini;
    const newModels = { ...config.models };
    if (Object.keys(rest).length > 0) {
      newModels.gemini = rest as GeminiConfig;
    } else {
      delete newModels.gemini;
    }
    writeConfig({ ...config, models: newModels });
  }
}

/**
 * Check if Gemini is configured (has API key or OAuth token).
 */
export function isGeminiConfigured(): boolean {
  return !!(getGeminiApiKey() || getGeminiOAuthTokens().accessToken);
}

/**
 * Ensure the directory for a file path exists.
 */
function ensureDir(filePath: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/**
 * Get the app directory path.
 */
export { getAppDir, getConfigPath } from "../util/paths.js";

