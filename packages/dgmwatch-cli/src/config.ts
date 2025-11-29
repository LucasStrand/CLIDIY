import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

export type DgmwatchConfig = {
  host?: string;
};

const CONFIG_PATH = join(homedir(), ".dgmwatch", "config.json");

export function readConfig(): DgmwatchConfig {
  try {
    const raw = readFileSync(CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw) as DgmwatchConfig;
    const result: DgmwatchConfig = {};
    if (parsed.host?.trim()) {
      result.host = parsed.host.trim();
    }
    return result;
  } catch {
    return {};
  }
}

export function writeConfig(config: DgmwatchConfig): void {
  ensureDir(CONFIG_PATH);
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf8");
}

export function updateConfig(patch: Partial<DgmwatchConfig>): DgmwatchConfig {
  const current = readConfig();
  const next: DgmwatchConfig = { ...current };
  if (patch.host !== undefined) {
    const trimmed = patch.host.trim();
    if (trimmed) {
      next.host = trimmed;
    } else {
      delete next.host;
    }
  }
  writeConfig(next);
  return next;
}

export function getConfiguredHost(): string | undefined {
  return readConfig().host;
}

export function getConfigPath(): string {
  return CONFIG_PATH;
}

function ensureDir(path: string): void {
  try {
    mkdirSync(dirname(path), { recursive: true });
  } catch {
    // ignore errors (best effort)
  }
}

