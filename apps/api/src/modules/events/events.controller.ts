import { Body, Controller, Delete, Get, Param, Patch, Post, Res } from '@nestjs/common';
import type { CsvResponse } from '../../common/http/csv-response';
import {
  CreateEventRequestSchema,
  EventStatus,
  Permission,
  UpdateEventRequestSchema,
  type AttendanceReport,
  type CreateEventRequest,
  type EventDTO,
  type UpdateEventRequest,
} from '@mvs/shared';
import { CurrentUser, type RequestUser } from '../../common/auth/current-user.decorator';
import { RequirePermissions } from '../../common/auth/permissions.decorator';
import { ZodBody } from '../../common/pipes/zod-validation.pipe';
import { EventsService } from './events.service';

@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @RequirePermissions(Permission.SPACE_VIEW)
  @Get()
  list(@CurrentUser() user: RequestUser): Promise<EventDTO[]> {
    return this.events.list(user.tenantId, user.sub);
  }

  @RequirePermissions(Permission.EVENT_CREATE)
  @Post()
  create(
    @CurrentUser() user: RequestUser,
    @Body(new ZodBody(CreateEventRequestSchema)) body: CreateEventRequest,
  ): Promise<EventDTO> {
    return this.events.create(user.tenantId, body);
  }

  @RequirePermissions(Permission.EVENT_MANAGE)
  @Patch(':id')
  update(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body(new ZodBody(UpdateEventRequestSchema)) body: UpdateEventRequest,
  ): Promise<EventDTO> {
    return this.events.update(user.tenantId, id, body);
  }

  @RequirePermissions(Permission.EVENT_MANAGE)
  @Delete(':id')
  remove(@CurrentUser() user: RequestUser, @Param('id') id: string): Promise<{ id: string }> {
    return this.events.remove(user.tenantId, id);
  }

  @RequirePermissions(Permission.SPACE_VIEW)
  @Post(':id/register')
  register(@CurrentUser() user: RequestUser, @Param('id') id: string): Promise<EventDTO> {
    return this.events.register(user.tenantId, id, user.sub);
  }

  @RequirePermissions(Permission.SPACE_VIEW)
  @Post(':id/unregister')
  unregister(@CurrentUser() user: RequestUser, @Param('id') id: string): Promise<EventDTO> {
    return this.events.unregister(user.tenantId, id, user.sub);
  }

  /** Presenter flips the event LIVE so attendance auto-marks on join. */
  @RequirePermissions(Permission.PRESENT)
  @Post(':id/go-live')
  goLive(@CurrentUser() user: RequestUser, @Param('id') id: string): Promise<EventDTO> {
    return this.events.setStatus(user.tenantId, id, EventStatus.LIVE);
  }

  @RequirePermissions(Permission.PRESENT)
  @Post(':id/end')
  end(@CurrentUser() user: RequestUser, @Param('id') id: string): Promise<EventDTO> {
    return this.events.setStatus(user.tenantId, id, EventStatus.ENDED);
  }

  /** Attendance report (registrants + who attended) as structured JSON. */
  @RequirePermissions(Permission.EVENT_MANAGE)
  @Get(':id/attendance')
  attendance(@CurrentUser() user: RequestUser, @Param('id') id: string): Promise<AttendanceReport> {
    return this.events.attendanceReport(user.tenantId, id);
  }

  /** Same report as a downloadable CSV (one row per registrant). */
  @RequirePermissions(Permission.EVENT_MANAGE)
  @Get(':id/attendance.csv')
  async attendanceCsv(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Res() res: CsvResponse,
  ): Promise<void> {
    const report = await this.events.attendanceReport(user.tenantId, id);
    const csv = this.events.attendanceCsv(report);
    const safeName = report.eventTitle.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'event';
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="attendance-${safeName}.csv"`);
    res.send(csv);
  }
}
