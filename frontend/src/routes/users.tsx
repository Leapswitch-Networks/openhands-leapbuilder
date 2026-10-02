import React from "react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import {
  ApiError,
  hasPerm,
  lbApi,
  Me,
  Role,
  SUPER_ADMIN_ROLE_ID,
  User,
} from "#/lib/lb-admin-api";

// LeapBuilder M11 — top-level /users page (users CRUD).
// Sidebar entry only renders for admins; for the rare case where a
// non-admin reaches /users directly, the page short-circuits to a
// "restricted" view.

function AssignRoleControl({
  user,
  roles,
  onAssign,
}: {
  user: User;
  roles: Role[];
  onAssign: (roleId: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const available = roles.filter(
    (r) => Array.isArray(user.role_ids) && !user.role_ids.includes(r.id),
  );
  if (available.length === 0) return null;
  return (
    <select
      defaultValue=""
      onChange={(e) => {
        const select = e.target;
        const v = select.value;
        if (!v) return;
        onAssign(v);
        select.value = "";
      }}
      className="bg-[#1f1f1f] border border-[#3a3a3a] rounded px-1.5 py-0.5 text-[11px]"
    >
      <option value="">{t(I18nKey.LB_USERS$ASSIGN_ROLE)}</option>
      {available.map((r) => (
        <option key={r.id} value={r.id}>
          {r.name}
        </option>
      ))}
    </select>
  );
}

function RoleChip({
  name,
  system,
  onRemove,
}: {
  name: string;
  system?: boolean;
  onRemove?: () => void;
}) {
  return (
    <span
      className={
        system
          ? "inline-flex items-center gap-1 rounded bg-[#9E28B0] text-white px-1.5 py-0.5 text-[10px] font-semibold"
          : "inline-flex items-center gap-1 rounded bg-[#1FBD53] text-[#0D0F11] px-1.5 py-0.5 text-[10px] font-semibold"
      }
    >
      {name}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="ml-1 opacity-75 hover:opacity-100"
          aria-label={`remove ${name}`}
        >
          ×
        </button>
      )}
    </span>
  );
}

function UsersTable({
  users,
  roles,
  currentEmail,
  canToggle,
  canUpdate,
  reload,
  onError,
}: {
  users: User[];
  roles: Role[];
  currentEmail: string | null;
  canToggle: boolean; // users:toggle_status
  canUpdate: boolean; // users:update
  reload: () => Promise<void>;
  onError: (msg: string) => void;
}) {
  const { t } = useTranslation();
  const canActOnRow = canToggle || canUpdate;
  return (
    <table className="text-xs w-full">
      <thead className="text-[10px] uppercase tracking-wider opacity-60">
        <tr>
          <th className="text-left py-1 pr-3">{t(I18nKey.LB_USERS$EMAIL)}</th>
          <th className="text-left py-1 pr-3">{t(I18nKey.LB_USERS$GITHUB)}</th>
          <th className="text-left py-1 pr-3">{t(I18nKey.LB_USERS$ROLES)}</th>
          <th className="text-left py-1 pr-3">{t(I18nKey.LB_USERS$STATUS)}</th>
          <th className="text-left py-1 pr-3">
            {t(I18nKey.LB_USERS$LAST_SEEN)}
          </th>
          {canActOnRow && (
            <th className="text-left py-1">{t(I18nKey.SETTINGS$ACTIONS)}</th>
          )}
        </tr>
      </thead>
      <tbody>
        {users.map((u) => {
          const isSelf = u.email === currentEmail;
          return (
            <tr key={u.id} className="border-t border-[#242424] align-top">
              <td className="py-2 pr-3 font-mono">{u.email}</td>
              <td className="py-2 pr-3 font-mono">{u.github_login ?? "—"}</td>
              <td className="py-2 pr-3">
                <div className="flex flex-wrap gap-1">
                  {Array.isArray(u.role_names) && u.role_names.length > 0 ? (
                    u.role_ids.map((rid, i) => (
                      <RoleChip
                        key={rid}
                        name={u.role_names[i]}
                        system={rid === SUPER_ADMIN_ROLE_ID}
                        onRemove={
                          !isSelf && canUpdate
                            ? async () => {
                                if (
                                  !window.confirm(
                                    `Remove role "${u.role_names[i]}" from ${u.email}?`,
                                  )
                                )
                                  return;
                                try {
                                  await lbApi(
                                    `/api/v1/lb/users/${encodeURIComponent(u.email)}/roles/${rid}`,
                                    { method: "DELETE" },
                                  );
                                  await reload();
                                } catch (e) {
                                  onError((e as Error).message);
                                }
                              }
                            : undefined
                        }
                      />
                    ))
                  ) : (
                    <span className="opacity-60">—</span>
                  )}
                </div>
              </td>
              <td className="py-2 pr-3">
                <span
                  className={
                    u.is_enabled
                      ? "rounded bg-[#1FBD53] text-[#0D0F11] px-1.5 py-0.5 text-[10px] font-semibold"
                      : "rounded bg-[#FF3B30] text-white px-1.5 py-0.5 text-[10px] font-semibold"
                  }
                >
                  {u.is_enabled
                    ? t(I18nKey.LB_USERS$ENABLED)
                    : t(I18nKey.LB_USERS$DISABLED)}
                </span>
              </td>
              <td className="py-2 pr-3 opacity-70">
                {u.last_seen_at.slice(0, 19)}
              </td>
              {canActOnRow && (
                <td className="py-2">
                  {isSelf ? (
                    <span className="opacity-50 text-[11px]">
                      {t(I18nKey.LB_USERS$SELF_EDIT_BLOCKED)}
                    </span>
                  ) : (
                    <div className="flex items-center gap-2">
                      {canToggle && (
                        <button
                          type="button"
                          className="text-[11px] underline opacity-80 hover:opacity-100"
                          onClick={async () => {
                            try {
                              await lbApi(
                                `/api/v1/lb/users/${encodeURIComponent(u.email)}`,
                                {
                                  method: "PATCH",
                                  json: { is_enabled: !u.is_enabled },
                                },
                              );
                              await reload();
                            } catch (e) {
                              onError((e as Error).message);
                            }
                          }}
                        >
                          {u.is_enabled
                            ? t(I18nKey.LB_USERS$DISABLE)
                            : t(I18nKey.LB_USERS$ENABLE)}
                        </button>
                      )}
                      {canUpdate && (
                        <AssignRoleControl
                          user={u}
                          roles={roles}
                          onAssign={async (rid) => {
                            try {
                              await lbApi(
                                `/api/v1/lb/users/${encodeURIComponent(u.email)}/roles/${rid}`,
                                { method: "POST" },
                              );
                              await reload();
                            } catch (e) {
                              onError((e as Error).message);
                            }
                          }}
                        />
                      )}
                    </div>
                  )}
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export default function UsersScreen() {
  const { t } = useTranslation();
  const [me, setMe] = React.useState<Me | null>(null);
  const [users, setUsers] = React.useState<User[] | null>(null);
  const [roles, setRoles] = React.useState<Role[] | null>(null);
  const [restricted, setRestricted] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const reloadUsers = React.useCallback(async () => {
    try {
      const data = await lbApi<{ users: User[] }>("/api/v1/lb/users");
      setUsers(data.users);
      setRestricted(false);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        setRestricted(true);
        setUsers([]);
      } else {
        setError((e as Error).message);
        setUsers([]);
      }
    }
  }, []);
  const reloadRoles = React.useCallback(async () => {
    try {
      const data = await lbApi<{ roles: Role[] }>("/api/v1/lb/roles");
      setRoles(data.roles);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

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
    reloadUsers();
    reloadRoles();
  }, [reloadUsers, reloadRoles]);

  if (restricted) {
    return (
      <div className="flex flex-col gap-4 p-6 max-w-3xl">
        <h1 className="text-2xl font-semibold">{t(I18nKey.LB_USERS$TITLE)}</h1>
        <p className="text-sm opacity-75">{t(I18nKey.LB_USERS$RESTRICTED)}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6 max-w-5xl">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{t(I18nKey.LB_USERS$TITLE)}</h1>
        <p className="text-sm opacity-75">{t(I18nKey.LB_USERS$DESCRIPTION)}</p>
      </header>

      {error && (
        <div className="rounded border border-[#FF3B30] p-3 text-sm text-[#FF3B30] flex items-center justify-between">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-xs opacity-70 hover:opacity-100"
          >
            {t(I18nKey.LB_USERS$DISMISS)}
          </button>
        </div>
      )}

      {users === null ? (
        <p className="text-sm opacity-70">{t(I18nKey.LB_USERS$LOADING)}</p>
      ) : (
        <section className="rounded-md border border-[#242424] p-4">
          <h2 className="text-sm font-semibold tracking-wide uppercase opacity-70 mb-3">
            {t(I18nKey.LB_USERS$HEADING, { total: users.length })}
          </h2>
          <UsersTable
            users={users}
            roles={roles ?? []}
            currentEmail={me?.email ?? null}
            canToggle={hasPerm(me, "users:toggle_status")}
            canUpdate={hasPerm(me, "users:update")}
            reload={reloadUsers}
            onError={setError}
          />
        </section>
      )}
    </div>
  );
}
