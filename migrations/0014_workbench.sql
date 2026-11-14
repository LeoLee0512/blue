-- 0014（2026-11-14 蓝稿 v2）：卷章树、章节版本、人物卡扩展、设定库、按作品的每日字数。
-- 只新增表和列，不改动、不删除任何已有数据。可重复执行。

create table if not exists volumes (
  id text primary key,
  novel_id text not null,
  user_id text not null,
  title text not null,
  summary text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists volumes_novel_idx on volumes (novel_id, sort_order);

alter table chapters add column if not exists volume_id text;
alter table chapters add column if not exists status text not null default 'draft';
alter table chapters add column if not exists note text not null default '';
alter table chapters add column if not exists words integer not null default 0;
create index if not exists chapters_volume_idx on chapters (novel_id, volume_id, sort_order);

create table if not exists chapter_versions (
  id text primary key,
  chapter_id text not null,
  novel_id text not null,
  user_id text not null,
  kind text not null default 'auto',
  label text not null default '',
  title text not null default '',
  body text not null default '',
  words integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists chapter_versions_chapter_idx on chapter_versions (chapter_id, created_at desc);

alter table characters add column if not exists aliases text not null default '';
alter table characters add column if not exists appearance text not null default '';
alter table characters add column if not exists personality text not null default '';
alter table characters add column if not exists tags text not null default '';
alter table characters add column if not exists updated_at timestamptz not null default now();

create table if not exists lore_entries (
  id text primary key,
  novel_id text not null,
  user_id text not null,
  kind text not null default 'other',
  name text not null,
  summary text not null default '',
  body text not null default '',
  tags text not null default '',
  sort_order integer not null default 0,
  updated_at timestamptz not null default now()
);
create index if not exists lore_entries_novel_idx on lore_entries (novel_id, kind, sort_order);

create table if not exists novel_days (
  user_id text not null,
  novel_id text not null,
  day text not null,
  words integer not null default 0,
  primary key (user_id, novel_id, day)
);

alter table novels add column if not exists author text not null default '';
alter table novels add column if not exists daily_goal integer not null default 0;

-- 与 0013 一致：新表的 user_id 外键，NOT VALID，只约束新写入的行。
do $$
declare t text;
begin
  perform set_config('lock_timeout', '5s', true);
  foreach t in array array['volumes','chapter_versions','lore_entries','novel_days'] loop
    if to_regclass(t) is not null and to_regclass('"user"') is not null and not exists (
      select 1 from pg_constraint where conname = t || '_user_fk' and conrelid = to_regclass(t)
    ) then
      execute format('alter table %I add constraint %I foreign key (user_id) references "user"(id) on delete cascade not valid', t, t || '_user_fk');
    end if;
  end loop;
end $$;
