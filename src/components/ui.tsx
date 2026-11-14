import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import * as Dialog from "@radix-ui/react-dialog";
import * as Menu from "@radix-ui/react-dropdown-menu";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "quiet" | "ghost" | "danger";

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" }
>(function Button({ variant = "primary", size = "md", className, type = "button", ...props }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50",
        size === "md" ? "h-9 px-3.5" : "h-7 px-2.5 text-[13px]",
        variant === "primary" && "bg-accent text-accent-fg shadow-sm hover:bg-accent-ink",
        variant === "secondary" && "border border-line bg-surface text-ink hover:bg-hover",
        variant === "quiet" && "px-2.5 text-mist hover:bg-hover hover:text-ink",
        variant === "ghost" && "px-2 font-normal text-mist hover:text-ink",
        variant === "danger" && "bg-danger text-white hover:opacity-90",
        className,
      )}
      {...props}
    />
  );
});

export const IconButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean; size?: "sm" | "md" }
>(function IconButton({ label, active, size = "md", className, type = "button", children, ...props }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-lg text-mist transition-colors duration-150 hover:bg-hover hover:text-ink disabled:opacity-40",
        size === "md" ? "size-9" : "size-7",
        active && "bg-accent-soft text-accent hover:bg-accent-soft hover:text-accent",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
});

export const fieldClass =
  "h-9 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink outline-none transition-[border-color,box-shadow] placeholder:text-faint focus:border-accent focus:ring-3 focus:ring-accent/15";

export const areaClass =
  "w-full resize-y rounded-lg border border-line bg-surface px-3 py-2 text-sm leading-relaxed text-ink outline-none transition-[border-color,box-shadow] placeholder:text-faint focus:border-accent focus:ring-3 focus:ring-accent/15";

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="flex items-baseline justify-between gap-2 text-[13px] font-medium text-mist">
        {label}
        {hint ? <span className="font-normal text-faint">{hint}</span> : null}
      </span>
      {children}
    </label>
  );
}

export function Switch({ on, label, onToggle }: { on: boolean; label: string; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onToggle}
      className={cn("flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors duration-150", on ? "bg-accent" : "bg-line")}
    >
      <span className={cn("size-4 rounded-full bg-white shadow-sm transition-transform duration-150", on && "translate-x-4")} />
    </button>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  className,
}: {
  value: T;
  options: { id: T; label: ReactNode }[];
  onChange: (value: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("inline-flex rounded-lg bg-sunk p-0.5", className)}>
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          role="radio"
          aria-checked={value === opt.id}
          onClick={() => onChange(opt.id)}
          className={cn(
            "h-7 rounded-md px-2.5 text-[13px] whitespace-nowrap transition-colors",
            value === opt.id ? "bg-surface font-medium text-ink shadow-sm" : "text-mist hover:text-ink",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function Badge({ children, tone = "plain", className }: { children: ReactNode; tone?: "plain" | "accent" | "ok" | "warn"; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-md px-1.5 text-[11px] font-medium whitespace-nowrap",
        tone === "plain" && "bg-sunk text-mist",
        tone === "accent" && "bg-accent-soft text-accent",
        tone === "ok" && "bg-ok-soft text-ok",
        tone === "warn" && "bg-sunk text-warn",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-line bg-sunk px-1 font-sans text-[11px] text-mist">{children}</kbd>;
}

export function Empty({ title, body, children, icon }: { title: string; body: string; children?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="mx-auto max-w-md px-6 py-16 text-center">
      {icon ? <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-accent-soft text-accent">{icon}</div> : null}
      <h2 className="font-serif text-xl text-ink">{title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-mist">{body}</p>
      {children ? <div className="mt-6 flex flex-wrap justify-center gap-2">{children}</div> : null}
    </div>
  );
}

export function PageHeader({ title, body, children }: { title: string; body?: string; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-serif text-2xl font-semibold tracking-wide text-ink">{title}</h1>
        {body ? <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-mist">{body}</p> : null}
      </div>
      {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
    </div>
  );
}

/* ---------------- 对话框 ---------------- */

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]" />
        <Dialog.Content
          className={cn(
            "pop fixed top-1/2 left-1/2 z-50 flex max-h-[86dvh] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl border border-line bg-surface shadow-[var(--shadow-pop)] outline-none",
            wide ? "max-w-3xl" : "max-w-lg",
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div>
              <Dialog.Title className="font-serif text-lg font-semibold text-ink">{title}</Dialog.Title>
              {description ? <Dialog.Description className="mt-1 text-sm text-mist">{description}</Dialog.Description> : <Dialog.Description className="sr-only">{title}</Dialog.Description>}
            </div>
            <Dialog.Close asChild>
              <IconButton label="关闭" size="sm">
                <X className="size-4" />
              </IconButton>
            </Dialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer ? <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3">{footer}</div> : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export type ConfirmRequest = {
  title: string;
  body: ReactNode;
  confirm: string;
  danger?: boolean;
  onConfirm: () => void | Promise<void>;
};

export function Confirm({ request, onClose }: { request: ConfirmRequest | null; onClose: () => void }) {
  return (
    <AlertDialog.Root open={Boolean(request)} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]" />
        <AlertDialog.Content className="pop fixed top-1/2 left-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-line bg-surface p-5 shadow-[var(--shadow-pop)] outline-none">
          <AlertDialog.Title className="font-serif text-lg font-semibold text-ink">{request?.title}</AlertDialog.Title>
          <AlertDialog.Description asChild>
            <div className="mt-2 text-sm leading-relaxed text-mist">{request?.body}</div>
          </AlertDialog.Description>
          <div className="mt-5 flex justify-end gap-2">
            <AlertDialog.Cancel asChild>
              <Button variant="secondary">取消</Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Button
                variant={request?.danger ? "danger" : "primary"}
                onClick={() => {
                  const run = request?.onConfirm;
                  onClose();
                  void run?.();
                }}
              >
                {request?.confirm}
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

/* ---------------- 菜单 ---------------- */

export function MenuRoot({ trigger, children, align = "start" }: { trigger: ReactNode; children: ReactNode; align?: "start" | "end" }) {
  return (
    <Menu.Root modal={false}>
      <Menu.Trigger asChild>{trigger}</Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          align={align}
          sideOffset={4}
          className="pop z-50 min-w-40 rounded-xl border border-line bg-surface p-1 shadow-[var(--shadow-pop)]"
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
          {children}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}

export function MenuItem({ children, onSelect, danger, icon }: { children: ReactNode; onSelect: () => void; danger?: boolean; icon?: ReactNode }) {
  return (
    <Menu.Item
      onSelect={onSelect}
      className={cn(
        "flex h-8 cursor-pointer items-center gap-2 rounded-lg px-2.5 text-[13px] outline-none select-none data-[highlighted]:bg-hover",
        danger ? "text-danger" : "text-ink",
      )}
    >
      {icon ? <span className="flex size-4 items-center justify-center text-mist">{icon}</span> : null}
      {children}
    </Menu.Item>
  );
}

export function MenuSeparator() {
  return <Menu.Separator className="my-1 h-px bg-line" />;
}
