create table if not exists public.portfolio_profiles (
  id text primary key,
  content jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

alter table public.portfolio_profiles enable row level security;

drop policy if exists "Portfolio profiles are publicly readable" on public.portfolio_profiles;
create policy "Portfolio profiles are publicly readable"
on public.portfolio_profiles
for select
using (true);

drop policy if exists "Only owner can insert portfolio profiles" on public.portfolio_profiles;
create policy "Only owner can insert portfolio profiles"
on public.portfolio_profiles
for insert
with check (
  auth.jwt() ->> 'email' = 'your-email@example.com'
);

drop policy if exists "Only owner can update portfolio profiles" on public.portfolio_profiles;
create policy "Only owner can update portfolio profiles"
on public.portfolio_profiles
for update
using (
  auth.jwt() ->> 'email' = 'your-email@example.com'
)
with check (
  auth.jwt() ->> 'email' = 'your-email@example.com'
);

create or replace function public.set_portfolio_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  new.updated_by = auth.uid();
  return new;
end;
$$;

drop trigger if exists set_portfolio_profiles_updated_at on public.portfolio_profiles;
create trigger set_portfolio_profiles_updated_at
before insert or update on public.portfolio_profiles
for each row
execute function public.set_portfolio_updated_at();
