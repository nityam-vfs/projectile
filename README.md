# Planwise

A browser based project scheduling workspace built with Next.js, TypeScript, Supabase and Drizzle Kit for SQL schema generation. The first milestone covers project records, a hierarchical task grid, WBS numbering, predecessor editing and a server side schedule recalculation endpoint.

## Setup

1. Create a Supabase project. Copy the **Project URL** and **anon/public key** from **Project Settings → API**.
2. A random `APP_WRITE_TOKEN` is generated for this workspace in the ignored `.env.local`; its matching SQL is in the ignored `supabase/setup.local.sql`. Run that full script in the Supabase SQL Editor. It creates the tables, enables RLS, and limits writes to requests carrying the app token. Keep both local files out of source control.
3. Put your `SUPABASE_URL` and `SUPABASE_ANON_KEY` in `.env.local` using `.env.example` as a template. The generated app token is already there.
4. Install packages with `npm install`, then start the app with `npm run dev`.

The app uses Supabase's JavaScript client with the project URL and anon/public key. The service-role key, direct PostgreSQL password, and Supabase Auth are not used. The anon key is sent only from server routes. RLS permits project reads and checks the shared write token for every mutation. Keep `.env.local` out of source control and place the production app behind an access boundary because project reads are available to anyone who can reach the deployment.

## Scheduling conventions

- Dates are stored as ISO calendar dates. The initial engine treats these as UTC dates and uses Monday through Friday as working days.
- Task duration is a count of working days. A one day task starts and finishes on the same working date. For a positive duration, finish is inclusive. An FS successor starts on the next working date after its predecessor finishes; lag advances that boundary by working days. Negative lag is allowed.
- SS, FF and SF constraints use their corresponding start/finish points. The engine calculates early dates with a topological pass and float with a reverse pass. Cycle detection and dependency validation run before calculating dates.
- An entered start date acts as an earliest-start constraint. Summary-task aggregation and configurable hours, holidays, and timezone calendars are scheduled for a subsequent milestone.
- Predecessors use the visible row IDs (for example `1FS,3SS+2d`); internal links store UUIDs.

## Current scope

Projects, task create/update/delete, WBS code generation, hierarchy display/collapse, duration and progress editing, predecessor parsing, server-side date recalculation, critical highlighting, a timeline, dependency network, calendar configuration, and schedule baselines are implemented. Baselines snapshot task start, finish, and duration; the Baselines view compares those values with the current schedule. Replacing a baseline requires explicit confirmation. Resource management, CSV/XLSX import/export, multi-select hierarchy operations, and undo/redo remain future work.

## Deployment

Deploy as a standard Next.js app on Vercel and configure `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `APP_WRITE_TOKEN` in project environment variables. Apply schema changes through the Supabase SQL Editor using `supabase/setup.sql`. No local filesystem persistence is used.
