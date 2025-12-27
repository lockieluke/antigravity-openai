# Antigravity OpenAI-Compatible Server

An OpenAI-compatible API server for Google's Antigravity models, built with ElysiaJS and Bun.

## Features

- **OpenAI-compatible API** - Drop-in replacement for OpenAI API clients
- **Streaming support** - Real-time SSE streaming responses
- **Multiple models** - Access to Gemini 3, Claude Sonnet/Opus, and GPT-OSS models
- **Automatic token refresh** - OAuth tokens are refreshed automatically
- **Tool calling** - Function/tool calling support

## Available Models

| Model ID | Description |
|----------|-------------|
| `gemini-3-pro-low` | Gemini 3 Pro (low thinking) |
| `gemini-3-pro-high` | Gemini 3 Pro (high thinking) |
| `gemini-3-flash` | Gemini 3 Flash |
| `claude-sonnet-4-5` | Claude Sonnet 4.5 |
| `claude-sonnet-4-5-thinking-low` | Claude Sonnet 4.5 (8K thinking budget) |
| `claude-sonnet-4-5-thinking-medium` | Claude Sonnet 4.5 (16K thinking budget) |
| `claude-sonnet-4-5-thinking-high` | Claude Sonnet 4.5 (32K thinking budget) |
| `claude-opus-4-5-thinking-low` | Claude Opus 4.5 (8K thinking budget) |
| `claude-opus-4-5-thinking-medium` | Claude Opus 4.5 (16K thinking budget) |
| `claude-opus-4-5-thinking-high` | Claude Opus 4.5 (32K thinking budget) |
| `gpt-oss-120b-medium` | GPT-OSS 120B Medium |

## Installation

```bash
# Install dependencies
bun install
```

## Authentication

Before using the server, you need to authenticate with your Google account:

```bash
bun run auth
```

This will:
1. Open a browser window for Google OAuth login
2. Store your tokens securely in `~/.config/antigravity-openai/tokens.json`

## Usage

### Start the server

```bash
bun start
```

Or in development mode with auto-reload:

```bash
bun run dev
```

The server will start on `http://localhost:8080` by default. Set the `PORT` environment variable to change this.

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/v1/models` | List available models |
| GET | `/v1/models/:model` | Get model details |
| POST | `/v1/chat/completions` | Chat completions (OpenAI compatible) |
| GET | `/status` | Server status and authentication info |
| GET | `/health` | Health check |

### Example Usage

#### With curl

```bash
# List models
curl http://localhost:8080/v1/models

# Chat completion
curl http://localhost:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-3-pro-high",
    "messages": [
      {"role": "user", "content": "Hello!"}
    ]
  }'

# Streaming
curl http://localhost:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-3-pro-high",
    "messages": [
      {"role": "user", "content": "Write a poem about AI"}
    ],
    "stream": true
  }'
```

#### With OpenAI SDK (Python)

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:8080/v1",
    api_key="not-needed"  # Authentication is handled by OAuth
)

response = client.chat.completions.create(
    model="gemini-3-pro-high",
    messages=[
        {"role": "user", "content": "Hello!"}
    ]
)

print(response.choices[0].message.content)
```

#### With OpenAI SDK (TypeScript)

```typescript
import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "http://localhost:8080/v1",
  apiKey: "not-needed",
});

const response = await client.chat.completions.create({
  model: "gemini-3-pro-high",
  messages: [{ role: "user", content: "Hello!" }],
});

console.log(response.choices[0].message.content);
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8080` | Server port |

### Token Storage

Tokens are stored in `~/.config/antigravity-openai/tokens.json`. This file contains sensitive OAuth tokens - treat it like a password.

## Warning

⚠️ **Use at your own risk.** This project uses Google's Antigravity API which may:
- Violate Terms of Service of AI model providers
- Result in account suspension or ban
- Change or break without notice

This project is not affiliated with or endorsed by Google, Anthropic, or OpenAI.

## License

MIT
