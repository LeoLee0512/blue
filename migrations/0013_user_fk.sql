-- 0013（2026-11-03 Sam，队长批准）：13 张业务表的 user_id 补外键 → "user"(id) on delete cascade。
-- NOT VALID：只约束以后新写入的行，不检查、不改动任何已有数据（孤儿行只用 scripts/count_orphans.mjs 统计）。
-- 幂等：约束已存在就跳过。
do $$
declare t text;
begin
  perform set_config('lock_timeout', '5s', true); -- 只在本事务内生效
  foreach t in array array['novels','chapters','characters','outline_nodes','messages','profiles','voice_docs','source_texts','usage_days','pieces','shares','wallets','ledger'] loop
    if to_regclass(t) is null then
      raise notice '0013: 表 % 不存在，跳过', t;
    elsif not exists (
      select 1 from pg_constraint where conname = t || '_user_fk' and conrelid = to_regclass(t)
    ) then
      execute format('alter table %I add constraint %I foreign key (user_id) references "user"(id) on delete cascade not valid', t, t || '_user_fk');
    end if;
  end loop;
end $$;
