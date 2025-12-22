import { loadConfig } from "./config";
import { fetchAndParseIcs } from "./ics-parser";
import { createGoogleCalendarClient, generateCalendarName } from "./google-calendar";
import { syncEvents } from "./sync";

const CALENDAR_NAME_FILE = ".calendar-name";

async function main() {
  console.log("Starting Calendar Sync...");

  // Load configuration
  const config = loadConfig();
  console.log(`ICS URL: ${config.icsUrl}`);
  console.log(`Sync interval: ${config.syncIntervalMs}ms`);

  // Initialize Google Calendar client
  const client = createGoogleCalendarClient(config);

  // Get or generate calendar name
  let calendarName = config.calendarName;
  if (!calendarName) {
    // Try to read from file (persists across restarts)
    try {
      calendarName = await Bun.file(CALENDAR_NAME_FILE).text();
      calendarName = calendarName.trim();
    } catch {
      // Generate new name
      calendarName = generateCalendarName();
      await Bun.write(CALENDAR_NAME_FILE, calendarName);
    }
  }

  console.log(`Calendar name: ${calendarName}`);

  // Get or create the calendar
  const calendarId = await client.getOrCreateCalendar(calendarName);
  console.log(`Calendar ID: ${calendarId}`);
  console.log("");

  // Run sync loop
  while (true) {
    try {
      await runSync(config.icsUrl, client, calendarId);
    } catch (error) {
      console.error("Sync failed:", error);
    }

    // Wait for next sync
    console.log(`Next sync in ${config.syncIntervalMs / 1000} seconds...\n`);
    await sleep(config.syncIntervalMs);
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
