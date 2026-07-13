'use client';

import { useEffect, useState } from 'react';
import { Download, RotateCcw, Trash2, Users } from 'lucide-react';
import {
  Permission,
  RoleKey,
  type MemberDTO,
  type RoleDTO,
} from '@mvs/shared';
import { api } from '@/lib/api';
import { useSessionStore } from '@/stores/sessionStore';
import { Button, IconButton, Modal, Spinner, Tooltip, toast } from '@/ui/primitives';

const ROLE_OPTIONS = Object.values(RoleKey).filter((k) => k !== RoleKey.SUPER_ADMIN);

const inputCls =
  'rounded-md border border-line/15 bg-brand-bg px-3 py-2 text-sm text-brand-text placeholder:text-brand-text/40 focus:border-brand-primary focus:outline-none';

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
      <Button variant="ghost" icon={Users} onClick={() => setOpen(true)}>
        Team &amp; roles
      </Button>
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
    try {
      const res = await api.eraseUser(member.id);
      // Drop the erased member from the roster (it's now an anonymized tombstone).
      setMembers((prev) => prev?.filter((m) => m.id !== member.id) ?? null);
      const r = res.removed;
      toast.success(
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
    <Modal
      title="Team & roles"
      size="md"
      onClose={onClose}
      headerExtra={
        <div className="flex gap-0.5 rounded-md bg-brand-bg p-0.5 text-xs">
          <Tab active={tab === 'members'} onClick={() => setTab('members')}>
            Members
          </Tab>
          <Tab
            active={tab === 'roles'}
            onClick={() => setTab('roles')}
            disabled={!canManageRoles}
            tooltip={canManageRoles ? undefined : 'Requires Manage roles'}
          >
            Roles
          </Tab>
        </div>
      }
    >
      <div className="p-5">
        {error && <p className="mb-3 text-sm text-danger">{error}</p>}

        {tab === 'members' && members === null && !error && (
          <div className="flex justify-center py-12">
            <Spinner size={20} />
          </div>
        )}

        {tab === 'members' && members !== null && (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line/10 text-[11px] uppercase tracking-wide text-brand-text/55">
                <th className="py-2 pr-3 font-medium">Member</th>
                <th className="py-2 pr-3 font-medium">Role</th>
                <th className="py-2 pr-3 font-medium">Data</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} className="border-b border-line/8">
                  <td className="py-2.5 pr-3">
                    <div className="font-medium text-brand-text">{m.name}</div>
                    <div className="text-xs text-brand-text/55">{m.email}</div>
                  </td>
                  <td className="py-2.5 pr-3">
                    <Tooltip
                      label={m.id === me?.user.id ? "You can't change your own role" : 'Change role'}
                    >
                      <select
                        value={m.roleKey}
                        disabled={busyId === m.id || m.id === me?.user.id}
                        onChange={(e) => void assign(m.id, e.target.value as RoleKey)}
                        className={`${inputCls} px-2 py-1 disabled:opacity-50`}
                      >
                        {ROLE_OPTIONS.map((r) => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                    </Tooltip>
                  </td>
                  <td className="py-2.5 pr-3">
                    <div className="flex items-center gap-0.5">
                      <Tooltip label="Download this member's data (GDPR export)">
                        <IconButton
                          icon={Download}
                          aria-label="Download this member's data (GDPR export)"
                          variant="subtle"
                          size="sm"
                          disabled={busyId === m.id}
                          onClick={() => void exportData(m.id)}
                        />
                      </Tooltip>
                      <Tooltip
                        label={
                          m.id === me?.user.id
                            ? "You can't erase yourself"
                            : 'Erase (right to be forgotten)'
                        }
                      >
                        <IconButton
                          icon={Trash2}
                          aria-label="Erase member (right to be forgotten)"
                          variant="subtle"
                          size="sm"
                          className="text-danger hover:text-danger disabled:opacity-30"
                          disabled={busyId === m.id || m.id === me?.user.id}
                          onClick={() => setErasing(m)}
                        />
                      </Tooltip>
                    </div>
                  </td>
                </tr>
              ))}
              {members.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-6 text-center text-brand-text/55">
                    No members yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}

        {tab === 'roles' && canManageRoles && (
          <RoleEditor roles={roles} busyId={busyId} onToggle={togglePerm} onReset={resetRole} />
        )}
      </div>

      {erasing && (
        <EraseConfirm
          member={erasing}
          busy={busyId === erasing.id}
          onCancel={() => setErasing(null)}
          onConfirm={() => void confirmErase(erasing)}
        />
      )}
    </Modal>
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
    <Modal
      title={<span className="text-danger">Erase {member.name}?</span>}
      size="sm"
      onClose={onCancel}
    >
      <div className="p-5">
        <p className="text-sm text-brand-text/60">
          This permanently anonymizes the member and deletes their sessions and direct messages.
          Aggregate analytics are kept but detached from their identity. This cannot be undone.
        </p>
        <p className="mt-3 text-xs text-brand-text/55">
          Type <span className="font-semibold text-brand-text/75">{member.name}</span> to confirm:
        </p>
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoFocus
          className={`mt-1.5 w-full ${inputCls}`}
        />
        <div className="mt-4 flex gap-2">
          <Button
            variant="danger"
            className="flex-1"
            disabled={!armed}
            loading={busy}
            onClick={onConfirm}
          >
            Erase permanently
          </Button>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
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
  if (!role) return <p className="text-sm text-brand-text/55">No roles.</p>;

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1">
        {editable.map((r) => (
          <button
            key={r.id}
            onClick={() => setActiveKey(r.key)}
            className={`rounded-sm px-3 py-1 text-xs font-medium transition ${
              role.id === r.id
                ? 'bg-brand-primary text-white shadow-e1'
                : 'bg-line/8 text-brand-text/70 hover:bg-line/12 hover:text-brand-text'
            }`}
          >
            {r.key}
          </button>
        ))}
      </div>

      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm text-brand-text/60">{role.permissions.length} permissions</span>
        <Button
          variant="subtle"
          size="sm"
          icon={RotateCcw}
          disabled={busyId === role.id}
          onClick={() => onReset(role)}
        >
          Reset to defaults
        </Button>
      </div>

      {PERMISSION_GROUPS.map((g) => (
        <div key={g.group} className="mb-4">
          <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-brand-text/55">
            {g.group}
          </div>
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {g.perms.map((p) => {
              const on = role.permissions.includes(p.key);
              return (
                <label
                  key={p.key}
                  className="flex cursor-pointer items-center gap-2 rounded-sm bg-brand-bg px-3 py-1.5 text-sm text-brand-text"
                >
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={busyId === role.id}
                    onChange={(e) => onToggle(role, p.key, e.target.checked)}
                    style={{ accentColor: 'var(--brand-primary)' }}
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
  tooltip,
  children,
}: {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  tooltip?: string;
  children: React.ReactNode;
}) {
  const btn = (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-sm px-3 py-1 font-medium transition ${
        active
          ? 'bg-brand-surface text-brand-text shadow-e1'
          : 'text-brand-text/60 hover:text-brand-text'
      } disabled:opacity-40`}
    >
      {children}
    </button>
  );
  return tooltip ? <Tooltip label={tooltip}>{btn}</Tooltip> : btn;
}
