-- All app records live in one table, grouped by logical table name (e.g. "clients:<trainerId>").
-- Only the "api" edge function (service role) touches it; access rules are enforced there.
create table public.kv_rows (
  tbl text not null,
  id text not null,
  data json not null default '{}'::json,
  seq bigint generated always as identity,
  primary key (tbl, id)
);

create index kv_rows_tbl_seq_idx on public.kv_rows (tbl, seq);

alter table public.kv_rows enable row level security;
revoke all on public.kv_rows from anon, authenticated;
