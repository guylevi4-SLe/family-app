import { Component, type ReactNode } from 'react';

const KEY = 'lastError';

/** Keeps one broken screen from blanking the whole app; offers a reload instead. */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    rememberError(error.message);
  }

  componentDidUpdate(prev: { resetKey?: string }) {
    // Moving to another screen gives it a fresh start.
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="list-page crash">
        <p>משהו השתבש במסך הזה.</p>
        <button className="primary" onClick={() => location.reload()}>
          טעינה מחדש
        </button>
        <p className="muted crash-detail">{this.state.error.message}</p>
      </main>
    );
  }
}

/** Keeps the latest error on this device so it can be read out from Settings. */
export function rememberError(message: string) {
  try {
    localStorage.setItem(KEY, `${new Date().toLocaleString('he-IL')} ${message}`.slice(0, 500));
  } catch {
    /* optional */
  }
}

export function lastError() {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}
