import React from "react";
import { Trans } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import {
  ACTION_LABELS,
  PERMISSION_CATALOG,
  permString,
} from "#/lib/lb-permissions";

// LeapBuilder M11 — structured permission picker. Renders a grid of
// resource × action checkboxes. The currently-selected set is the
// caller-supplied `value` array of permission strings; toggling a
// checkbox calls onChange with the new full array.
//
// Permissions not represented in the catalog (e.g. forward-compat
// strings authored by API directly) are preserved via the optional
// `extras` field so editing a role never silently drops grants.

export interface LbPermissionPickerProps {
  value: string[];
  onChange: (next: string[]) => void;
  readOnly?: boolean;
}

export function LbPermissionPicker({
  value,
  onChange,
  readOnly,
}: LbPermissionPickerProps) {
  const selected = React.useMemo(() => new Set(value), [value]);

  // Carry forward any permission strings that aren't in the catalog
  // (e.g. older grants, free-form strings created via API).
  const known = React.useMemo(() => {
    const s = new Set<string>();
    for (const r of PERMISSION_CATALOG)
      for (const a of r.actions) s.add(permString(r.key, a));
    return s;
  }, []);
  const extras = value.filter((p) => !known.has(p));

  function toggle(p: string) {
    const next = new Set(selected);
    if (next.has(p)) next.delete(p);
    else next.add(p);
    // Preserve original order of in-catalog perms + tack on extras
    const ordered: string[] = [];
    for (const r of PERMISSION_CATALOG)
      for (const a of r.actions) {
        const k = permString(r.key, a);
        if (next.has(k)) ordered.push(k);
      }
    for (const e of extras) ordered.push(e);
    onChange(ordered);
  }

  return (
    <div className="flex flex-col gap-2">
      {PERMISSION_CATALOG.map((res) => (
        <div
          key={res.key}
          className="flex flex-wrap items-center gap-x-4 gap-y-1"
        >
          <span className="text-xs font-semibold w-28 shrink-0">
            {res.label}:
          </span>
          {res.actions.map((act) => {
            const p = permString(res.key, act);
            return (
              <label
                key={act}
                className="flex items-center gap-1.5 text-xs cursor-pointer select-none"
              >
                <input
                  type="checkbox"
                  checked={selected.has(p)}
                  disabled={readOnly}
                  onChange={() => toggle(p)}
                />
                <span>{ACTION_LABELS[act]}</span>
              </label>
            );
          })}
        </div>
      ))}
      {extras.length > 0 && (
        <div className="text-[11px] opacity-60 mt-1">
          <Trans
            i18nKey={I18nKey.LB_PERMISSIONS$EXTRAS}
            values={{ extras: extras.join(", ") }}
            components={{ code: <code /> }}
            tOptions={{ interpolation: { escapeValue: false } }}
          />
        </div>
      )}
    </div>
  );
}
