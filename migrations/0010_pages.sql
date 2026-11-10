create table if not exists pieces (
  id text primary key,
  user_id text not null,
  kind text not null,
  title text not null,
  body text not null default '',
  updated_at timestamptz not null default now()
);
create index if not exists pieces_user_idx on pieces (user_id, kind, updated_at desc);

create table if not exists shares (
  id text primary key,
  user_id text not null,
  author_name text not null default '',
  kind text not null,
  title text not null,
  body text not null default '',
  source_id text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists shares_recent_idx on shares (created_at desc);
