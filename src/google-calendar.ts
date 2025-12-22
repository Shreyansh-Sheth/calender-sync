import { google, calendar_v3 } from "googleapis";
import type { Config } from "./config";
import type { CalendarEvent } from "./ics-parser";

export interface GoogleCalendarClient {
  getOrCreateCalendar(name: string): Promise<string>;
  listEvents(calendarId: string): Promise<GoogleEvent[]>;
  createEvent(calendarId: string, event: CalendarEvent): Promise<void>;
  updateEvent(calendarId: string, eventId: string, event: CalendarEvent): Promise<void>;
  deleteEvent(calendarId: string, eventId: string): Promise<void>;
}

export interface GoogleEvent {
  id: string;
  iCalUID?: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
}

// Random animal names for calendar
const adjectives = [
  "Swift", "Clever", "Happy", "Curious", "Brave", "Gentle", "Mighty", "Wise",
  "Cheerful", "Peaceful", "Lively", "Playful", "Calm", "Bright", "Noble", "Kind",
  "Jolly", "Merry", "Daring", "Graceful", "Lucky", "Cozy", "Fluffy", "Snappy"
];

const animals = [
  "Penguin", "Falcon", "Otter", "Fox", "Owl", "Dolphin", "Panda", "Wolf",
  "Eagle", "Koala", "Tiger", "Bear", "Rabbit", "Deer", "Hawk", "Swan",
  "Parrot", "Seal", "Badger", "Heron", "Sparrow", "Raven", "Finch", "Crane"
];

export function generateCalendarName(): string {
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const animal = animals[Math.floor(Math.random() * animals.length)];
  return `${adj} ${animal}`;
}

export function createGoogleCalendarClient(config: Config): GoogleCalendarClient {
  const oauth2Client = new google.auth.OAuth2(
    config.googleClientId,
    config.googleClientSecret
  );

  oauth2Client.setCredentials({
    refresh_token: config.googleRefreshToken,
  });

  const calendar = google.calendar({ version: "v3", auth: oauth2Client });

  return {
    async getOrCreateCalendar(name: string): Promise<string> {
      // List existing calendars
      const listResponse = await calendar.calendarList.list();
      const calendars = listResponse.data.items || [];

      // Check if calendar with this name exists
      const existing = calendars.find((c) => c.summary === name);
      if (existing && existing.id) {
        console.log(`Found existing calendar: ${name} (${existing.id})`);
        return existing.id;
      }

      // Create new calendar
      const createResponse = await calendar.calendars.insert({
        requestBody: {
          summary: name,
          description: "Synced from ICS feed by Calendar Sync",
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      });

      const calendarId = createResponse.data.id;
      if (!calendarId) {
        throw new Error("Failed to create calendar: no ID returned");
      }

      console.log(`Created new calendar: ${name} (${calendarId})`);
      return calendarId;
    },

    async listEvents(calendarId: string): Promise<GoogleEvent[]> {
      const events: GoogleEvent[] = [];
      let pageToken: string | undefined;

      // Get events from past month to next year
      const now = new Date();
      const timeMin = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
      const timeMax = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate()).toISOString();

      do {
        const response = await calendar.events.list({
          calendarId,
          timeMin,
          timeMax,
          maxResults: 2500,
          singleEvents: true,
          pageToken,
        });

        const items = response.data.items || [];
        for (const item of items) {
          if (item.id) {
            events.push({
              id: item.id,
              iCalUID: item.iCalUID || undefined,
              summary: item.summary || undefined,
              description: item.description || undefined,
              location: item.location || undefined,
              start: item.start || undefined,
              end: item.end || undefined,
            });
          }
        }

        pageToken = response.data.nextPageToken || undefined;
      } while (pageToken);

      return events;
    },

    async createEvent(calendarId: string, event: CalendarEvent): Promise<void> {
      const eventBody = buildEventBody(event);

      await calendar.events.insert({
        calendarId,
        requestBody: eventBody,
      });
    },

    async updateEvent(calendarId: string, eventId: string, event: CalendarEvent): Promise<void> {
      const eventBody = buildEventBody(event);

      await calendar.events.update({
        calendarId,
        eventId,
        requestBody: eventBody,
      });
    },

    async deleteEvent(calendarId: string, eventId: string): Promise<void> {
      await calendar.events.delete({
        calendarId,
        eventId,
      });
    },
  };
}

function buildEventBody(event: CalendarEvent): calendar_v3.Schema$Event {
  const body: calendar_v3.Schema$Event = {
    summary: event.summary,
    description: event.description,
    location: event.location,
    iCalUID: event.uid,
  };

  if (event.isAllDay) {
    body.start = { date: formatDate(event.start) };
    body.end = { date: formatDate(event.end) };
  } else {
    body.start = { dateTime: event.start.toISOString() };
    body.end = { dateTime: event.end.toISOString() };
  }

  return body;
}

function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}
