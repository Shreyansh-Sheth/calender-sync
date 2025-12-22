# Calendar Sync

Sync ICS calendar feeds (like Outlook) to Google Calendar. Runs every minute to keep your calendars in sync.

## Features

- Fetches events from any ICS feed URL
- Creates a new Google Calendar with a fun random animal name
- Full two-way sync: creates, updates, and deletes events
- Runs continuously with configurable sync interval
- Docker-ready for easy deployment

## Quick Start

### 1. Set up Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select existing)
3. Enable the **Google Calendar API**:
   - Go to APIs & Services > Library
   - Search for "Google Calendar API"
   - Click Enable
4. Create OAuth credentials:
   - Go to APIs & Services > Credentials
   - Click "Create Credentials" > "OAuth client ID"
   - Application type: **Desktop app**
   - Download the JSON file
5. Configure OAuth consent screen:
   - Go to APIs & Services > OAuth consent screen
   - User type: External (or Internal if using Workspace)
   - Add your email as a test user

### 2. Get your credentials

From the downloaded JSON or the credentials page, note:
- **Client ID** (ends with `.apps.googleusercontent.com`)
- **Client Secret**

### 3. Get a refresh token

```bash
# Clone the repo
git clone https://github.com/yourusername/calendar-sync.git
cd calendar-sync

# Install dependencies
bun install

# Get refresh token (opens browser for auth)
GOOGLE_CLIENT_ID=your-client-id GOOGLE_CLIENT_SECRET=your-secret bun run get-token
```

Follow the prompts to authorize. Copy the refresh token from the terminal output.

### 4. Configure environment

```bash
cp .env.example .env
```

Edit `.env` with your values:
```env
ICS_URL=https://outlook.office365.com/owa/calendar/xxx/calendar.ics
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REFRESH_TOKEN=your-refresh-token
SYNC_INTERVAL_MS=60000
```

### 5. Run locally

```bash
bun run start
```

Or with Docker:

```bash
docker-compose up -d
```

## Deployment to Coolify

1. Push your code to GitHub
2. In Coolify, create a new service from Git repository
3. Select your repo and branch
4. Build pack: **Dockerfile**
5. Add environment variables in Coolify's UI:
   - `ICS_URL`
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `GOOGLE_REFRESH_TOKEN`
   - `SYNC_INTERVAL_MS` (optional, default 60000)
   - `CALENDAR_NAME` (optional)
6. Deploy!

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ICS_URL` | Yes | URL to your ICS calendar feed |
| `GOOGLE_CLIENT_ID` | Yes | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Yes | Google OAuth client secret |
| `GOOGLE_REFRESH_TOKEN` | Yes | Google OAuth refresh token |
| `SYNC_INTERVAL_MS` | No | Sync interval in ms (default: 60000) |
| `CALENDAR_NAME` | No | Custom calendar name (default: random animal) |

## Getting your ICS URL

### Outlook/Office 365
1. Go to Outlook Calendar (web)
2. Settings > Calendar > Shared calendars
3. Publish a calendar
4. Copy the ICS link

### iCloud
1. Go to icloud.com/calendar
2. Click the share icon next to a calendar
3. Enable "Public Calendar"
4. Copy the URL

### Google Calendar
1. Calendar settings > Integrate calendar
2. Copy "Secret address in iCal format"

## License

MIT
