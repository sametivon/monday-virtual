import type {
  AnalyticsSummary,
  AttendanceReport,
  AuthTokens,
  AvatarConfig,
  BrandingDTO,
  BrandingUpdate,
  ChatHistoryQuery,
  ChatMessageBroadcast,
  CreateEventRequest,
  CreateObjectRequest,
  EventDTO,
  GdprErasureResult,
  HeatmapResponse,
  MeResponse,
  MediaTokenResponse,
  MemberDTO,
  UpdateEventRequest,
  MondayBoardData,
  MondayBoardSummary,
  RoleDTO,
  RoleKey,
  SceneObjectDTO,
  SpaceSummaryDTO,
  UpdateObjectRequest,
  UploadKind,
  UploadSignResponse,
  WhiteboardDrawOp,
  WorldManifest,
} from '@mvs/shared';
import { UPLOAD_LIMITS } from '@mvs/shared';
import { env } from './env';

/**
 * Thin typed fetch client for the control plane. Holds the access token in
 * memory (the iframe re-auths via the monday sessionToken on reload, so we
 * avoid persisting tokens to storage).
 */
class ApiClient {
  private accessToken: string | null = null;

  setToken(token: string | null) {
    this.accessToken = token;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${env.apiUrl}/api${path}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        ...(this.accessToken ? { authorization: `Bearer ${this.accessToken}` } : {}),
        ...(init.headers ?? {}),
      },
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`API ${path} failed (${res.status}): ${detail}`);
    }
    return (await res.json()) as T;
  }

  async authWithSession(
    sessionToken: string,
    profile?: { name: string; email?: string },
  ): Promise<AuthTokens> {
    const tokens = await this.request<AuthTokens>('/auth/session', {
      method: 'POST',
      body: JSON.stringify({ sessionToken, profile }),
    });
    this.setToken(tokens.accessToken);
    return tokens;
  }

  me(): Promise<MeResponse> {
    return this.request<MeResponse>('/me');
  }

  updateAvatar(config: AvatarConfig): Promise<AvatarConfig> {
    return this.request<AvatarConfig>('/me/avatar', {
      method: 'PATCH',
      body: JSON.stringify(config),
    });
  }

  spaces(): Promise<SpaceSummaryDTO[]> {
    return this.request<SpaceSummaryDTO[]>('/spaces');
  }

  manifest(spaceId: string): Promise<WorldManifest> {
    return this.request<WorldManifest>(`/spaces/${spaceId}`);
  }

  chatHistory(query: Partial<ChatHistoryQuery> & { scope: ChatHistoryQuery['scope'] }): Promise<ChatMessageBroadcast[]> {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null) params.set(k, String(v));
    }
    return this.request<ChatMessageBroadcast[]>(`/chat/history?${params.toString()}`);
  }

  mondayBoards(sessionToken: string): Promise<MondayBoardSummary[]> {
    return this.request<MondayBoardSummary[]>('/monday/boards/list', {
      method: 'POST',
      body: JSON.stringify({ sessionToken }),
    });
  }

  mondayBoardData(sessionToken: string, boardId: string): Promise<MondayBoardData> {
    return this.request<MondayBoardData>('/monday/board-data', {
      method: 'POST',
      body: JSON.stringify({ sessionToken, boardId }),
    });
  }

  updateBranding(update: BrandingUpdate): Promise<BrandingDTO> {
    return this.request<BrandingDTO>('/tenant/branding', {
      method: 'PATCH',
      body: JSON.stringify(update),
    });
  }

  whiteboardOps(objectId: string): Promise<WhiteboardDrawOp[]> {
    return this.request<WhiteboardDrawOp[]>(`/whiteboard/${objectId}/ops`);
  }

  pinBoard(spaceId: string, objectId: string, mondayBoardId: string): Promise<SceneObjectDTO> {
    return this.request<SceneObjectDTO>(`/spaces/${spaceId}/objects/${objectId}/board`, {
      method: 'PATCH',
      body: JSON.stringify({ mondayBoardId }),
    });
  }

  setDeck(spaceId: string, objectId: string, slides: string[]): Promise<SceneObjectDTO> {
    return this.request<SceneObjectDTO>(`/spaces/${spaceId}/objects/${objectId}/deck`, {
      method: 'PATCH',
      body: JSON.stringify({ slides }),
    });
  }

  // ── Scene editor ──────────────────────────────────────────────────────────
  createObject(spaceId: string, body: CreateObjectRequest): Promise<SceneObjectDTO> {
    return this.request<SceneObjectDTO>(`/spaces/${spaceId}/objects`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  updateObject(spaceId: string, objectId: string, patch: UpdateObjectRequest): Promise<SceneObjectDTO> {
    return this.request<SceneObjectDTO>(`/spaces/${spaceId}/objects/${objectId}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
  }

  deleteObject(spaceId: string, objectId: string): Promise<{ id: string }> {
    return this.request<{ id: string }>(`/spaces/${spaceId}/objects/${objectId}`, {
      method: 'DELETE',
    });
  }

  // ── RBAC ──────────────────────────────────────────────────────────────────
  rbacMembers(): Promise<MemberDTO[]> {
    return this.request<MemberDTO[]>('/rbac/members');
  }

  rbacRoles(): Promise<RoleDTO[]> {
    return this.request<RoleDTO[]>('/rbac/roles');
  }

  rbacAssign(userId: string, roleKey: RoleKey): Promise<MemberDTO> {
    return this.request<MemberDTO>('/rbac/assign', {
      method: 'POST',
      body: JSON.stringify({ userId, roleKey }),
    });
  }

  rbacUpdateRole(roleId: string, permissions: string[]): Promise<RoleDTO> {
    return this.request<RoleDTO>(`/rbac/roles/${roleId}`, {
      method: 'PATCH',
      body: JSON.stringify({ permissions }),
    });
  }

  rbacResetRole(roleId: string): Promise<RoleDTO> {
    return this.request<RoleDTO>(`/rbac/roles/${roleId}/reset`, { method: 'POST' });
  }

  // ── GDPR ──────────────────────────────────────────────────────────────────
  /** Download a user's full data export as a JSON file (USER_MANAGE). */
  async downloadGdprExport(userId: string): Promise<void> {
    const res = await fetch(`${env.apiUrl}/api/gdpr/users/${userId}/export.json`, {
      headers: this.accessToken ? { authorization: `Bearer ${this.accessToken}` } : {},
    });
    if (!res.ok) throw new Error(`Export failed (${res.status})`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gdpr-export-${userId}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  /** Erase a user (right to be forgotten). `confirm` must equal the userId. */
  eraseUser(userId: string): Promise<GdprErasureResult> {
    return this.request<GdprErasureResult>(`/gdpr/users/${userId}/erase`, {
      method: 'POST',
      body: JSON.stringify({ confirm: userId }),
    });
  }

  // ── Analytics ─────────────────────────────────────────────────────────────
  analyticsSummary(days = 7): Promise<AnalyticsSummary> {
    return this.request<AnalyticsSummary>(`/analytics/summary?days=${days}`);
  }

  analyticsHeatmap(days = 7, spaceId?: string): Promise<HeatmapResponse> {
    const params = new URLSearchParams({ days: String(days) });
    if (spaceId) params.set('spaceId', spaceId);
    return this.request<HeatmapResponse>(`/analytics/heatmap?${params.toString()}`);
  }

  // ── Events ────────────────────────────────────────────────────────────────
  events(): Promise<EventDTO[]> {
    return this.request<EventDTO[]>('/events');
  }

  createEvent(body: CreateEventRequest): Promise<EventDTO> {
    return this.request<EventDTO>('/events', { method: 'POST', body: JSON.stringify(body) });
  }

  updateEvent(id: string, body: UpdateEventRequest): Promise<EventDTO> {
    return this.request<EventDTO>(`/events/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
  }

  deleteEvent(id: string): Promise<{ id: string }> {
    return this.request<{ id: string }>(`/events/${id}`, { method: 'DELETE' });
  }

  registerEvent(id: string, on: boolean): Promise<EventDTO> {
    return this.request<EventDTO>(`/events/${id}/${on ? 'register' : 'unregister'}`, { method: 'POST' });
  }

  eventGoLive(id: string, live: boolean): Promise<EventDTO> {
    return this.request<EventDTO>(`/events/${id}/${live ? 'go-live' : 'end'}`, { method: 'POST' });
  }

  eventAttendance(id: string): Promise<AttendanceReport> {
    return this.request<AttendanceReport>(`/events/${id}/attendance`);
  }

  /**
   * Download an event's attendance CSV. The endpoint is auth-gated, so we can't
   * use a bare <a href> (it wouldn't carry the bearer token) — fetch the bytes
   * with the token, then trigger a client-side download of the blob.
   */
  async downloadEventAttendanceCsv(id: string, fallbackName = 'attendance'): Promise<void> {
    const res = await fetch(`${env.apiUrl}/api/events/${id}/attendance.csv`, {
      headers: this.accessToken ? { authorization: `Bearer ${this.accessToken}` } : {},
    });
    if (!res.ok) throw new Error(`Download failed (${res.status})`);
    const blob = await res.blob();
    const disposition = res.headers.get('content-disposition') ?? '';
    const match = /filename="?([^"]+)"?/.exec(disposition);
    const filename = match?.[1] ?? `${fallbackName}.csv`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  /**
   * Upload a file via presigned S3 PUT: ask the API to sign, upload the bytes
   * straight to the bucket (never through the API), return the public URL.
   * Pre-validates size/type client-side against the shared limits.
   */
  async uploadAsset(kind: UploadKind, file: File): Promise<string> {
    const limits = UPLOAD_LIMITS[kind];
    if (!limits.mime.test(file.type)) throw new Error(`Unsupported file type: ${file.type || 'unknown'}`);
    if (file.size > limits.maxBytes) {
      throw new Error(`File too large (max ${Math.round(limits.maxBytes / 1024 / 1024)}MB)`);
    }
    const signed = await this.request<UploadSignResponse>('/uploads/sign', {
      method: 'POST',
      body: JSON.stringify({ kind, contentType: file.type, size: file.size }),
    });
    const put = await fetch(signed.putUrl, { method: 'PUT', headers: signed.headers, body: file });
    if (!put.ok) throw new Error(`Upload failed (${put.status})`);
    return signed.publicUrl;
  }

  mediaToken(spaceId: string, roomKey?: string): Promise<MediaTokenResponse> {
    return this.request<MediaTokenResponse>('/media/token', {
      method: 'POST',
      body: JSON.stringify({ spaceId, roomKey, publish: true }),
    });
  }

  get token() {
    return this.accessToken;
  }
}

export const api = new ApiClient();

// Dev-only test hook: the api client is a singleton, so exposing it lets
// browser tests drive control-plane calls from any page (launcher included).
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  (window as unknown as { __api?: unknown }).__api = api;
}
