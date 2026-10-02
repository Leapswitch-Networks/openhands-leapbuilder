import React from "react";
import { Trans, useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { useGitUser } from "#/hooks/query/use-git-user";
import { lbApi, Me } from "#/lib/lb-admin-api";

// LeapBuilder M11 — user profile page (top-level /profile).
//
// Combines two sources:
//   - GET /api/v1/lb/me        → email + (super_admin / permissions)
//   - useGitUser()              → avatar_url, name, login, company,
//                                 GitHub email (when scoped)
//
// Why not /settings/user: upstream's user-settings route gates email
// editing as SaaS-only and the loader redirects it to /settings in OSS
// mode anyway. This page is the OSS-flavored "who am I" — display only
// for now; profile mutations would land here in a follow-up.

function Avatar({ src, name }: { src: string | null; name: string | null }) {
  if (src) {
    return (
      <img
        src={src}
        alt={name ? `${name}'s avatar` : "Avatar"}
        className="w-24 h-24 rounded-full border border-[#3a3a3a] object-cover"
      />
    );
  }
  const initial = (name || "?").trim().slice(0, 1).toUpperCase();
  return (
    <div className="w-24 h-24 rounded-full border border-[#3a3a3a] bg-base-secondary flex items-center justify-center text-3xl font-semibold opacity-80">
      {initial}
    </div>
  );
}

function Field({
  label,
  value,
  placeholder,
  prefix,
  link,
  mono,
}: {
  label: string;
  value: string | null;
  placeholder?: string;
  prefix?: string;
  link?: string | null;
  mono?: boolean;
}) {
  const displayed = value
    ? (prefix ?? "") + value
    : (placeholder ?? "(unknown)");
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] uppercase tracking-wide opacity-60">
        {label}
      </span>
      {link && value ? (
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className={`text-sm underline ${mono ? "font-mono" : ""}`}
        >
          {displayed}
        </a>
      ) : (
        <span
          className={`text-sm ${mono ? "font-mono" : ""} ${value ? "" : "opacity-50"}`}
        >
          {displayed}
        </span>
      )}
    </div>
  );
}

export default function ProfileScreen() {
  const { t } = useTranslation();
  const [me, setMe] = React.useState<Me | null>(null);
  const gitUser = useGitUser();

  React.useEffect(() => {
    lbApi<Me>("/api/v1/lb/me")
      .then(setMe)
      .catch(() =>
        setMe({
          email: null,
          is_admin: false,
          is_super_admin: false,
          permissions: [],
        }),
      );
  }, []);

  // Only the /lb/me probe is required for the page to render. useGitUser
  // can be in a long-pending state in OSS/dev (no scoped GitHub token)
  // and we render fine without it — the avatar falls back to an
  // initial-based placeholder.
  const loading = me === null;
  const avatar = gitUser.data?.avatar_url ?? null;
  const name = gitUser.data?.name ?? null;
  const login = gitUser.data?.login ?? null;
  const company = gitUser.data?.company ?? null;
  // Prefer the oauth2-proxy-derived email (authoritative for the
  // session) over the GitHub-public email (which is often null).
  const email = me?.email ?? gitUser.data?.email ?? null;

  return (
    <div className="flex flex-col gap-6 p-6 max-w-3xl">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">
          {t(I18nKey.LB_PROFILE$TITLE)}
        </h1>
        <p className="text-sm opacity-75">
          {t(I18nKey.LB_PROFILE$DESCRIPTION)}
        </p>
      </header>

      {loading ? (
        <p className="text-sm opacity-70">{t(I18nKey.LB_PROFILE$LOADING)}</p>
      ) : (
        <section className="rounded-md border border-[#242424] p-5 flex flex-col md:flex-row gap-5 items-start">
          <Avatar src={avatar} name={name || login || email} />
          <div className="flex flex-col gap-3 flex-1">
            <Field
              label="Name"
              value={name}
              placeholder="(not set on GitHub)"
            />
            <Field label="Email" value={email} mono />
            <Field
              label="GitHub login"
              value={login}
              prefix="@"
              link={login ? `https://github.com/${login}` : null}
              mono
            />
            {company && <Field label="Company" value={company} />}
            {me?.is_super_admin && (
              <div className="mt-1">
                {/* eslint-disable-next-line i18next/no-literal-string */}
                <span className="rounded bg-[#9E28B0] text-white px-1.5 py-0.5 text-[10px] font-semibold">
                  super_admin
                </span>
              </div>
            )}
            {!me?.is_super_admin && me?.permissions.length ? (
              <div className="mt-1">
                <p className="text-xs opacity-60 mb-1 uppercase tracking-wide">
                  {t(I18nKey.LB_PROFILE$PERMISSIONS)}
                </p>
                <div className="flex flex-wrap gap-1">
                  {me.permissions.map((p) => (
                    <code
                      key={p}
                      className="rounded bg-base-secondary px-1.5 py-0.5 text-[11px]"
                    >
                      {p}
                    </code>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </section>
      )}

      <section className="text-xs opacity-70">
        <Trans
          i18nKey={I18nKey.LB_PROFILE$PREFERENCES_NOTE}
          components={{
            // eslint-disable-next-line jsx-a11y/anchor-has-content, jsx-a11y/control-has-associated-label
            settings: <a href="/settings" className="underline" />,
          }}
        />
      </section>
    </div>
  );
}
