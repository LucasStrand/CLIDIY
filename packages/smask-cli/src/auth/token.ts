import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { getTokenCachePath } from "../util/paths.js";

/**
 * Token data structure for OAuth tokens.
 */
export interface TokenData {
  accessToken: string;
  refreshToken?: string | undefined;
  expiresAt?: number | undefined;
  tokenType?: string | undefined;
  scope?: string | undefined;
}

/**
 * Token cache structure.
 */
export interface TokenCache {
  google?: TokenData;
}

/**
 * Read the token cache from disk.
 */
export function readTokenCache(): TokenCache {
  const cachePath = getTokenCachePath();
  if (!existsSync(cachePath)) {
    return {};
  }
  try {
    const raw = readFileSync(cachePath, "utf8");
    return JSON.parse(raw) as TokenCache;
  } catch {
    return {};
  }
}

/**
 * Write the token cache to disk.
 */
export function writeTokenCache(cache: TokenCache): void {
  const cachePath = getTokenCachePath();
  ensureDir(cachePath);
  writeFileSync(cachePath, JSON.stringify(cache, null, 2), "utf8");
}

/**
 * Save Google OAuth tokens.
 */
export function saveGoogleTokens(tokens: TokenData): void {
  const cache = readTokenCache();
  cache.google = tokens;
  writeTokenCache(cache);
}

/**
 * Get Google OAuth tokens.
 */
export function getGoogleTokens(): TokenData | undefined {
  return readTokenCache().google;
}

/**
 * Clear Google OAuth tokens.
 */
export function clearGoogleTokens(): void {
  const cache = readTokenCache();
  delete cache.google;
  writeTokenCache(cache);
}

/**
 * Check if Google tokens are expired.
 */
export function isGoogleTokenExpired(): boolean {
  const tokens = getGoogleTokens();
  if (!tokens?.expiresAt) {
    return true;
  }
  // Consider expired if less than 5 minutes remaining
  return Date.now() >= tokens.expiresAt - 5 * 60 * 1000;
}

/**
 * Ensure directory exists for a file path.
 */
function ensureDir(filePath: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

