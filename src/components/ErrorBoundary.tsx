// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 AMOK / Europe Magic Wand

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { runEmergencyStop } from '../lib/emergencyStop';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Top-level error boundary. Beyond showing a recoverable fallback, its job is a
 * SAFETY one: if a render crash tears down the UI while a pattern is playing,
 * we must not leave the motor running with no way to stop it — so on catch we
 * fire a best-effort stop to the connected device.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    runEmergencyStop();
    console.error('Strong Vibes Playapp crashed:', error, info.componentStack);
  }

  handleReload = (): void => {
    runEmergencyStop();
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-surface-50 dark:bg-surface-900">
          <div className="max-w-md w-full panel p-6 space-y-4 text-center">
            <div className="flex justify-center">
              <AlertTriangle className="w-10 h-10 text-danger-500" />
            </div>
            <h1 className="text-lg font-semibold text-surface-800 dark:text-surface-100">
              Something went wrong
            </h1>
            <p className="text-sm text-surface-500 dark:text-surface-400">
              The app hit an unexpected error. As a safety measure it has sent a
              stop command to the connected device. Reload to continue.
            </p>
            <button onClick={this.handleReload} className="btn-primary w-full py-2">
              Reload app
            </button>
            {this.state.error.message && (
              <pre className="text-[10px] text-left font-mono text-surface-400 bg-surface-100 dark:bg-surface-800 p-2 rounded overflow-x-auto">
                {this.state.error.message}
              </pre>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
