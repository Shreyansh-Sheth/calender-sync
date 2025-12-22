import type { CalendarEvent } from "./ics-parser";
import { getEventHash } from "./ics-parser";
import type { GoogleCalendarClient, GoogleEvent } from "./google-calendar";

interface SyncResult {
  created: number;
  updated: number;
  deleted: number;
  unchanged: number;
}

export async function syncEvents(
  client: GoogleCalendarClient,
  calendarId: string,
  icsEvents: CalendarEvent[]
): Promise<SyncResult> {
  const result: SyncResult = {
    created: 0,
    updated: 0,
    deleted: 0,
    unchanged: 0,
  };

  // Get current events from Google Calendar
  const googleEvents = await client.listEvents(calendarId);

  // Build maps for comparison
  const icsEventMap = new Map<string, CalendarEvent>();
  for (const event of icsEvents) {
    icsEventMap.set(event.uid, event);
  }

  const googleEventMap = new Map<string, GoogleEvent>();
  for (const event of googleEvents) {
    if (event.iCalUID) {
      googleEventMap.set(event.iCalUID, event);
    }
  }

  // Find events to create or update
  for (const [uid, icsEvent] of icsEventMap) {
    const googleEvent = googleEventMap.get(uid);

    if (!googleEvent) {
      // New event - create it
      try {
        await client.createEvent(calendarId, icsEvent);
        console.log(`Created: ${icsEvent.summary}`);
        result.created++;
      } catch (error: any) {
        // Handle 409 Conflict - event already exists (outside our time range)
        if (error?.status === 409 || error?.code === 409) {
          try {
            const existingEvent = await client.findEventByUID(calendarId, icsEvent.uid);
            if (existingEvent) {
              await client.updateEvent(calendarId, existingEvent.id, icsEvent);
              console.log(`Updated (was conflict): ${icsEvent.summary}`);
              result.updated++;
            } else {
              console.error(`Failed to find existing event "${icsEvent.summary}" after 409`);
            }
          } catch (updateError) {
            console.error(`Failed to update after conflict "${icsEvent.summary}":`, updateError);
          }
        } else {
          console.error(`Failed to create event "${icsEvent.summary}":`, error);
        }
      }
    } else {
      // Existing event - check if it needs updating
      if (hasEventChanged(icsEvent, googleEvent)) {
        try {
          await client.updateEvent(calendarId, googleEvent.id, icsEvent);
          console.log(`Updated: ${icsEvent.summary}`);
          result.updated++;
        } catch (error) {
          console.error(`Failed to update event "${icsEvent.summary}":`, error);
        }
      } else {
        result.unchanged++;
      }
    }
  }

  // Find events to delete (in Google but not in ICS)
  for (const [uid, googleEvent] of googleEventMap) {
    if (!icsEventMap.has(uid)) {
      try {
        await client.deleteEvent(calendarId, googleEvent.id);
        console.log(`Deleted: ${googleEvent.summary || uid}`);
        result.deleted++;
      } catch (error) {
        console.error(`Failed to delete event "${googleEvent.summary}":`, error);
      }
    }
  }

  return result;
}

function hasEventChanged(icsEvent: CalendarEvent, googleEvent: GoogleEvent): boolean {
  // Compare summary
  if (icsEvent.summary !== googleEvent.summary) return true;

  // Compare description
  if ((icsEvent.description || "") !== (googleEvent.description || "")) return true;

  // Compare location
  if ((icsEvent.location || "") !== (googleEvent.location || "")) return true;

  // Compare start time
  const googleStart = parseGoogleDate(googleEvent.start);
  if (googleStart && Math.abs(icsEvent.start.getTime() - googleStart.getTime()) > 60000) {
    return true;
  }

  // Compare end time
  const googleEnd = parseGoogleDate(googleEvent.end);
  if (googleEnd && Math.abs(icsEvent.end.getTime() - googleEnd.getTime()) > 60000) {
    return true;
  }

  return false;
}

function parseGoogleDate(dateObj?: { dateTime?: string; date?: string }): Date | null {
  if (!dateObj) return null;

  if (dateObj.dateTime) {
    return new Date(dateObj.dateTime);
  }

  if (dateObj.date) {
    return new Date(dateObj.date);
  }

  return null;
}
