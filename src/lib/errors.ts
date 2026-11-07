import { API } from './api';

/** Send uncaught browser errors to the server log (Workers Observability). At most a few per page load. */
export function reportClientErrors(): void {
  let sent = 0;
  const report = (message: string, stack?: string) => {
    if (sent++ >= 5 || import.meta.env.DEV) return;
    void fetch(`${API}/api/client-errors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: message.slice(0, 300), stack: stack?.slice(0, 1200), page: location.pathname }),
      keepalive: true,
    }).catch(() => undefined);
  };
  window.addEventListener('error', event => report(event.message, event.error?.stack));
  window.addEventListener('unhandledrejection', event => {
    const reason = event.reason;
    report(
      reason instanceof Error ? reason.message : String(reason),
      reason instanceof Error ? reason.stack : undefined,
    );
  });
}
