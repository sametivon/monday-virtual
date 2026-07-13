import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type Redis from 'ioredis';
import {
  ObjectInteractionSchema,
  ObjectType,
  SceneConfigSchema,
  SceneObjectSchema,
  normalizeBrandingPalette,
  TransformSchema,
  WorldManifestSchema,
  type ObjectConfig,
  type SceneObjectDTO,
  type SpaceSummaryDTO,
  type WorldManifest,
} from '@mvs/shared';
import type { Prisma } from '@mvs/db';
import { PrismaService } from '../../common/prisma/prisma.service';
import { REDIS } from '../../common/redis/redis.module';

@Injectable()
export class SpacesService {
  private readonly logger = new Logger(SpacesService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  /** Published spaces for the tenant with live occupancy. */
  async list(tenantId: string): Promise<SpaceSummaryDTO[]> {
    const spaces = await this.prisma
      .forTenant(tenantId)
      .space.findMany({ where: { isPublished: true }, orderBy: { createdAt: 'asc' } });

    return Promise.all(
      spaces.map(async (s) => ({
        id: s.id,
        name: s.name,
        type: s.type,
        isPublished: s.isPublished,
        capacity: s.capacity,
        occupancy: await this.occupancy(tenantId, s.id),
      })),
    );
  }

  /** The full world manifest the engine renders. */
  async manifest(tenantId: string, spaceId: string): Promise<WorldManifest> {
    const space = await this.prisma
      .forTenant(tenantId)
      .space.findFirst({ where: { id: spaceId }, include: { objects: true } });
    if (!space) throw new NotFoundException('Space not found');

    const scene = SceneConfigSchema.parse(space.sceneConfig ?? {});
    await this.applyBrandTheme(tenantId, scene);

    // Validate each object independently and DROP invalid ones rather than
    // 500-ing the whole space: the scene editor can persist an object whose
    // config isn't yet complete (e.g. a Portal with no target), and one bad
    // object must never blank out everyone else's world.
    const objects = space.objects.flatMap((o) => {
      const parsed = SceneObjectSchema.safeParse({
        id: o.id,
        type: o.type,
        transform: o.transform ?? {},
        config: o.config,
        interaction: o.interaction ?? undefined,
      });
      if (!parsed.success) {
        this.logger.warn(`Dropping invalid object ${o.id} (${o.type}) from manifest: ${parsed.error.issues[0]?.message}`);
        return [];
      }
      return [parsed.data];
    });

    return WorldManifestSchema.parse({
      spaceId: space.id,
      spaceType: space.type,
      name: space.name,
      scene,
      objects,
    });
  }

  /** Bind a monday board to a DASHBOARD object (scene authoring, Phase 2). */
  async pinBoard(
    tenantId: string,
    spaceId: string,
    objectId: string,
    mondayBoardId: string,
  ): Promise<SceneObjectDTO> {
    const object = await this.prisma
      .forTenant(tenantId)
      .sceneObject.findFirst({ where: { id: objectId, spaceId, type: ObjectType.DASHBOARD } });
    if (!object) throw new NotFoundException('Dashboard object not found');

    const config = { ...(object.config as object), mondayBoardId };
    const updated = await this.prisma.raw.sceneObject.update({
      where: { id: object.id },
      data: { config: config as Prisma.InputJsonValue },
    });

    return {
      id: updated.id,
      type: updated.type,
      transform: TransformSchema.parse(updated.transform ?? {}),
      config: updated.config as ObjectConfig,
      interaction: updated.interaction
        ? ObjectInteractionSchema.parse(updated.interaction)
        : undefined,
    };
  }

  /**
   * Bind a slide deck (image URLs) to a SCREEN object so the in-world screen
   * can show slides; live advancing flows over the `slide:goto` socket event,
   * while the deck + starting index persist here for late joiners.
   */
  async setDeck(
    tenantId: string,
    spaceId: string,
    objectId: string,
    slides: string[],
  ): Promise<SceneObjectDTO> {
    const object = await this.prisma
      .forTenant(tenantId)
      .sceneObject.findFirst({ where: { id: objectId, spaceId, type: ObjectType.SCREEN } });
    if (!object) throw new NotFoundException('Screen object not found');

    const config = { ...(object.config as object), slides, slideIndex: 0 };
    const updated = await this.prisma.raw.sceneObject.update({
      where: { id: object.id },
      data: { config: config as Prisma.InputJsonValue },
    });

    return {
      id: updated.id,
      type: updated.type,
      transform: TransformSchema.parse(updated.transform ?? {}),
      config: updated.config as ObjectConfig,
      interaction: updated.interaction
        ? ObjectInteractionSchema.parse(updated.interaction)
        : undefined,
    };
  }

  /**
   * Scene editor: create a new object in a space. Transform/config default to
   * sane empties so a dropped object always renders at the space origin.
   */
  async createObject(
    tenantId: string,
    spaceId: string,
    input: {
      type: ObjectType;
      transform?: unknown;
      config?: Record<string, unknown>;
      interaction?: unknown;
    },
  ): Promise<SceneObjectDTO> {
    const space = await this.prisma.forTenant(tenantId).space.findFirst({ where: { id: spaceId } });
    if (!space) throw new NotFoundException('Space not found');

    // Merge caller config over per-type defaults so a palette drop is always
    // manifest-valid (required fields like portal target / table roomKey filled).
    const config = { ...this.defaultConfigFor(input.type, spaceId), ...(input.config ?? {}) };

    const created = await this.prisma.raw.sceneObject.create({
      data: {
        tenantId,
        spaceId,
        type: input.type,
        transform: (input.transform ?? {}) as Prisma.InputJsonValue,
        config: config as Prisma.InputJsonValue,
        interaction: (input.interaction ?? this.defaultInteractionFor(input.type)) as
          | Prisma.InputJsonValue
          | undefined,
      },
    });
    return this.toDto(created);
  }

  /** Scene editor: patch an object's transform/config/interaction. */
  async updateObject(
    tenantId: string,
    spaceId: string,
    objectId: string,
    patch: { transform?: unknown; config?: Record<string, unknown>; interaction?: unknown },
  ): Promise<SceneObjectDTO> {
    const object = await this.prisma
      .forTenant(tenantId)
      .sceneObject.findFirst({ where: { id: objectId, spaceId } });
    if (!object) throw new NotFoundException('Object not found');

    const data: Prisma.SceneObjectUpdateInput = {};
    if (patch.transform !== undefined) data.transform = patch.transform as Prisma.InputJsonValue;
    if (patch.config !== undefined) {
      // Merge so a transform-only move never drops label/board/deck config.
      data.config = { ...(object.config as object), ...patch.config } as Prisma.InputJsonValue;
    }
    if (patch.interaction !== undefined) {
      data.interaction = patch.interaction as Prisma.InputJsonValue;
    }

    const updated = await this.prisma.raw.sceneObject.update({ where: { id: object.id }, data });
    return this.toDto(updated);
  }

  /** Scene editor: remove an object from a space. */
  async deleteObject(tenantId: string, spaceId: string, objectId: string): Promise<{ id: string }> {
    const object = await this.prisma
      .forTenant(tenantId)
      .sceneObject.findFirst({ where: { id: objectId, spaceId } });
    if (!object) throw new NotFoundException('Object not found');
    await this.prisma.raw.sceneObject.delete({ where: { id: object.id } });
    return { id: object.id };
  }

  /** Per-type config defaults so a freshly-dropped object is manifest-valid. */
  private defaultConfigFor(type: ObjectType, spaceId: string): Record<string, unknown> {
    const base = { type, label: this.defaultLabelFor(type) };
    switch (type) {
      case ObjectType.PORTAL:
        // Self-target until rebound — valid and harmless (teleports in place).
        return { ...base, targetSpaceId: spaceId };
      case ObjectType.MEETING_TABLE:
        return { ...base, capacity: 6, roomKey: `table-${Math.random().toString(36).slice(2, 8)}` };
      case ObjectType.DASHBOARD:
        return { ...base, mondayBoardId: 'demo-board-1', vizType: 'kpi', refreshSeconds: 60 };
      case ObjectType.LINK:
        return { ...base, url: 'https://monday.com', openIn: 'newTab' };
      case ObjectType.VIDEO:
        return { ...base, videoUrl: 'https://example.com/video.mp4' };
      case ObjectType.SCREEN:
        return { ...base, source: 'screenshare' };
      default:
        return base; // SCREEN/WHITEBOARD/CHAIR/DESK have all-optional configs
    }
  }

  private defaultLabelFor(type: ObjectType): string {
    const map: Partial<Record<ObjectType, string>> = {
      [ObjectType.SCREEN]: 'Screen',
      [ObjectType.WHITEBOARD]: 'Whiteboard',
      [ObjectType.DASHBOARD]: 'Board',
      [ObjectType.MEETING_TABLE]: 'Meeting',
      [ObjectType.PORTAL]: 'Portal',
      [ObjectType.LINK]: 'Link',
      [ObjectType.VIDEO]: 'Video',
    };
    return map[type] ?? type;
  }

  /** Default click behaviour so new objects are interactive like seeded ones. */
  private defaultInteractionFor(type: ObjectType): Record<string, unknown> | undefined {
    switch (type) {
      case ObjectType.WHITEBOARD:
        return { onClick: 'open', permissionsRequired: ['whiteboard:edit'] };
      case ObjectType.DASHBOARD:
        return { onClick: 'openBoard', permissionsRequired: ['monday:read'] };
      case ObjectType.SCREEN:
        return { onClick: 'open', permissionsRequired: [] };
      case ObjectType.MEETING_TABLE:
        return { onClick: 'joinTable', permissionsRequired: ['media:publish'] };
      case ObjectType.CHAIR:
        return { onClick: 'sit', permissionsRequired: [] };
      case ObjectType.PORTAL:
        return { onClick: 'teleport', permissionsRequired: [] };
      case ObjectType.LINK:
        return { onClick: 'openLink', permissionsRequired: [] };
      default:
        return undefined;
    }
  }

  /**
   * Per-tenant scene theming: recolor the scene's accent (trim/glow/portal/
   * stage lip) from the tenant's branding accent, unless the scene opts out
   * (interior.themeFromBranding === false). Mutates the parsed scene in place.
   */
  private async applyBrandTheme(tenantId: string, scene: { environment: { interior?: { accentColor: string; themeFromBranding: boolean } } }): Promise<void> {
    const interior = scene.environment.interior;
    if (!interior || !interior.themeFromBranding) return;
    const branding = await this.prisma
      .forTenant(tenantId)
      .branding.findFirst({ where: { tenantId } });
    const accent = normalizeBrandingPalette(branding?.palette).accent;
    if (accent) interior.accentColor = accent;
  }

  /** Map a Prisma SceneObject row to the wire DTO. */
  private toDto(o: {
    id: string;
    type: ObjectType;
    transform: unknown;
    config: unknown;
    interaction: unknown;
  }): SceneObjectDTO {
    return {
      id: o.id,
      type: o.type,
      transform: TransformSchema.parse(o.transform ?? {}),
      config: o.config as ObjectConfig,
      interaction: o.interaction ? ObjectInteractionSchema.parse(o.interaction) : undefined,
    };
  }

  /** Presence count from the realtime gateway's Redis hash (0 if absent). */
  private async occupancy(tenantId: string, spaceId: string): Promise<number> {
    try {
      return await this.redis.hlen(`presence:${tenantId}:${spaceId}`);
    } catch {
      return 0;
    }
  }
}
