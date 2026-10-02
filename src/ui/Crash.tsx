import { Component, type ReactNode } from 'react';

/** Drops the app kept on the phone (public/sw.js) and loads it again from the network. */
export async function reloadFresh() {
  try {
    const regs = (await navigator.serviceWorker?.getRegistrations()) || [];
    await Promise.all(regs.map((r) => r.unregister()));
    if ('caches' in window) for (const key of await caches.keys()) await caches.delete(key);
  } catch {
    /* reload anyway */
  }
  location.reload();
}

/**
 * Any error while drawing a screen: instead of a blank page, what happened and a way back.
 * The data is not touched; unsent sets stay in the phone's queue (src/offline.ts).
 */
export class CrashScreen extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    console.error(error, info.componentStack);
  }
  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const detail = [String(error.message || error), (error.stack || '').split('\n').slice(0, 4).join('\n')].join('\n');
    return (
      <div className="auth crash">
        <h2>Что-то пошло не так</h2>
        <p className="muted">Приложение не смогло показать экран. Записанные подходы не потеряны. Попробуйте открыть заново.</p>
        <button className="btn btn-primary btn-block btn-lg" onClick={() => location.reload()}>
          Открыть заново
        </button>
        <button className="btn btn-block" onClick={() => void reloadFresh()}>
          Загрузить приложение заново
        </button>
        <details>
          <summary className="muted small">Подробности для разработчика</summary>
          <pre className="crash-detail">{detail}</pre>
        </details>
      </div>
    );
  }
}
