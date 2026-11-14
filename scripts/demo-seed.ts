// 给截图 / 手动试用准备一份示例数据。只写入 LANGAO_DATA_DIR 指向的目录（先跑一次 db:migrate）。
// 运行：LANGAO_DATA_DIR=$PWD/.data/demo npm run db:migrate && LANGAO_DATA_DIR=$PWD/.data/demo node --experimental-strip-types --import ./scripts/ts-alias-hooks.mjs scripts/demo-seed.ts
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

const dir = process.env.LANGAO_DATA_DIR;
if (!dir || !dir.includes(".data")) throw new Error("请把 LANGAO_DATA_DIR 指到仓库里的 .data/ 下面");

type Sql = {
  <T = Record<string, unknown>>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]>;
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
};

const pg = new PGlite({ dataDir: path.join(dir, "pglite"), parsers: { 20: Number } });
const run = (text: string, params: unknown[]) => pg.query(text, params);
const sql = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
  let text = strings[0];
  for (let i = 0; i < values.length; i += 1) text += `$${i + 1}${strings[i + 1]}`;
  return (await run(text, values)).rows;
}) as unknown as Sql;
sql.query = (async (text: string, params: unknown[] = []) => (await run(text, params)).rows) as Sql["query"];

const store = await import("../src/lib/novel/store.server.ts");
const wb = await import("../src/lib/novel/workbench.server.ts");
const U = "local";
await pg.query(`insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt") values ('local','本地用户','local@desktop',true,now(),now()) on conflict (id) do nothing`);
await store.ensureAccount(sql as never, U);

const p = (...lines: string[]) => lines.map((l) => `\u3000\u3000${l}`).join("\n");

const novel = await store.createNovel(sql as never, U, { title: "雾镇灯塔", genre: "悬疑", logline: "一个回乡的记者，追查父亲失踪那晚亮起的灯塔。" });
await wb.updateNovelMeta(sql as never, U, novel.id, { author: "青岚", dailyGoal: 3000 });
const v1 = await wb.createVolume(sql as never, U, novel.id, "第一卷　归乡");
const v2 = await wb.createVolume(sql as never, U, novel.id, "第二卷　灯塔");
const chapters: [string, string, string][] = [
  [
    v1.id,
    "第一章　雨里的站台",
    p(
      "林照回到雾镇的那天，雨下得很细，像是有人在天上筛着一层薄薄的面粉。站台上只有一盏灯，灯罩里积着去年的飞蛾，昏黄的光落在湿漉漉的水泥地上，被来往的鞋印踩得支离破碎。",
      "她拖着箱子走出车厢，冷风立刻灌进领口。十二年了，镇子好像什么都没变：站牌上的油漆依旧剥落，候车室的长椅依旧缺了一条腿，连空气里那股咸腥的海味都和记忆里一模一样。",
      "“你还是回来了。”",
      "周叔撑着一把黑伞站在出站口，把伞往她那边偏了偏，自己的半边肩膀很快湿透。他老了许多，鬓角全白，可那双眼睛还和从前一样，看人的时候总像在掂量什么。",
      "“我爸的事，镇上有人知道些什么吗？”林照问。",
      "周叔没有回答，只是抬起下巴朝远处点了点。顺着他的目光望去，海岬尽头那座据说已经废弃了二十年的灯塔，此刻正一明一灭地亮着。",
    ),
  ],
  [
    v1.id,
    "第二章　旧宅",
    p(
      "老宅在镇子西头，门前的石榴树已经枯死了一半。林照推开门，一股陈年的灰尘味扑面而来。",
      "父亲的书房保持着离开时的样子：桌上摊着一张潮汐表，铅笔在某个日期上画了三个圈；墙上钉着一张泛黄的海图，灯塔的位置被红笔反复描过，几乎要把纸戳破。",
      "她在抽屉最里层摸到一本硬皮笔记。翻开第一页，只有一行字——",
      "“灯亮的那晚，不要出海。”",
    ),
  ],
  [v1.id, "第三章　码头的人", p("清晨的码头比林照想象的热闹。渔船一艘接一艘靠岸，鱼贩们的吆喝声此起彼伏。", "她拿着父亲的照片挨个打听，大多数人只是摇头。直到一个补网的老太太停下手里的梭子，盯着照片看了很久。")],
  [v2.id, "第四章　守塔人", p("灯塔的门锁锈死了，可门缝里却有新鲜的脚印。")],
  [v2.id, "第五章　潮汐表", ""],
];
const ids: string[] = [];
for (const [vol, title, body] of chapters) {
  const ch = await wb.createChapterIn(sql as never, U, novel.id, vol, title);
  if (body) await store.saveChapter(sql as never, U, { novelId: novel.id, id: ch.id, title, body });
  ids.push(ch.id);
}
await wb.createVersion(sql as never, U, novel.id, ids[0], "manual", "初稿完成");
await store.saveChapter(sql as never, U, {
  novelId: novel.id,
  id: ids[0],
  title: chapters[0][1],
  body: chapters[0][2].replace("像是有人在天上筛着一层薄薄的面粉", "细得像一层被风吹散的盐").replace("十二年了", "整整十二年了"),
});
await sql`update chapters set status = 'done' where id = ${ids[0]}`;
for (const c of [
  { name: "林照", role: "主角 · 记者", aliases: "阿照、林记者", appearance: "短发，左眉有一道浅疤，总穿一件洗旧的军绿色风衣。", personality: "冷静、固执，习惯把情绪藏在提问后面。", bio: "十二年前离开雾镇去省城读书，后来成了调查记者。父亲失踪的消息传来时，她正在跟一桩工厂污染案。", tags: "记者、雾镇人" },
  { name: "周叔", role: "邻居 · 老渔民", aliases: "老周", appearance: "鬓角全白，手背上布满旧伤。", personality: "话少，护短。", bio: "林照父亲的老朋友，知道灯塔的一些往事，却始终不肯开口。", tags: "渔民" },
  { name: "沈渡", role: "镇派出所民警", aliases: "", appearance: "高瘦，戴一副黑框眼镜。", personality: "温和，但对外来者保持警惕。", bio: "负责林父失踪案，案卷上写着“意外落水”。", tags: "警察" },
]) {
  await wb.saveCard(sql as never, U, { novelId: novel.id, ...c });
}
for (const l of [
  { kind: "place", name: "雾镇", summary: "东海边的小渔镇，常年有雾。", body: "镇上不到三千人，以捕捞和晒鱼干为生。每逢大潮，海雾会一连几天不散。", tags: "地点" },
  { kind: "place", name: "灯塔", summary: "海岬尽头的白色灯塔，二十年前废弃。", body: "民国时期由外国商会修建，1998 年台风后停用。镇上传说灯亮的夜晚会有船失踪。", tags: "核心场景" },
  { kind: "item", name: "潮汐表", summary: "父亲留下的潮汐表，某个日期被画了三个圈。", body: "", tags: "线索" },
  { kind: "event", name: "九八年台风", summary: "灯塔停用的起因，也是镇上很多人不愿提起的一夜。", body: "", tags: "往事" },
]) {
  await wb.saveLore(sql as never, U, { novelId: novel.id, ...l });
}
// 过去几天的字数（日历和今日目标用）
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
for (const [offset, words] of [[1, 2650], [2, 3120], [3, 1800], [5, 2400]] as const) {
  const d = new Date(`${today}T12:00:00+08:00`);
  d.setUTCDate(d.getUTCDate() - offset);
  const day = d.toISOString().slice(0, 10);
  await sql`insert into novel_days (user_id, novel_id, day, words) values (${U}, ${novel.id}, ${day}, ${words}) on conflict do nothing`;
}

const second = await store.createNovel(sql as never, U, { title: "长安夜雨", genre: "历史", logline: "天宝年间，一个不良人在上元夜追查一桩连环失踪案。" });
const sv = await wb.createVolume(sql as never, U, second.id, "上元");
const sc = await wb.createChapterIn(sql as never, U, second.id, sv.id, "第一章　灯市");
await store.saveChapter(sql as never, U, { novelId: second.id, id: sc.id, title: "第一章　灯市", body: p("上元夜，长安城不设宵禁。朱雀大街上灯火如昼，人潮从坊门里涌出来，像决了堤的水。") });
const third = await store.createNovel(sql as never, U, { title: "她的第十三封信", genre: "都市", logline: "一封迟到了十年的信，把两个早已陌路的人重新拉回同一座城市。" });
await wb.createChapterIn(sql as never, U, third.id, null, "楔子");

await pg.close();
console.log("示例数据已写入", dir);
