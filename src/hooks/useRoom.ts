import { useCallback, useEffect, useRef, useState } from 'react';
import type { AccountSession, GameAction, GameView, ServerMessage, Session } from '../../shared/types';
import { API, apiRequest, requestId } from '../lib/api';

type Pending = { type: 'action'; id: string; version: number; action: GameAction };
export type Connection = 'connecting' | 'online' | 'reconnecting' | 'offline';

export function roomFromLocation() {
  return new URLSearchParams(window.location.hash.slice(1)).get('room')?.toUpperCase() ?? '';
}

export function savedSession(roomId: string): Session | null {
  try {
    const value = JSON.parse(localStorage.getItem(`islanders:${roomId}`) ?? 'null') as Session | null;
    return value?.roomId === roomId && typeof value.token === 'string' && typeof value.playerId === 'string' ? value : null;
  } catch { return null; }
}

export async function enterRoom(name: string, roomId?: string, account?: AccountSession | null, playtest = false): Promise<Session> {
  const data = await apiRequest<Session>(`/api/rooms${roomId ? `/${encodeURIComponent(roomId)}/join` : ''}`, {
    method: 'POST', body: JSON.stringify({ name, playtest }),
  }, account);
  try { localStorage.setItem(`islanders:${data.roomId}`, JSON.stringify(data)); } catch { /* The live seat still works without local storage. */ }
  return data;
}

export function useRoom(session: Session | null) {
  const [view, setView] = useState<GameView | null>(null);
  const [online, setOnline] = useState<string[]>([]);
  const [connection, setConnection] = useState<Connection>('connecting');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const socket = useRef<WebSocket | null>(null);
  const currentView = useRef<GameView | null>(null);
  const inFlight = useRef<Pending | null>(null);

  useEffect(() => {
    setView(null); currentView.current = null; inFlight.current = null;
    setOnline([]); setPending(false); setError(null);
    if (!session) return;
    let disposed = false;
    let attempt = 0;
    let reconnect: ReturnType<typeof setTimeout>;
    let watchdog: ReturnType<typeof setTimeout>;
    let heartbeat: ReturnType<typeof setInterval>;
    let lastSeen = Date.now();

    function connect() {
      if (disposed || !session) return;
      setConnection(attempt ? 'reconnecting' : 'connecting');
      const url = new URL(`${API}/api/rooms/${session.roomId}/socket`, window.location.origin);
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(url);
      socket.current = ws;
      let authenticated = false;
      watchdog = setTimeout(() => ws.close(), 15_000);
      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'auth', token: session.token }));
        lastSeen = Date.now();
        heartbeat = setInterval(() => {
          if (Date.now() - lastSeen > 50_000) ws.close();
          else if (ws.readyState === WebSocket.OPEN) ws.send('ping');
        }, 20_000);
      };
      ws.onmessage = (event: MessageEvent<string>) => {
        if (disposed || socket.current !== ws) return;
        lastSeen = Date.now();
        if (event.data === 'pong') return;
        let message: ServerMessage;
        try { message = JSON.parse(event.data) as ServerMessage; } catch { return; }
        if (message.type === 'error') {
          setError(message.message);
          if (!message.id || message.id === inFlight.current?.id) { inFlight.current = null; setPending(false); }
          return;
        }
        if (message.type !== 'state') return;
        clearTimeout(watchdog);
        attempt = 0;
        setConnection('online');
        currentView.current = message.state;
        setView(message.state); setOnline(message.online);
        if (message.acknowledgedId === inFlight.current?.id) {
          inFlight.current = null; setPending(false);
        }
        if (!authenticated && inFlight.current) ws.send(JSON.stringify(inFlight.current));
        authenticated = true;
      };
      ws.onclose = (event) => {
        clearTimeout(watchdog); clearInterval(heartbeat);
        if (disposed) return;
        if ([4401, 4404, 4409, 4429].includes(event.code) || attempt >= 6) {
          setConnection('offline'); setPending(false); inFlight.current = null;
          if (event.code === 4401 || event.code === 4404) {
            try { localStorage.removeItem(`islanders:${session.roomId}`); } catch { /* Storage may be disabled. */ }
          }
          setError(event.reason || 'The table could not be reached. Return home and use your invite to try again.');
          return;
        }
        setConnection('reconnecting');
        reconnect = setTimeout(connect, Math.min(10_000, 750 * 2 ** attempt++) + Math.random() * 300);
      };
      ws.onerror = () => ws.close();
    }
    connect();
    return () => {
      disposed = true; clearTimeout(reconnect); clearTimeout(watchdog); clearInterval(heartbeat);
      socket.current?.close(); socket.current = null;
    };
  }, [session]);

  useEffect(() => {
    if (!pending) return;
    const timeout = setTimeout(() => socket.current?.close(), 12_000);
    return () => clearTimeout(timeout);
  }, [pending, connection]);

  const send = useCallback((action: GameAction) => {
    if (socket.current?.readyState !== WebSocket.OPEN || !currentView.current || inFlight.current || connection !== 'online') return;
    const message: Pending = { type: 'action', id: requestId(), version: currentView.current.version, action };
    inFlight.current = message; setPending(true); setError(null);
    socket.current.send(JSON.stringify(message));
  }, [connection]);

  const viewAs = useCallback((playerId: string) => {
    if (socket.current?.readyState === WebSocket.OPEN && !inFlight.current && connection === 'online') {
      socket.current.send(JSON.stringify({ type: 'view-as', playerId }));
    }
  }, [connection]);
  return { view, online, connection, error, pending, send, viewAs, clearError: () => setError(null) };
}
