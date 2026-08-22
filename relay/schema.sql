create table if not exists reports (
  id bigserial primary key,
  received_at timestamptz not null default now(),
  kind text not null, label text not null,
  host text not null, reg_domain text not null,
  level text, score real, ext_version text,
  payload jsonb not null
);
create index if not exists reports_received_idx on reports (received_at);
create index if not exists reports_reg_domain_idx on reports (reg_domain);
