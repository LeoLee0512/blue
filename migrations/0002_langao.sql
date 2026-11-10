create table if not exists wallets (
  user_id text primary key,
  balance integer not null default 0,
  hosted_calls integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists ledger (
  id serial primary key,
  user_id text not null,
  delta integer not null,
  reason text not null,
  created_at timestamptz not null default now()
);
create index if not exists ledger_user_idx on ledger (user_id, id desc);

create table if not exists profiles (
  user_id text primary key,
  provider text not null default 'hosted',
  base_url text not null default '',
  model text not null default '',
  api_key text not null default '',
  skills text not null default '',
  plugins text not null default ''
);

create table if not exists novels (
  id text primary key,
  user_id text not null,
  title text not null,
  genre text not null default '',
  logline text not null default '',
  premise text not null default '',
  style_notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists novels_user_idx on novels (user_id);

create table if not exists outline_nodes (
  id text primary key,
  novel_id text not null,
  user_id text not null,
  parent_id text,
  kind text not null,
  title text not null,
  summary text not null default '',
  sort_order integer not null default 0,
  status text not null default 'draft'
);
create index if not exists outline_novel_idx on outline_nodes (novel_id, sort_order);

create table if not exists chapters (
  id text primary key,
  novel_id text not null,
  user_id text not null,
  node_id text,
  title text not null,
  body text not null default '',
  sort_order integer not null default 0,
  updated_at timestamptz not null default now()
);
create index if not exists chapters_novel_idx on chapters (novel_id, sort_order);

create table if not exists characters (
  id text primary key,
  novel_id text not null,
  user_id text not null,
  name text not null,
  role text not null default '',
  bio text not null default '',
  sort_order integer not null default 0
);
create index if not exists characters_novel_idx on characters (novel_id, sort_order);

create table if not exists messages (
  id text primary key,
  novel_id text not null,
  user_id text not null,
  role text not null,
  content text not null,
  tool_name text,
  created_at timestamptz not null default now()
);
create index if not exists messages_novel_idx on messages (novel_id, created_at);
