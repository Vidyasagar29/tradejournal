# Supabase Auth Setup

This app now supports a real login screen with Supabase Auth.

To make the dashboard actually private, you must do both:

1. Create Supabase Auth users
2. Enable RLS policies on the project tables

Without RLS, a login screen alone is not enough.

## 1. Create Users

In Supabase Dashboard:

* Authentication
* Users
* Add user

Create the email/password accounts that should be allowed to use the app.

## 2. Enable RLS

Run this SQL in the Supabase SQL editor:

```sql
alter table public.strategies enable row level security;
alter table public.trades enable row level security;
alter table public.positions enable row level security;
alter table public.exits enable row level security;
alter table public.portfolio enable row level security;
alter table public.default_iv enable row level security;

create policy "authenticated read strategies"
on public.strategies for select
to authenticated
using (true);

create policy "authenticated write strategies"
on public.strategies for all
to authenticated
using (true)
with check (true);

create policy "authenticated read trades"
on public.trades for select
to authenticated
using (true);

create policy "authenticated write trades"
on public.trades for all
to authenticated
using (true)
with check (true);

create policy "authenticated read positions"
on public.positions for select
to authenticated
using (true);

create policy "authenticated write positions"
on public.positions for all
to authenticated
using (true)
with check (true);

create policy "authenticated read exits"
on public.exits for select
to authenticated
using (true);

create policy "authenticated write exits"
on public.exits for all
to authenticated
using (true)
with check (true);

create policy "authenticated read portfolio"
on public.portfolio for select
to authenticated
using (true);

create policy "authenticated write portfolio"
on public.portfolio for all
to authenticated
using (true)
with check (true);

create policy "authenticated read default_iv"
on public.default_iv for select
to authenticated
using (true);
```

## Notes

* This setup protects the app so only signed-in users can read/write.
* If you later want multi-user isolation, add an owner column and user-specific policies.
* The GitHub Actions snapshot script uses the service-role key, so it will keep working even after RLS is enabled.
