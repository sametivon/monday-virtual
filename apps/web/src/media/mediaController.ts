'use client';

import {
  LocalTrackPublication,
  Participant,
  RemoteTrack,
  RemoteTrackPublication,
  Room,
  RoomEvent,
  Track,
} from 'livekit-client';
import { create } from 'zustand';
import type { SceneConfig } from '@mvs/shared';
import { api } from '@/lib/api';
import { SpatialAudioGraph } from './spatialAudio';

export type MediaMode = 'off' | 'connecting' | 'space' | 'table';

interface MediaUiState {
  mode: MediaMode;
  tableLabel: string | null;
  micEnabled: boolean;
  camEnabled: boolean;
  screenEnabled: boolean;
  /** Remote participants in the current voice room. */
  voiceCount: number;
  /** Bumped whenever the video tile set changes (tiles re-read the map). */
  tilesVersion: number;
  error: string | null;
  /** Transient user-facing notice (e.g. screen share blocked in the iframe). */
  notice: string | null;
}

export const useMediaStore = create<MediaUiState>(() => ({
  mode: 'off',
  tableLabel: null,
  micEnabled: false,
  camEnabled: false,
  screenEnabled: false,
  voiceCount: 0,
  tilesVersion: 0,
  error: null,
  notice: null,
}));

export interface VideoTile {
  key: string;
  participantName: string;
  kind: 'camera' | 'screen';
  local: boolean;
  track: Track;
}

/**
 * Media plane controller (M4). Owns the LiveKit Room: proximity voice in the
 * space-wide room (spatialized via SpatialAudioGraph), or a meeting-table
 * sub-room at full volume with camera + screen-share. The client never sees
 * LiveKit secrets — the api mints a scoped, TTL'd token per room
 * (ARCHITECTURE: media plane).
 */
class MediaController {
  private room: Room | null = null;
  private spatial: SpatialAudioGraph | null = null;
  private spaceId: string | null = null;
  /**
   * Connection intents are serialized through a queue, and each captures a
   * generation at call time: when it finally runs, a stale intent is skipped
   * BEFORE joining. Two live joins with the same identity make LiveKit kick
   * the older one — which is exactly what React StrictMode's double-effects
   * would trigger if we let superseded connects proceed.
   */
  private generation = 0;
  private queue: Promise<unknown> = Promise.resolve();
  readonly tiles = new Map<string, VideoTile>();

  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = () => fn();
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => undefined);
    return p;
  }

  /** Join the space-wide proximity-voice room (listen-only until mic on). */
  async joinSpace(
    spaceId: string,
    audioConfig: SceneConfig['spatialAudio'],
    stage?: SceneConfig['stage'],
  ): Promise<void> {
    const gen = ++this.generation;
    this.spaceId = spaceId;
    this.spatial?.dispose();
    this.spatial = new SpatialAudioGraph(audioConfig, stage);
    await this.enqueue(() => this.connect(gen, undefined));
  }

  /** Switch to a meeting-table sub-room: full volume, video + screen allowed. */
  async joinTable(roomKey: string, label: string): Promise<void> {
    const gen = ++this.generation;
    this.spatial?.setSpatial(false);
    await this.enqueue(() => this.connect(gen, roomKey, label));
  }

  /** Back to space-wide proximity voice. */
  async leaveTable(): Promise<void> {
    const gen = ++this.generation;
    this.spatial?.setSpatial(true);
    await this.enqueue(() => this.connect(gen, undefined));
  }

  async toggleMic(): Promise<void> {
    if (!this.room) return;
    const next = !this.room.localParticipant.isMicrophoneEnabled;
    await this.room.localParticipant.setMicrophoneEnabled(next);
    useMediaStore.setState({ micEnabled: next });
  }

  async toggleCamera(): Promise<void> {
    if (!this.room) return;
    const next = !this.room.localParticipant.isCameraEnabled;
    await this.room.localParticipant.setCameraEnabled(next);
    useMediaStore.setState({ camEnabled: next });
  }

  async toggleScreenShare(): Promise<void> {
    if (!this.room) return;
    const next = !this.room.localParticipant.isScreenShareEnabled;
    try {
      await this.room.localParticipant.setScreenShareEnabled(next);
      useMediaStore.setState({ screenEnabled: next });
    } catch (err) {
      // monday's iframe doesn't grant the display-capture permission, so
      // getDisplayMedia is structurally blocked in-frame — offer the pop-out.
      const message = (err as Error).message ?? '';
      const blocked = /display-capture|permissions policy|NotAllowed/i.test(message);
      useMediaStore.setState({
        notice: blocked
          ? 'Screen sharing is blocked inside monday.com — use "↗ Pop out" (top right) to share from a full tab.'
          : `Screen share failed: ${message}`,
      });
      setTimeout(() => useMediaStore.setState({ notice: null }), 8000);
    }
  }

  /** Leaving the space page tears the whole media plane down. */
  async dispose(): Promise<void> {
    this.generation++;
    this.spaceId = null;
    this.spatial?.dispose();
    this.spatial = null;
    await this.enqueue(async () => {
      const room = this.room;
      this.room = null;
      this.tiles.clear();
      useMediaStore.setState({
        mode: 'off',
        tableLabel: null,
        micEnabled: false,
        camEnabled: false,
        screenEnabled: false,
        voiceCount: 0,
        error: null,
      });
      await room?.disconnect();
    });
  }

  /** Current spatial gains, for tests/debugging. */
  debugGains(): Record<string, number> {
    return this.spatial?.debugGains() ?? {};
  }

  private async connect(gen: number, roomKey: string | undefined, tableLabel?: string): Promise<void> {
    // A newer intent arrived while we were queued — never join at all.
    if (gen !== this.generation || !this.spaceId) return;
    useMediaStore.setState({ mode: 'connecting', error: null });

    // Tear down the previous room (keeps the spatial graph); an open mic
    // follows the user across rooms.
    const keepMicOn = this.room?.localParticipant.isMicrophoneEnabled ?? false;
    if (this.room) {
      const old = this.room;
      this.room = null;
      this.tiles.clear();
      this.bumpTiles();
      await old.disconnect();
    }

    try {
      const { url, token } = await api.mediaToken(this.spaceId, roomKey);
      // adaptiveStream must stay OFF: it pauses remote video that isn't
      // attached to a visible DOM element, and screen shares render as WebGL
      // textures on in-world screens (no DOM element). Dynacast still saves
      // publisher bandwidth for unsubscribed layers.
      const room = new Room({ adaptiveStream: false, dynacast: true });

      room
        .on(RoomEvent.TrackSubscribed, this.onTrackSubscribed)
        .on(RoomEvent.TrackUnsubscribed, this.onTrackUnsubscribed)
        .on(RoomEvent.LocalTrackPublished, this.onLocalTrackPublished)
        .on(RoomEvent.LocalTrackUnpublished, this.onLocalTrackUnpublished)
        .on(RoomEvent.ParticipantConnected, this.refreshCount)
        .on(RoomEvent.ParticipantDisconnected, this.refreshCount);

      await room.connect(url, token);
      this.room = room;
      if (keepMicOn) await room.localParticipant.setMicrophoneEnabled(true);
      useMediaStore.setState({
        mode: roomKey ? 'table' : 'space',
        tableLabel: tableLabel ?? null,
        micEnabled: room.localParticipant.isMicrophoneEnabled,
        camEnabled: false,
        screenEnabled: false,
        voiceCount: room.remoteParticipants.size,
      });
    } catch (err) {
      useMediaStore.setState({ mode: 'off', error: (err as Error).message });
    }
  }

  private onTrackSubscribed = (
    track: RemoteTrack,
    publication: RemoteTrackPublication,
    participant: Participant,
  ): void => {
    console.debug(
      `[media] subscribed ${track.kind}/${publication.source} from ${participant.identity} (mst: ${Boolean(track.mediaStreamTrack)})`,
    );
    if (track.kind === Track.Kind.Audio) {
      if (track.mediaStreamTrack) {
        this.spatial?.addVoice(participant.identity, track.mediaStreamTrack);
      }
      return;
    }
    this.tiles.set(publication.trackSid, {
      key: publication.trackSid,
      participantName: participant.name || participant.identity,
      kind: publication.source === Track.Source.ScreenShare ? 'screen' : 'camera',
      local: false,
      track,
    });
    this.bumpTiles();
  };

  private onTrackUnsubscribed = (
    track: RemoteTrack,
    publication: RemoteTrackPublication,
    participant: Participant,
  ): void => {
    if (track.kind === Track.Kind.Audio) {
      this.spatial?.removeVoice(participant.identity);
      return;
    }
    this.tiles.delete(publication.trackSid);
    this.bumpTiles();
  };

  private onLocalTrackPublished = (publication: LocalTrackPublication): void => {
    if (!publication.track || publication.kind !== Track.Kind.Video) return;
    this.tiles.set(publication.trackSid, {
      key: publication.trackSid,
      participantName: 'You',
      kind: publication.source === Track.Source.ScreenShare ? 'screen' : 'camera',
      local: true,
      track: publication.track,
    });
    this.bumpTiles();
  };

  private onLocalTrackUnpublished = (publication: LocalTrackPublication): void => {
    this.tiles.delete(publication.trackSid);
    this.bumpTiles();
  };

  private refreshCount = (): void => {
    useMediaStore.setState({ voiceCount: this.room?.remoteParticipants.size ?? 0 });
  };

  private bumpTiles(): void {
    useMediaStore.setState((s) => ({ tilesVersion: s.tilesVersion + 1 }));
  }
}

export const media = new MediaController();

// Test/debug hook (dev only): drives table joins and reads spatial gains from
// automated browser tests without fishing for 3D click coordinates.
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  (window as unknown as { __media?: MediaController }).__media = media;
}
