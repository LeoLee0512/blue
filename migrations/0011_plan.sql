alter table profiles add column if not exists plan text not null default 'free';
alter table profiles add column if not exists plan_until timestamptz;
