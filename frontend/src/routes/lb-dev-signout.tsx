import React from "react";
import { Trans, useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";

// LeapBuilder M11 — dev-mode /oauth2/sign_out final page.
//
// In staging oauth2-proxy intercepts /oauth2/* upstream of nginx, so
// the SPA never reaches this route. In dev there's no proxy and
// Traefik's lb-dev-identity middleware re-injects the auth header on
// every request — meaning a real logout isn't possible without
// disabling the middleware. Rather than silently redirecting back to
// '/' (which made it look like nothing happened), this page is a
// clear "you've been signed out" final state with a "Sign in again"
// link the user can click when they want to come back.

export default function DevSignOutScreen() {
  const { t } = useTranslation();
  React.useEffect(() => {
    // Clear browser-side session data. The X-Forwarded-Email header
    // injected by Traefik isn't browser-controlled, so the next request
    // will re-authenticate as the dev identity — but we still want to
    // wipe anything cached on this device.
    try {
      window.localStorage.clear();
      window.sessionStorage.clear();
    } catch {
      /* ignore */
    }
  }, []);

  const url =
    typeof window !== "undefined" ? new URL(window.location.href) : null;
  const rd = url?.searchParams.get("rd");
  const target = rd && /^https?:\/\//.test(rd) ? rd : "/";

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 p-6 text-center max-w-xl mx-auto">
      <div className="text-5xl select-none">👋</div>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">
          {t(I18nKey.LB_DEV_SIGNOUT$TITLE)}
        </h1>
        <p className="text-sm opacity-75">
          <Trans
            i18nKey={I18nKey.LB_DEV_SIGNOUT$BODY}
            components={{ em: <em /> }}
          />
        </p>
      </div>
      <a
        href={target}
        className="text-xs px-3 py-1.5 rounded bg-[#FC6B0E] text-[#0D0F11] font-semibold"
      >
        {t(I18nKey.LB_DEV_SIGNOUT$SIGN_IN_AGAIN)}
      </a>
    </div>
  );
}
