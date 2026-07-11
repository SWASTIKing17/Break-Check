/**
 * freeXan Caption — ErrorBoundary
 *
 * Wraps each tab so a single tab crash never blanks the rest of the app.
 * Shows an inline recovery UI instead of an empty white pane.
 */
import React from 'react';

interface Props {
  tabId: string;
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  errorMsg: string;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorMsg: '' };
  }

  static getDerivedStateFromError(error: unknown): State {
    const msg = error instanceof Error ? error.message : String(error);
    return { hasError: true, errorMsg: msg };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(
      `[ErrorBoundary] Tab "${this.props.tabId}" threw an uncaught error:`,
      msg,
      info.componentStack
    );
  }

  handleRetry = () => {
    this.setState({ hasError: false, errorMsg: '' });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            gap: '12px',
            padding: '24px',
            color: 'var(--fx-text-muted, #888)',
            textAlign: 'center',
          }}
        >
          <svg viewBox="0 0 24 24" width="36" height="36" stroke="var(--fx-accent, #e05c5c)" strokeWidth="1.5" fill="none">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <p style={{ margin: 0, fontSize: '13px', maxWidth: '280px' }}>
            <strong style={{ color: 'var(--fx-text, #ddd)' }}>
              {this.props.tabId} tab encountered an error
            </strong>
            <br />
            <span style={{ fontSize: '11px', opacity: 0.7 }}>{this.state.errorMsg}</span>
          </p>
          <button
            onClick={this.handleRetry}
            style={{
              background: 'var(--fx-accent, #00a6d6)',
              border: 'none',
              color: '#fff',
              padding: '6px 18px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 600,
            }}
          >
            ↺ Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
