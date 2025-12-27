/**
 * OAuth authentication for Antigravity (Google login)
 */

import {
  ANTIGRAVITY_CLIENT_ID,
  ANTIGRAVITY_CLIENT_SECRET,
  ANTIGRAVITY_REDIRECT_URI,
  ANTIGRAVITY_SCOPES,
  ANTIGRAVITY_ENDPOINTS,
  ANTIGRAVITY_HEADERS,
  ANTIGRAVITY_DEFAULT_PROJECT_ID,
} from "./constants";

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  email?: string;
  projectId: string;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  token_type: string;
}

interface UserInfo {
  email?: string;
  name?: string;
}

/**
 * Generate PKCE code verifier and challenge
 */
function generatePKCE(): { verifier: string; challenge: string } {
  const verifier = generateRandomString(64);
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);

  // Use synchronous crypto for PKCE
  const hashBuffer = new Bun.CryptoHasher("sha256").update(data).digest();
  const challenge = base64UrlEncode(hashBuffer);

  return { verifier, challenge };
}

function generateRandomString(length: number): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  let result = "";
  const randomValues = new Uint8Array(length);
  crypto.getRandomValues(randomValues);
  for (let i = 0; i < length; i++) {
    result += chars[randomValues[i] % chars.length];
  }
  return result;
}

function base64UrlEncode(buffer: Uint8Array): string {
  const base64 = Buffer.from(buffer).toString("base64");
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Create the authorization URL for Google OAuth
 */
export function createAuthorizationUrl(projectId = ""): {
  url: string;
  verifier: string;
  state: string;
} {
  const pkce = generatePKCE();

  const state = Buffer.from(
    JSON.stringify({ verifier: pkce.verifier, projectId: projectId || "" })
  ).toString("base64url");

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", ANTIGRAVITY_CLIENT_ID);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", ANTIGRAVITY_REDIRECT_URI);
  url.searchParams.set("scope", ANTIGRAVITY_SCOPES.join(" "));
  url.searchParams.set("code_challenge", pkce.challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", state);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");

  return {
    url: url.toString(),
    verifier: pkce.verifier,
    state,
  };
}

/**
 * Decode the OAuth state parameter
 */
function decodeState(state: string): { verifier: string; projectId: string } {
  try {
    const normalized = state.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4)) % 4),
      "="
    );
    const json = Buffer.from(padded, "base64").toString("utf8");
    const parsed = JSON.parse(json);
    return {
      verifier: parsed.verifier || "",
      projectId: parsed.projectId || "",
    };
  } catch {
    return { verifier: "", projectId: "" };
  }
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCodeForTokens(
  code: string,
  state: string
): Promise<AuthTokens> {
  const { verifier, projectId } = decodeState(state);

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: ANTIGRAVITY_CLIENT_ID,
      client_secret: ANTIGRAVITY_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
      redirect_uri: ANTIGRAVITY_REDIRECT_URI,
      code_verifier: verifier,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token exchange failed: ${errorText}`);
  }

  const tokenData = (await response.json()) as TokenResponse;

  if (!tokenData.refresh_token) {
    throw new Error("No refresh token received");
  }

  // Get user info
  const userInfo = await fetchUserInfo(tokenData.access_token);

  // Get project ID from Antigravity API
  let effectiveProjectId = projectId;
  if (!effectiveProjectId) {
    effectiveProjectId = await fetchProjectId(tokenData.access_token);
  }

  return {
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token,
    expiresAt: Date.now() + tokenData.expires_in * 1000,
    email: userInfo.email,
    projectId: effectiveProjectId || ANTIGRAVITY_DEFAULT_PROJECT_ID,
  };
}

/**
 * Refresh an access token using the refresh token
 */
export async function refreshAccessToken(
  refreshToken: string
): Promise<{ accessToken: string; expiresAt: number }> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: ANTIGRAVITY_CLIENT_ID,
      client_secret: ANTIGRAVITY_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token refresh failed: ${errorText}`);
  }

  const tokenData = (await response.json()) as TokenResponse;

  return {
    accessToken: tokenData.access_token,
    expiresAt: Date.now() + tokenData.expires_in * 1000,
  };
}

/**
 * Fetch user info from Google
 */
async function fetchUserInfo(accessToken: string): Promise<UserInfo> {
  try {
    const response = await fetch(
      "https://www.googleapis.com/oauth2/v1/userinfo?alt=json",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (response.ok) {
      return (await response.json()) as UserInfo;
    }
  } catch {
    // Ignore errors
  }
  return {};
}

/**
 * Fetch project ID from Antigravity loadCodeAssist endpoint
 */
async function fetchProjectId(accessToken: string): Promise<string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    "User-Agent": "google-api-nodejs-client/9.15.1",
    "X-Goog-Api-Client": "google-cloud-sdk vscode_cloudshelleditor/0.1",
    "Client-Metadata": ANTIGRAVITY_HEADERS["Client-Metadata"],
  };

  for (const endpoint of ANTIGRAVITY_ENDPOINTS) {
    try {
      const response = await fetch(`${endpoint}/v1internal:loadCodeAssist`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          metadata: {
            ideType: "IDE_UNSPECIFIED",
            platform: "PLATFORM_UNSPECIFIED",
            pluginType: "GEMINI",
          },
        }),
      });

      if (!response.ok) continue;

      const data = (await response.json()) as {
        cloudaicompanionProject?: string | { id?: string };
      };

      if (typeof data.cloudaicompanionProject === "string") {
        return data.cloudaicompanionProject;
      }
      if (
        data.cloudaicompanionProject &&
        typeof data.cloudaicompanionProject === "object" &&
        data.cloudaicompanionProject.id
      ) {
        return data.cloudaicompanionProject.id;
      }
    } catch {
      // Try next endpoint
    }
  }

  return "";
}

/**
 * Check if tokens are expired (with 5 minute buffer)
 */
export function isTokenExpired(expiresAt: number): boolean {
  return Date.now() > expiresAt - 5 * 60 * 1000;
}
