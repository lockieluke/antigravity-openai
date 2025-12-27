/**
 * Antigravity API client for making requests to Google's Cloud Code API
 */

import {
  ANTIGRAVITY_ENDPOINTS,
  ANTIGRAVITY_HEADERS,
  ANTIGRAVITY_DEFAULT_PROJECT_ID,
  AVAILABLE_MODELS,
  type ModelId,
} from "./constants";
import { refreshAccessToken, isTokenExpired, type AuthTokens } from "./oauth";
import { saveTokens, loadTokens } from "./storage";

interface GenerateContentRequest {
  contents: Array<{
    role: string;
    parts: Array<{ text?: string;[key: string]: unknown }>;
  }>;
  generationConfig?: {
    temperature?: number;
    topP?: number;
    topK?: number;
    maxOutputTokens?: number;
    thinkingConfig?: {
      includeThoughts?: boolean;
      thinkingLevel?: string;
      thinkingBudget?: number;
      include_thoughts?: boolean;
      thinking_budget?: number;
    };
    [key: string]: unknown;
  };
  systemInstruction?: {
    parts: Array<{ text: string }>;
  };
  tools?: unknown[];
  toolConfig?: unknown;
  [key: string]: unknown;
}

interface AntigravityRequest {
  project: string;
  model: string;
  request: GenerateContentRequest;
  userAgent?: string;
  requestId?: string;
}

export interface StreamChunk {
  type: "content" | "thinking" | "done" | "error";
  content?: string;
  thinking?: string;
  error?: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

/**
 * Antigravity API client
 */
export class AntigravityClient {
  private tokens: AuthTokens | null = null;
  private initialized = false;

  /**
   * Initialize the client by loading stored tokens
   */
  async initialize(): Promise<boolean> {
    if (this.initialized) return true;

    this.tokens = await loadTokens();
    this.initialized = true;

    return this.tokens !== null;
  }

  /**
   * Set tokens directly (used after OAuth flow)
   */
  async setTokens(tokens: AuthTokens): Promise<void> {
    this.tokens = tokens;
    await saveTokens(tokens);
    this.initialized = true;
  }

  /**
   * Check if the client has valid tokens
   */
  hasValidTokens(): boolean {
    return this.tokens !== null;
  }

  /**
   * Get current tokens
   */
  getTokens(): AuthTokens | null {
    return this.tokens;
  }

  /**
   * Ensure we have a valid access token, refreshing if needed
   */
  private async ensureValidToken(): Promise<string> {
    if (!this.tokens) {
      throw new Error("Not authenticated. Run 'bun run auth' first.");
    }

    if (isTokenExpired(this.tokens.expiresAt)) {
      console.log("[AntigravityClient] Refreshing access token...");
      const refreshed = await refreshAccessToken(this.tokens.refreshToken);
      this.tokens = {
        ...this.tokens,
        accessToken: refreshed.accessToken,
        expiresAt: refreshed.expiresAt,
      };
      await saveTokens(this.tokens);
    }

    return this.tokens.accessToken;
  }

  /**
   * Get the project ID
   */
  getProjectId(): string {
    return this.tokens?.projectId || ANTIGRAVITY_DEFAULT_PROJECT_ID;
  }

  /**
   * Resolve model name to actual Antigravity model
   */
  private resolveModel(modelId: string): {
    actualModel: string;
    thinkingConfig?: {
      thinkingLevel?: string;
      thinkingBudget?: number;
    };
    isClaude: boolean;
  } {
    const modelInfo = AVAILABLE_MODELS[modelId as ModelId];

    // Default to treating as Gemini
    const isClaude = modelId.toLowerCase().includes("claude");

    // Extract thinking config based on model type
    let thinkingConfig: { thinkingLevel?: string; thinkingBudget?: number } | undefined;

    if (modelInfo) {
      if ("thinkingLevel" in modelInfo) {
        thinkingConfig = { thinkingLevel: modelInfo.thinkingLevel };
      } else if ("thinkingBudget" in modelInfo) {
        thinkingConfig = { thinkingBudget: modelInfo.thinkingBudget };
      }
    }

    return {
      actualModel: modelId,
      thinkingConfig,
      isClaude,
    };
  }

  /**
   * Generate content (non-streaming)
   */
  async generateContent(
    model: string,
    request: GenerateContentRequest
  ): Promise<unknown> {
    const accessToken = await this.ensureValidToken();
    const { actualModel, thinkingConfig, isClaude } = this.resolveModel(model);

    // Apply thinking config
    if (thinkingConfig) {
      request.generationConfig = request.generationConfig || {};

      if (isClaude && thinkingConfig.thinkingBudget) {
        request.generationConfig.thinkingConfig = {
          include_thoughts: true,
          thinking_budget: thinkingConfig.thinkingBudget,
        };
        // Ensure max output tokens is high enough for thinking
        request.generationConfig.maxOutputTokens = Math.max(
          request.generationConfig.maxOutputTokens || 0,
          65536
        );
      } else if (thinkingConfig.thinkingLevel) {
        request.generationConfig.thinkingConfig = {
          includeThoughts: true,
          thinkingLevel: thinkingConfig.thinkingLevel,
        };
      }
    }

    // Configure Claude tool calling mode
    if (isClaude && request.tools && request.tools.length > 0) {
      request.toolConfig = {
        functionCallingConfig: { mode: "VALIDATED" },
      };
    }

    const body: AntigravityRequest = {
      project: this.getProjectId(),
      model: actualModel,
      request,
      userAgent: "antigravity",
      requestId: `agent-${crypto.randomUUID()}`,
    };

    // Try endpoints in order
    for (const endpoint of ANTIGRAVITY_ENDPOINTS) {
      try {
        const response = await fetch(
          `${endpoint}/v1internal:generateContent`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${accessToken}`,
              ...ANTIGRAVITY_HEADERS,
            },
            body: JSON.stringify(body),
          }
        );

        if (response.ok) {
          const data = await response.json() as { response?: unknown };
          return data.response || data;
        }

        // Retry on certain errors
        if (response.status === 403 || response.status === 404 || response.status >= 500) {
          continue;
        }

        // Return error for other status codes
        const errorText = await response.text();
        throw new Error(`API error ${response.status}: ${errorText}`);
      } catch (error) {
        if (endpoint === ANTIGRAVITY_ENDPOINTS[ANTIGRAVITY_ENDPOINTS.length - 1]) {
          throw error;
        }
        // Continue to next endpoint
      }
    }

    throw new Error("All Antigravity endpoints failed");
  }

  /**
   * Generate content with streaming
   */
  async *streamGenerateContent(
    model: string,
    request: GenerateContentRequest
  ): AsyncGenerator<StreamChunk> {
    const accessToken = await this.ensureValidToken();
    const { actualModel, thinkingConfig, isClaude } = this.resolveModel(model);

    // Apply thinking config
    if (thinkingConfig) {
      request.generationConfig = request.generationConfig || {};

      if (isClaude && thinkingConfig.thinkingBudget) {
        request.generationConfig.thinkingConfig = {
          include_thoughts: true,
          thinking_budget: thinkingConfig.thinkingBudget,
        };
        request.generationConfig.maxOutputTokens = Math.max(
          request.generationConfig.maxOutputTokens || 0,
          65536
        );
      } else if (thinkingConfig.thinkingLevel) {
        request.generationConfig.thinkingConfig = {
          includeThoughts: true,
          thinkingLevel: thinkingConfig.thinkingLevel,
        };
      }
    }

    // Configure Claude tool calling mode
    if (isClaude && request.tools && request.tools.length > 0) {
      request.toolConfig = {
        functionCallingConfig: { mode: "VALIDATED" },
      };
    }

    // Add interleaved thinking header for Claude
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      Accept: "text/event-stream",
      ...ANTIGRAVITY_HEADERS,
    };

    if (isClaude && thinkingConfig?.thinkingBudget) {
      headers["anthropic-beta"] = "interleaved-thinking-2025-05-14";
    }

    const body: AntigravityRequest = {
      project: this.getProjectId(),
      model: actualModel,
      request,
      userAgent: "antigravity",
      requestId: `agent-${crypto.randomUUID()}`,
    };

    let lastError: Error | null = null;

    // Try endpoints in order
    for (const endpoint of ANTIGRAVITY_ENDPOINTS) {
      try {
        const response = await fetch(
          `${endpoint}/v1internal:streamGenerateContent?alt=sse`,
          {
            method: "POST",
            headers,
            body: JSON.stringify(body),
          }
        );

        if (!response.ok) {
          if (response.status === 403 || response.status === 404 || response.status >= 500) {
            continue;
          }
          const errorText = await response.text();
          throw new Error(`API error ${response.status}: ${errorText}`);
        }

        if (!response.body) {
          throw new Error("No response body");
        }

        // Process SSE stream
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            yield { type: "done" };
            return;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data:")) continue;

            const jsonStr = line.slice(5).trim();
            if (!jsonStr) continue;

            try {
              const data = JSON.parse(jsonStr) as {
                response?: {
                  candidates?: Array<{
                    content?: {
                      parts?: Array<{
                        text?: string;
                        thought?: boolean;
                        type?: string;
                        thinking?: string;
                      }>;
                    };
                  }>;
                  usageMetadata?: {
                    promptTokenCount?: number;
                    candidatesTokenCount?: number;
                    totalTokenCount?: number;
                  };
                };
              };

              const response = data.response;
              if (!response?.candidates?.[0]?.content?.parts) continue;

              for (const part of response.candidates[0].content.parts) {
                if (part.thought === true || part.type === "thinking") {
                  yield {
                    type: "thinking",
                    thinking: part.text || part.thinking || "",
                  };
                } else if (part.text) {
                  yield {
                    type: "content",
                    content: part.text,
                  };
                }
              }

              // Include usage if available
              if (response.usageMetadata) {
                yield {
                  type: "content",
                  usage: {
                    promptTokens: response.usageMetadata.promptTokenCount,
                    completionTokens: response.usageMetadata.candidatesTokenCount,
                    totalTokens: response.usageMetadata.totalTokenCount,
                  },
                };
              }
            } catch {
              // Skip malformed JSON
            }
          }
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (endpoint === ANTIGRAVITY_ENDPOINTS[ANTIGRAVITY_ENDPOINTS.length - 1]) {
          yield { type: "error", error: lastError.message };
          return;
        }
        // Continue to next endpoint
      }
    }

    yield { type: "error", error: lastError?.message || "All endpoints failed" };
  }
}

// Singleton instance
export const client = new AntigravityClient();
