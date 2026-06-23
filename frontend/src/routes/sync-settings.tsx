import React from "react";

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
        <h1 className="text-2xl font-semibold">Git sync</h1>
        <p className="text-sm opacity-75">
          A safety net so you never lose work and never build on a stale
          base. Say any of these phrases in chat — the LeapBuilder
          microagent handles the rest.
        </p>
      </header>

      <div className="rounded-md border border-[#242424] p-4 text-sm leading-relaxed">
        <p className="font-medium">Two modes (per project):</p>
        <ul className="list-disc pl-5 mt-2 space-y-1 opacity-90">
          <li>
            <strong>Manual</strong> (default) — the agent commits and pushes
            only when you ask.
          </li>
          <li>
            <strong>Repo-first</strong> — the agent auto-commits and
            auto-pushes after every turn that touches files. Switch with{" "}
            <code>switch to repo-first</code>.
          </li>
        </ul>
        <p className="mt-3 opacity-80">
          Per-project config lives at <code>.leapbuilder/sync.toml</code> in
          each scaffolded project.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold tracking-wide uppercase opacity-70">
          Phrases the agent recognizes
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
                {copied === t.phrase ? "copied" : "copy"}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <footer className="text-xs opacity-60 pt-4 border-t border-[#242424]">
        Hard guards: the agent will never <code>git push --force</code>{" "}
        without the literal phrase "force push", never{" "}
        <code>reset --hard</code> / <code>clean -fd</code> without consent,
        and never stages <code>.env</code> / <code>*.pem</code> /{" "}
        <code>credentials*</code> / <code>secrets*</code>. See{" "}
        <code>docs/features/git-sync.md</code> in the LeapBuilder repo.
      </footer>
    </div>
  );
}

export default SyncSettingsScreen;
