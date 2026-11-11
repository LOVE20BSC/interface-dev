import { Component, type ErrorInfo, type ReactNode } from 'react';
import { RefreshCw } from '@/shared/ui/icons';
import { copy } from '@/shared/config/copy';
import { buttonStyles } from '@/shared/ui/button';
import { Card, CardTitle } from '@/shared/ui/card';
import { hrefFor } from '@/app/router/base-path';

interface Props {
  readonly children: ReactNode;
}

interface State {
  readonly hasError: boolean;
}

/**
 * Route-level error boundary. Keep the fallback dependency-free: if a page
 * throws during render, the shell (header/nav) must still be usable.
 */
export class AppErrorBoundary extends Component<Props, State> {
  public override state: State = { hasError: false };

  public static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  public override componentDidCatch(error: Error, info: ErrorInfo): void {
    // No analytics / third-party reporting in M0 (no third-party calls).
    console.error('[love20] render error', error, info.componentStack);
  }

  public override render(): ReactNode {
    if (!this.state.hasError) return this.props.children;
    return (
      <Card>
        <CardTitle>{copy.errors.generic}</CardTitle>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            className={buttonStyles('primary', 'md')}
            onClick={() => window.location.reload()}
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            {copy.common.refresh}
          </button>
          <a href={hrefFor('/')} className={buttonStyles('secondary', 'md')}>
            {copy.common.home}
          </a>
        </div>
      </Card>
    );
  }
}
