'use client';

import { useEffect, useState } from 'react';
import {
  Permission,
  RoleKey,
  type MemberDTO,
  type RoleDTO,
} from '@mvs/shared';
import { api } from '@/lib/api';
import { useSessionStore } from '@/stores/sessionStore';

const ROLE_OPTIONS = Object.values(RoleKey).filter((k) => k !== RoleKey.SUPER_ADMIN);

/** Grouped permission catalog for the role editor (label + the catalog value). */
const PERMISSION_GROUPS: { group: string; perms: { key: string; label: string }[] }[] = [
  {
    group: 'Spaces',
    perms: [
      { key: Permission.SPACE_VIEW, label: 'View spaces' },
      { key: Permission.SPACE_CREATE, label: 'Create spaces' },
      { key: Permission.SPACE_EDIT, label: 'Edit scenes' },
      { key: Permission.SPACE_DELETE, label: 'Delete spaces' },
      { key: Permission.SPACE_PUBLISH, label: 'Publish spaces' },
    ],
  },
  {
    group: 'Collaboration',
    perms: [
      { key: Permission.PRESENCE_JOIN, label: 'Join presence' },
      { key: Permission.CHAT_SEND, label: 'Send chat' },
      { key: Permission.CHAT_MODERATE, label: 'Moderate chat' },
      { key: Permission.WHITEBOARD_EDIT, label: 'Edit whiteboard' },
      { key: Permission.MONDAY_READ, label: 'View boards' },
      { key: Permission.MONDAY_BIND, label: 'Bind boards' },
      { key: Permission.AI_USE, label: 'Use AI' },
    ],
  },
  {
    group: 'Media & Stage',
    perms: [
      { key: Permission.MEDIA_PUBLISH, label: 'Share mic/cam/screen' },
      { key: Permission.MEDIA_MODERATE, label: 'Moderate media' },
      { key: Permission.PRESENT, label: 'Present (stage/slides)' },
      { key: Permission.STAGE_INVITE, label: 'Invite to stage' },
    ],
  },
  {
    group: 'Administration',
    perms: [
      { key: Permission.TENANT_MANAGE, label: 'Manage workspace' },
      { key: Permission.BRANDING_EDIT, label: 'Edit branding' },
      { key: Permission.USER_MANAGE, label: 'Manage members' },
      { key: Permission.ROLE_MANAGE, label: 'Manage roles' },
      { key: Permission.ANALYTICS_VIEW, label: 'View analytics' },
      { key: Permission.EVENT_CREATE, label: 'Create events' },
      { key: Permission.EVENT_MANAGE, label: 'Manage events' },
    ],
  },
];

/**
 * Team & roles admin (USER_MANAGE / ROLE_MANAGE). Members tab reassigns each
 * member's role; Roles tab toggles a role's permissions. Changes take effect on
 * the affected users' next request (auth re-reads role permissions).
 */
export function TeamSettings() {
  const me = useSessionStore((s) => s.me);
  const [open, setOpen] = useState(false);

  const canManageUsers = me?.permissions.includes(Permission.USER_MANAGE) ?? false;
  if (!canManageUsers) return null;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg border border-white/10 bg-brand-surface px-4 py-2 text-sm transition hover:border-brand-primary"
      >
        👥 Team & roles
      </button>
    );
  }
  return <TeamModal onClose={() => setOpen(false)} />;
}

function TeamModal({ onClose }: { onClose: () => void }) {
  const me = useSessionStore((s) => s.me);
  const canManageRoles = me?.permissions.includes(Permission.ROLE_MANAGE) ?? false;
  const [tab, setTab] = useState<'members' | 'roles'>('members');
  const [members, setMembers] = useState<MemberDTO[] | null>(null);
  const [roles, setRoles] = useState<RoleDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [erasing, setErasing] = useState<MemberDTO | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([api.rbacMembers(), api.rbacRoles()])
      .then(([m, r]) => {
        setMembers(m);
        setRoles(r);
      })
      .catch((e) => setError((e as Error).message));
  }, []);

  const assign = async (userId: string, roleKey: RoleKey) => {
    setBusyId(userId);
    setError(null);
    try {
      const updated = await api.rbacAssign(userId, roleKey);
      setMembers((prev) => prev?.map((m) => (m.id === userId ? updated : m)) ?? null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const togglePerm = async (role: RoleDTO, perm: string, on: boolean) => {
    const next = on ? [...role.permissions, perm] : role.permissions.filter((p) => p !== perm);
    setBusyId(role.id);
    setError(null);
    try {
      const updated = await api.rbacUpdateRole(role.id, next);
      setRoles((prev) => prev?.map((r) => (r.id === role.id ? updated : r)) ?? null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const exportData = async (userId: string) => {
    setBusyId(userId);
    setError(null);
    setNotice(null);
    try {
      await api.downloadGdprExport(userId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const confirmErase = async (member: MemberDTO) => {
    setBusyId(member.id);
    setError(null);
    setNotice(null);
    try {
      const res = await api.eraseUser(member.id);
      // Drop the erased member from the roster (it's now an anonymized tombstone).
      setMembers((prev) => prev?.filter((m) => m.id !== member.id) ?? null);
      const r = res.removed;
      setNotice(
        `Erased. Removed ${r.sessions} sessions, ${r.directMessages} DMs; anonymized ${r.chatMessagesAnonymized} messages, detached ${r.analyticsEventsDetached} analytics events.`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
      setErasing(null);
    }
  };

  const resetRole = async (role: RoleDTO) => {
    setBusyId(role.id);
    setError(null);
    try {
      const updated = await api.rbacResetRole(role.id);
      setRoles((prev) => prev?.map((r) => (r.id === role.id ? updated : r)) ?? null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl border border-white/10 bg-brand-surface"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 p-4">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">Team &amp; roles</h2>
            <div className="ml-3 flex gap-1 rounded-lg bg-white/5 p-1 text-xs">
              <Tab active={tab === 'members'} onClick={() => setTab('members')}>Members</Tab>
              <Tab
                active={tab === 'roles'}
                onClick={() => setTab('roles')}
                disabled={!canManageRoles}
                title={canManageRoles ? undefined : 'Requires Manage roles'}
              >
                Roles
              </Tab>
            </div>
          </div>
          <button onClick={onClose} className="text-white/60 hover:text-white">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {error && <p className="mb-3 text-sm text-red-400">⚠️ {error}</p>}
          {notice && <p className="mb-3 text-sm text-emerald-400">✓ {notice}</p>}

          {tab === 'members' && (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-xs uppercase text-white/40">
                  <th className="py-2 pr-3">Member</th>
                  <th className="py-2 pr-3">Role</th>
                  <th className="py-2 pr-3">Data</th>
                </tr>
              </thead>
              <tbody>
                {members?.map((m) => (
                  <tr key={m.id} className="border-b border-white/5">
                    <td className="py-2 pr-3">
                      <div className="font-medium">{m.name}</div>
                      <div className="text-xs text-white/40">{m.email}</div>
                    </td>
                    <td className="py-2 pr-3">
                      <select
                        value={m.roleKey}
                        disabled={busyId === m.id || m.id === me?.user.id}
                        title={m.id === me?.user.id ? "You can't change your own role" : undefined}
                        onChange={(e) => void assign(m.id, e.target.value as RoleKey)}
                        className="rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-sm outline-none focus:border-brand-primary disabled:opacity-50"
                      >
                        {ROLE_OPTIONS.map((r) => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 pr-3">
                      <div className="flex gap-1">
                        <button
                          disabled={busyId === m.id}
                          onClick={() => void exportData(m.id)}
                          title="Download this member's data (GDPR export)"
                          className="rounded px-2 py-1 text-xs text-white/50 transition hover:text-white disabled:opacity-50"
                        >
                          ⬇ Export
                        </button>
                        <button
                          disabled={busyId === m.id || m.id === me?.user.id}
                          onClick={() => setErasing(m)}
                          title={m.id === me?.user.id ? "You can't erase yourself" : 'Erase (right to be forgotten)'}
                          className="rounded px-2 py-1 text-xs text-red-400/70 transition hover:text-red-400 disabled:opacity-30"
                        >
                          Erase
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {members?.length === 0 && (
                  <tr><td colSpan={3} className="py-6 text-center text-white/40">No members yet.</td></tr>
                )}
              </tbody>
            </table>
          )}

          {tab === 'roles' && canManageRoles && (
            <RoleEditor roles={roles} busyId={busyId} onToggle={togglePerm} onReset={resetRole} />
          )}
        </div>
      </div>

      {erasing && (
        <EraseConfirm
          member={erasing}
          busy={busyId === erasing.id}
          onCancel={() => setErasing(null)}
          onConfirm={() => void confirmErase(erasing)}
        />
      )}
    </div>
  );
}

/** Irreversible-erase confirmation: type the member's name to enable the button. */
function EraseConfirm({
  member,
  busy,
  onCancel,
  onConfirm,
}: {
  member: MemberDTO;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [typed, setTyped] = useState('');
  const armed = typed.trim() === member.name.trim();
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4" onClick={onCancel}>
      <div
        className="w-full max-w-md rounded-2xl border border-red-500/30 bg-brand-surface p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold text-red-400">Erase {member.name}?</h3>
        <p className="mt-2 text-sm text-white/60">
          This permanently anonymizes the member and deletes their sessions and direct messages.
          Aggregate analytics are kept but detached from their identity. This cannot be undone.
        </p>
        <p className="mt-3 text-xs text-white/50">
          Type <span className="font-semibold text-white/80">{member.name}</span> to confirm:
        </p>
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoFocus
          className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-red-500"
        />
        <div className="mt-4 flex gap-2">
          <button
            disabled={!armed || busy}
            onClick={onConfirm}
            className="flex-1 rounded-lg bg-red-600/80 py-2 text-sm font-semibold transition hover:bg-red-600 disabled:opacity-40"
          >
            {busy ? 'Erasing…' : 'Erase permanently'}
          </button>
          <button onClick={onCancel} className="rounded-lg bg-white/10 px-4 py-2 text-sm transition hover:bg-white/20">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function RoleEditor({
  roles,
  busyId,
  onToggle,
  onReset,
}: {
  roles: RoleDTO[] | null;
  busyId: string | null;
  onToggle: (role: RoleDTO, perm: string, on: boolean) => void;
  onReset: (role: RoleDTO) => void;
}) {
  const editable = (roles ?? []).filter((r) => r.key !== RoleKey.SUPER_ADMIN);
  const [activeKey, setActiveKey] = useState<RoleKey>(RoleKey.MEMBER);
  const role = editable.find((r) => r.key === activeKey) ?? editable[0];
  if (!role) return <p className="text-sm text-white/40">No roles.</p>;

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1">
        {editable.map((r) => (
          <button
            key={r.id}
            onClick={() => setActiveKey(r.key)}
            className={`rounded-lg px-3 py-1 text-xs transition ${
              role.id === r.id ? 'bg-brand-primary' : 'bg-white/10 hover:bg-white/20'
            }`}
          >
            {r.key}
          </button>
        ))}
      </div>

      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm text-white/60">{role.permissions.length} permissions</span>
        <button
          onClick={() => onReset(role)}
          disabled={busyId === role.id}
          className="rounded-lg bg-white/10 px-3 py-1 text-xs transition hover:bg-white/20 disabled:opacity-50"
        >
          Reset to defaults
        </button>
      </div>

      {PERMISSION_GROUPS.map((g) => (
        <div key={g.group} className="mb-4">
          <div className="mb-1 text-xs uppercase tracking-wide text-white/40">{g.group}</div>
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {g.perms.map((p) => {
              const on = role.permissions.includes(p.key);
              return (
                <label
                  key={p.key}
                  className="flex cursor-pointer items-center gap-2 rounded-lg bg-white/5 px-3 py-1.5 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={busyId === role.id}
                    onChange={(e) => onToggle(role, p.key, e.target.checked)}
                  />
                  {p.label}
                </label>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function Tab({
  active,
  onClick,
  disabled,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`rounded-md px-3 py-1 transition ${
        active ? 'bg-brand-primary' : 'text-white/60 hover:text-white'
      } disabled:opacity-40`}
    >
      {children}
    </button>
  );
}
