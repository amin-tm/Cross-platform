-- Run this once in Supabase Dashboard → SQL Editor.
-- Creates the tables that pol needs. Safe to run again; nothing is dropped.

create extension if not exists "pgcrypto";

create table if not exists public.transfers (
  id uuid primary key default gen_random_uuid(),
  code varchar(6) not null unique,
  owner_id uuid not null,
  contributor_id uuid,
  kind varchar(12) not null default 'send',
  status varchar(12) not null default 'pending',
  total_size bigint not null default 0,
  file_count integer not null default 0,
  downloads integer not null default 0,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  expires_at timestamptz not null
);

create table if not exists public.transfer_files (
  id uuid primary key,
  transfer_id uuid not null references public.transfers(id) on delete cascade,
  name text not null,
  mime text not null default 'application/octet-stream',
  size bigint not null,
  storage_name text not null,
  status varchar(12) not null default 'ready',
  created_at timestamptz not null default now()
);

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  message text not null,
  created_at timestamptz not null default now()
);

create index if not exists transfers_expires_at_idx on public.transfers (expires_at);
create index if not exists transfer_files_transfer_id_idx on public.transfer_files (transfer_id);

-- These tables are only touched by pol's Next.js API routes using the service role key,
-- which bypasses RLS. Enable RLS so nothing is exposed via the public anon key by accident.
alter table public.transfers enable row level security;
alter table public.transfer_files enable row level security;
alter table public.feedback enable row level security;

-- Create the storage bucket used for uploaded files.
insert into storage.buckets (id, name, public)
values ('transfers', 'transfers', false)
on conflict (id) do nothing;

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  phone varchar(20) not null unique,
  visits integer not null default 1,
  source varchar(40) not null default 'contact-popup',
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists leads_created_at_idx
on public.leads (created_at desc);

alter table public.leads enable row level security;
