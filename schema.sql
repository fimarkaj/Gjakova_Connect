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
