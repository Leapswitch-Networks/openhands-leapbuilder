import {
  type RouteConfig,
  layout,
  index,
  route,
} from "@react-router/dev/routes";

export default [
  route("login", "routes/login.tsx"),
  route("onboarding", "routes/onboarding-form.tsx"),
  route("information-request", "routes/information-request.tsx"),
  layout("routes/root-layout.tsx", [
    index("routes/home.tsx"),
    route("accept-tos", "routes/accept-tos.tsx"),
    route("launch", "routes/launch.tsx"),
    route("settings", "routes/settings.tsx", [
      index("routes/llm-settings.tsx"),
      route("condenser", "routes/condenser-settings.tsx"),
      route("verification", "routes/verification-settings.tsx"),
      route("org-defaults", "routes/org-default-llm-settings.tsx"),
      route(
        "org-defaults/condenser",
        "routes/org-default-condenser-settings.tsx",
      ),
      route(
        "org-defaults/verification",
        "routes/org-default-verification-settings.tsx",
      ),
      route("mcp", "routes/mcp-settings.tsx"),
      route("skills", "routes/skills-settings.tsx"),
      route("themes", "routes/themes-settings.tsx"),
      route("sync", "routes/sync-settings.tsx"),
      route("user", "routes/user-settings.tsx"),
      route("integrations", "routes/git-settings.tsx"),
      route("app", "routes/app-settings.tsx"),
      route("billing", "routes/billing.tsx"),
      route("secrets", "routes/secrets-settings.tsx"),
      route("api-keys", "routes/api-keys.tsx"),
      route("org-members", "routes/manage-organization-members.tsx"),
      route("org", "routes/manage-org.tsx"),
    ]),
    route("users", "routes/users.tsx"),
    route("roles", "routes/roles.tsx"),
    route("app-settings", "routes/lb-app-settings.tsx"),
    route("profile", "routes/lb-profile.tsx"),
    route("conversations/:conversationId", "routes/conversation.tsx"),
    route("oauth/device/verify", "routes/device-verify.tsx"),
    // Catch-all 404 — must be last inside the layout. 404s keep the
    // sidebar so the user can navigate elsewhere.
    route("*", "routes/lb-not-found.tsx"),
  ]),
  // Dev-mode /oauth2/sign_out — fullscreen page outside the layout
  // (no sidebar) so it looks like a real signed-out state. In staging
  // oauth2-proxy intercepts /oauth2/* upstream of nginx so this route
  // never actually renders.
  route("oauth2/sign_out", "routes/lb-dev-signout.tsx"),
  // Shared routes that don't require authentication
  route(
    "shared/conversations/:conversationId",
    "routes/shared-conversation.tsx",
  ),
] satisfies RouteConfig;
