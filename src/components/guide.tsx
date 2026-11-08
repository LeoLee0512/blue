import { useEffect, useState } from "react";

const KEY = "langao-guide-v3";

export function LibraryHint() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(KEY) !== "done") setOpen(true);
    } catch {
      setOpen(true);
    }
    const onAsk = () => setOpen(true);
    window.addEventListener("langao-guide", onAsk);
    return () => window.removeEventListener("langao-guide", onAsk);
  }, []);

  if (!open) return null;

  return (
    <p className="mb-8 text-sm leading-relaxed text-faint">
      大纲点开就能改。对话里可以只聊聊，或让它落到稿上。
      <button
        type="button"
        className="ml-3 text-mist"
        onClick={() => {
          try {
            window.localStorage.setItem(KEY, "done");
          } catch {
            /* ignore */
          }
          setOpen(false);
        }}
      >
        知道了
      </button>
    </p>
  );
}
