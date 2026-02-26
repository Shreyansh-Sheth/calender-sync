import { google } from "googleapis";
import type { Config } from "./config";

const SCOPES = ["https://www.googleapis.com/auth/calendar"];
const DATA_DIR = process.env.DATA_DIR || "/data";
const TOKEN_FILE = `${DATA_DIR}/google-tokens.json`;
const LEGACY_TOKEN_FILE = `${DATA_DIR}/google-refresh-token`;

export interface StoredTokens {
  refresh_token: string;
  access_token?: string;
  expiry_date?: number;
}

/**
 * Check if an error is an invalid_grant error (expired or revoked refresh token)
 */
export function isInvalidGrantError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const err = error as Record<string, unknown>;

  // Check for gaxios error message
  if (typeof err.message === "string" && err.message.includes("invalid_grant")) {
    return true;
  }

  // Check for error code in response
  if (err.response && typeof err.response === "object") {
    const response = err.response as Record<string, unknown>;
    if (response.data && typeof response.data === "object") {
      const data = response.data as Record<string, unknown>;
      if (data.error === "invalid_grant") {
        return true;
      }
    }
  }

  return false;
}

/**
 * Save tokens (refresh + access + expiry) to disk
 */
export async function saveTokens(tokens: StoredTokens): Promise<void> {
  try {
    await Bun.write(TOKEN_FILE, JSON.stringify(tokens, null, 2));
  } catch (err) {
    console.error("Failed to save tokens:", err);
  }
}

/**
 * Load stored tokens from disk
 */
export async function loadStoredTokens(): Promise<StoredTokens | null> {
  // Try new JSON format first
  try {
    const content = await Bun.file(TOKEN_FILE).text();
    if (content.trim()) {
      return JSON.parse(content) as StoredTokens;
    }
  } catch {
    // Not found or invalid JSON
  }

  // Migrate from legacy plain-text refresh token file
  try {
    const legacyToken = await Bun.file(LEGACY_TOKEN_FILE).text();
    if (legacyToken.trim()) {
      console.log("Migrating legacy token file to new format...");
      const tokens: StoredTokens = { refresh_token: legacyToken.trim() };
      await saveTokens(tokens);
      // Clean up legacy file
      await Bun.write(LEGACY_TOKEN_FILE, "");
      return tokens;
    }
  } catch {
    // No legacy file
  }

  return null;
}

/**
 * Clear the stored token files
 */
export async function clearStoredToken(): Promise<void> {
  try {
    await Bun.write(TOKEN_FILE, "");
    console.log("Cleared stored tokens");
  } catch {
    // Ignore errors when clearing
  }
}

/**
 * Validate a refresh token by attempting to get an access token.
 * Returns the full token set on success, or null if the token is invalid.
 */
export async function validateAndRefreshToken(
  config: Config,
  storedTokens: StoredTokens
): Promise<StoredTokens | null> {
  // If we have a cached access token that's still valid for > 5 minutes, skip validation
  if (
    storedTokens.access_token &&
    storedTokens.expiry_date &&
    storedTokens.expiry_date > Date.now() + 5 * 60 * 1000
  ) {
    return storedTokens;
  }

  const oauth2Client = new google.auth.OAuth2(
    config.googleClientId,
    config.googleClientSecret
  );

  oauth2Client.setCredentials({
    refresh_token: storedTokens.refresh_token,
  });

  // Retry up to 2 times for transient errors
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const { credentials } = await oauth2Client.refreshAccessToken();

      const refreshedTokens: StoredTokens = {
        refresh_token: credentials.refresh_token || storedTokens.refresh_token,
        access_token: credentials.access_token || undefined,
        expiry_date: credentials.expiry_date || undefined,
      };

      await saveTokens(refreshedTokens);
      if (attempt > 1) {
        console.log(`Token refresh succeeded on attempt ${attempt}`);
      }
      return refreshedTokens;
    } catch (error) {
      if (isInvalidGrantError(error)) {
        if (attempt < 2) {
          console.log(`Token refresh failed (attempt ${attempt}/2), retrying in 2s...`);
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }
        console.error("Refresh token is permanently invalid.");
        console.error(
          "Tip: If your Google Cloud app is in 'Testing' mode, refresh tokens expire after 7 days."
        );
        console.error(
          "     Set your app to 'Production' in the OAuth consent screen to avoid this."
        );
        return null;
      }
      // For non-auth errors (network issues etc.), retry
      if (attempt < 2) {
        console.log(`Token refresh error (attempt ${attempt}/2), retrying in 2s...`);
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
      throw error;
    }
  }

  return null;
}

export async function ensureAuthenticated(config: Config): Promise<StoredTokens> {
  // Check if we already have a refresh token from env
  if (config.googleRefreshToken) {
    console.log("Using refresh token from environment");
    const tokens: StoredTokens = { refresh_token: config.googleRefreshToken };

    // Validate and get a fresh access token
    const validated = await validateAndRefreshToken(config, tokens);
    if (validated) return validated;

    console.error("Environment-provided refresh token is invalid.");
  }

  // Check if we have stored tokens
  const storedTokens = await loadStoredTokens();
  if (storedTokens) {
    console.log("Using stored refresh token");

    // Validate and refresh the access token proactively
    const validated = await validateAndRefreshToken(config, storedTokens);
    if (validated) {
      console.log("Token validated successfully");
      return validated;
    }

    // Token is invalid - clear it
    console.log("Stored token is invalid, clearing...");
    await clearStoredToken();
  }

  // Need to get a new token via web OAuth
  console.log("\n⚠️  No valid refresh token found. Starting OAuth setup server...\n");
  const refreshToken = await runOAuthServer(config);
  const tokens: StoredTokens = { refresh_token: refreshToken };

  // Validate the newly obtained token to cache the access token
  const validated = await validateAndRefreshToken(config, tokens);
  return validated || tokens;
}

async function runOAuthServer(config: Config): Promise<string> {
  const port = config.port;
  const baseUrl = config.baseUrl || `http://localhost:${port}`;
  const redirectUri = `${baseUrl}/callback`;

  console.log(`Using redirect URI: ${redirectUri}`);

  const oauth2Client = new google.auth.OAuth2(
    config.googleClientId,
    config.googleClientSecret,
    redirectUri
  );

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
  });

  return new Promise((resolve, reject) => {
    const server = Bun.serve({
      port,
      async fetch(req) {
        const url = new URL(req.url);

        // Setup page
        if (url.pathname === "/" || url.pathname === "/setup") {
          return new Response(getSetupPage(authUrl), {
            headers: { "Content-Type": "text/html" },
          });
        }

        // OAuth callback
        if (url.pathname === "/callback") {
          const code = url.searchParams.get("code");
          const error = url.searchParams.get("error");

          if (error) {
            return new Response(getErrorPage(error), {
              headers: { "Content-Type": "text/html" },
            });
          }

          if (!code) {
            return new Response(getErrorPage("No authorization code received"), {
              headers: { "Content-Type": "text/html" },
            });
          }

          try {
            const { tokens } = await oauth2Client.getToken(code);
            const refreshToken = tokens.refresh_token;

            if (!refreshToken) {
              return new Response(
                getErrorPage("No refresh token received. Please revoke access at https://myaccount.google.com/permissions and try again."),
                { headers: { "Content-Type": "text/html" } }
              );
            }

            // Store the token
            await Bun.write(TOKEN_FILE, refreshToken);
            console.log("\n✅ OAuth successful! Refresh token saved.\n");

            // Stop server and resolve after a short delay
            setTimeout(() => {
              server.stop();
              resolve(refreshToken);
            }, 1000);

            return new Response(getSuccessPage(), {
              headers: { "Content-Type": "text/html" },
            });
          } catch (err) {
            console.error("OAuth error:", err);
            return new Response(getErrorPage(String(err)), {
              headers: { "Content-Type": "text/html" },
            });
          }
        }

        // Health check
        if (url.pathname === "/health") {
          return new Response("OK");
        }

        return new Response("Not found", { status: 404 });
      },
    });

    console.log(`🔐 OAuth Setup Server running at ${baseUrl}`);
    console.log(`\n   Open this URL to authorize:\n   ${baseUrl}/setup\n`);
    console.log(`   Or directly: ${authUrl}\n`);
  });
}

function getSetupPage(authUrl: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <title>Calendar Sync - Setup</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
    h1 { color: #333; }
    .btn { display: inline-block; background: #4285f4; color: white; padding: 12px 24px;
           text-decoration: none; border-radius: 4px; font-size: 16px; }
    .btn:hover { background: #3367d6; }
    .note { color: #666; margin-top: 20px; font-size: 14px; }
  </style>
</head>
<body>
  <h1>📅 Calendar Sync Setup</h1>
  <p>Click the button below to authorize this app to access your Google Calendar.</p>
  <p><a href="${authUrl}" class="btn">Authorize with Google</a></p>
  <p class="note">This will allow the app to create a calendar and sync your ICS events to it.</p>
</body>
</html>`;
}

function getSuccessPage(): string {
  return `<!DOCTYPE html>
<html>
<head>
  <title>Calendar Sync - Success</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; text-align: center; }
    h1 { color: #34a853; }
    .icon { font-size: 64px; }
  </style>
</head>
<body>
  <div class="icon">✅</div>
  <h1>Authorization Successful!</h1>
  <p>Calendar Sync is now authorized and will start syncing your calendar.</p>
  <p>You can close this window.</p>
</body>
</html>`;
}

function getErrorPage(error: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <title>Calendar Sync - Error</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
    h1 { color: #ea4335; }
    .error { background: #fce8e6; padding: 15px; border-radius: 4px; }
    a { color: #4285f4; }
  </style>
</head>
<body>
  <h1>❌ Authorization Failed</h1>
  <div class="error">${error}</div>
  <p><a href="/setup">Try again</a></p>
</body>
</html>`;
}
