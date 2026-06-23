import React from "react";
import type { Me } from "#/lib/lb-admin-api";

// LeapBuilder M11 — hook for the signed-in user's admin state +
// granular catalog permissions.
//
// Source of truth: GET /api/v1/lb/me. Module-scoped cache so all
// consumers share a single in-flight probe, with lbAdminInvalidate()
// to force a re-fetch after a known role change.

type State =
  | { kind: "loading" }
  | { kind: "anonymous" }
  | { kind: "ready"; me: Me };

let _cache: State = { kind: "loading" };
const _subscribers = new Set<() => void>();
let _inflight: Promise<void> | null = null;

function notify() {
  for (const cb of _subscribers) cb();
}

async function refresh(): Promise<void> {
  try {
    const r = await fetch("/api/v1/lb/me", { credentials: "same-origin" });
    if (r.ok) {
      const me = (await r.json()) as Me;
      _cache = me.email
        ? { kind: "ready", me }
        : { kind: "anonymous" };
    } else {
      _cache = { kind: "anonymous" };
    }
  } catch {
    _cache = { kind: "anonymous" };
  }
  notify();
}

export function lbAdminInvalidate(): void {
  _inflight = refresh();
}

function useState(): State {
  const [, force] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => {
    _subscribers.add(force);
    if (_inflight === null) _inflight = refresh();
    return () => {
      _subscribers.delete(force);
    };
  }, []);
  return _cache;
}

// Backwards-compat hook used by the sidebar — returns the same
// "yes" / "no" / "loading" tri-state as before, computed from the
// richer /me payload.
export function useLbIsAdmin(): "loading" | "yes" | "no" {
  const s = useState();
  if (s.kind === "loading") return "loading";
  if (s.kind === "anonymous") return "no";
  return s.me.is_admin ? "yes" : "no";
}

// Granular hook — returns the full Me payload or null.
export function useLbMe(): Me | null {
  const s = useState();
  return s.kind === "ready" ? s.me : null;
}

// Convenience predicate. Super_admin always returns true.
export function useLbHasPerm(perm: string): boolean {
  const me = useLbMe();
  if (!me) return false;
  if (me.is_super_admin) return true;
  return me.permissions.includes(perm);
}
