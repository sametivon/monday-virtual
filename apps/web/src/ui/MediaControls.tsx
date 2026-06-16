'use client';

import { media, useMediaStore } from '@/media/mediaController';

/**
 * Bottom-center media bar (M4/Phase 2): mic everywhere; camera + screen-share
 * unlock inside a meeting table; in the space-wide room "Present" publishes a
 * screen share that renders onto the in-world screens for everyone.
 */
export function MediaControls() {
  const { mode, tableLabel, micEnabled, camEnabled, screenEnabled, voiceCount, error, notice } =
    useMediaStore();

  const noticeToast = notice && (
    <div className="absolute bottom-20 left-1/2 w-max max-w-md -translate-x-1/2 rounded-lg bg-amber-500/90 px-4 py-2 text-sm text-black shadow-lg">
      {notice}
    </div>
  );

  if (mode === 'off' && error) {
    return (
      <Bar>
        <span className="px-2 text-xs text-amber-300/80">voice unavailable: {error}</span>
      </Bar>
    );
  }
  if (mode === 'off') return null;
  if (mode === 'connecting') {
    return (
      <Bar>
        <span className="px-2 text-xs text-white/60">connecting voice…</span>
      </Bar>
    );
  }

  const inTable = mode === 'table';

  return (
    <>
      {noticeToast}
      <Bar>
      <span className="px-2 text-xs text-white/60">
        {inTable ? `🟣 ${tableLabel ?? 'Meeting'}` : '🔊 nearby voice'} · {voiceCount + 1}
      </span>
      <Toggle on={micEnabled} onClick={() => void media.toggleMic()} label={micEnabled ? '🎤 Mic on' : '🎤 Mic off'} />
      {inTable ? (
        <>
          <Toggle on={camEnabled} onClick={() => void media.toggleCamera()} label={camEnabled ? '📷 Cam on' : '📷 Cam off'} />
          <Toggle on={screenEnabled} onClick={() => void media.toggleScreenShare()} label={screenEnabled ? '🖥️ Sharing' : '🖥️ Share'} />
          <button
            onClick={() => void media.leaveTable()}
            className="rounded-lg bg-red-500/70 px-3 py-1.5 text-sm transition hover:bg-red-500"
          >
            Leave table
          </button>
        </>
      ) : (
        <Toggle
          on={screenEnabled}
          onClick={() => void media.toggleScreenShare()}
          label={screenEnabled ? '🖥️ Presenting' : '🖥️ Present'}
        />
      )}
      </Bar>
    </>
  );
}

function Bar({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-xl bg-black/50 px-3 py-2 backdrop-blur">
      {children}
    </div>
  );
}

function Toggle({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-sm transition ${
        on ? 'bg-brand-primary text-white' : 'bg-white/10 hover:bg-white/20'
      }`}
    >
      {label}
    </button>
  );
}
