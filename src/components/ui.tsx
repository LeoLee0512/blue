import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Button({
  variant = "primary",
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "quiet" | "ghost" }) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 px-3 text-sm transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" && "bg-ink text-paper hover:opacity-90",
        variant === "quiet" && "bg-transparent px-2 text-mist hover:text-ink",
        variant === "ghost" && "text-mist hover:text-ink",
        className,
      )}
      {...props}
    />
  );
}

export const fieldClass =
  "h-11 w-full border-0 border-b border-line bg-transparent px-0 text-sm text-ink outline-none placeholder:text-faint focus:border-ink";

export const areaClass =
  "w-full resize-none border-0 border-b border-line bg-transparent px-0 py-3 text-sm leading-relaxed text-ink outline-none placeholder:text-faint focus:border-ink";

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-mist">{label}</span>
      {children}
    </label>
  );
}

export function Switch({
  on,
  label,
  onToggle,
}: {
  on: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onToggle}
      className={cn(
        "flex h-6 w-11 shrink-0 items-center rounded-full px-0.5 transition-colors duration-150",
        on ? "justify-end bg-ink" : "justify-start bg-line",
      )}
    >
      <span className="size-5 rounded-full bg-surface" />
    </button>
  );
}

export function Empty({ title, body, children }: { title: string; body: string; children?: ReactNode }) {
  return (
    <div className="mx-auto max-w-md px-6 py-16 text-center">
      <h2 className="font-serif text-2xl text-ink">{title}</h2>
      <p className="mt-3 text-sm leading-relaxed text-mist">{body}</p>
      {children ? <div className="mt-6 flex flex-wrap justify-center gap-2">{children}</div> : null}
    </div>
  );
}
