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
import { useScreenShareTile } from '@/media/useScreenShare';
import { AlertTriangle, ExternalLink, LogOut } from 'lucide-react';
import { Button, Panel, Spinner } from '@/ui/primitives';
import { ChatPanel } from '@/ui/ChatPanel';
import { ConnectionBanner } from '@/ui/ConnectionBanner';
import { WelcomeHint } from '@/ui/WelcomeHint';
import { DashboardModal } from '@/ui/DashboardModal';
import { EditorPanel } from '@/ui/EditorPanel';
import { PresenceList } from '@/ui/PresenceList';
import { ScreenViewer } from '@/ui/ScreenViewer';
import { SpaceDock } from '@/ui/SpaceDock';
import { VideoTiles } from '@/ui/VideoTiles';
import { WhiteboardModal } from '@/ui/WhiteboardModal';
import type { SceneObjectDTO } from '@mvs/shared';

// The 3D engine is browser-only (three.js); never SSR it.
const SceneCanvas = dynamic(() => import('@/engine/SceneCanvas').then((m) => m.SceneCanvas), {
  ssr: false,
  loading: () => <Overlay busy>Loading the space…</Overlay>,
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

  // Optimistic single-object transform update for the scene editor: patch local
  // state instantly (no network round-trip / full refetch) so dragging feels
  // immediate; the editor persists in the background.
  const patchObjectTransform = useCallback(
    (objectId: string, transform: SceneObjectDTO['transform']) => {
      setManifest((m) =>
        m
          ? { ...m, objects: m.objects.map((o) => (o.id === objectId ? { ...o, transform } : o)) }
          : m,
      );
    },
    [],
  );

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
  const [screen, setScreen] = useState<SceneObjectDTO | null>(null);

  // When someone is screen-sharing, surface a one-tap way to view it fullscreen
  // (clicking the tiny 3D screen from a back row is fiddly). Opens the main
  // stage SCREEN object so the slide fallback still works.
  const liveShare = useScreenShareTile();
  const mainScreen = manifest?.objects.find((o) => o.type === ObjectType.SCREEN) ?? null;

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
      if (object.type === ObjectType.SCREEN) setScreen(object);
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

  if (status !== 'ready') return <Overlay busy>Connecting…</Overlay>;
  if (error) {
    return (
      <Overlay>
        <span className="grid h-11 w-11 place-items-center rounded-full bg-danger/10 text-danger">
          <AlertTriangle size={20} strokeWidth={1.75} />
        </span>
        <p className="font-display text-lg text-brand-text">This space didn&rsquo;t load</p>
        <p className="max-w-sm text-center text-sm text-brand-text/60">{error}</p>
        <Button
          variant="primary"
          size="sm"
          onClick={() => {
            setError(null);
            loadManifest();
          }}
        >
          Try again
        </Button>
      </Overlay>
    );
  }
  if (!manifest) return <Overlay busy>Preparing the world…</Overlay>;

  return (
    <div className="relative h-full w-full">
      <EngineErrorBoundary>
        <SceneCanvas manifest={manifest} onInteract={onInteract} />
      </EngineErrorBoundary>
      <Hud name={manifest.name} />
      <ConnectionBanner />
      <WelcomeHint />
      {liveShare && !screen && mainScreen && (
        <button
          onClick={() => setScreen(mainScreen)}
          className="absolute left-1/2 top-4 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full bg-brand-primary px-4 py-2 text-sm font-semibold text-white shadow-e2 transition hover:opacity-90"
        >
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-white/90" />
          {liveShare.local ? 'You’re presenting' : `${liveShare.participantName} is presenting`} · View
          fullscreen
        </button>
      )}
      <PresenceList />
      <EditorPanel manifest={manifest} onChanged={loadManifest} onPatchTransform={patchObjectTransform} />
      <SpaceDock manifest={manifest} onDeckChanged={loadManifest} />
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
      {screen && <ScreenViewer object={screen} onClose={() => setScreen(null)} />}
    </div>
  );
}

function Hud({ name }: { name: string }) {
  const count = usePresenceStore((s) => Object.keys(s.players).length);
  const productName = useSessionStore((s) => s.me?.tenant.branding.productName);
  const [inIframe, setInIframe] = useState(false);
  useEffect(() => setInIframe(window.self !== window.top), []);

  // The tab reflects where you are — "Auditorium · Acme Office".
  useEffect(() => {
    const prev = document.title;
    document.title = productName ? `${name} · ${productName}` : name;
    return () => {
      document.title = prev;
    };
  }, [name, productName]);

  // Hand the session to a full tab — the iframe can't get display-capture
  // permission, a top-level tab can. The token rides the URL fragment, NOT
  // localStorage: inside the monday iframe our storage is partitioned under
  // monday.com, so a top-level pop-out (mondayvirtual.eu) can't read it. The
  // fragment never reaches the server; MondayProvider strips it on read.
  const popOut = () => {
    if (!api.token) return;
    const url = `${window.location.pathname}#mvs_handoff=${encodeURIComponent(api.token)}`;
    window.open(url, '_blank', 'noopener');
  };

  return (
    <>
      <Panel variant="glass-strong" padding="none" className="pointer-events-none absolute left-4 top-4 px-4 py-2.5">
        <div className="font-display text-lg leading-tight text-brand-text">{name}</div>
        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-brand-text/55">
          <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden="true" />
          {count + 1} here now
        </div>
      </Panel>
      <div className="absolute right-4 top-4 flex gap-2">
        {inIframe && (
          <Button variant="ghost" size="sm" icon={ExternalLink} onClick={popOut}>
            Pop out
          </Button>
        )}
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 rounded-sm border border-line/15 bg-brand-surface/70 px-2.5 py-1.5 text-[13px] font-medium text-brand-text backdrop-blur transition hover:bg-brand-surface"
        >
          <LogOut size={14} strokeWidth={1.75} aria-hidden="true" />
          Leave
        </Link>
      </div>
    </>
  );
}

function Overlay({ children, busy = false }: { children: React.ReactNode; busy?: boolean }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-brand-text/70">
      {busy && <Spinner size={22} />}
      {typeof children === 'string' ? <p className="text-sm">{children}</p> : children}
    </div>
  );
}
