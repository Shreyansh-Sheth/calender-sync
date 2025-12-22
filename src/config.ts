export interface Config {
  icsUrl: string;
  googleClientId: string;
  googleClientSecret: string;
  googleRefreshToken: string;
  syncIntervalMs: number;
  calendarName?: string;
}

function getEnvOrThrow(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export function loadConfig(): Config {
  return {
    icsUrl: getEnvOrThrow("ICS_URL"),
    googleClientId: getEnvOrThrow("GOOGLE_CLIENT_ID"),
    googleClientSecret: getEnvOrThrow("GOOGLE_CLIENT_SECRET"),
    googleRefreshToken: getEnvOrThrow("GOOGLE_REFRESH_TOKEN"),
    syncIntervalMs: parseInt(process.env.SYNC_INTERVAL_MS || "60000", 10),
    calendarName: process.env.CALENDAR_NAME,
  };
}
