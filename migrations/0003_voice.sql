create table if not exists voice_docs (
  user_id text primary key,
  portrait_md text not null default '',
  touch_md text not null default '',
  preference_md text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists source_texts (
  id text primary key,
  user_id text not null,
  kind text not null,
  title text not null,
  created_at timestamptz not null default now()
);
create index if not exists source_texts_user_idx on source_texts (user_id, created_at desc);
