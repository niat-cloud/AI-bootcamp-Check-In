# Event Check-In & Smart Team Seat Allocation

Check-in for offline AI Bootcamp events across many locations. A student scans the event's QR code, enters their phone number, confirms their details and gets a permanent, balanced, random team + seat + room.

- **Event page (public):** `/<location>/<event>`, for example `/hyderabad/18-oct-2026`. A second event at the same location on the same day gets `-2`. Print its QR code from Event Setup.
- **Live events (public):** `/` lists every event whose check-in is open.
- **Gate kiosk (admin only):** `/gate/<event id>`. Volunteers search by name or phone. It needs an admin of that location signed in on the device.
- **Admin:** `/admin`. Location admins request access at `/admin/signup`.

## Roles

- **Super admin:** creates locations, approves or rejects access requests, assigns locations to admins, can disable accounts, and sees every location (Platform → All Locations, Locations, Admins).
- **Location admin:** everything for their own locations only: event setup, import, rooms & teams, dashboard, participants, export. Other locations' events behave as if they don't exist.

The super admin account is created on the first sign-in from `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD` (falling back to `ADMIN_EMAIL` / `ADMIN_PASSWORD`, then `admin@niat.edu` / `admin123`). With the built-in default password, the first sign-in has to set a new one. Passwords are stored hashed (scrypt). Changing the environment variables later doesn't change an existing account.

## Setup

```bash
cp .env.example .env        # set DATABASE_URL to your managed Postgres (Neon / Supabase / Render …)
npm install
npm run migrate             # create tables (the dev server also runs migrations on startup)
npm run dev                 # API on :4000, web app on http://localhost:5173
```

## Event workflow

1. **Super admin → Locations:** add each city or campus. Its link name starts every event URL there.
2. **Admin → Event Setup:** create the event (location, date, expected students, team size, seat labels), then add rooms with capacity and priority. The public link and QR code appear right away.
3. **Admin → Import Participants:** upload `.xlsx` / `.csv` (Name, Phone, School/College and Source; Class, Parent Phone and Area are optional, in any column order), or copy the list from a previous event of the same location.
   - **Source** is the marketing channel the person came through (CBA, Pass, DM, Outbound …). Only admins see it: it is on the dashboard, the participants list and the export, and never on the student check-in pages. Re-importing a file fills in or corrects the source of people already on the list.
   - The dashboard's **Marketing** tab ranks sources by show-up rate (registered → arrived), lists the top areas and schools, and has a **call list** of registered people who haven't arrived yet (filter by source, export as CSV). Areas come from the Area column, and students give theirs when they check in.
4. **Activate** the event. This opens the event page and the gate kiosk. Team size, seat labels, the location and the link are fixed after this. Rooms and their capacity can still change.
5. **Check-in:** students enter their phone number on the event page.
   - **Registered:** they check their details and confirm.
   - **Known from an earlier event:** their details are pre-filled.
   - **New:** they fill in a short form.

   They then get a seat. Reopening the link on the same phone shows the seat again. When every seat is taken they go on the waiting list until capacity is added (Rooms & Teams → Auto-Allocate).
6. **Dashboard → Live operations** during the event: what needs attention now (waiting list, last seats, quiet periods), arrivals per time slot with a forecast of when seats run out, the live check-in feed, room and table occupancy. It refreshes every 5 seconds.
7. **Projects & AI Judging:**
   - **Student page:** `/<location>/<event>/project` (or click "Show QR on screen" in Admin → Projects to project the room QR with live progress bar and countdown).
   - **Submission flow:** teams select their room (auto-selected when scanning a room QR), pick their team number, select their name from team members, choose a theme, describe the problem statement, and paste their published Lovable link. Editor links (`lovable.dev/projects/...`) and unrendered preview links are rejected with instructions to click Publish.
   - **Admin controls:** per-room submission window controls (Open with 15–90 min deadline, +10 min, Close, Open all rooms). Submissions after deadline are accepted and flagged as late; Close is the hard stop.
   - **AI scoring:** automatically evaluates submissions in the background (OpenAI first, then Gemini, then Claude, using whichever keys are set) against 5 rubric criteria (Problem Clarity, Solution Fit, Working App & Experience, Creativity & Wow Factor, Impact & Usefulness, /50 total). Rendered screenshots and page text are captured via Browserless.
   - **Judges review & ranking:** ranked shortlist table per room with flags (duplicate links, late, un-evaluable, failed). Judges can override scores with notes, disqualify, re-queue, select Winner / Runner-up / 2nd Runner-up ("Fill from top 3"), lock room results, and export all results to CSV.
8. **Complete** the event when it's over. Data stays available for export.

Several events (in different locations, or the same one) can be live at the same time. Each event has its own lock, so they never slow each other down.

## How seats are allocated

- **Tables:** each room holds `floor(capacity / team size)` full tables, plus one smaller table for any leftover seats. Table numbers restart at Team 1 in every room.
- **Rooms** fill strictly in priority order.
- **Active team pool:** only the first *N* tables of a room are open at the start. When those reach the configured fill level (60% by default), the next *N* tables open.
- **Random but balanced:** each arriving student goes to a random table among the open tables with the fewest people. Within a table, seats fill A → B → C.
- **Permanent:** each assignment runs in one database transaction that locks the event row. Unique constraints guarantee one seat per participant and one participant per seat. Repeating a request returns the same seat.

## Tests

```bash
npm test     # unit tests; with DATABASE_URL set, also the full DB scenarios (in a temporary schema that is dropped afterwards)
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
   - `AUTH_SECRET`: a long random string that signs admin sessions. If it isn't set, a key derived from `DATABASE_URL` is used.
   - `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD` (optional): the first super admin.
   - `EVENT_TIMEZONE` = `Asia/Kolkata` (optional)
   - `OPENAI_API_KEY` (main), `GEMINI_API_KEY` and/or `ANTHROPIC_API_KEY`: API keys for AI project scoring. Every provider with a key is used in that order: if one fails for a project, the next one scores it. `OPENAI_MODEL`, `GEMINI_MODEL` and `PROJECT_EVAL_MODEL` (Claude) pick the models.
   - `BROWSERLESS_TOKEN` (optional): Browserless headless browser token to render client-side Lovable apps and capture screenshots for the AI evaluator.
3. Deploy. The serverless function does not create database tables. Create them by running `npm run migrate` locally against the same database.

Note: Vercel limits request bodies to 4.5 MB, which is plenty for participant imports of a few thousand rows.
