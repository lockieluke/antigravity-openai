/**
 * Token storage for persisting OAuth credentials
 */

import { homedir } from "os";
import { join } from "path";
import { mkdir, readFile, writeFile, unlink } from "fs/promises";
import type { AuthTokens } from "./oauth";

const CONFIG_DIR = join(homedir(), ".config", "antigravity-openai");
const TOKENS_FILE = join(CONFIG_DIR, "tokens.json");

interface StoredTokens {
  version: number;
  tokens: AuthTokens;
}

/**
 * Ensure the config directory exists
 */
async function ensureConfigDir(): Promise<void> {
  try {
    await mkdir(CONFIG_DIR, { recursive: true });
  } catch {
    // Directory might already exist
  }
}

/**
 * Save tokens to disk
 */
export async function saveTokens(tokens: AuthTokens): Promise<void> {
  await ensureConfigDir();

  const data: StoredTokens = {
    version: 1,
    tokens,
  };

  await writeFile(TOKENS_FILE, JSON.stringify(data, null, 2), "utf-8");
}

/**
 * Load tokens from disk
 */
export async function loadTokens(): Promise<AuthTokens | null> {
  try {
    const content = await readFile(TOKENS_FILE, "utf-8");
    const data = JSON.parse(content) as StoredTokens;

    if (data.version !== 1 || !data.tokens) {
      return null;
    }

    return data.tokens;
  } catch {
    return null;
  }
}

/**
 * Clear stored tokens
 */
export async function clearTokens(): Promise<void> {
  try {
    await unlink(TOKENS_FILE);
  } catch {
    // File might not exist
  }
}

/**
 * Check if tokens are stored
 */
export async function hasStoredTokens(): Promise<boolean> {
  const tokens = await loadTokens();
  return tokens !== null;
}
