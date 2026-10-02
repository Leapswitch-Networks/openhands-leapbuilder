import React from "react";
import { Trans, useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";

// LeapBuilder M3.5b — discoverable Settings page for the git-sync feature.
// The conversational microagent (M3.5 v1, `microagents/git-sync.md`) already
// handles the actual work; this page surfaces it for users who don't know
// to type "/sync" in chat.

const TRIGGERS: Array<{ phrase: string; what: string }> = [
  {
    phrase: "/sync",
    what: "Guided checkpoint — git status + the right next action.",
  },
  {
    phrase: "git status",
    what: "Fetch origin, report ahead/behind + dirty files.",
  },
  {
    phrase: "commit and push",
    what: "Stage everything, write a real conventional-commit message, push.",
  },
  {
    phrase: "save my work",
    what: "Alias for commit and push.",
  },
  {
    phrase: "pull latest",
    what: "git pull --rebase (or merge — configurable per project).",
  },
  {
    phrase: "switch to repo-first",
    what: "Auto-commit + auto-push after every mutating agent turn.",
  },
  {
    phrase: "switch to manual",
    what: "Commit only when you ask. (Default.)",
  },
];

function SyncSettingsScreen() {
  const { t: tr } = useTranslation();
  const [copied, setCopied] = React.useState<string | null>(null);

  const handleCopy = (phrase: string) => {
    try {
      navigator.clipboard.writeText(phrase);
      setCopied(phrase);
      setTimeout(() => setCopied((c) => (c === phrase ? null : c)), 1500);
    } catch {
      // ignore clipboard errors — user can still type the phrase
    }
  };

  return (
    <div className="flex flex-col gap-6 p-6 max-w-3xl">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">{tr(I18nKey.LB_SYNC$TITLE)}</h1>
        <p className="text-sm opacity-75">{tr(I18nKey.LB_SYNC$DESCRIPTION)}</p>
      </header>

      <div className="rounded-md border border-[#242424] p-4 text-sm leading-relaxed">
        <p className="font-medium">{tr(I18nKey.LB_SYNC$TWO_MODES)}</p>
        <ul className="list-disc pl-5 mt-2 space-y-1 opacity-90">
          <li>
            <Trans
              i18nKey={I18nKey.LB_SYNC$MODE_MANUAL}
              components={{ strong: <strong /> }}
            />
          </li>
          <li>
            <Trans
              i18nKey={I18nKey.LB_SYNC$MODE_REPO_FIRST}
              components={{ strong: <strong />, code: <code /> }}
            />
          </li>
        </ul>
        <p className="mt-3 opacity-80">
          <Trans
            i18nKey={I18nKey.LB_SYNC$CONFIG_NOTE}
            components={{ code: <code /> }}
          />
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold tracking-wide uppercase opacity-70">
          {tr(I18nKey.LB_SYNC$PHRASES_HEADING)}
        </h2>
        <ul className="flex flex-col gap-2">
          {TRIGGERS.map((t) => (
            <li
              key={t.phrase}
              className="flex items-start gap-3 rounded border border-[#242424] p-3 hover:bg-[#1f1f1f99]"
            >
              <div className="flex-1 min-w-0">
                <code className="rounded bg-[#1F1F1F] px-2 py-0.5 text-sm">
                  {t.phrase}
                </code>
                <p className="mt-1 text-xs opacity-75">{t.what}</p>
              </div>
              <button
                type="button"
                onClick={() => handleCopy(t.phrase)}
                className="shrink-0 rounded border border-[#242424] px-2 py-1 text-xs hover:bg-[#1f1f1f99]"
                aria-label={`Copy "${t.phrase}"`}
              >
                {copied === t.phrase
                  ? tr(I18nKey.LB_SYNC$COPIED)
                  : tr(I18nKey.LB_SYNC$COPY)}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <footer className="text-xs opacity-60 pt-4 border-t border-[#242424]">
        <Trans
          i18nKey={I18nKey.LB_SYNC$HARD_GUARDS}
          components={{ code: <code /> }}
        />
      </footer>
    </div>
  );
}

export default SyncSettingsScreen;
