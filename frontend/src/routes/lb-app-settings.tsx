import React from "react";
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
        <h1 className="text-2xl font-semibold">App Settings</h1>
        <p className="text-sm opacity-75">
          You need the <code>app_settings:view</code> permission to view
          this page.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6 max-w-3xl">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">App Settings</h1>
        <p className="text-sm opacity-75">
          Application-level configuration. User-scoped preferences
          (theme, language, secrets) live under <a href="/settings" className="underline">Settings</a>.
        </p>
      </header>

      <section className="rounded-md border border-[#242424] p-4">
        <h2 className="text-sm font-semibold tracking-wide uppercase opacity-70 mb-3">
          Placeholder
        </h2>
        <p className="text-sm opacity-75">
          Concrete settings (default LLM, SSO allowlist, audit retention,
          feature flags, ...) will land here in subsequent milestones.
          The <code>app_settings:view</code> and{" "}
          <code>app_settings:update</code> permissions are already
          defined in the catalog and can be granted to roles today.
        </p>
      </section>
    </div>
  );
}
