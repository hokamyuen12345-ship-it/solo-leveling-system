# Supabase setup for Solo Leveling System

Use Supabase so progress syncs across devices (e.g. complete a task on your phone and see it on your computer).

## 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and sign in (or create an account).
2. **New project** → choose org, name (e.g. `solo-leveling`), database password, region.
3. Wait for the project to be ready.

## 2. Get URL and anon key

In the Supabase dashboard:

- **Project Settings** (gear) → **API**.
- Copy **Project URL** and **anon public** key.

Locally, create `.env.local` (do not commit):

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

For Vercel: **Project** → **Settings** → **Environment Variables** → add the same two variables for Production (and Preview if you want).

## 3. Run the SQL (table + RLS)

In the Supabase dashboard: **SQL Editor** → **New query**, paste the SQL below, then **Run**.

```sql
-- Table: one row per (user, key). Value is JSON (same as localStorage).
create table if not exists public.user_state (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  key        text not null,
  value      jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  unique(user_id, key)
);

-- Index for fast lookups by user
create index if not exists user_state_user_id_idx on public.user_state(user_id);

-- RLS: users can only read/write their own rows
alter table public.user_state enable row level security;

create policy "Users can read own state"
  on public.user_state for select
  using (auth.uid() = user_id);

create policy "Users can insert own state"
  on public.user_state for insert
  with check (auth.uid() = user_id);

create policy "Users can update own state"
  on public.user_state for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own state"
  on public.user_state for delete
  using (auth.uid() = user_id);
```

## 4. Enable Auth providers (optional)

- **Authentication** → **Providers**:
  - **Email**: enable if you want magic link or email+password.
  - **Google** (or GitHub): enable if you want “Sign in with Google” and add the OAuth client ID/secret.

After this, the app will:

- Let you sign in (email or Google).
- On load when signed in: fetch your state from Supabase and use it (and write to localStorage for offline).
- On every progress change: save to Supabase so other devices see the same data when they load.

## 5. Sync keys

The app syncs these localStorage keys to Supabase:

- `slq_v2` — main progress (EXP, completed, debuffs, streak, boss, lastReset)
- `slq_meta_v1` — week history, emergency/penalty, random hidden quest, shadow soldiers
- `slq_history_v1` — mission history list
- `slq_boss_v1` — weekly boss state
- `slq_achievements_v1` — unlocked achievement IDs
- `slq_voice_enabled` — voice on/off (stored as string in value)

If Supabase env vars are missing or the user is not signed in, the app keeps using only localStorage (no sync).
