'use client';

import { useEffect, useState } from 'react';
import {
  EventStatus,
  EventType,
  Permission,
  type EventDTO,
  type SpaceSummaryDTO,
} from '@mvs/shared';
import { api } from '@/lib/api';
import { useSessionStore } from '@/stores/sessionStore';

const STATUS_STYLE: Record<string, string> = {
  SCHEDULED: 'bg-white/10 text-white/70',
  LIVE: 'bg-red-500/80 text-white',
  ENDED: 'bg-white/5 text-white/40',
  CANCELLED: 'bg-white/5 text-white/40',
};

/** Events launcher button → modal. Everyone sees events; admins author, presenters go live. */
export function EventsPanel() {
  const me = useSessionStore((s) => s.me);
  const [open, setOpen] = useState(false);
  if (!me) return null;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg border border-white/10 bg-brand-surface px-4 py-2 text-sm transition hover:border-brand-primary"
      >
        📅 Events
      </button>
    );
  }
  return <EventsModal onClose={() => setOpen(false)} />;
}

function EventsModal({ onClose }: { onClose: () => void }) {
  const me = useSessionStore((s) => s.me);
  const canCreate = me?.permissions.includes(Permission.EVENT_CREATE) ?? false;
  const canManage = me?.permissions.includes(Permission.EVENT_MANAGE) ?? false;
  const canPresent = me?.permissions.includes(Permission.PRESENT) ?? false;

  const [events, setEvents] = useState<EventDTO[] | null>(null);
  const [spaces, setSpaces] = useState<SpaceSummaryDTO[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<EventDTO | 'new' | null>(null);

  const load = () =>
    api
      .events()
      .then(setEvents)
      .catch((e) => setError((e as Error).message));

  useEffect(() => {
    void load();
    void api.spaces().then(setSpaces).catch(() => undefined);
  }, []);

  const act = async (id: string, fn: () => Promise<EventDTO | { id: string }>) => {
    setBusyId(id);
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  if (editing) {
    return (
      <EventEditor
        event={editing === 'new' ? null : editing}
        spaces={spaces}
        onClose={() => setEditing(null)}
        onSaved={async () => {
          setEditing(null);
          await load();
        }}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl border border-white/10 bg-brand-surface"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 p-4">
          <h2 className="text-lg font-semibold">📅 Events</h2>
          <div className="flex items-center gap-2">
            {canCreate && (
              <button
                onClick={() => setEditing('new')}
                className="rounded-lg bg-brand-primary px-3 py-1.5 text-sm transition hover:opacity-90"
              >
                + New event
              </button>
            )}
            <button onClick={onClose} className="text-white/60 hover:text-white">✕</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {error && <p className="mb-3 text-sm text-red-400">⚠️ {error}</p>}
          {events === null && <p className="py-10 text-center text-sm text-white/50">Loading…</p>}
          {events?.length === 0 && <p className="py-10 text-center text-sm text-white/40">No events scheduled.</p>}

          <div className="flex flex-col gap-3">
            {events?.map((ev) => (
              <div key={ev.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-semibold">{ev.title}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase ${STATUS_STYLE[ev.status]}`}>
                        {ev.status}
                      </span>
                    </div>
                    <div className="text-xs text-white/50">
                      {ev.type} · {fmt(ev.startsAt)} · {ev.registeredCount} registered
                    </div>
                    {ev.speakers.length > 0 && (
                      <div className="mt-1 text-xs text-white/40">
                        🎤 {ev.speakers.map((s) => s.name).join(', ')}
                      </div>
                    )}
                    {ev.agenda.length > 0 && (
                      <ul className="mt-2 space-y-0.5 text-xs text-white/60">
                        {ev.agenda.map((a, i) => (
                          <li key={i}>
                            • {new Date(a.startsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} — {a.title}
                            {a.speaker ? ` (${a.speaker})` : ''}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {ev.status !== EventStatus.ENDED && ev.status !== EventStatus.CANCELLED && (
                      <button
                        disabled={busyId === ev.id}
                        onClick={() => void act(ev.id, () => api.registerEvent(ev.id, !ev.registered))}
                        className={`rounded-lg px-3 py-1 text-xs transition disabled:opacity-50 ${
                          ev.registered ? 'bg-brand-primary' : 'bg-white/10 hover:bg-white/20'
                        }`}
                      >
                        {ev.registered ? '✓ Registered' : 'Register'}
                      </button>
                    )}
                    {ev.attended && <span className="text-[10px] text-emerald-400">attended</span>}
                    {canPresent && ev.status !== EventStatus.ENDED && (
                      <button
                        disabled={busyId === ev.id}
                        onClick={() => void act(ev.id, () => api.eventGoLive(ev.id, ev.status !== EventStatus.LIVE))}
                        className={`rounded-lg px-3 py-1 text-xs transition disabled:opacity-50 ${
                          ev.status === EventStatus.LIVE ? 'bg-red-500/80' : 'bg-emerald-600/70 hover:bg-emerald-600'
                        }`}
                      >
                        {ev.status === EventStatus.LIVE ? '■ End' : '▶ Go live'}
                      </button>
                    )}
                    {canManage && (
                      <div className="flex gap-1">
                        <button
                          onClick={() => setEditing(ev)}
                          className="rounded px-2 py-1 text-xs text-white/50 transition hover:text-white"
                        >
                          Edit
                        </button>
                        {ev.registeredCount > 0 && (
                          <button
                            disabled={busyId === ev.id}
                            onClick={() =>
                              void act(ev.id, async () => {
                                await api.downloadEventAttendanceCsv(ev.id, ev.title);
                                return { id: ev.id };
                              })
                            }
                            title="Download attendance CSV"
                            className="rounded px-2 py-1 text-xs text-white/50 transition hover:text-white"
                          >
                            ⬇ CSV
                          </button>
                        )}
                        <button
                          disabled={busyId === ev.id}
                          onClick={() => void act(ev.id, () => api.deleteEvent(ev.id))}
                          className="rounded px-2 py-1 text-xs text-red-400/70 transition hover:text-red-400"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function EventEditor({
  event,
  spaces,
  onClose,
  onSaved,
}: {
  event: EventDTO | null;
  spaces: SpaceSummaryDTO[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const auditorium = spaces.find((s) => s.type === 'AUDITORIUM');
  const [title, setTitle] = useState(event?.title ?? '');
  const [type, setType] = useState<EventType>(event?.type ?? EventType.CONFERENCE);
  const [spaceId, setSpaceId] = useState(event?.spaceId ?? auditorium?.id ?? '');
  const [startsAt, setStartsAt] = useState(toLocalInput(event?.startsAt));
  const [endsAt, setEndsAt] = useState(toLocalInput(event?.endsAt, 60));
  const [speakers, setSpeakers] = useState(event?.speakers.map((s) => s.name).join(', ') ?? '');
  const [agenda, setAgenda] = useState(
    event?.agenda.map((a) => `${new Date(a.startsAt).toISOString()}|${a.durationMinutes}|${a.title}${a.speaker ? `|${a.speaker}` : ''}`).join('\n') ?? '',
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const body = {
        type,
        title: title.trim(),
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
        spaceId: spaceId || undefined,
        speakers: speakers
          .split(',')
          .map((n) => n.trim())
          .filter(Boolean)
          .map((name) => ({ name })),
        agenda: agenda
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => {
            const [iso, dur, t, sp] = line.split('|');
            return { startsAt: new Date(iso!).toISOString(), durationMinutes: Number(dur) || 30, title: (t ?? '').trim(), speaker: sp?.trim() || undefined };
          }),
      };
      if (event) await api.updateEvent(event.id, body);
      else await api.createEvent(body);
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl border border-white/10 bg-brand-surface"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 p-4">
          <h2 className="text-lg font-semibold">{event ? 'Edit event' : 'New event'}</h2>
          <button onClick={onClose} className="text-white/60 hover:text-white">✕</button>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto p-4 text-sm">
          {error && <p className="text-red-400">⚠️ {error}</p>}
          <Field label="Title">
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} className={inputCls} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <select value={type} onChange={(e) => setType(e.target.value as EventType)} className={inputCls}>
                {Object.values(EventType).map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </Field>
            <Field label="Space (auditorium)">
              <select value={spaceId} onChange={(e) => setSpaceId(e.target.value)} className={inputCls}>
                <option value="">(none)</option>
                {spaces.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Starts">
              <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Ends">
              <input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className={inputCls} />
            </Field>
          </div>
          <Field label="Speakers (comma-separated)">
            <input value={speakers} onChange={(e) => setSpeakers(e.target.value)} placeholder="Ada Lovelace, Alan Turing" className={inputCls} />
          </Field>
          <Field label="Agenda (one per line: ISO-time|minutes|title|speaker?)">
            <textarea
              value={agenda}
              onChange={(e) => setAgenda(e.target.value)}
              rows={4}
              placeholder={`2026-06-20T15:00:00Z|30|Welcome|Ada\n2026-06-20T15:30:00Z|45|Keynote|Alan`}
              className={`${inputCls} resize-none font-mono text-xs`}
            />
          </Field>
        </div>
        <div className="flex gap-2 border-t border-white/10 p-4">
          <button
            onClick={() => void save()}
            disabled={saving || !title.trim()}
            className="flex-1 rounded-lg bg-brand-primary py-2 font-semibold transition hover:opacity-90 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save event'}
          </button>
          <button onClick={onClose} className="rounded-lg bg-white/10 px-4 py-2 transition hover:bg-white/20">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

const inputCls =
  'w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 outline-none focus:border-brand-primary';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-white/60">{label}</span>
      {children}
    </label>
  );
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** ISO → value for <input type=datetime-local> (local tz, no seconds). */
function toLocalInput(iso?: string, addMinutes = 0): string {
  const d = iso ? new Date(iso) : new Date(Date.now() + addMinutes * 60000);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}
