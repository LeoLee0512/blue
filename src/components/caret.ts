/**
 * textarea 里某个字符位置在页面上的坐标（镜像 div 法）。用于浮动工具条、@ 提示和打字机滚动。
 */
const COPY = [
  "boxSizing",
  "width",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "fontStyle",
  "fontVariant",
  "fontWeight",
  "fontStretch",
  "fontSize",
  "lineHeight",
  "fontFamily",
  "textAlign",
  "textTransform",
  "textIndent",
  "letterSpacing",
  "wordSpacing",
  "tabSize",
  "lineBreak",
  "wordBreak",
  "overflowWrap",
] as const;

export function caretRect(area: HTMLTextAreaElement, index: number): { top: number; left: number; height: number } {
  const style = window.getComputedStyle(area);
  const mirror = document.createElement("div");
  for (const key of COPY) mirror.style[key] = style[key];
  mirror.style.position = "absolute";
  mirror.style.visibility = "hidden";
  mirror.style.whiteSpace = "pre-wrap";
  mirror.style.top = "0";
  mirror.style.left = "-9999px";
  mirror.style.height = "auto";
  mirror.style.overflow = "hidden";
  mirror.textContent = area.value.slice(0, index);
  const mark = document.createElement("span");
  mark.textContent = area.value.slice(index, index + 1) || "\u200b";
  mirror.appendChild(mark);
  document.body.appendChild(mirror);
  const box = area.getBoundingClientRect();
  const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.8;
  const top = box.top + mark.offsetTop - area.scrollTop;
  const left = box.left + mark.offsetLeft - area.scrollLeft;
  document.body.removeChild(mirror);
  return { top, left, height: lineHeight };
}
