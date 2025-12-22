# Calendar Sync

Sync ICS calendar feeds (like Outlook) to Google Calendar. Runs every minute to keep your calendars in sync.

## Features

- Fetches events from any ICS feed URL
- Creates a new Google Calendar with a fun random animal name
- Full two-way sync: creates, updates, and deletes events
- Runs continuously with configurable sync interval
- **Web-based OAuth** - authorize directly from your browser on first run
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
   - Application type: **Web application**
   - Add authorized redirect URI: `https://your-app-domain.com/callback`
   - (For local dev, also add: `http://localhost:3000/callback`)
5. Configure OAuth consent screen:
   - Go to APIs & Services > OAuth consent screen
   - User type: External (or Internal if using Workspace)
   - Add your email as a test user

### 2. Get your credentials

From the credentials page, note:
- **Client ID** (ends with `.apps.googleusercontent.com`)
- **Client Secret**

### 3. Deploy

#### Option A: Deploy to Coolify (Recommended)

1. Push your code to GitHub
2. In Coolify, create a new service from Git repository
3. Select your repo and branch
4. Build pack: **Dockerfile**
5. Add environment variables:
   - `ICS_URL` - Your ICS calendar URL
   - `GOOGLE_CLIENT_ID` - OAuth client ID
   - `GOOGLE_CLIENT_SECRET` - OAuth client secret
   - `BASE_URL` - Your app's public URL (e.g., `https://calendar-sync.yourdomain.com`)
   - `PORT` - Port to listen on (default: 3000)
6. Deploy!
7. **First run**: Open your app URL in a browser to authorize with Google

#### Option B: Run with Docker

```bash
docker-compose up -d
```

Then open `http://localhost:3000` to authorize.

#### Option C: Run locally

```bash
# Install dependencies
bun install

# Set environment variables
export ICS_URL=https://outlook.office365.com/owa/calendar/xxx/calendar.ics
export GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
export GOOGLE_CLIENT_SECRET=your-client-secret

# Run
bun run start
```

Open `http://localhost:3000` to authorize on first run.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ICS_URL` | Yes | URL to your ICS calendar feed |
| `GOOGLE_CLIENT_ID` | Yes | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Yes | Google OAuth client secret |
| `GOOGLE_REFRESH_TOKEN` | No | Pre-configured refresh token (skips web OAuth) |
| `BASE_URL` | No | Public URL for OAuth callback (default: `http://localhost:PORT`) |
| `PORT` | No | HTTP port for OAuth server (default: 3000) |
| `SYNC_INTERVAL_MS` | No | Sync interval in ms (default: 60000) |
| `CALENDAR_NAME` | No | Custom calendar name (default: random animal) |

## How It Works

1. **First run**: App starts a web server for OAuth authorization
2. **Authorization**: You click the link to authorize with Google
3. **Token storage**: Refresh token is saved to `.google-refresh-token` file
4. **Sync loop**: App syncs ICS events to Google Calendar every minute
5. **Restarts**: Token persists, so no re-authorization needed

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

## Troubleshooting

### "No refresh token received"
Go to https://myaccount.google.com/permissions, revoke access for this app, and try again.

### OAuth redirect mismatch
Make sure your `BASE_URL` matches the authorized redirect URI in Google Cloud Console.

## License

MIT
