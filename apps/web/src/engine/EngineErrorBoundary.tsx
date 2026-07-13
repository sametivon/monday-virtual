'use client';

import { Component, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button, Panel } from '@/ui/primitives';

/**
 * Catches render errors from the 3D engine (WebGL context failures, bad scene
 * data, asset errors) and shows a readable card instead of unmounting the
 * page to a blank screen. "Reload scene" clears the error so the canvas
 * remounts and tries again.
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
        <div className="flex h-full items-center justify-center px-6">
          <Panel
            variant="solid"
            padding="lg"
            className="flex w-full max-w-md flex-col items-center gap-3 text-center"
          >
            <span className="grid h-11 w-11 place-items-center rounded-full bg-danger/10 text-danger">
              <AlertTriangle size={20} strokeWidth={1.75} aria-hidden="true" />
            </span>
            <h2 className="font-display text-lg text-brand-text">The 3D scene hit a snag</h2>
            <p className="max-w-sm break-words text-xs text-brand-text/55">
              {this.state.error.message}
            </p>
            <Button
              variant="primary"
              className="mt-1"
              onClick={() => this.setState({ error: null })}
            >
              Reload scene
            </Button>
          </Panel>
        </div>
      );
    }
    return this.props.children;
  }
}
