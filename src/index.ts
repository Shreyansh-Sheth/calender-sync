import { loadConfig, type Config } from "./config";
import { fetchAndParseIcs } from "./ics-parser";
import { createGoogleCalendarClient, generateCalendarName } from "./google-calendar";
import { syncEvents } from "./sync";
import { ensureAuthenticated, isInvalidGrantError, clearStoredToken } from "./auth-server";

const DATA_DIR = process.env.DATA_DIR || "/data";
const CALENDAR_NAME_FILE = `${DATA_DIR}/calendar-name`;

async function main() {
  console.log("🗓️  Calendar Sync\n");

  // Load configuration
  const config = loadConfig();
  console.log(`ICS URL: ${config.icsUrl}`);
  console.log(`Sync interval: ${config.syncIntervalMs}ms`);

  // Get or generate calendar name (do this once, before auth)
  const calendarName = await getOrCreateCalendarName(config.calendarName);
  console.log(`\n📅 Calendar: ${calendarName}`);

  // Start the sync loop with authentication handling
  await runSyncLoop(config, calendarName);
}

async function getOrCreateCalendarName(configName?: string): Promise<string> {
  if (configName) return configName;

  // Try to read from file (persists across restarts)
  try {
    const name = await Bun.file(CALENDAR_NAME_FILE).text();
    if (name.trim()) return name.trim();
  } catch {
    // File doesn't exist
  }

  // Generate new name
  const name = generateCalendarName();
  await Bun.write(CALENDAR_NAME_FILE, name);
  return name;
}

async function runSyncLoop(config: Config, calendarName: string): Promise<never> {
  while (true) {
    // Ensure we have a valid refresh token (will start OAuth server if needed)
    const refreshToken = await ensureAuthenticated(config);

    // Initialize Google Calendar client with the refresh token
    const client = createGoogleCalendarClient({
      ...config,
      googleRefreshToken: refreshToken,
    });

    // Get or create the calendar
    let calendarId: string;
    try {
      calendarId = await client.getOrCreateCalendar(calendarName);
      console.log(`   ID: ${calendarId}\n`);
    } catch (error) {
      if (isInvalidGrantError(error)) {
        console.error("\n⚠️  Refresh token is invalid or expired. Re-authenticating...\n");
        await clearStoredToken();
        continue; // Restart the loop to re-authenticate
      }
      throw error;
    }

    // Run sync loop until we hit an auth error
    console.log("Starting sync loop...\n");
    let needsReauth = false;

    while (!needsReauth) {
      try {
        await runSync(config.icsUrl, client, calendarId);
      } catch (error) {
        if (isInvalidGrantError(error)) {
          console.error("\n⚠️  Refresh token is invalid or expired. Re-authenticating...\n");
          await clearStoredToken();
          needsReauth = true;
          continue;
        }
        console.error("Sync failed:", error);
      }

      if (!needsReauth) {
        // Wait for next sync
        console.log(`Next sync in ${config.syncIntervalMs / 1000} seconds...\n`);
        await sleep(config.syncIntervalMs);
      }
    }
  }
}

async function runSync(
  icsUrl: string,
  client: ReturnType<typeof createGoogleCalendarClient>,
  calendarId: string
) {
  const startTime = Date.now();
  console.log(`[${new Date().toISOString()}] Starting sync...`);

  // Fetch and parse ICS
  const icsEvents = await fetchAndParseIcs(icsUrl);

  // Sync to Google Calendar
  const result = await syncEvents(client, calendarId, icsEvents);

  const duration = Date.now() - startTime;
  console.log(`Sync complete in ${duration}ms:`);
  console.log(`  Created: ${result.created}`);
  console.log(`  Updated: ${result.updated}`);
  console.log(`  Deleted: ${result.deleted}`);
  console.log(`  Unchanged: ${result.unchanged}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Start the application
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
