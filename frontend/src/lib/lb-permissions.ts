// LeapBuilder M11 — permission catalog used by the Roles editor UI.
//
// Permissions stored on the backend are free-form strings (one per row
// in lb_role_permissions). This catalog defines which strings the UI
// surfaces as checkboxes. A role can technically grant any string via
// the API, but the canonical set used by the rest of the application
// lives here so the form stays self-describing.
//
// Convention: <resource>:<action>. Resources are plural snake_case;
// actions are short verbs.

export type PermissionAction =
  | "view"
  | "add"
  | "update"
  | "toggle_status"
  | "delete";

export type PermissionResource = {
  key: string; // identifier used to build "<key>:<action>"
  label: string; // shown next to the checkbox row
  actions: PermissionAction[];
};

export const PERMISSION_CATALOG: PermissionResource[] = [
  {
    key: "users",
    label: "Users",
    actions: ["view", "add", "update", "toggle_status"],
  },
  {
    key: "roles",
    label: "Roles",
    actions: ["view", "add", "update", "toggle_status"],
  },
  {
    key: "app_settings",
    label: "App Settings",
    actions: ["view", "update"],
  },
];

export const ACTION_LABELS: Record<PermissionAction, string> = {
  view: "View",
  add: "Add",
  update: "Update",
  toggle_status: "Toggle Status",
  delete: "Delete",
};

export function permString(resource: string, action: PermissionAction): string {
  return `${resource}:${action}`;
}

// Walk the catalog and return every permission string in canonical order.
export function allCatalogPermissions(): string[] {
  const out: string[] = [];
  for (const r of PERMISSION_CATALOG) {
    for (const a of r.actions) out.push(permString(r.key, a));
  }
  return out;
}
