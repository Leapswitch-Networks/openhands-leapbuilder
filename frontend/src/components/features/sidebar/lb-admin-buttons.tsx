import React from "react";
import { NavLink } from "react-router";
import {
  IoPeopleOutline,
  IoSettingsOutline,
  IoShieldCheckmarkOutline,
} from "react-icons/io5";
import { useLbMe } from "#/hooks/lb-use-is-admin";
import { hasPerm } from "#/lib/lb-admin-api";

// LeapBuilder M11 — two top-level sidebar entries (Users, Roles).
// Visible ONLY when the signed-in user is an admin (super_admin or
// env-fallback). Component renders nothing while the admin probe is
// still loading to avoid a flash of admin icons for non-admins.

function SidebarIconLink({
  to,
  Icon,
  label,
  testId,
}: {
  to: string;
  Icon: typeof IoPeopleOutline;
  label: string;
  testId: string;
}) {
  return (
    <NavLink
      to={to}
      data-testid={testId}
      title={label}
      aria-label={label}
      // text-content / bg-base-secondary are LB theme tokens — they
      // remap to --lb-fg / --lb-bg-elevated via themes/_bindings.css so
      // the icons stay visible on both light and dark themes. Avoid
      // text-white/80 with opacity — the theme override targets the
      // bare .text-white selector and an opacity suffix doesn't match.
      className={({ isActive }) =>
        [
          "flex items-center justify-center w-[36px] h-[36px] rounded",
          "hover:bg-base-secondary transition-colors",
          isActive
            ? "bg-base-secondary text-content"
            : "text-content opacity-70 hover:opacity-100",
        ].join(" ")
      }
    >
      <Icon size={22} />
    </NavLink>
  );
}

export function LbAdminSidebarButtons() {
  const me = useLbMe();
  if (!me) return null;
  const showUsers = hasPerm(me, "users:view");
  const showRoles = hasPerm(me, "roles:view");
  const showAppSettings = hasPerm(me, "app_settings:view");
  if (!showUsers && !showRoles && !showAppSettings) return null;
  return (
    <>
      {showUsers && (
        <SidebarIconLink
          to="/users"
          Icon={IoPeopleOutline}
          label="Users"
          testId="lb-sidebar-users"
        />
      )}
      {showRoles && (
        <SidebarIconLink
          to="/roles"
          Icon={IoShieldCheckmarkOutline}
          label="Roles"
          testId="lb-sidebar-roles"
        />
      )}
      {showAppSettings && (
        <SidebarIconLink
          to="/app-settings"
          Icon={IoSettingsOutline}
          label="App Settings"
          testId="lb-sidebar-app-settings"
        />
      )}
    </>
  );
}
