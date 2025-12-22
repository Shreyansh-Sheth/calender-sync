export interface Config {
  icsUrl: string;
  googleClientId: string;
  googleClientSecret: string;
  googleRefreshToken?: string; // Optional - can be obtained via web OAuth
  syncIntervalMs: number;
  calendarName?: string;
  port: number;
  baseUrl?: string;
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
    googleRefreshToken: process.env.GOOGLE_REFRESH_TOKEN, // Optional now
    syncIntervalMs: parseInt(process.env.SYNC_INTERVAL_MS || "60000", 10),
    calendarName: process.env.CALENDAR_NAME,
    port: parseInt(process.env.PORT || "3000", 10),
    baseUrl: process.env.BASE_URL,
  };
}
