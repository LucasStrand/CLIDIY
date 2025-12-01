import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Get the root directory for smask configuration files.
 * Defaults to ~/.smask
 */
export function getAppDir(): string {
  return process.env["SMASK_CONFIG_DIR"] ?? join(homedir(), ".smask");
}

/**
 * Get the path to the main configuration file.
 */
export function getConfigPath(): string {
  return join(getAppDir(), "config.json");
}

/**
 * Get the path to the token cache file.
 */
export function getTokenCachePath(): string {
  return join(getAppDir(), "tokens.json");
}




