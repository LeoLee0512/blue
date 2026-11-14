import type { NovelDetail } from "@/lib/novel/types";
import type { ExportBook } from "@/lib/write/exporters";
import { buildTree } from "@/lib/write/tree";
import type { ExportScope } from "@/components/desk";

export function downloadBlob(name: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** 按范围把作品整理成导出用的书。正在编辑的章节用编辑器里的最新文字。 */
export function bookFor(detail: NovelDetail, scope: ExportScope, liveBody?: { id: string; body: string }): ExportBook {
  const tree = buildTree(detail.volumes, detail.chapters);
  const body = (c: { id: string; body: string }) => (liveBody && liveBody.id === c.id ? liveBody.body : c.body);
  const pick = (c: { id: string; title: string; body: string }) => ({ id: c.id, title: c.title, body: body(c) });
  let parts: ExportBook["parts"];
  let title = detail.novel.title;
  if (scope.kind === "chapter") {
    const c = detail.chapters.find((x) => x.id === scope.id);
    parts = c ? [{ id: "p", title: null, chapters: [pick(c)] }] : [];
    if (c) title = `${detail.novel.title} · ${c.title}`;
  } else if (scope.kind === "volume") {
    const v = scope.id ? tree.volumes.find((x) => x.volume.id === scope.id) : null;
    const chapters = v ? v.chapters : tree.loose;
    parts = [{ id: v?.volume.id ?? "loose", title: v ? v.volume.title : null, chapters: chapters.map(pick) }];
    title = `${detail.novel.title} · ${v ? v.volume.title : "未分卷"}`;
  } else {
    parts = [
      ...(tree.loose.length ? [{ id: "loose", title: tree.volumes.length ? "未分卷" : null, chapters: tree.loose.map(pick) }] : []),
      ...tree.volumes.filter((v) => v.chapters.length).map((v) => ({ id: v.volume.id, title: v.volume.title, chapters: v.chapters.map(pick) })),
    ];
  }
  return {
    id: detail.novel.id,
    title,
    author: detail.novel.author || undefined,
    genre: detail.novel.genre || undefined,
    logline: scope.kind === "work" ? detail.novel.logline || undefined : undefined,
    parts,
    date: new Date(),
  };
}

