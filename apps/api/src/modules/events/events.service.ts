import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AgendaItemSchema,
  EventStatus,
  SpeakerSchema,
  type AgendaItem,
  type AttendanceReport,
  type CreateEventRequest,
  type EventDTO,
  type EventType,
  type Speaker,
  type UpdateEventRequest,
} from '@mvs/shared';
import type { Prisma } from '@mvs/db';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Event mode (Phase 3): scheduled conferences/workshops/town-halls/trainings
 * that run in an auditorium space. Admins author events (agenda + speakers),
 * members register, presenters flip them LIVE, and attendance is auto-marked
 * when a registered user joins the event's space while it is LIVE
 * (markAttendance, called from the realtime gateway).
 */
@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, userId: string): Promise<EventDTO[]> {
    const events = await this.prisma
      .forTenant(tenantId)
      .event.findMany({ orderBy: { startsAt: 'asc' }, include: { registrations: true } });
    return events.map((e) => this.toDto(e, userId));
  }

  async create(tenantId: string, input: CreateEventRequest): Promise<EventDTO> {
    if (new Date(input.endsAt) <= new Date(input.startsAt)) {
      throw new BadRequestException('endsAt must be after startsAt');
    }
    if (input.spaceId) await this.assertSpace(tenantId, input.spaceId);

    const created = await this.prisma.raw.event.create({
      data: {
        tenantId,
        type: input.type as EventType,
        title: input.title,
        startsAt: new Date(input.startsAt),
        endsAt: new Date(input.endsAt),
        spaceId: input.spaceId ?? null,
        agenda: (input.agenda ?? []) as Prisma.InputJsonValue,
        speakers: (input.speakers ?? []) as Prisma.InputJsonValue,
        status: EventStatus.SCHEDULED,
      },
      include: { registrations: true },
    });
    return this.toDto(created, '');
  }

  async update(tenantId: string, eventId: string, patch: UpdateEventRequest): Promise<EventDTO> {
    const event = await this.find(tenantId, eventId);
    if (patch.spaceId) await this.assertSpace(tenantId, patch.spaceId);
    const startsAt = patch.startsAt ? new Date(patch.startsAt) : event.startsAt;
    const endsAt = patch.endsAt ? new Date(patch.endsAt) : event.endsAt;
    if (endsAt <= startsAt) throw new BadRequestException('endsAt must be after startsAt');

    const updated = await this.prisma.raw.event.update({
      where: { id: event.id },
      data: {
        type: (patch.type ?? event.type) as EventType,
        title: patch.title ?? event.title,
        startsAt,
        endsAt,
        spaceId: patch.spaceId === undefined ? event.spaceId : patch.spaceId,
        agenda: (patch.agenda ?? (event.agenda as unknown[]) ?? []) as Prisma.InputJsonValue,
        speakers: (patch.speakers ?? (event.speakers as unknown[]) ?? []) as Prisma.InputJsonValue,
      },
      include: { registrations: true },
    });
    return this.toDto(updated, '');
  }

  async remove(tenantId: string, eventId: string): Promise<{ id: string }> {
    const event = await this.find(tenantId, eventId);
    await this.prisma.raw.event.delete({ where: { id: event.id } });
    return { id: event.id };
  }

  /** Member RSVP — idempotent (upsert on the unique (eventId, userId)). */
  async register(tenantId: string, eventId: string, userId: string): Promise<EventDTO> {
    const event = await this.find(tenantId, eventId);
    if (event.status === EventStatus.ENDED || event.status === EventStatus.CANCELLED) {
      throw new BadRequestException('Event is no longer open for registration');
    }
    await this.prisma.raw.eventRegistration.upsert({
      where: { eventId_userId: { eventId: event.id, userId } },
      update: {},
      create: { tenantId, eventId: event.id, userId },
    });
    return this.toDto(await this.findWithRegs(tenantId, eventId), userId);
  }

  async unregister(tenantId: string, eventId: string, userId: string): Promise<EventDTO> {
    const event = await this.find(tenantId, eventId);
    await this.prisma.raw.eventRegistration.deleteMany({ where: { eventId: event.id, userId } });
    return this.toDto(await this.findWithRegs(tenantId, eventId), userId);
  }

  /** Presenter flips an event LIVE (or back). Only one transition path each. */
  async setStatus(tenantId: string, eventId: string, status: EventStatus): Promise<EventDTO> {
    const event = await this.find(tenantId, eventId);
    const updated = await this.prisma.raw.event.update({
      where: { id: event.id },
      data: { status },
      include: { registrations: true },
    });
    return this.toDto(updated, '');
  }

  /**
   * Auto-attendance: when a user joins a space, mark them attended on any LIVE
   * event bound to that space. Registers them on the fly if they weren't (a
   * walk-in still counts as attendance). Called fire-and-forget from realtime.
   */
  async markAttendance(tenantId: string, spaceId: string, userId: string): Promise<void> {
    const live = await this.prisma
      .forTenant(tenantId)
      .event.findFirst({ where: { spaceId, status: EventStatus.LIVE } });
    if (!live) return;
    await this.prisma.raw.eventRegistration.upsert({
      where: { eventId_userId: { eventId: live.id, userId } },
      update: { attended: true },
      create: { tenantId, eventId: live.id, userId, attended: true },
    });
  }

  /**
   * Attendance report for one event: every registrant with their RSVP time and
   * whether they actually attended (joined the bound space while LIVE). Powers
   * the admin export (JSON + CSV) and ties into GDPR record-keeping.
   */
  async attendanceReport(tenantId: string, eventId: string): Promise<AttendanceReport> {
    const event = await this.prisma.forTenant(tenantId).event.findFirst({
      where: { id: eventId },
      include: { registrations: { include: { user: true }, orderBy: { registeredAt: 'asc' } } },
    });
    if (!event) throw new NotFoundException('Event not found');

    const rows = event.registrations.map((r) => ({
      userId: r.userId,
      name: r.user?.name ?? 'Unknown',
      email: r.user?.email ?? '',
      registeredAt: r.registeredAt.toISOString(),
      attended: r.attended,
    }));
    return {
      eventId: event.id,
      eventTitle: event.title,
      startsAt: event.startsAt.toISOString(),
      registeredCount: rows.length,
      attendedCount: rows.filter((r) => r.attended).length,
      rows,
    };
  }

  /** Render an attendance report as RFC-4180 CSV bytes (one row per registrant). */
  attendanceCsv(report: AttendanceReport): string {
    const header = ['Name', 'Email', 'Registered At', 'Attended'];
    const lines = [header, ...report.rows.map((r) => [r.name, r.email, r.registeredAt, r.attended ? 'yes' : 'no'])];
    return lines.map((cols) => cols.map(csvCell).join(',')).join('\r\n');
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  private async find(tenantId: string, eventId: string) {
    const event = await this.prisma.forTenant(tenantId).event.findFirst({ where: { id: eventId } });
    if (!event) throw new NotFoundException('Event not found');
    return event;
  }

  private async findWithRegs(tenantId: string, eventId: string) {
    const event = await this.prisma
      .forTenant(tenantId)
      .event.findFirst({ where: { id: eventId }, include: { registrations: true } });
    if (!event) throw new NotFoundException('Event not found');
    return event;
  }

  private async assertSpace(tenantId: string, spaceId: string) {
    const space = await this.prisma.forTenant(tenantId).space.findFirst({ where: { id: spaceId } });
    if (!space) throw new BadRequestException('Bound space not found');
  }

  private toDto(
    e: {
      id: string;
      type: string;
      title: string;
      startsAt: Date;
      endsAt: Date;
      status: string;
      spaceId: string | null;
      agenda: unknown;
      speakers: unknown;
      registrations?: { userId: string; attended: boolean }[];
    },
    userId: string,
  ): EventDTO {
    const regs = e.registrations ?? [];
    const mine = regs.find((r) => r.userId === userId);
    // Tolerate hand-edited JSON: parse defensively, drop bad rows.
    const agenda = (Array.isArray(e.agenda) ? e.agenda : [])
      .map((a) => AgendaItemSchema.safeParse(a))
      .flatMap((r) => (r.success ? [r.data] : [])) as AgendaItem[];
    const speakers = (Array.isArray(e.speakers) ? e.speakers : [])
      .map((s) => SpeakerSchema.safeParse(s))
      .flatMap((r) => (r.success ? [r.data] : [])) as Speaker[];
    return {
      id: e.id,
      type: e.type as EventType,
      title: e.title,
      startsAt: e.startsAt.toISOString(),
      endsAt: e.endsAt.toISOString(),
      status: e.status as EventStatus,
      spaceId: e.spaceId,
      agenda,
      speakers,
      registeredCount: regs.length,
      registered: Boolean(mine),
      attended: Boolean(mine?.attended),
    };
  }
}

/** Quote a CSV field if it contains a comma, quote, or newline (RFC 4180). */
function csvCell(value: string): string {
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}
