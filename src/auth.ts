/**
 * OAuth authentication CLI for Antigravity
 * Run with: bun run auth
 */

import { createServer } from "http";
import { createAuthorizationUrl, exchangeCodeForTokens } from "./oauth";
import { client } from "./client";
import { clearTokens, hasStoredTokens } from "./storage";

const CALLBACK_PORT = 51121;

async function openBrowser(url: string): Promise<void> {
  const { exec } = await import("child_process");

  const platform = process.platform;

  if (platform === "darwin") {
    exec(`open "${url}"`);
  } else if (platform === "win32") {
    exec(`start "${url}"`);
  } else {
    exec(`xdg-open "${url}"`);
  }
}

async function waitForCallback(): Promise<{ code: string; state: string }> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url || "/", `http://localhost:${CALLBACK_PORT}`);

      if (url.pathname === "/oauth-callback") {
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const error = url.searchParams.get("error");

        if (error) {
          res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
          res.end(`
            <!DOCTYPE html>
            <html>
              <head><meta charset="utf-8"><title>Authentication Failed</title></head>
              <body style="font-family: system-ui; padding: 40px; text-align: center;">
                <h1>❌ Authentication Failed</h1>
                <p>Error: ${error}</p>
                <p>You can close this window.</p>
              </body>
            </html>
          `);
          server.close();
          reject(new Error(`OAuth error: ${error}`));
          return;
        }

        if (!code || !state) {
          res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
          res.end(`
            <!DOCTYPE html>
            <html>
              <head><meta charset="utf-8"><title>Authentication Failed</title></head>
              <body style="font-family: system-ui; padding: 40px; text-align: center;">
                <h1>❌ Authentication Failed</h1>
                <p>Missing authorization code or state.</p>
                <p>You can close this window.</p>
              </body>
            </html>
          `);
          server.close();
          reject(new Error("Missing code or state"));
          return;
        }

        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(`
          <!DOCTYPE html>
          <html>
            <head><meta charset="utf-8"><title>Authentication Successful</title></head>
            <body style="font-family: system-ui; padding: 40px; text-align: center;">
              <h1>✅ Authentication Successful!</h1>
              <p>You can close this window and return to the terminal.</p>
              <script>window.close();</script>
            </body>
          </html>
        `);

        server.close();
        resolve({ code, state });
      } else {
        res.writeHead(404);
        res.end("Not found");
      }
    });

    server.listen(CALLBACK_PORT, () => {
      console.log(`\n🔗 Listening for OAuth callback on port ${CALLBACK_PORT}...`);
    });

    server.on("error", (err) => {
      reject(new Error(`Failed to start callback server: ${err.message}`));
    });

    // Timeout after 5 minutes
    setTimeout(() => {
      server.close();
      reject(new Error("Authentication timed out"));
    }, 5 * 60 * 1000);
  });
}

async function main() {
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║          Antigravity OAuth Authentication                      ║
╚════════════════════════════════════════════════════════════════╝
`);

  // Check for existing tokens
  if (await hasStoredTokens()) {
    await client.initialize();
    const tokens = client.getTokens();

    console.log(`ℹ️  Found existing authentication:`);
    console.log(`   Email: ${tokens?.email || "Unknown"}`);
    console.log(`   Project: ${tokens?.projectId || "Unknown"}`);
    console.log("");

    const readline = await import("readline");
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const answer = await new Promise<string>((resolve) => {
      rl.question("Do you want to re-authenticate? (y/N): ", resolve);
    });
    rl.close();

    if (answer.toLowerCase() !== "y") {
      console.log("\n✅ Using existing authentication.");
      process.exit(0);
    }

    console.log("\n🔄 Clearing existing tokens...");
    await clearTokens();
  }

  // Create authorization URL
  console.log("🔐 Starting OAuth flow...\n");

  const { url, state } = createAuthorizationUrl();

  console.log("📋 Authorization URL:");
  console.log(url);
  console.log("");

  // Try to open browser
  console.log("🌐 Opening browser...");
  await openBrowser(url);

  console.log("\nIf the browser didn't open, please copy the URL above and paste it in your browser.\n");

  try {
    // Wait for callback
    const { code, state: returnedState } = await waitForCallback();

    console.log("\n🔄 Exchanging authorization code for tokens...");

    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code, returnedState);

    // Save tokens
    await client.setTokens(tokens);

    console.log(`
╔════════════════════════════════════════════════════════════════╗
║                  ✅ Authentication Successful!                 ║
╠════════════════════════════════════════════════════════════════╣
║  Email:     ${(tokens.email || "Unknown").padEnd(48)}║
║  Project:   ${tokens.projectId.padEnd(48)}║
╠════════════════════════════════════════════════════════════════╣
║  You can now start the server with: bun start                  ║
╚════════════════════════════════════════════════════════════════╝
`);

    process.exit(0);
  } catch (error) {
    console.error("\n❌ Authentication failed:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
