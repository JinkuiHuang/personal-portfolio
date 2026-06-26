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
  auth.jwt() ->> 'email' = 'jacksonhuang.hjk@qq.com'
);

drop policy if exists "Only owner can update portfolio profiles" on public.portfolio_profiles;
create policy "Only owner can update portfolio profiles"
on public.portfolio_profiles
for update
using (
  auth.jwt() ->> 'email' = 'jacksonhuang.hjk@qq.com'
)
with check (
  auth.jwt() ->> 'email' = 'jacksonhuang.hjk@qq.com'
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

insert into storage.buckets (id, name, public)
values ('portfolio-assets', 'portfolio-assets', true)
on conflict (id) do update
set public = excluded.public;

drop policy if exists "Portfolio assets are publicly readable" on storage.objects;
create policy "Portfolio assets are publicly readable"
on storage.objects
for select
using (bucket_id = 'portfolio-assets');

drop policy if exists "Only owner can upload portfolio assets" on storage.objects;
create policy "Only owner can upload portfolio assets"
on storage.objects
for insert
with check (
  bucket_id = 'portfolio-assets'
  and auth.jwt() ->> 'email' = 'jacksonhuang.hjk@qq.com'
);

drop policy if exists "Only owner can update portfolio assets" on storage.objects;
create policy "Only owner can update portfolio assets"
on storage.objects
for update
using (
  bucket_id = 'portfolio-assets'
  and auth.jwt() ->> 'email' = 'jacksonhuang.hjk@qq.com'
)
with check (
  bucket_id = 'portfolio-assets'
  and auth.jwt() ->> 'email' = 'jacksonhuang.hjk@qq.com'
);

drop policy if exists "Only owner can delete portfolio assets" on storage.objects;
create policy "Only owner can delete portfolio assets"
on storage.objects
for delete
using (
  bucket_id = 'portfolio-assets'
  and auth.jwt() ->> 'email' = 'jacksonhuang.hjk@qq.com'
);
