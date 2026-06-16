import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import {
  CreateObjectRequestSchema,
  Permission,
  PinBoardRequestSchema,
  SlideDeckSchema,
  UpdateObjectRequestSchema,
  type CreateObjectRequest,
  type PinBoardRequest,
  type SceneObjectDTO,
  type SlideDeck,
  type SpaceSummaryDTO,
  type UpdateObjectRequest,
  type WorldManifest,
} from '@mvs/shared';
import { CurrentUser, type RequestUser } from '../../common/auth/current-user.decorator';
import { RequirePermissions } from '../../common/auth/permissions.decorator';
import { ZodBody } from '../../common/pipes/zod-validation.pipe';
import { SpacesService } from './spaces.service';

@Controller('spaces')
export class SpacesController {
  constructor(private readonly spaces: SpacesService) {}

  @RequirePermissions(Permission.SPACE_VIEW)
  @Get()
  list(@CurrentUser() user: RequestUser): Promise<SpaceSummaryDTO[]> {
    return this.spaces.list(user.tenantId);
  }

  @RequirePermissions(Permission.SPACE_VIEW)
  @Get(':id')
  manifest(@CurrentUser() user: RequestUser, @Param('id') id: string): Promise<WorldManifest> {
    return this.spaces.manifest(user.tenantId, id);
  }

  /** Scene authoring: bind a monday board to an in-world dashboard panel. */
  @RequirePermissions(Permission.SPACE_EDIT)
  @Patch(':id/objects/:objectId/board')
  pinBoard(
    @CurrentUser() user: RequestUser,
    @Param('id') spaceId: string,
    @Param('objectId') objectId: string,
    @Body(new ZodBody(PinBoardRequestSchema)) body: PinBoardRequest,
  ): Promise<SceneObjectDTO> {
    return this.spaces.pinBoard(user.tenantId, spaceId, objectId, body.mondayBoardId);
  }

  /** Bind a slide deck (uploaded image URLs) to an in-world SCREEN object. */
  @RequirePermissions(Permission.PRESENT)
  @Patch(':id/objects/:objectId/deck')
  setDeck(
    @CurrentUser() user: RequestUser,
    @Param('id') spaceId: string,
    @Param('objectId') objectId: string,
    @Body(new ZodBody(SlideDeckSchema)) body: SlideDeck,
  ): Promise<SceneObjectDTO> {
    return this.spaces.setDeck(user.tenantId, spaceId, objectId, body.slides);
  }

  /** Scene editor: add a new object to a space. */
  @RequirePermissions(Permission.SPACE_EDIT)
  @Post(':id/objects')
  createObject(
    @CurrentUser() user: RequestUser,
    @Param('id') spaceId: string,
    @Body(new ZodBody(CreateObjectRequestSchema)) body: CreateObjectRequest,
  ): Promise<SceneObjectDTO> {
    return this.spaces.createObject(user.tenantId, spaceId, body);
  }

  /** Scene editor: move/rotate/scale or re-configure an object. */
  @RequirePermissions(Permission.SPACE_EDIT)
  @Patch(':id/objects/:objectId')
  updateObject(
    @CurrentUser() user: RequestUser,
    @Param('id') spaceId: string,
    @Param('objectId') objectId: string,
    @Body(new ZodBody(UpdateObjectRequestSchema)) body: UpdateObjectRequest,
  ): Promise<SceneObjectDTO> {
    return this.spaces.updateObject(user.tenantId, spaceId, objectId, body);
  }

  /** Scene editor: delete an object. */
  @RequirePermissions(Permission.SPACE_EDIT)
  @Delete(':id/objects/:objectId')
  deleteObject(
    @CurrentUser() user: RequestUser,
    @Param('id') spaceId: string,
    @Param('objectId') objectId: string,
  ): Promise<{ id: string }> {
    return this.spaces.deleteObject(user.tenantId, spaceId, objectId);
  }
}
