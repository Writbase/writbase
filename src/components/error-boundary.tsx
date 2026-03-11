'use client';

import * as Sentry from '@sentry/nextjs';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info);
    Sentry.captureException(error, {
      contexts: { react: { componentStack: info.componentStack ?? undefined } },
    });
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-slate-200 bg-slate-50 p-8 dark:border-slate-700 dark:bg-slate-800">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Something went wrong
          </p>
          <Button
            variant="secondary"
            onClick={() => {
              this.setState({ hasError: false });
            }}
          >
            Try again
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
