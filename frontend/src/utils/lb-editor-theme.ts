// LeapBuilder M9 / KI-002 — read --lb-* CSS variables off the document root
// and return Monaco-editor and xterm-compatible theme configs.
//
// Neither Monaco nor xterm.js reads CSS custom properties directly — they
// need explicit theme objects with hex colors. This helper bridges the gap
// so when the LB theme switches (data-theme attribute on <html>), callers
// can re-read the current values and re-apply.

const FALLBACKS = {
  bg: "#25272D",
  bgElevated: "#1f1f1f",
  fg: "#e6edf3",
  fgMuted: "#a3a3a3",
  border: "#3a3a3a",
  accent: "#FC6B0E",
  accentFg: "#0D0F11",
};

function readVar(name: string): string {
  if (typeof document === "undefined") return "";
  return getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
}

export function readLbTokens() {
  const get = (varName: string, fallback: string) =>
    readVar(varName) || fallback;

  return {
    bg: get("--lb-bg", FALLBACKS.bg),
    bgElevated: get("--lb-bg-elevated", FALLBACKS.bgElevated),
    fg: get("--lb-fg", FALLBACKS.fg),
    fgMuted: get("--lb-fg-muted", FALLBACKS.fgMuted),
    border: get("--lb-border", FALLBACKS.border),
    accent: get("--lb-accent", FALLBACKS.accent),
    accentFg: get("--lb-accent-fg", FALLBACKS.accentFg),
  };
}

function isLight(hex: string): boolean {
  // Naive luma test — enough to choose Monaco's "vs" vs "vs-dark" base.
  // Accepts #RGB and #RRGGBB; returns false for unparseable.
  let h = hex.trim().replace("#", "");
  if (h.length === 3) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (h.length !== 6) return false;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luma > 0.5;
}

/**
 * Monaco theme definition derived from --lb-* tokens. Pass to
 * `monaco.editor.defineTheme("lb-theme", theme)` then
 * `monaco.editor.setTheme("lb-theme")` (or set `theme="lb-theme"` on the
 * <Editor /> wrapper).
 *
 * The light-vs-dark base is inferred from a comparison between bg
 * luminance — works for all four built-in LB themes (default, daylight
 * are light; midnight, high-contrast are dark).
 */
export function monacoThemeFromLbTokens() {
  const t = readLbTokens();
  const base = isLight(t.bg) ? "vs" : "vs-dark";
  return {
    base,
    inherit: true,
    rules: [],
    colors: {
      "editor.background": t.bg,
      "editor.foreground": t.fg,
      "editorLineNumber.foreground": t.fgMuted,
      "editorLineNumber.activeForeground": t.fg,
      "editorCursor.foreground": t.accent,
      "editor.selectionBackground": `${t.accent}33`,
      "editor.lineHighlightBackground": t.bgElevated,
      "editorIndentGuide.background": t.border,
      "editorIndentGuide.activeBackground": t.fgMuted,
      "editor.findMatchBackground": `${t.accent}55`,
      "editor.findMatchHighlightBackground": `${t.accent}22`,
      "scrollbarSlider.background": `${t.border}66`,
      "scrollbarSlider.hoverBackground": `${t.border}AA`,
    },
  } as const;
}

/**
 * xterm.js theme derived from --lb-* tokens. Pass to the Terminal
 * constructor's `theme` option, or `terminal.options.theme = ...` to
 * re-apply after a theme switch.
 */
export function xtermThemeFromLbTokens() {
  const t = readLbTokens();
  return {
    background: t.bg,
    foreground: t.fg,
    cursor: t.accent,
    cursorAccent: t.accentFg,
    selectionBackground: `${t.accent}55`,
    black: "#000000",
    brightBlack: "#666666",
    red: "#ff6b6b",
    brightRed: "#ff8b8b",
    green: "#4ade80",
    brightGreen: "#7ee69b",
    yellow: "#facc15",
    brightYellow: "#fde047",
    blue: "#60a5fa",
    brightBlue: "#93c5fd",
    magenta: "#c084fc",
    brightMagenta: "#d8b4fe",
    cyan: "#22d3ee",
    brightCyan: "#67e8f9",
    white: t.fg,
    brightWhite: t.fg,
  };
}

/**
 * Subscribe to data-theme attribute changes on <html>. The callback
 * fires once on initial mount and again on every theme switch. Returns
 * a cleanup function. Used by Monaco + xterm consumers to re-apply
 * their theme objects.
 */
export function onLbThemeChange(callback: () => void): () => void {
  if (typeof document === "undefined") return () => {};
  // Fire once on subscribe so first paint matches the current theme.
  callback();
  const observer = new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === "attributes" && m.attributeName === "data-theme") {
        callback();
        return;
      }
    }
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  return () => observer.disconnect();
}
