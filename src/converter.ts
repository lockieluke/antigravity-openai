/**
 * Convert between OpenAI API format and Antigravity API format
 */

export interface OpenAIMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
  name?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

export interface OpenAIChatRequest {
  model: string;
  messages: OpenAIMessage[];
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  stream?: boolean;
  tools?: Array<{
    type: "function";
    function: {
      name: string;
      description?: string;
      parameters?: Record<string, unknown>;
    };
  }>;
  tool_choice?: "auto" | "none" | { type: "function"; function: { name: string } };
}

export interface AntigravityContent {
  role: "user" | "model";
  parts: Array<{
    text?: string;
    functionCall?: { name: string; args: Record<string, unknown> };
    functionResponse?: { name: string; response: unknown };
    inlineData?: { mimeType: string; data: string };
    [key: string]: unknown;
  }>;
}

export interface AntigravityRequest {
  contents: AntigravityContent[];
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
  tools?: Array<{
    functionDeclarations?: Array<{
      name: string;
      description?: string;
      parameters?: Record<string, unknown>;
    }>;
  }>;
  toolConfig?: {
    functionCallingConfig?: {
      mode?: string;
      allowedFunctionNames?: string[];
    };
  };
  [key: string]: unknown;
}

export interface OpenAIChoice {
  index: number;
  message: {
    role: "assistant";
    content: string | null;
    tool_calls?: Array<{
      id: string;
      type: "function";
      function: { name: string; arguments: string };
    }>;
  };
  finish_reason: "stop" | "length" | "tool_calls" | "content_filter" | null;
}

export interface OpenAIChatResponse {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: OpenAIChoice[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface OpenAIStreamChunk {
  id: string;
  object: "chat.completion.chunk";
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: "assistant";
      content?: string;
      tool_calls?: Array<{
        index: number;
        id?: string;
        type?: "function";
        function?: { name?: string; arguments?: string };
      }>;
    };
    finish_reason: "stop" | "length" | "tool_calls" | "content_filter" | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * Convert OpenAI messages to Antigravity format
 */
export function convertOpenAIToAntigravity(request: OpenAIChatRequest): AntigravityRequest {
  const antigravityRequest: AntigravityRequest = {
    contents: [],
  };

  // Extract system message
  const systemMessages = request.messages.filter((m) => m.role === "system");
  if (systemMessages.length > 0) {
    const systemText = systemMessages
      .map((m) => (typeof m.content === "string" ? m.content : ""))
      .join("\n\n");
    if (systemText) {
      antigravityRequest.systemInstruction = {
        parts: [{ text: systemText }],
      };
    }
  }

  // Convert messages (excluding system)
  const nonSystemMessages = request.messages.filter((m) => m.role !== "system");

  for (const msg of nonSystemMessages) {
    const content = convertMessage(msg);
    if (content) {
      antigravityRequest.contents.push(content);
    }
  }

  // Convert generation config
  if (request.temperature !== undefined || request.top_p !== undefined || request.max_tokens !== undefined) {
    antigravityRequest.generationConfig = {};

    if (request.temperature !== undefined) {
      antigravityRequest.generationConfig.temperature = request.temperature;
    }
    if (request.top_p !== undefined) {
      antigravityRequest.generationConfig.topP = request.top_p;
    }
    if (request.max_tokens !== undefined) {
      antigravityRequest.generationConfig.maxOutputTokens = request.max_tokens;
    }
  }

  // Convert tools
  if (request.tools && request.tools.length > 0) {
    const functionDeclarations = request.tools
      .filter((t) => t.type === "function")
      .map((t) => ({
        name: t.function.name,
        description: t.function.description || "",
        parameters: t.function.parameters || { type: "object", properties: {} },
      }));

    if (functionDeclarations.length > 0) {
      antigravityRequest.tools = [{ functionDeclarations }];
    }

    // Configure tool calling
    if (request.tool_choice) {
      antigravityRequest.toolConfig = { functionCallingConfig: {} };

      if (request.tool_choice === "none") {
        antigravityRequest.toolConfig.functionCallingConfig!.mode = "NONE";
      } else if (request.tool_choice === "auto") {
        antigravityRequest.toolConfig.functionCallingConfig!.mode = "AUTO";
      } else if (typeof request.tool_choice === "object") {
        antigravityRequest.toolConfig.functionCallingConfig!.mode = "ANY";
        antigravityRequest.toolConfig.functionCallingConfig!.allowedFunctionNames = [
          request.tool_choice.function.name,
        ];
      }
    }
  }

  return antigravityRequest;
}

/**
 * Convert a single OpenAI message to Antigravity content
 */
function convertMessage(msg: OpenAIMessage): AntigravityContent | null {
  const role: "user" | "model" = msg.role === "assistant" ? "model" : "user";
  const parts: AntigravityContent["parts"] = [];

  // Handle tool results
  if (msg.role === "tool" && msg.tool_call_id) {
    let responseContent: unknown;
    try {
      responseContent = typeof msg.content === "string" ? JSON.parse(msg.content) : msg.content;
    } catch {
      responseContent = { result: msg.content };
    }

    return {
      role: "user",
      parts: [
        {
          functionResponse: {
            name: msg.name || msg.tool_call_id,
            response: responseContent,
          },
        },
      ],
    };
  }

  // Handle content
  if (typeof msg.content === "string") {
    if (msg.content) {
      parts.push({ text: msg.content });
    }
  } else if (Array.isArray(msg.content)) {
    for (const item of msg.content) {
      if (item.type === "text" && item.text) {
        parts.push({ text: item.text });
      } else if (item.type === "image_url" && item.image_url?.url) {
        // Handle base64 images
        const url = item.image_url.url;
        if (url.startsWith("data:")) {
          const match = url.match(/^data:([^;]+);base64,(.+)$/);
          if (match) {
            parts.push({
              inlineData: {
                mimeType: match[1],
                data: match[2],
              },
            });
          }
        }
      }
    }
  }

  // Handle tool calls from assistant
  if (msg.role === "assistant" && msg.tool_calls) {
    for (const toolCall of msg.tool_calls) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(toolCall.function.arguments);
      } catch {
        // Use empty object if parsing fails
      }

      parts.push({
        functionCall: {
          name: toolCall.function.name,
          args,
        },
      });
    }
  }

  if (parts.length === 0) {
    return null;
  }

  return { role, parts };
}

/**
 * Convert Antigravity response to OpenAI format
 */
export function convertAntigravityToOpenAI(
  response: {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          text?: string;
          thought?: boolean;
          functionCall?: { name: string; args: Record<string, unknown> };
        }>;
      };
      finishReason?: string;
    }>;
    usageMetadata?: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
      totalTokenCount?: number;
    };
  },
  model: string,
  requestId?: string
): OpenAIChatResponse {
  const id = requestId || `chatcmpl-${crypto.randomUUID()}`;
  const created = Math.floor(Date.now() / 1000);

  const choices: OpenAIChoice[] = [];

  if (response.candidates && response.candidates.length > 0) {
    const candidate = response.candidates[0];
    const parts = candidate.content?.parts || [];

    let content = "";
    const toolCalls: OpenAIChoice["message"]["tool_calls"] = [];

    for (const part of parts) {
      // Skip thinking parts in response
      if (part.thought === true) {
        continue;
      }

      if (part.text) {
        content += part.text;
      }

      if (part.functionCall) {
        toolCalls.push({
          id: `call_${crypto.randomUUID().slice(0, 8)}`,
          type: "function",
          function: {
            name: part.functionCall.name,
            arguments: JSON.stringify(part.functionCall.args || {}),
          },
        });
      }
    }

    let finishReason: OpenAIChoice["finish_reason"] = "stop";
    if (candidate.finishReason === "MAX_TOKENS") {
      finishReason = "length";
    } else if (toolCalls.length > 0) {
      finishReason = "tool_calls";
    }

    choices.push({
      index: 0,
      message: {
        role: "assistant",
        content: content || null,
        ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
      },
      finish_reason: finishReason,
    });
  }

  const result: OpenAIChatResponse = {
    id,
    object: "chat.completion",
    created,
    model,
    choices,
  };

  if (response.usageMetadata) {
    result.usage = {
      prompt_tokens: response.usageMetadata.promptTokenCount || 0,
      completion_tokens: response.usageMetadata.candidatesTokenCount || 0,
      total_tokens: response.usageMetadata.totalTokenCount || 0,
    };
  }

  return result;
}

/**
 * Create an OpenAI streaming chunk
 */
export function createStreamChunk(
  id: string,
  model: string,
  content?: string,
  isFirst = false,
  finishReason: OpenAIStreamChunk["choices"][0]["finish_reason"] = null,
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
): OpenAIStreamChunk {
  return {
    id,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        delta: {
          ...(isFirst ? { role: "assistant" } : {}),
          ...(content !== undefined ? { content } : {}),
        },
        finish_reason: finishReason,
      },
    ],
    ...(usage ? { usage } : {}),
  };
}

/**
 * Format SSE message
 */
export function formatSSE(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

/**
 * Format SSE done message
 */
export function formatSSEDone(): string {
  return "data: [DONE]\n\n";
}
