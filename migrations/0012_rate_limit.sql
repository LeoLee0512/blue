-- 2026-10-30 Sam：Better Auth 登录限流改为数据库存储（多实例部署下共享计数）。
-- 列名为 camelCase，必须加双引号，与 Better Auth 的查询保持一致。
create table if not exists "rateLimit" (
  "id" text not null primary key,
  "key" text not null unique,
  "count" integer not null,
  "lastRequest" bigint not null
);
