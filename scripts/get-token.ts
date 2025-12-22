import { google } from "googleapis";

const SCOPES = ["https://www.googleapis.com/auth/calendar"];
const REDIRECT_URI = "http://localhost:3000/callback";

async function main() {
  console.log("Google Calendar OAuth Token Generator\n");

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error("Error: Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables");
    console.log("\nExample:");
    console.log("  GOOGLE_CLIENT_ID=xxx GOOGLE_CLIENT_SECRET=yyy bun run get-token");
    process.exit(1);
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);

  // Generate authorization URL
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
  });

  console.log("1. Open this URL in your browser:\n");
  console.log(authUrl);
  console.log("\n2. Authorize the application");
  console.log("3. You'll be redirected to localhost:3000/callback");
  console.log("4. Copy the 'code' parameter from the URL\n");

  // Start a simple server to catch the callback
  const server = Bun.serve({
    port: 3000,
    async fetch(req) {
      const url = new URL(req.url);

      if (url.pathname === "/callback") {
        const code = url.searchParams.get("code");

        if (!code) {
          return new Response("No code provided", { status: 400 });
        }

        try {
          const { tokens } = await oauth2Client.getToken(code);
          const refreshToken = tokens.refresh_token;

          if (!refreshToken) {
            return new Response(
              "No refresh token received. Make sure you revoked previous access at https://myaccount.google.com/permissions",
              { status: 400 }
            );
          }

          console.log("\n✅ Success! Here's your refresh token:\n");
          console.log(refreshToken);
          console.log("\nAdd this to your .env file:");
          console.log(`GOOGLE_REFRESH_TOKEN=${refreshToken}`);

          // Shutdown server after a delay
          setTimeout(() => {
            server.stop();
            process.exit(0);
          }, 1000);

          return new Response(`
            <!DOCTYPE html>
            <html>
              <head><title>Success!</title></head>
              <body>
                <h1>Authorization successful!</h1>
                <p>Your refresh token has been printed in the terminal.</p>
                <p>You can close this window.</p>
              </body>
            </html>
          `, {
            headers: { "Content-Type": "text/html" },
          });
        } catch (error) {
          console.error("Error exchanging code:", error);
          return new Response("Error exchanging code: " + String(error), { status: 500 });
        }
      }

      return new Response("Not found", { status: 404 });
    },
  });

  console.log(`Waiting for callback on http://localhost:3000/callback ...\n`);
}

main().catch(console.error);
