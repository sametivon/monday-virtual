'use client';

import { useEffect, useState } from 'react';
import {
  CalendarDays,
  CalendarOff,
  Check,
  Download,
  Mic,
  Pencil,
  Play,
  Plus,
  Square,
  Trash2,
} from 'lucide-react';
import {
  EventStatus,
  EventType,
  Permission,
  type EventDTO,
  type SpaceSummaryDTO,
} from '@mvs/shared';
import { api } from '@/lib/api';
import { useSessionStore } from '@/stores/sessionStore';
import { Button, EmptyState, IconButton, Modal, Spinner, Tooltip } from '@/ui/primitives';

const STATUS_STYLE: Record<string, string> = {
  SCHEDULED: 'bg-brand-primary/10 text-brand-primary',
  LIVE: 'bg-danger text-white',
  ENDED: 'bg-line/8 text-brand-text/55',
  CANCELLED: 'bg-warning/10 text-warning',
};

/** Events launcher button → modal. Everyone sees events; admins author, presenters go live. */
export function EventsPanel() {
  const me = useSessionStore((s) => s.me);
  const [open, setOpen] = useState(false);
  if (!me) return null;

  if (!open) {
    return (
      <Button variant="ghost" icon={CalendarDays} onClick={() => setOpen(true)}>
        Events
      </Button>
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
    <Modal
      title="Events"
      size="md"
      onClose={onClose}
      headerExtra={
        canCreate ? (
          <Button variant="accent" size="sm" icon={Plus} onClick={() => setEditing('new')}>
            New event
          </Button>
        ) : undefined
      }
    >
      <div className="p-5">
        {error && <p className="mb-3 text-sm text-danger">{error}</p>}
        {events === null && (
          <div className="flex justify-center py-12">
            <Spinner size={20} />
          </div>
        )}
        {events?.length === 0 && (
          <EmptyState
            icon={CalendarOff}
            title="No events scheduled"
            body="Company events show up here — town halls, conferences, workshops."
          />
        )}

        <div className="flex flex-col gap-3">
          {events?.map((ev) => (
            <div key={ev.id} className="rounded-md border border-line/10 bg-brand-surface p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium text-brand-text">{ev.title}</span>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATUS_STYLE[ev.status]}`}
                    >
                      {ev.status === EventStatus.LIVE && (
                        <span
                          className="h-1.5 w-1.5 animate-pulse rounded-full bg-white"
                          aria-hidden="true"
                        />
                      )}
                      {ev.status}
                    </span>
                  </div>
                  <div className="mt-0.5 text-xs text-brand-text/55">
                    {ev.type} · {fmt(ev.startsAt)} · {ev.registeredCount} registered
                  </div>
                  {ev.speakers.length > 0 && (
                    <div className="mt-1 inline-flex items-center gap-1.5 text-xs text-brand-text/55">
                      <Mic size={12} strokeWidth={1.75} aria-hidden="true" />
                      {ev.speakers.map((s) => s.name).join(', ')}
                    </div>
                  )}
                  {ev.agenda.length > 0 && (
                    <ul className="mt-2 space-y-0.5 text-xs text-brand-text/60">
                      {ev.agenda.map((a, i) => (
                        <li key={i}>
                          {new Date(a.startsAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}{' '}
                          — {a.title}
                          {a.speaker ? ` (${a.speaker})` : ''}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  {ev.status !== EventStatus.ENDED && ev.status !== EventStatus.CANCELLED && (
                    <Button
                      variant={ev.registered ? 'accent' : 'ghost'}
                      size="sm"
                      icon={ev.registered ? Check : undefined}
                      disabled={busyId === ev.id}
                      onClick={() => void act(ev.id, () => api.registerEvent(ev.id, !ev.registered))}
                    >
                      {ev.registered ? 'Registered' : 'Register'}
                    </Button>
                  )}
                  {ev.attended && (
                    <span className="text-[10px] font-medium uppercase tracking-wide text-success">
                      Attended
                    </span>
                  )}
                  {canPresent && ev.status !== EventStatus.ENDED && (
                    <Button
                      variant={ev.status === EventStatus.LIVE ? 'ghost' : 'accent'}
                      size="sm"
                      icon={ev.status === EventStatus.LIVE ? Square : Play}
                      disabled={busyId === ev.id}
                      onClick={() =>
                        void act(ev.id, () => api.eventGoLive(ev.id, ev.status !== EventStatus.LIVE))
                      }
                    >
                      {ev.status === EventStatus.LIVE ? 'End' : 'Go live'}
                    </Button>
                  )}
                  {canManage && (
                    <div className="flex items-center gap-0.5">
                      <Tooltip label="Edit event">
                        <IconButton
                          icon={Pencil}
                          aria-label="Edit event"
                          variant="subtle"
                          size="sm"
                          onClick={() => setEditing(ev)}
                        />
                      </Tooltip>
                      {ev.registeredCount > 0 && (
                        <Tooltip label="Download attendance CSV">
                          <IconButton
                            icon={Download}
                            aria-label="Download attendance CSV"
                            variant="subtle"
                            size="sm"
                            disabled={busyId === ev.id}
                            onClick={() =>
                              void act(ev.id, async () => {
                                await api.downloadEventAttendanceCsv(ev.id, ev.title);
                                return { id: ev.id };
                              })
                            }
                          />
                        </Tooltip>
                      )}
                      <Tooltip label="Delete event">
                        <IconButton
                          icon={Trash2}
                          aria-label="Delete event"
                          variant="subtle"
                          size="sm"
                          className="text-danger hover:text-danger"
                          disabled={busyId === ev.id}
                          onClick={() => void act(ev.id, () => api.deleteEvent(ev.id))}
                        />
                      </Tooltip>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Modal>
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
    <Modal title={event ? 'Edit event' : 'New event'} size="sm" onClose={onClose}>
      <div className="space-y-3 p-5 text-sm">
        {error && <p className="text-sm text-danger">{error}</p>}
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
      <div className="flex gap-2 border-t border-line/8 p-4">
        <Button
          variant="accent"
          className="flex-1"
          loading={saving}
          disabled={!title.trim()}
          onClick={() => void save()}
        >
          Save event
        </Button>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </Modal>
  );
}

const inputCls =
  'w-full rounded-md border border-line/15 bg-brand-bg px-3 py-2 text-sm text-brand-text placeholder:text-brand-text/40 focus:border-brand-primary focus:outline-none';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-brand-text/60">{label}</span>
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
