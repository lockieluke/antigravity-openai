/**
 * OpenAI-compatible API server for Google Antigravity models
 * Built with ElysiaJS and Bun
 */

import { Elysia, t } from "elysia";
import { cors } from "@elysiajs/cors";
import { AVAILABLE_MODELS } from "./constants";
import { client } from "./client";
import {
  convertOpenAIToAntigravity,
  convertAntigravityToOpenAI,
  createStreamChunk,
  formatSSE,
  formatSSEDone,
  type OpenAIChatRequest,
} from "./converter";

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 8080;

// Initialize the Antigravity client
await client.initialize();

const app = new Elysia()
  .use(cors())
  // Health check
  .get("/health", () => ({ status: "ok" }))

  // List models (OpenAI compatible)
  .get("/v1/models", () => {
    const models = Object.values(AVAILABLE_MODELS).map((model) => ({
      id: model.id,
      object: "model",
      created: Math.floor(Date.now() / 1000),
      owned_by: model.owned_by,
      display_name: model.display_name,
      description: model.description,
      type: model.type,
      context_length: model.context_length,
    }));

    return {
      object: "list",
      data: models,
    };
  })

  // Get specific model
  .get("/v1/models/:model", ({ params }) => {
    const modelInfo = AVAILABLE_MODELS[params.model as keyof typeof AVAILABLE_MODELS];

    if (!modelInfo) {
      return new Response(
        JSON.stringify({
          error: {
            message: `Model '${params.model}' not found`,
            type: "invalid_request_error",
            code: "model_not_found",
          },
        }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    return {
      id: modelInfo.id,
      object: "model",
      created: Math.floor(Date.now() / 1000),
      owned_by: modelInfo.owned_by,
    };
  })

  // Chat completions (OpenAI compatible)
  .post(
    "/v1/chat/completions",
    async ({ body, set }) => {
      // Check authentication
      if (!client.hasValidTokens()) {
        set.status = 401;
        return {
          error: {
            message: "Not authenticated. Run 'bun run auth' to authenticate with Google.",
            type: "authentication_error",
            code: "not_authenticated",
          },
        };
      }

      const request = body as OpenAIChatRequest;

      // Validate model
      if (!AVAILABLE_MODELS[request.model as keyof typeof AVAILABLE_MODELS]) {
        set.status = 400;
        return {
          error: {
            message: `Model '${request.model}' is not available. Use /v1/models to list available models.`,
            type: "invalid_request_error",
            code: "model_not_found",
          },
        };
      }

      // Convert to Antigravity format
      const antigravityRequest = convertOpenAIToAntigravity(request);

      try {
        if (request.stream) {
          // Streaming response
          const id = `chatcmpl-${crypto.randomUUID()}`;
          let isFirst = true;
          let promptTokens = 0;
          let completionTokens = 0;

          const stream = new ReadableStream({
            async start(controller) {
              const encoder = new TextEncoder();

              try {
                for await (const chunk of client.streamGenerateContent(
                  request.model,
                  antigravityRequest
                )) {
                  if (chunk.type === "content" && chunk.content) {
                    const sseChunk = createStreamChunk(
                      id,
                      request.model,
                      chunk.content,
                      isFirst
                    );
                    controller.enqueue(encoder.encode(formatSSE(sseChunk)));
                    isFirst = false;
                  } else if (chunk.type === "thinking" && chunk.thinking) {
                    // Optionally include thinking in a custom field or skip
                    // For now, we'll include it as regular content prefixed with [Thinking]
                    // You can customize this behavior
                  } else if (chunk.type === "done") {
                    // Send final chunk with finish_reason
                    const finalChunk = createStreamChunk(
                      id,
                      request.model,
                      undefined,
                      false,
                      "stop",
                      promptTokens || completionTokens
                        ? {
                          prompt_tokens: promptTokens,
                          completion_tokens: completionTokens,
                          total_tokens: promptTokens + completionTokens,
                        }
                        : undefined
                    );
                    controller.enqueue(encoder.encode(formatSSE(finalChunk)));
                    controller.enqueue(encoder.encode(formatSSEDone()));
                    controller.close();
                    return;
                  } else if (chunk.type === "error") {
                    const errorChunk = {
                      error: {
                        message: chunk.error || "Unknown error",
                        type: "api_error",
                      },
                    };
                    controller.enqueue(encoder.encode(formatSSE(errorChunk)));
                    controller.close();
                    return;
                  }

                  // Track usage if available
                  if (chunk.usage) {
                    promptTokens = chunk.usage.promptTokens || promptTokens;
                    completionTokens = chunk.usage.completionTokens || completionTokens;
                  }
                }
              } catch (error) {
                const errorMessage = error instanceof Error ? error.message : "Unknown error";
                const errorChunk = {
                  error: {
                    message: errorMessage,
                    type: "api_error",
                  },
                };
                controller.enqueue(encoder.encode(formatSSE(errorChunk)));
                controller.close();
              }
            },
          });

          return new Response(stream, {
            headers: {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache",
              Connection: "keep-alive",
            },
          });
        } else {
          // Non-streaming response
          const response = await client.generateContent(request.model, antigravityRequest);
          const openAIResponse = convertAntigravityToOpenAI(
            response as Parameters<typeof convertAntigravityToOpenAI>[0],
            request.model
          );
          return openAIResponse;
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        console.error("[ChatCompletions] Error:", errorMessage);

        set.status = 500;
        return {
          error: {
            message: errorMessage,
            type: "api_error",
            code: "internal_error",
          },
        };
      }
    },
    {
      body: t.Object({
        model: t.String(),
        messages: t.Array(
          t.Object({
            role: t.String(),
            content: t.Union([
              t.String(),
              t.Array(
                t.Object({
                  type: t.String(),
                  text: t.Optional(t.String()),
                  image_url: t.Optional(
                    t.Object({
                      url: t.String(),
                    })
                  ),
                })
              ),
            ]),
            name: t.Optional(t.String()),
            tool_calls: t.Optional(
              t.Array(
                t.Object({
                  id: t.String(),
                  type: t.Literal("function"),
                  function: t.Object({
                    name: t.String(),
                    arguments: t.String(),
                  }),
                })
              )
            ),
            tool_call_id: t.Optional(t.String()),
          })
        ),
        temperature: t.Optional(t.Number()),
        top_p: t.Optional(t.Number()),
        max_tokens: t.Optional(t.Number()),
        stream: t.Optional(t.Boolean()),
        tools: t.Optional(
          t.Array(
            t.Object({
              type: t.Literal("function"),
              function: t.Object({
                name: t.String(),
                description: t.Optional(t.String()),
                parameters: t.Optional(t.Any()),
              }),
            })
          )
        ),
        tool_choice: t.Optional(t.Any()),
      }),
    }
  )

  // Status endpoint
  .get("/status", async () => {
    const hasTokens = client.hasValidTokens();
    const tokens = client.getTokens();

    return {
      authenticated: hasTokens,
      email: tokens?.email || null,
      projectId: tokens?.projectId || null,
      availableModels: Object.keys(AVAILABLE_MODELS),
    };
  })

  .listen(PORT);

console.log(`
╔════════════════════════════════════════════════════════════════╗
║          Antigravity OpenAI-Compatible Server                  ║
╠════════════════════════════════════════════════════════════════╣
║  Server running at: http://localhost:${PORT}                      ║
║                                                                ║
║  Endpoints:                                                    ║
║    GET  /v1/models              - List available models        ║
║    POST /v1/chat/completions    - Chat completions (OpenAI)    ║
║    GET  /status                 - Server status                ║
║    GET  /health                 - Health check                 ║
║                                                                ║
${client.hasValidTokens()
    ? `║  ✓ Authenticated as: ${(client.getTokens()?.email || "Unknown").padEnd(35)}║`
    : "║  ✗ Not authenticated. Run: bun run auth                      ║"
  }
╚════════════════════════════════════════════════════════════════╝
`);

export default app;
