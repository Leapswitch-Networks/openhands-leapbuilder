import React from "react";
import { Trans, useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { hasPerm, lbApi, Me, Role } from "#/lib/lb-admin-api";
import { LbPermissionPicker } from "#/components/features/admin/lb-permission-picker";

// LeapBuilder M11 — top-level /roles page (roles CRUD).
// Public read; mutations require admin (server-enforced).

function CreateRoleForm({
  onSubmit,
}: {
  onSubmit: (
    name: string,
    description: string | null,
    permissions: string[],
  ) => Promise<void>;
}) {
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [perms, setPerms] = React.useState<string[]>([]);
  const { t } = useTranslation();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(name, description || null, perms).then(() => {
          setName("");
          setDescription("");
          setPerms([]);
        });
      }}
      className="rounded border border-[#3a3a3a] p-3 mb-3 flex flex-col gap-3"
    >
      <label className="flex flex-col gap-1 text-xs">
        <span className="opacity-70">{t(I18nKey.LB_ROLES$NAME)}</span>
        <input
          required
          placeholder="e.g. editor"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="bg-[#1f1f1f] border border-[#3a3a3a] rounded px-2 py-1 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs">
        <span className="opacity-70">{t(I18nKey.FORM$DESCRIPTION)}</span>
        <input
          placeholder="(optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="bg-[#1f1f1f] border border-[#3a3a3a] rounded px-2 py-1 text-sm"
        />
      </label>
      <div className="flex flex-col gap-1">
        <span className="text-xs opacity-70">
          {t(I18nKey.LB_ROLES$PERMISSIONS)}
        </span>
        <LbPermissionPicker value={perms} onChange={setPerms} />
      </div>
      <button
        type="submit"
        className="self-start text-xs px-3 py-1 rounded bg-[#FC6B0E] text-[#0D0F11] font-semibold"
      >
        {t(I18nKey.LB_ROLES$CREATE_ROLE)}
      </button>
    </form>
  );
}

function RoleReadOnlyView({ role }: { role: Role }) {
  const { t } = useTranslation();
  if (role.is_system) {
    return (
      <p className="text-xs opacity-60 mt-2">
        {t(I18nKey.LB_ROLES$SYSTEM_ROLE_NOTE)}
      </p>
    );
  }
  if (!Array.isArray(role.permissions) || role.permissions.length === 0) {
    return (
      <p className="text-xs opacity-50 mt-2">
        {t(I18nKey.LB_ROLES$NO_PERMISSIONS)}
      </p>
    );
  }
  return (
    <div className="mt-2">
      <LbPermissionPicker
        value={role.permissions}
        onChange={() => {}}
        readOnly
      />
    </div>
  );
}

function RoleEditor({
  role,
  canUpdate,
  reload,
  onError,
}: {
  role: Role;
  canUpdate: boolean; // roles:update — rename / description / perms / delete
  reload: () => Promise<void>;
  onError: (msg: string) => void;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = React.useState(false);
  const [name, setName] = React.useState(role.name);
  const [description, setDescription] = React.useState(role.description ?? "");
  const [perms, setPerms] = React.useState<string[]>(
    Array.isArray(role.permissions) ? role.permissions : [],
  );

  // When the role re-fetches (after save), sync local state.
  React.useEffect(() => {
    setName(role.name);
    setDescription(role.description ?? "");
    setPerms(Array.isArray(role.permissions) ? role.permissions : []);
  }, [role.id, role.name, role.description, role.permissions]);

  const canEdit = canUpdate && !role.is_system;

  return (
    <div className="border border-[#242424] rounded p-3">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span
              className={
                role.is_system
                  ? "rounded bg-[#9E28B0] text-white px-1.5 py-0.5 text-[10px] font-semibold"
                  : "rounded bg-[#1FBD53] text-[#0D0F11] px-1.5 py-0.5 text-[10px] font-semibold"
              }
            >
              {role.name}
            </span>
            {!role.is_enabled && (
              <span className="rounded bg-[#FF3B30] text-white px-1.5 py-0.5 text-[10px] font-semibold">
                {t(I18nKey.LB_ROLES$DISABLED)}
              </span>
            )}
          </div>
          <p className="text-xs opacity-75">
            {role.description || (
              <span className="opacity-50">
                {t(I18nKey.LB_ROLES$NO_DESCRIPTION)}
              </span>
            )}
          </p>
        </div>
        {canEdit && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setEditing((v) => !v)}
              className="text-[11px] underline opacity-80 hover:opacity-100"
            >
              {editing ? t(I18nKey.LB_ROLES$CANCEL) : t(I18nKey.LB_ROLES$EDIT)}
            </button>
            <button
              type="button"
              onClick={async () => {
                if (!window.confirm(`Delete role "${role.name}"?`)) return;
                try {
                  await lbApi(`/api/v1/lb/roles/${role.id}`, {
                    method: "DELETE",
                  });
                  await reload();
                } catch (e) {
                  onError((e as Error).message);
                }
              }}
              className="text-[11px] underline opacity-80 hover:opacity-100 text-[#FF3B30]"
            >
              {t(I18nKey.LB_ROLES$DELETE)}
            </button>
          </div>
        )}
      </div>
      {editing ? (
        <div className="flex flex-col gap-3 mt-3">
          <label className="flex flex-col gap-1 text-xs">
            <span className="opacity-70">{t(I18nKey.LB_ROLES$NAME)}</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="bg-[#1f1f1f] border border-[#3a3a3a] rounded px-2 py-1 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="opacity-70">{t(I18nKey.FORM$DESCRIPTION)}</span>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="(optional)"
              className="bg-[#1f1f1f] border border-[#3a3a3a] rounded px-2 py-1 text-sm"
            />
          </label>
          <div className="flex flex-col gap-1">
            <span className="text-xs opacity-70">
              {t(I18nKey.LB_ROLES$PERMISSIONS)}
            </span>
            <LbPermissionPicker value={perms} onChange={setPerms} />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={async () => {
                try {
                  await lbApi(`/api/v1/lb/roles/${role.id}`, {
                    method: "PATCH",
                    json: { name, description: description || null },
                  });
                  await lbApi(`/api/v1/lb/roles/${role.id}/permissions`, {
                    method: "PUT",
                    json: { permissions: perms },
                  });
                  setEditing(false);
                  await reload();
                } catch (e) {
                  onError((e as Error).message);
                }
              }}
              className="text-xs px-3 py-1 rounded bg-[#FC6B0E] text-[#0D0F11] font-semibold"
            >
              {t(I18nKey.LB_ROLES$SAVE)}
            </button>
          </div>
        </div>
      ) : (
        <RoleReadOnlyView role={role} />
      )}
    </div>
  );
}

export default function RolesScreen() {
  const { t } = useTranslation();
  const [me, setMe] = React.useState<Me | null>(null);
  const [roles, setRoles] = React.useState<Role[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [showCreate, setShowCreate] = React.useState(false);

  const reload = React.useCallback(async () => {
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
    reload();
  }, [reload]);

  const canAdd = hasPerm(me, "roles:add");
  const canUpdate = hasPerm(me, "roles:update");

  return (
    <div className="flex flex-col gap-6 p-6 max-w-5xl">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{t(I18nKey.LB_ROLES$TITLE)}</h1>
        <p className="text-sm opacity-75">
          <Trans
            i18nKey={I18nKey.LB_ROLES$INTRO}
            components={{ code: <code /> }}
          />
        </p>
      </header>

      {error && (
        <div className="rounded border border-[#FF3B30] p-3 text-sm text-[#FF3B30] flex items-center justify-between">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-xs opacity-70 hover:opacity-100"
          >
            {t(I18nKey.LB_ROLES$DISMISS)}
          </button>
        </div>
      )}

      {roles === null ? (
        <p className="text-sm opacity-70">{t(I18nKey.LB_ROLES$LOADING)}</p>
      ) : (
        <section className="rounded-md border border-[#242424] p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold tracking-wide uppercase opacity-70">
              {t(I18nKey.LB_ROLES$HEADING, { total: roles.length })}
            </h2>
            {canAdd && (
              <button
                type="button"
                onClick={() => setShowCreate((v) => !v)}
                className="text-xs px-2 py-1 rounded bg-[#1f1f1f] border border-[#3a3a3a] hover:bg-[#2a2a2a]"
              >
                {showCreate
                  ? t(I18nKey.LB_ROLES$CANCEL)
                  : t(I18nKey.LB_ROLES$NEW_ROLE)}
              </button>
            )}
          </div>
          {showCreate && canAdd && (
            <CreateRoleForm
              onSubmit={async (name, description, permissions) => {
                try {
                  await lbApi("/api/v1/lb/roles", {
                    method: "POST",
                    json: { name, description, permissions },
                  });
                  setShowCreate(false);
                  await reload();
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            />
          )}
          <div className="flex flex-col gap-4">
            {roles.map((r) => (
              <RoleEditor
                key={r.id}
                role={r}
                canUpdate={canUpdate}
                reload={reload}
                onError={setError}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
