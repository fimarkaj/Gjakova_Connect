-- gjakova-connect: reports table + storage bucket
-- Run this whole file in the Supabase SQL editor (Project > SQL Editor > New query).

-- Required for gen_random_uuid()
create extension if not exists pgcrypto;

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  ticket_code text unique not null,
  description text not null,
  category text,
  urgency text,
  status text not null default 'submitted'
    check (status in ('submitted', 'in_progress', 'resolved', 'reopened', 'confirmed_resolved')),
  area text,
  latitude double precision,
  longitude double precision,
  photo_url text,
  duplicate_of uuid references public.reports(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Drop the reporter_id/auth link from any earlier deployment — reports are anonymous,
-- the ticket_code is the citizen's only way to track a submission.
alter table public.reports drop column if exists reporter_id;

-- Auto-generate ticket codes like GJK-1001, GJK-1002, ...
create sequence if not exists public.reports_ticket_seq start with 1001;

create or replace function public.set_report_ticket_code()
returns trigger
language plpgsql
as $$
begin
  if new.ticket_code is null then
    new.ticket_code := 'GJK-' || nextval('public.reports_ticket_seq');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_reports_ticket_code on public.reports;
create trigger trg_reports_ticket_code
  before insert on public.reports
  for each row
  execute function public.set_report_ticket_code();

-- Keep updated_at current on every update
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_reports_updated_at on public.reports;
create trigger trg_reports_updated_at
  before update on public.reports
  for each row
  execute function public.set_updated_at();

create index if not exists reports_status_idx on public.reports(status);
create index if not exists reports_created_at_idx on public.reports(created_at desc);

-- Enable Supabase Realtime (postgres_changes) on reports so /admin can live-update
-- on new submissions and status changes without a manual refresh.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'reports'
  ) then
    alter publication supabase_realtime add table public.reports;
  end if;
end $$;

-- Row Level Security: public read (feed is public), inserts allowed for anon/auth,
-- updates restricted to service role (admin/staff tooling) until an admin role is modeled.
alter table public.reports enable row level security;

drop policy if exists "Public read access" on public.reports;
create policy "Public read access"
  on public.reports for select
  using (true);

drop policy if exists "Anyone can submit a report" on public.reports;
create policy "Anyone can submit a report"
  on public.reports for insert
  with check (true);

-- ---------- storage ----------
-- Public bucket for report photos.
insert into storage.buckets (id, name, public)
values ('report-photos', 'report-photos', true)
on conflict (id) do nothing;

drop policy if exists "Public read for report photos" on storage.objects;
create policy "Public read for report photos"
  on storage.objects for select
  using (bucket_id = 'report-photos');

-- No anon/auth insert policy: photo uploads are handled only by the server
-- (/api/reports/photo, via the service_role key) so every photo is re-encoded
-- and stripped of EXIF metadata before it lands in the bucket.
drop policy if exists "Anyone can upload report photos" on storage.objects;

-- ---------- AI pipeline: duplicate detection embeddings ----------
-- Requires pgvector. On Supabase this extension ships in the "extensions" schema.
create extension if not exists vector;

create table if not exists public.report_embeddings (
  report_id uuid primary key references public.reports(id) on delete cascade,
  embedding vector(1536) not null,
  created_at timestamptz not null default now()
);

-- Approximate nearest-neighbor index for cosine distance (<=>) lookups.
create index if not exists report_embeddings_embedding_idx
  on public.report_embeddings
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- Only the server (service_role, via supabaseAdmin) reads/writes embeddings —
-- no public policies are defined, so RLS blocks anon/auth access entirely.
alter table public.report_embeddings enable row level security;

-- ---------- email notifications ----------
-- Optional citizen contact email for status-change notifications. This is
-- PII, unlike every other reports column, so it must never be readable by
-- the anon/authenticated roles the browser uses — RLS alone can't hide a
-- single column (it's row-scoped), so we revoke table-level SELECT and
-- re-grant it only for the non-sensitive columns. Only supabaseAdmin
-- (service_role, bypasses RLS/grants) reads notify_email.
alter table public.reports add column if not exists notify_email text;

revoke select on public.reports from anon, authenticated;
grant select (
  id, ticket_code, description, category, urgency, status, area,
  latitude, longitude, photo_url, duplicate_of, created_at, updated_at
) on public.reports to anon, authenticated;

-- postgres_changes (Realtime) replicates full rows regardless of the column
-- grants above — RLS gates which ROWS a subscriber sees, not which columns.
-- Restrict the publication itself to the same safe column list (Postgres 15+,
-- which Supabase runs) so notify_email is never replicated to any anon-key
-- websocket subscriber, including /admin's live-update channel.
alter publication supabase_realtime set table public.reports (
  id, ticket_code, description, category, urgency, status, area,
  latitude, longitude, photo_url, duplicate_of, created_at, updated_at
);

-- ---------- categories: municipal departments ----------
-- Categories now map to the municipality's departments (see CATEGORIES in
-- lib/types.ts). Remap rows classified under the old issue-type ids.
update public.reports set category = case category
    when 'rruge' then 'infrastruktura'
    when 'drite' then 'infrastruktura'
    when 'mbeturina' then 'sherbime_publike'
    when 'uji' then 'sherbime_publike'
    when 'gjelberim' then 'urbanizem'
    when 'tjeter' then 'administrata'
  end
where category in ('rruge', 'drite', 'mbeturina', 'uji', 'gjelberim', 'tjeter');

-- ---------- AI quality gate ----------
-- Written by assessReport() (lib/quality.ts) on submission, before
-- classification and duplicate detection run. `description` is never touched:
-- the citizen's original text is permanent and stays the column every public
-- view reads. The normalized restatement lives alongside it.
--
-- These columns are deliberately left out of the anon/authenticated grant and
-- the realtime publication below — flag_reason is written for municipal staff,
-- not for the submitter. Add them to both lists if /admin ever needs to read
-- them with the anon key.
alter table public.reports add column if not exists normalized_description text;
alter table public.reports add column if not exists quality_flagged boolean default false;
alter table public.reports add column if not exists flag_reason text;
alter table public.reports add column if not exists quality_confidence double precision;

-- ---------- departments: contact routing ----------
-- One row per municipal department (see CATEGORIES in lib/types.ts for the
-- matching category ids/labels). `contact_email` is filled in by staff from
-- /admin/departments; report emails are only ever sent when a clerk clicks
-- "Send to Department" on a report, never automatically.
create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text,
  contact_email text,
  updated_at timestamptz not null default now()
);

-- One department per category keeps the "default department for this
-- report's category" lookup in /admin unambiguous. A plain (non-partial)
-- unique index is required here so `insert ... on conflict (category)`
-- below can target it; Postgres already treats multiple NULLs as distinct,
-- so departments without a category still don't collide.
create unique index if not exists departments_category_key
  on public.departments(category);

drop trigger if exists trg_departments_updated_at on public.departments;
create trigger trg_departments_updated_at
  before update on public.departments
  for each row
  execute function public.set_updated_at();

-- Audit log: every time staff send a report to a department, regardless of
-- whether the department's email later changes.
create table if not exists public.report_department_sends (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  department_id uuid not null references public.departments(id) on delete cascade,
  sent_at timestamptz not null default now(),
  sent_to_email text not null
);

create index if not exists report_department_sends_report_idx
  on public.report_department_sends(report_id);

-- Admin-only data: no anon/authenticated policies are defined, so RLS denies
-- them entirely. Only supabaseAdmin (service_role, bypasses RLS) reads/writes
-- these tables, via /api/admin/* routes gated by middleware's Basic Auth.
alter table public.departments enable row level security;
alter table public.report_department_sends enable row level security;

-- Seed one department per current category, named after Komuna e Gjakovës's
-- Drejtoria për Shërbime Publike structure. contact_email is left NULL —
-- staff fill it in from /admin/departments before any send will work.
insert into public.departments (name, category, contact_email)
values
  ('Drejtoria e Administratës', 'administrata', null),
  ('Drejtoria e Shëndetësisë dhe Mirëqenies Sociale', 'shendetesi', null),
  ('Drejtoria e Arsimit', 'arsim', null),
  ('Drejtoria e Buxhetit dhe Financave', 'buxhet', null),
  ('Drejtoria e Zhvillimit Ekonomik', 'zhvillim_ekonomik', null),
  ('Drejtoria e Urbanizmit dhe Planifikimit', 'urbanizem', null),
  ('Drejtoria e Bujqësisë, Pylltarisë dhe Zhvillimit Rural', 'bujqesi', null),
  ('Drejtoria e Shërbimeve Publike', 'sherbime_publike', null),
  ('Drejtoria e Infrastrukturës', 'infrastruktura', null),
  ('Drejtoria e Kulturës, Rinisë dhe Sportit', 'kulture', null),
  ('Drejtoria e Mbrojtjes dhe Shpëtimit', 'mbrojtje_shpetim', null),
  ('Drejtoria e Kadastrit dhe Gjeodezisë', 'kadastri', null),
  ('Drejtoria e Inspektoratit', 'inspektorati', null)
on conflict (category) do nothing;
