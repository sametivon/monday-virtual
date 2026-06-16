'use client';

import { Component, type ReactNode } from 'react';

/**
 * Catches render errors from the 3D engine (WebGL context failures, bad scene
 * data, asset errors) and shows a readable message instead of unmounting the
 * page to a blank screen.
 */
export class EngineErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  override state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override render() {
    if (this.state.error) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-2 text-brand-text/70">
          <div>⚠️ The 3D scene failed to load.</div>
          <div className="max-w-lg text-center text-xs text-brand-text/50">
            {this.state.error.message}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
