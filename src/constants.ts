/**
 * Antigravity OAuth and API constants
 * Ported from opencode-antigravity-auth
 */

export const ANTIGRAVITY_CLIENT_ID =
  "1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com";

export const ANTIGRAVITY_CLIENT_SECRET = "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";

export const ANTIGRAVITY_SCOPES: readonly string[] = [
  "https://www.googleapis.com/auth/cloud-platform",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/cclog",
  "https://www.googleapis.com/auth/experimentsandconfigs",
];

export const ANTIGRAVITY_REDIRECT_URI = "http://localhost:51121/oauth-callback";

// Endpoint fallback order (daily → autopush → prod)
export const ANTIGRAVITY_ENDPOINT_DAILY =
  "https://daily-cloudcode-pa.sandbox.googleapis.com";
export const ANTIGRAVITY_ENDPOINT_AUTOPUSH =
  "https://autopush-cloudcode-pa.sandbox.googleapis.com";
export const ANTIGRAVITY_ENDPOINT_PROD = "https://cloudcode-pa.googleapis.com";

export const ANTIGRAVITY_ENDPOINTS = [
  ANTIGRAVITY_ENDPOINT_DAILY,
  ANTIGRAVITY_ENDPOINT_AUTOPUSH,
  ANTIGRAVITY_ENDPOINT_PROD,
] as const;

export const ANTIGRAVITY_HEADERS = {
  "User-Agent": "antigravity/1.11.5 windows/amd64",
  "X-Goog-Api-Client": "google-cloud-sdk vscode_cloudshelleditor/0.1",
  "Client-Metadata":
    '{"ideType":"IDE_UNSPECIFIED","platform":"PLATFORM_UNSPECIFIED","pluginType":"GEMINI"}',
} as const;

// Default project ID when Antigravity does not return one
export const ANTIGRAVITY_DEFAULT_PROJECT_ID = "rising-fact-p41fc";

// Available models
export const AVAILABLE_MODELS = {
  "gemini-3-pro-low": {
    id: "gemini-3-pro-low",
    object: "model",
    created: Date.now(),
    owned_by: "google",
    thinkingLevel: "low",
  },
  "gemini-3-pro-high": {
    id: "gemini-3-pro-high",
    object: "model",
    created: Date.now(),
    owned_by: "google",
    thinkingLevel: "high",
  },
  "gemini-3-flash": {
    id: "gemini-3-flash",
    object: "model",
    created: Date.now(),
    owned_by: "google",
  },
  "claude-sonnet-4-5": {
    id: "claude-sonnet-4-5",
    object: "model",
    created: Date.now(),
    owned_by: "anthropic",
  },
  "claude-sonnet-4-5-thinking-low": {
    id: "claude-sonnet-4-5-thinking-low",
    object: "model",
    created: Date.now(),
    owned_by: "anthropic",
    thinkingBudget: 8192,
  },
  "claude-sonnet-4-5-thinking-medium": {
    id: "claude-sonnet-4-5-thinking-medium",
    object: "model",
    created: Date.now(),
    owned_by: "anthropic",
    thinkingBudget: 16384,
  },
  "claude-sonnet-4-5-thinking-high": {
    id: "claude-sonnet-4-5-thinking-high",
    object: "model",
    created: Date.now(),
    owned_by: "anthropic",
    thinkingBudget: 32768,
  },
  "claude-opus-4-5-thinking-low": {
    id: "claude-opus-4-5-thinking-low",
    object: "model",
    created: Date.now(),
    owned_by: "anthropic",
    thinkingBudget: 8192,
  },
  "claude-opus-4-5-thinking-medium": {
    id: "claude-opus-4-5-thinking-medium",
    object: "model",
    created: Date.now(),
    owned_by: "anthropic",
    thinkingBudget: 16384,
  },
  "claude-opus-4-5-thinking-high": {
    id: "claude-opus-4-5-thinking-high",
    object: "model",
    created: Date.now(),
    owned_by: "anthropic",
    thinkingBudget: 32768,
  },
  "gpt-oss-120b-medium": {
    id: "gpt-oss-120b-medium",
    object: "model",
    created: Date.now(),
    owned_by: "google",
  },
} as const;

export type ModelId = keyof typeof AVAILABLE_MODELS;
