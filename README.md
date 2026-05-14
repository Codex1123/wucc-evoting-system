# wucc-evoting-system

Blockchain-based electronic voting system.

## Votechain

Votechain is a modern React + Supabase e-voting system for final year project defense. It supports managed voter approval, verified voter accounts, role-based administration, election controls, ballot casting, and realtime result charts.

## Tech Stack

- Frontend: React, Vite, Tailwind CSS, React Router, Recharts, Lucide React
- Backend: Supabase Auth, Database, Realtime, Storage-ready public URLs

## Project Structure

```text
src/
  components/
  config/
  context/
  hooks/
  pages/
  services/
supabase/
  migrations/
  seed.sql
```

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env.local` from `.env.example`:

```bash
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY
```

3. For a new Supabase project, run the reset schema in Supabase SQL Editor:

```text
supabase/reset_wucc_evoting.sql
```

4. Run seed data only after the reset/schema script completes:

```text
supabase/seed.sql
```

5. Create Supabase Auth users for admins and voters. Voters must use their own password, not their matric number.

6. Add matching profile rows:

```sql
insert into public.profiles (id, full_name, role)
values ('AUTH_USER_UUID', 'Chief Electoral Officer', 'superadmin');
```

Roles are `superadmin`, `commissioner`, `observer`, and `voter`.

Voters can register from the login page. Registration creates a pending voter record; a superadmin must approve it before login. Approved voters sign in through their verified account before accessing protected voting routes.

## Development

```bash
npm run dev
```

Build and syntax check:

```bash
npm run check
```

## Security Notes

- The Supabase publishable key is safe to expose in the browser.
- Never place a service-role key in this project.
- RLS policies and RPCs protect administration, voter records, and ballot casting.
- Public result/stat RPCs return aggregate data only; admin, voter, and profile writes stay protected by RLS plus security-definer RPCs.
