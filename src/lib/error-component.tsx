import type { ErrorComponentProps } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";
import { PAGE_ERROR_TEXT } from "@/lib/novel/client-error";

function errorMessage(_error: unknown): string {
  return PAGE_ERROR_TEXT;
}

export function AppErrorComponent({ error }: ErrorComponentProps) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-paper px-6 text-center text-ink">
      <span className="text-accent" aria-hidden="true">
        <TriangleAlert className="size-8" strokeWidth={1.75} />
      </span>
      <h1 className="font-serif text-xl">页面没有打开</h1>
      <p className="max-w-md text-sm break-words text-mist">{errorMessage(error)}</p>
    </main>
  );
}
