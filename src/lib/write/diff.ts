/**
 * 版本对比：段落级 Myers diff，改动的段落再做字符级 diff。
 */
export type DiffOp = { type: "equal" | "insert" | "delete"; text: string };

export type DiffRow =
  | { type: "equal"; text: string }
  | { type: "insert"; text: string }
  | { type: "delete"; text: string }
  | { type: "change"; before: string; after: string; parts: DiffOp[] };

type Edit = { type: "equal" | "insert" | "delete"; token: string };

/**
 * Myers O(ND) diff over token arrays. `maxD` bounds the work; past it the
 * result degrades to "delete all, insert all" (still correct, just coarse).
 */
export function diffTokens(a: string[], b: string[], maxD = 2000): Edit[] {
  const n = a.length;
  const m = b.length;
  // Trim common prefix / suffix first: most edits are local.
  let start = 0;
  while (start < n && start < m && a[start] === b[start]) start += 1;
  let endA = n;
  let endB = m;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA -= 1;
    endB -= 1;
  }
  const head: Edit[] = a.slice(0, start).map((token) => ({ type: "equal", token }));
  const tail: Edit[] = a.slice(endA).map((token) => ({ type: "equal", token }));
  const A = a.slice(start, endA);
  const B = b.slice(start, endB);
  const N = A.length;
  const M = B.length;
  if (N === 0) return [...head, ...B.map((token) => ({ type: "insert" as const, token })), ...tail];
  if (M === 0) return [...head, ...A.map((token) => ({ type: "delete" as const, token })), ...tail];
  const max = Math.min(N + M, maxD);
  const offset = max;
  const v = new Int32Array(2 * max + 2).fill(-1);
  v[offset + 1] = 0;
  const trace: Int32Array[] = [];
  let found = false;
  for (let d = 0; d <= max; d += 1) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      let x: number;
      if (k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1])) x = v[offset + k + 1];
      else x = v[offset + k - 1] + 1;
      let y = x - k;
      while (x < N && y < M && A[x] === B[y]) {
        x += 1;
        y += 1;
      }
      v[offset + k] = x;
      if (x >= N && y >= M) {
        found = true;
        break;
      }
    }
    if (found) break;
  }
  if (!found) {
    return [...head, ...A.map((token) => ({ type: "delete" as const, token })), ...B.map((token) => ({ type: "insert" as const, token })), ...tail];
  }
  // Backtrack.
  const middle: Edit[] = [];
  let x = N;
  let y = M;
  for (let d = trace.length - 1; d >= 0 && (x > 0 || y > 0); d -= 1) {
    const vd = trace[d];
    const k = x - y;
    let prevK: number;
    if (k === -d || (k !== d && vd[offset + k - 1] < vd[offset + k + 1])) prevK = k + 1;
    else prevK = k - 1;
    const prevX = d === 0 ? 0 : vd[offset + prevK];
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      middle.push({ type: "equal", token: A[x - 1] });
      x -= 1;
      y -= 1;
    }
    if (d === 0) break;
    if (x === prevX) {
      middle.push({ type: "insert", token: B[y - 1] });
      y -= 1;
    } else {
      middle.push({ type: "delete", token: A[x - 1] });
      x -= 1;
    }
  }
  while (x > 0 && y > 0) {
    middle.push({ type: "equal", token: A[x - 1] });
    x -= 1;
    y -= 1;
  }
  middle.reverse();
  return [...head, ...middle, ...tail];
}

/** 合并相邻同类 token。 */
function group(edits: Edit[], joiner: string): DiffOp[] {
  const ops: DiffOp[] = [];
  for (const edit of edits) {
    const last = ops[ops.length - 1];
    if (last && last.type === edit.type) last.text += joiner + edit.token;
    else ops.push({ type: edit.type, text: edit.token });
  }
  return ops;
}

/** 字符级 diff（按 Unicode 码点）。 */
export function diffChars(a: string, b: string): DiffOp[] {
  return group(diffTokens([...a], [...b], 1200), "");
}

/**
 * 段落级对比。相邻的「删掉一段 + 加上一段」合成 change 行，并附字符级差异。
 */
export function diffText(before: string, after: string): DiffRow[] {
  const a = String(before ?? "").replace(/\r\n?/g, "\n").split("\n");
  const b = String(after ?? "").replace(/\r\n?/g, "\n").split("\n");
  const edits = diffTokens(a, b);
  const rows: DiffRow[] = [];
  let i = 0;
  while (i < edits.length) {
    const edit = edits[i];
    if (edit.type === "equal") {
      rows.push({ type: "equal", text: edit.token });
      i += 1;
      continue;
    }
    const dels: string[] = [];
    const ins: string[] = [];
    while (i < edits.length && edits[i].type !== "equal") {
      if (edits[i].type === "delete") dels.push(edits[i].token);
      else ins.push(edits[i].token);
      i += 1;
    }
    const pairs = Math.min(dels.length, ins.length);
    for (let p = 0; p < pairs; p += 1) {
      const small = dels[p].length + ins[p].length <= 4000;
      rows.push({ type: "change", before: dels[p], after: ins[p], parts: small ? diffChars(dels[p], ins[p]) : [{ type: "delete", text: dels[p] }, { type: "insert", text: ins[p] }] });
    }
    for (const text of dels.slice(pairs)) rows.push({ type: "delete", text });
    for (const text of ins.slice(pairs)) rows.push({ type: "insert", text });
  }
  return rows;
}

/** 增删字符数（不含空白），用于版本列表里的「+12 / −3」。 */
export function diffStats(before: string, after: string): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  const size = (text: string) => text.replace(/\s/g, "").length;
  for (const row of diffText(before, after)) {
    if (row.type === "insert") added += size(row.text);
    else if (row.type === "delete") removed += size(row.text);
    else if (row.type === "change") {
      for (const part of row.parts) {
        if (part.type === "insert") added += size(part.text);
        else if (part.type === "delete") removed += size(part.text);
      }
    }
  }
  return { added, removed };
}
