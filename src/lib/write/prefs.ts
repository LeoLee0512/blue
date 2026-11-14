/**
 * 外观偏好：明暗、配色、正文字体、字号、行距、版心宽度。纯函数 + 常量，
 * 存在 localStorage（只在这台电脑上），不进数据库，也不进备份。
 */
export type Mode = "light" | "dark" | "system";
export type Palette = "qinghua" | "xuanzhi" | "zhuqing" | "muzi" | "yanzhi";
export type EditorFont = "song" | "hei" | "kai" | "fangsong";

export type Prefs = {
  mode: Mode;
  palette: Palette;
  font: EditorFont;
  /** 正文字号 px */
  size: number;
  /** 行距（倍数） */
  leading: number;
  /** 版心宽度（em） */
  width: number;
  /** 段首缩进两字 */
  indent: boolean;
  /** 打字机模式：光标所在行保持在屏幕中部 */
  typewriter: boolean;
};

export const PREFS_KEY = "langao-prefs-v2";

export const DEFAULT_PREFS: Prefs = {
  mode: "system",
  palette: "qinghua",
  font: "song",
  size: 18,
  leading: 1.9,
  width: 36,
  indent: true,
  typewriter: false,
};

export const PALETTES: { id: Palette; label: string; swatch: [string, string] }[] = [
  { id: "qinghua", label: "青花", swatch: ["#f5f7fa", "#2f5d8a"] },
  { id: "xuanzhi", label: "宣纸", swatch: ["#f6f1e7", "#8a5a2b"] },
  { id: "zhuqing", label: "竹青", swatch: ["#f2f6f1", "#3f7a5a"] },
  { id: "muzi", label: "暮紫", swatch: ["#f6f4f9", "#6a4f9c"] },
  { id: "yanzhi", label: "胭脂", swatch: ["#faf4f3", "#a34040"] },
];

export const MODES: { id: Mode; label: string }[] = [
  { id: "light", label: "浅色" },
  { id: "dark", label: "深色" },
  { id: "system", label: "跟随系统" },
];

export const EDITOR_FONTS: { id: EditorFont; label: string; stack: string }[] = [
  { id: "song", label: "宋体", stack: '"Noto Serif SC", "Songti SC", "SimSun", "STSong", serif' },
  { id: "hei", label: "黑体", stack: '"PingFang SC", "Microsoft YaHei", "Noto Sans SC", "Source Han Sans SC", sans-serif' },
  { id: "kai", label: "楷体", stack: '"Kaiti SC", "STKaiti", "KaiTi", "楷体", "Noto Serif SC", serif' },
  { id: "fangsong", label: "仿宋", stack: '"STFangsong", "FangSong", "仿宋", "Noto Serif SC", serif' },
];

export const SIZE_RANGE = { min: 14, max: 26, step: 1 } as const;
export const LEADING_RANGE = { min: 1.4, max: 2.6, step: 0.1 } as const;
export const WIDTH_RANGE = { min: 26, max: 56, step: 2 } as const;

const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;

const clamp = (value: unknown, range: { min: number; max: number; step: number }, fallback: number) => {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  const stepped = Math.round(n / range.step) * range.step;
  return Math.round(Math.min(range.max, Math.max(range.min, stepped)) * 100) / 100;
};

/** 读出的任何值都收成合法偏好（坏数据回落到默认）。 */
export function parsePrefs(raw: unknown): Prefs {
  let o: Record<string, unknown> = {};
  if (typeof raw === "string") {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) o = parsed as Record<string, unknown>;
    } catch {
      o = {};
    }
  } else if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    o = raw as Record<string, unknown>;
  }
  return {
    mode: pick(o.mode, ["light", "dark", "system"], DEFAULT_PREFS.mode),
    palette: pick(o.palette, PALETTES.map((p) => p.id), DEFAULT_PREFS.palette),
    font: pick(o.font, EDITOR_FONTS.map((f) => f.id), DEFAULT_PREFS.font),
    size: clamp(o.size, SIZE_RANGE, DEFAULT_PREFS.size),
    leading: clamp(o.leading, LEADING_RANGE, DEFAULT_PREFS.leading),
    width: clamp(o.width, WIDTH_RANGE, DEFAULT_PREFS.width),
    indent: typeof o.indent === "boolean" ? o.indent : DEFAULT_PREFS.indent,
    typewriter: typeof o.typewriter === "boolean" ? o.typewriter : DEFAULT_PREFS.typewriter,
  };
}

export function resolveDark(mode: Mode, systemDark: boolean): boolean {
  return mode === "dark" || (mode === "system" && systemDark);
}

/** 应用到 <html> 上的属性和 CSS 变量。 */
export function prefsToRoot(prefs: Prefs, systemDark: boolean): { dark: boolean; palette: Palette; vars: Record<string, string> } {
  const font = EDITOR_FONTS.find((f) => f.id === prefs.font) ?? EDITOR_FONTS[0];
  return {
    dark: resolveDark(prefs.mode, systemDark),
    palette: prefs.palette,
    vars: {
      "--editor-font": font.stack,
      "--editor-size": `${prefs.size}px`,
      "--editor-leading": String(prefs.leading),
      "--editor-width": `${prefs.width}em`,
      "--editor-indent": prefs.indent ? "2em" : "0",
    },
  };
}

/**
 * 首屏前执行的内联脚本：在 React 加载之前就把主题放到 <html> 上，避免闪白。
 * 与 parsePrefs/prefsToRoot 保持同一套规则（只做最必要的部分）。
 */
export function noFlashScript(): string {
  const fonts = Object.fromEntries(EDITOR_FONTS.map((f) => [f.id, f.stack]));
  const palettes = PALETTES.map((p) => p.id);
  return `(function(){try{var p=JSON.parse(localStorage.getItem(${JSON.stringify(PREFS_KEY)})||"{}")||{};var d=document.documentElement;var m=p.mode==="light"||p.mode==="dark"?p.mode:"system";var dark=m==="dark"||(m==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);d.classList.toggle("dark",dark);d.style.colorScheme=dark?"dark":"light";var pl=${JSON.stringify(palettes)};d.dataset.palette=pl.indexOf(p.palette)>=0?p.palette:"qinghua";var f=${JSON.stringify(fonts)};if(f[p.font])d.style.setProperty("--editor-font",f[p.font]);if(typeof p.size==="number"&&p.size>=14&&p.size<=26)d.style.setProperty("--editor-size",p.size+"px");if(typeof p.leading==="number"&&p.leading>=1.4&&p.leading<=2.6)d.style.setProperty("--editor-leading",String(p.leading));if(typeof p.width==="number"&&p.width>=26&&p.width<=56)d.style.setProperty("--editor-width",p.width+"em");if(p.indent===false)d.style.setProperty("--editor-indent","0")}catch(e){}})();`;
}
