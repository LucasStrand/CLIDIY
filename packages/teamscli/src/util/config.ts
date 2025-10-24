import fs from "fs";
import path from "path";
import { getConfigPath, getAppDir } from "./paths.js";

export interface AppConfig {
  clientId?: string;
  tenantId?: string;
  account?: {
    /** MSAL homeAccountId */
    homeAccountId: string;
    username: string;
  };
}

export function readConfig(): AppConfig {
  const p = getConfigPath();
  if (!fs.existsSync(p)) return {};
  try {
    const raw = fs.readFileSync(p, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function writeConfig(cfg: AppConfig): void {
  const dir = getAppDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(getConfigPath(), JSON.stringify(cfg, null, 2));
}

export function getSetting(name: "clientId" | "tenantId"): string | undefined {
  const envMap: Record<string, string | undefined> = {
    clientId: process.env.TEAMSCLI_CLIENT_ID,
    tenantId: process.env.TEAMSCLI_TENANT_ID,
  };
  return envMap[name] ?? readConfig()[name];
}
