import React from "react";
import { Trans, useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";

// LeapBuilder M9.1 — in-app theme picker.
// Themes live in the LeapBuilder overlay at /themes/_themes.json. Selection
// is purely client-side: write to localStorage.lb_theme and set the
// data-theme attribute on <html>. The themes-overlay sidecar's bootstrap
// script (M2) keeps the attribute in place after React reconciles.

type ThemeBundle = {
  name: string;
  kind: "light" | "dark";
  description: string;
  preview?: string;
  version?: string;
};

const LB_THEME_KEY = "lb_theme";

function applyTheme(name: string, kind?: "light" | "dark") {
  try {
    localStorage.setItem(LB_THEME_KEY, name);
  } catch {
    // ignore — private mode, etc.
  }
  if (typeof document === "undefined") return;
  const html = document.documentElement;
  html.setAttribute("data-theme", name);
  // Some upstream components (HeroUI, Tailwind dark-variants) toggle off a
  // .dark class on <html>, not our data-theme attribute. Sync it so a click
  // on a light theme immediately drops dark-mode styles, and vice versa.
  if (kind === "dark") {
    html.classList.add("dark");
  } else if (kind === "light") {
    html.classList.remove("dark");
  }
  // Force a reflow so CSS custom properties / class changes paint
  // immediately rather than at the next idle tick (some Chromium versions
  // batch repaints aggressively when only the html attribute changes).
  html.getBoundingClientRect();
}

function previewSwatchStyle(t: ThemeBundle): React.CSSProperties {
  // Approximate the theme bg from kind so we can render a swatch even when
  // the bundle didn't ship a preview.svg.
  const fallbackBg = t.kind === "light" ? "#fafafa" : "#0b0d12";
  return { background: fallbackBg };
}

function ThemesSettingsScreen() {
  const { t: tr } = useTranslation();
  const [themes, setThemes] = React.useState<ThemeBundle[] | null>(null);
  const [active, setActive] = React.useState<string>("default");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    fetch("/themes/_themes.json", { credentials: "same-origin" })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<ThemeBundle[]>;
      })
      .then((data) => {
        if (cancelled) return;
        setThemes(data);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(String(err?.message || err));
      });

    try {
      const stored = localStorage.getItem(LB_THEME_KEY);
      if (stored) setActive(stored);
      else {
        const current = document.documentElement.getAttribute("data-theme");
        if (current) setActive(current);
      }
    } catch {
      // ignore
    }

    return () => {
      cancelled = true;
    };
  }, []);

  const handlePick = (name: string) => {
    setActive(name);
    const picked = themes?.find((t) => t.name === name);
    applyTheme(name, picked?.kind);
  };

  return (
    <div className="flex flex-col gap-6 p-6 max-w-5xl">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">
          {tr(I18nKey.SETTINGS$NAV_THEMES)}
        </h1>
        <p className="text-sm opacity-75">
          {tr(I18nKey.LB_THEMES$DESCRIPTION)}
        </p>
      </header>

      {error && (
        <div className="rounded-md border border-[#C63143] bg-[#4A0709]/30 px-4 py-3 text-sm">
          <Trans
            i18nKey={I18nKey.LB_THEMES$LOAD_ERROR}
            values={{ error }}
            components={{ code: <code /> }}
            tOptions={{ interpolation: { escapeValue: false } }}
          />
        </div>
      )}

      {!themes && !error && (
        <div className="text-sm opacity-75">
          {tr(I18nKey.LB_THEMES$LOADING)}
        </div>
      )}

      {themes && themes.length === 0 && (
        <div className="text-sm opacity-75">
          <Trans
            i18nKey={I18nKey.LB_THEMES$EMPTY}
            components={{ code: <code /> }}
          />
        </div>
      )}

      {themes && themes.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {themes.map((t) => {
            const isActive = t.name === active;
            return (
              <button
                type="button"
                key={t.name}
                onClick={() => handlePick(t.name)}
                aria-pressed={isActive}
                className={`group flex flex-col gap-3 rounded-lg border-2 p-4 text-left transition-colors cursor-pointer ${
                  isActive
                    ? "border-[#FC6B0E] bg-[#1f1f1f99]"
                    : "border-[#242424] hover:bg-[#1f1f1f99]"
                }`}
              >
                {/* Preview: SVG if the bundle ships one, otherwise a flat
                    swatch in the theme's base color so the user can tell
                    light-from-dark at a glance. */}
                <div
                  className="h-20 w-full rounded border border-[#242424] overflow-hidden flex items-center justify-center"
                  style={t.preview ? undefined : previewSwatchStyle(t)}
                >
                  {t.preview && (
                    <img
                      src={t.preview}
                      alt={`${t.name} preview`}
                      className="w-full h-full object-cover"
                      loading="lazy"
                      onError={(e) => {
                        // Hide broken images; the parent swatch shows through.
                        const img = e.currentTarget;
                        img.style.display = "none";
                      }}
                    />
                  )}
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{t.name}</span>
                  <span className="text-[10px] uppercase tracking-wider opacity-60">
                    {t.kind}
                  </span>
                </div>
                <p className="text-xs opacity-75 min-h-[2.4em]">
                  {t.description}
                </p>
                <div className="mt-auto flex items-center justify-between gap-2 pt-2 text-xs">
                  {/* eslint-disable-next-line i18next/no-literal-string */}
                  <span className="opacity-60">v{t.version ?? "1.0.0"}</span>
                  <span
                    className={
                      isActive
                        ? "text-[#FC6B0E] font-medium"
                        : "opacity-60 group-hover:opacity-100"
                    }
                  >
                    {isActive
                      ? tr(I18nKey.LB_THEMES$ACTIVE)
                      : tr(I18nKey.LB_THEMES$USE_THIS)}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <footer className="text-xs opacity-60 pt-4 border-t border-[#242424]">
        <Trans
          i18nKey={I18nKey.LB_THEMES$FOOTER}
          components={{ code: <code /> }}
        />
      </footer>
    </div>
  );
}

export default ThemesSettingsScreen;
