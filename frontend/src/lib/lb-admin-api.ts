// LeapBuilder M11 — shared admin API helpers (used by /users + /roles routes).

export type Role = {
  id: string;
  name: string;
  description: string | null;
  is_system: boolean;
  is_enabled: boolean;
  created_at: string;
  permissions: string[];
};

export type User = {
  id: string;
  email: string;
  github_login: string | null;
  first_seen_at: string;
  last_seen_at: string;
  is_enabled: boolean;
  role_ids: string[];
  role_names: string[];
};

export type Me = {
  email: string | null;
  is_admin: boolean;
  is_super_admin: boolean;
  permissions: string[];
};

// Helper used across admin pages — super_admins bypass all checks
// (matches the backend's has_permission() behavior).
export function hasPerm(me: Me | null, perm: string): boolean {
  if (!me) return false;
  if (me.is_super_admin) return true;
  return me.permissions.includes(perm);
}

export const SUPER_ADMIN_ROLE_ID = "00000000-0000-0000-0000-000000000001";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function lbApi<T>(
  path: string,
  init?: RequestInit & { json?: unknown },
): Promise<T> {
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string> | undefined),
  };
  let body = init?.body;
  if (init?.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(init.json);
  }
  const r = await fetch(path, {
    credentials: "same-origin",
    ...init,
    headers,
    body,
  });
  if (!r.ok) {
    let detail = `HTTP ${r.status}`;
    try {
      const j = await r.json();
      if (j?.detail) detail = j.detail;
    } catch {
      /* ignore */
    }
    throw new ApiError(r.status, detail);
  }
  if (r.status === 204) return undefined as T;
  return r.json();
}
