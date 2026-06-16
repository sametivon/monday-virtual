'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { use, useCallback, useEffect, useState } from 'react';
import { ObjectType, type WorldManifest } from '@mvs/shared';
import { api } from '@/lib/api';
import { useSessionStore } from '@/stores/sessionStore';
import { usePresenceStore } from '@/stores/presenceStore';
import { useSpaceSocket } from '@/realtime/useSpaceSocket';
import { EngineErrorBoundary } from '@/engine/EngineErrorBoundary';
import { media } from '@/media/mediaController';
import { ChatPanel } from '@/ui/ChatPanel';
import { DashboardModal } from '@/ui/DashboardModal';
import { EditorPanel } from '@/ui/EditorPanel';
import { MediaControls } from '@/ui/MediaControls';
import { PresenceList } from '@/ui/PresenceList';
import { ReactionBar } from '@/ui/ReactionBar';
import { SlidesControl } from '@/ui/SlidesControl';
import { VideoTiles } from '@/ui/VideoTiles';
import { WhiteboardModal } from '@/ui/WhiteboardModal';
import type { SceneObjectDTO } from '@mvs/shared';

// The 3D engine is browser-only (three.js); never SSR it.
const SceneCanvas = dynamic(() => import('@/engine/SceneCanvas').then((m) => m.SceneCanvas), {
  ssr: false,
  loading: () => <Overlay>Loading space…</Overlay>,
});

export default function SpacePage({ params }: { params: Promise<{ spaceId: string }> }) {
  const { spaceId } = use(params);
  const router = useRouter();
  const status = useSessionStore((s) => s.status);
  const [manifest, setManifest] = useState<WorldManifest | null>(null);
  const [error, setError] = useState<string | null>(null);

  useSpaceSocket(spaceId);

  const loadManifest = useCallback(() => {
    api
      .manifest(spaceId)
      .then(setManifest)
      .catch((e) => setError((e as Error).message));
  }, [spaceId]);

  useEffect(() => {
    if (status !== 'ready') return;
    loadManifest();
  }, [status, loadManifest]);

  // Join space-wide proximity voice once the world is known (listen-only
  // until the user turns their mic on); tear the media plane down on leave.
  // Keyed on spaceId, not manifest, so a manifest refresh (e.g. after pinning
  // a board) doesn't reconnect the media room.
  useEffect(() => {
    if (!manifest) return;
    void media.joinSpace(manifest.spaceId, manifest.scene.spatialAudio, manifest.scene.stage);
    return () => void media.dispose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manifest?.spaceId]);

  const [dashboard, setDashboard] = useState<SceneObjectDTO | null>(null);
  const [whiteboard, setWhiteboard] = useState<SceneObjectDTO | null>(null);

  // Object interactions: tables join their sub-room (M4); dashboards open
  // live monday board data; portals teleport; whiteboards open the drawing
  // surface (Phase 2).
  const onInteract = useCallback(
    (id: string) => {
      const object = manifest?.objects.find((o) => o.id === id);
      if (!object) return;
      if (object.type === ObjectType.MEETING_TABLE && object.interaction?.onClick === 'joinTable') {
        const config = object.config as { roomKey: string; label?: string };
        void media.joinTable(config.roomKey, config.label ?? 'Meeting');
      }
      if (object.type === ObjectType.DASHBOARD) setDashboard(object);
      if (object.type === ObjectType.WHITEBOARD) setWhiteboard(object);
      if (object.type === ObjectType.PORTAL) {
        const config = object.config as { targetSpaceId?: string };
        if (config.targetSpaceId) router.push(`/space/${config.targetSpaceId}`);
      }
    },
    [manifest, router],
  );

  // Test/debug hook (dev only): drive object interactions without 3D picking.
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    (window as unknown as { __interact?: (id: string) => void }).__interact = onInteract;
  }, [onInteract]);

  if (status !== 'ready') return <Overlay>Connecting…</Overlay>;
  if (error) return <Overlay>⚠️ {error}</Overlay>;
  if (!manifest) return <Overlay>Loading world…</Overlay>;

  return (
    <div className="relative h-full w-full">
      <EngineErrorBoundary>
        <SceneCanvas manifest={manifest} onInteract={onInteract} />
      </EngineErrorBoundary>
      <Hud name={manifest.name} />
      <PresenceList />
      <MediaControls />
      <SlidesControl manifest={manifest} onDeckChanged={loadManifest} />
      <EditorPanel manifest={manifest} onChanged={loadManifest} />
      <ReactionBar />
      <VideoTiles />
      <ChatPanel spaceId={spaceId} />
      {dashboard && (
        <DashboardModal
          object={dashboard}
          spaceId={spaceId}
          onPinned={loadManifest}
          onClose={() => setDashboard(null)}
        />
      )}
      {whiteboard && <WhiteboardModal object={whiteboard} onClose={() => setWhiteboard(null)} />}
    </div>
  );
}

function Hud({ name }: { name: string }) {
  const count = usePresenceStore((s) => Object.keys(s.players).length);
  const [inIframe, setInIframe] = useState(false);
  useEffect(() => setInIframe(window.self !== window.top), []);

  // Hand the session to a full tab via a one-shot localStorage key — the
  // iframe can't get display-capture permission, a top-level tab can.
  const popOut = () => {
    if (!api.token) return;
    localStorage.setItem('mvs:handoff', JSON.stringify({ accessToken: api.token }));
    window.open(window.location.pathname, '_blank', 'noopener');
  };

  return (
    <>
      <div className="pointer-events-none absolute left-4 top-4 rounded-lg bg-black/40 px-4 py-2 backdrop-blur">
        <div className="text-lg font-semibold">{name}</div>
        <div className="text-xs text-white/60">{count + 1} present · WASD to move</div>
      </div>
      <div className="absolute right-4 top-4 flex gap-2">
        {inIframe && (
          <button
            onClick={popOut}
            title="Open in its own tab (enables screen sharing)"
            className="rounded-lg bg-brand-surface/80 px-3 py-2 text-sm backdrop-blur transition hover:bg-brand-primary"
          >
            ↗ Pop out
          </button>
        )}
        <Link
          href="/"
          className="rounded-lg bg-brand-surface/80 px-3 py-2 text-sm backdrop-blur transition hover:bg-brand-primary"
        >
          ← Leave
        </Link>
      </div>
    </>
  );
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center text-brand-text/70">{children}</div>
  );
}
