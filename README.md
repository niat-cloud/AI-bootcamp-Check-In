# Event Check-In & Smart Team Seat Allocation

Gate check-in for offline student events: search a student → confirm → get a permanent, balanced, random team + seat + room.

- **Check-in screen:** `/` (one device at the entry gate)
- **Admin:** `/admin` (set up the event, import participants, live dashboard, participants, rooms & teams, export)

There is no login: anyone with the URL can open `/admin`. Phone numbers are masked on the check-in screen, and its API returns at most 15 matches per search.

## Setup

```bash
cp .env.example .env        # set DATABASE_URL to your managed Postgres (Neon / Supabase / Render …)
npm install
npm run migrate             # create tables (the server also runs migrations on startup)
npm run dev                 # API on :4000, web app on http://localhost:5173
```

## Event workflow

1. **Admin → Event Setup:** create the event (expected students, team size, seat labels, active pool size), then add rooms with capacity and priority.
2. **Admin → Import Participants:** upload `.xlsx` / `.csv` (Name, Phone, School/College; Class and Parent Phone are optional, in any column order). Review the preview and any flagged rows, then import. You can also copy the list from a previous event.
3. **Activate** the event. This creates every table and seat from the rooms. After this, rooms, team size and seat labels can't be changed.
4. **Check-in screen:** search by phone or name → Confirm & Get Seat. Students who aren't found register as walk-ins and get a seat straight away.
5. **Complete** the event when it's over. No more seats are assigned, and the data stays available for export. Create a new event for next week.

## How seats are allocated

- **Tables:** each room holds `floor(capacity / team size)` full tables, plus one smaller table for any leftover seats (100 seats with teams of 3 gives Teams 1–33 plus Team 34 with seat A only). Team numbers continue across rooms, and there are never more seats than the room capacity.
- **Rooms** fill strictly in priority order.
- **Active team pool:** only the first *N* tables of a room are open at the start. When those reach the configured fill level (60% by default), the next *N* tables open.
- **Random but balanced:** each arriving student goes to a random table among the open tables with the fewest people. Every open table gets its first student before any table gets a second. Within a table, seats fill A → B → C.
- **Permanent:** each assignment runs in one database transaction that locks the event row. Unique constraints guarantee one seat per participant and one participant per seat. Repeating a request returns the same seat.

## Tests

```bash
npm test     # unit tests; with DATABASE_URL set, also the full DB scenario (runs in a temporary schema that is dropped afterwards)
```

## Deploy (Vercel + Supabase)

1. Import the GitHub repo in Vercel (Framework preset: **Other**, root directory: the repo root). `vercel.json` already sets:
   - the build command
   - the output directory (`client/dist`)
   - the `/api` serverless function
   - the Seoul region (`icn1`), next to the Supabase database
2. Add these environment variables in Vercel → Settings → Environment Variables:
   - `DATABASE_URL`: the Supabase **Transaction pooler** connection string (port **6543**). Write any `@` in the password as `%40`.
   - `DATABASE_SSL` = `true`
   - `EVENT_TIMEZONE` = `Asia/Kolkata` (optional)
3. Deploy. The serverless function does not create database tables. Create them by running `npm run migrate` locally against the same database.

Note: Vercel limits request bodies to 4.5 MB, which is plenty for participant imports of a few thousand rows.
