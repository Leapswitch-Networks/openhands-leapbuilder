import React from "react";
import { Trans, useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { hasPerm, lbApi, Me } from "#/lib/lb-admin-api";

// LeapBuilder M11 — application-level settings (admin scope).
//
// Placeholder for now — the catalog permission "app_settings:view" and
// "app_settings:update" are defined and assignable via Roles, but the
// concrete settings that live here will be filled in as features land:
//   - default LLM model / max tokens
//   - SSO / GitHub org allowlist
//   - audit log retention
//   - global theme defaults
//   - feature flags
//
// User-scoped preferences (theme, language, secrets, ...) belong under
// /settings (the user profile menu), not here.

export default function AppSettingsScreen() {
  const { t } = useTranslation();
  const [me, setMe] = React.useState<Me | null>(null);

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

  if (!hasPerm(me, "app_settings:view")) {
    return (
      <div className="flex flex-col gap-4 p-6 max-w-3xl">
        <h1 className="text-2xl font-semibold">
          {t(I18nKey.LB_APP_SETTINGS$TITLE)}
        </h1>
        <p className="text-sm opacity-75">
          <Trans
            i18nKey={I18nKey.LB_APP_SETTINGS$NO_PERMISSION}
            components={{ code: <code /> }}
          />
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6 max-w-3xl">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">
          {t(I18nKey.LB_APP_SETTINGS$TITLE)}
        </h1>
        <p className="text-sm opacity-75">
          <Trans
            i18nKey={I18nKey.LB_APP_SETTINGS$DESCRIPTION}
            components={{
              // eslint-disable-next-line jsx-a11y/anchor-has-content, jsx-a11y/control-has-associated-label
              settings: <a href="/settings" className="underline" />,
            }}
          />
        </p>
      </header>

      <section className="rounded-md border border-[#242424] p-4">
        <h2 className="text-sm font-semibold tracking-wide uppercase opacity-70 mb-3">
          {t(I18nKey.LB_APP_SETTINGS$PLACEHOLDER_TITLE)}
        </h2>
        <p className="text-sm opacity-75">
          <Trans
            i18nKey={I18nKey.LB_APP_SETTINGS$PLACEHOLDER_BODY}
            components={{ code: <code /> }}
          />
        </p>
      </section>
    </div>
  );
}
