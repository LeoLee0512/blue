alter table profiles add column if not exists wild integer not null default 0;
alter table profiles add column if not exists web_on integer not null default 0;
alter table profiles add column if not exists thinking text not null default 'mid';
alter table profiles add column if not exists context_used integer not null default 0;

create table if not exists usage_days (
  user_id text not null,
  day text not null,
  tokens integer not null default 0,
  user_chars integer not null default 0,
  ai_chars integer not null default 0,
  primary key (user_id, day)
);
