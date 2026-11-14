import type { Desk } from "@/components/desk";

type Fail = { ok: false; error: string; code?: string };

/**
 * 调用服务端函数：失败时提示错误并重新读取作品（撤销乐观更新），返回 null。
 */
export async function call<T extends { ok: true }>(desk: Pick<Desk, "fail" | "refreshDetail">, promise: Promise<T | Fail>, opts: { refresh?: boolean } = {}): Promise<T | null> {
  try {
    const res = await promise;
    if (!res.ok) {
      desk.fail(res.error);
      if (opts.refresh !== false) await desk.refreshDetail();
      return null;
    }
    return res;
  } catch {
    desk.fail("没有完成");
    if (opts.refresh !== false) await desk.refreshDetail();
    return null;
  }
}
