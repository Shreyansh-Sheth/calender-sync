import ICAL from "ical.js";

export interface CalendarEvent {
  uid: string;
  summary: string;
  description?: string;
  location?: string;
  start: Date;
  end: Date;
  isAllDay: boolean;
}

export async function fetchAndParseIcs(url: string): Promise<CalendarEvent[]> {
  console.log(`Fetching ICS from: ${url}`);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ICS: ${response.status} ${response.statusText}`);
  }

  const icsData = await response.text();
  return parseIcs(icsData);
}

export function parseIcs(icsData: string): CalendarEvent[] {
  const jcalData = ICAL.parse(icsData);
  const vcalendar = new ICAL.Component(jcalData);
  const events: CalendarEvent[] = [];

  const vevents = vcalendar.getAllSubcomponents("vevent");

  for (const vevent of vevents) {
    const event = new ICAL.Event(vevent);

    // Skip cancelled events
    if (vevent.getFirstPropertyValue("status") === "CANCELLED") {
      continue;
    }

    const uid = event.uid;
    if (!uid) continue;

    // Handle recurring events
    if (event.isRecurring()) {
      const expandedEvents = expandRecurringEvent(event, vevent);
      events.push(...expandedEvents);
    } else {
      const calEvent = extractEventData(event, uid);
      if (calEvent) {
        events.push(calEvent);
      }
    }
  }

  console.log(`Parsed ${events.length} events from ICS`);
  return events;
}

function expandRecurringEvent(event: ICAL.Event, vevent: ICAL.Component): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  const uid = event.uid;

  // Expand recurring events for the next year
  const now = new Date();
  const rangeStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const rangeEnd = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());

  const expand = new ICAL.RecurExpansion({
    component: vevent,
    dtstart: vevent.getFirstPropertyValue("dtstart"),
  });

  let next: ICAL.Time | null;
  let count = 0;
  const maxOccurrences = 500; // Limit to prevent infinite loops

  while ((next = expand.next()) && count < maxOccurrences) {
    const startDate = next.toJSDate();

    // Skip events outside our range
    if (startDate < rangeStart) continue;
    if (startDate > rangeEnd) break;

    const duration = event.duration;
    const endDate = new Date(startDate.getTime() + (duration?.toSeconds() || 3600) * 1000);

    const isAllDay = next.isDate;

    events.push({
      uid: `${uid}_${startDate.toISOString()}`,
      summary: event.summary || "Untitled Event",
      description: event.description || undefined,
      location: event.location || undefined,
      start: startDate,
      end: endDate,
      isAllDay,
    });

    count++;
  }

  return events;
}

function extractEventData(event: ICAL.Event, uid: string): CalendarEvent | null {
  const startDate = event.startDate?.toJSDate();
  const endDate = event.endDate?.toJSDate();

  if (!startDate) return null;

  const isAllDay = event.startDate?.isDate || false;

  return {
    uid,
    summary: event.summary || "Untitled Event",
    description: event.description || undefined,
    location: event.location || undefined,
    start: startDate,
    end: endDate || new Date(startDate.getTime() + 3600000), // Default 1 hour
    isAllDay,
  };
}

// Generate a hash for change detection
export function getEventHash(event: CalendarEvent): string {
  const data = [
    event.summary,
    event.description || "",
    event.location || "",
    event.start.toISOString(),
    event.end.toISOString(),
    event.isAllDay.toString(),
  ].join("|");

  // Simple hash function
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(16);
}
