/**
 * WebSocket hook for connecting audience phones to the relay server.
 * Receives skeleton data, show control cues, and sends audience interactions.
 */

import { useEffect, useRef, useCallback, useState } from 'react';

export interface RelayState {
  connected: boolean;
  audienceCount: number;
  deviceId: string | null;
}

export type MessageHandler = (msg: any) => void;

const RECONNECT_DELAY = 2000;
const HEARTBEAT_INTERVAL = 25_000;

export function useRelaySocket(
  serverUrl: string,
  onMessage: MessageHandler,
) {
  const wsRef = useRef<WebSocket | null>(null);
  const handlersRef = useRef(onMessage);
  handlersRef.current = onMessage;

  const [state, setState] = useState<RelayState>({
    connected: false,
    audienceCount: 0,
    deviceId: null,
  });

  const deviceIdRef = useRef<string | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();
  const heartbeatTimer = useRef<ReturnType<typeof setInterval>>();
  const mountedRef = useRef(true);

  const connect = useCallback(async () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    // For ngrok free tier: do a fetch first to clear the interstitial page.
    const httpUrl = serverUrl.replace('wss://', 'https://').replace('ws://', 'http://');
    try {
      await fetch(httpUrl, {
        mode: 'cors',
        headers: { 'ngrok-skip-browser-warning': 'true' },
      });
    } catch {
      // Fetch may fail due to CORS, that's OK — the cookie gets set anyway
    }

    if (!mountedRef.current) return;

    const ws = new WebSocket(serverUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[ROOT] WebSocket connected, sending handshake...');
      // Send handshake
      ws.send(JSON.stringify({
        type: 'handshake',
        role: 'audience',
      }));

      // Start heartbeat
      clearInterval(heartbeatTimer.current);
      heartbeatTimer.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'heartbeat',
            data: { deviceId: deviceIdRef.current },
          }));
        }
      }, HEARTBEAT_INTERVAL);
    };

    ws.onmessage = (event) => {
      let msg: any;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }

      // Handle system messages
      if (msg.type === 'welcome') {
        console.log('[ROOT] Welcome received, deviceId:', msg.data.deviceId);
        deviceIdRef.current = msg.data.deviceId;
        setState((prev: RelayState) => ({
          ...prev,
          connected: true,
          deviceId: msg.data.deviceId,
        }));
        return;
      }

      if (msg.type === 'audience_count') {
        setState((prev: RelayState) => ({
          ...prev,
          audienceCount: msg.data.connected,
        }));
        return;
      }

      // Forward all other messages to the handler
      handlersRef.current(msg);
    };

    ws.onclose = () => {
      console.log('[ROOT] WebSocket disconnected');
      setState((prev: RelayState) => ({ ...prev, connected: false }));
      clearInterval(heartbeatTimer.current);

      // Auto-reconnect only if still mounted
      if (mountedRef.current) {
        reconnectTimer.current = setTimeout(connect, RECONNECT_DELAY);
      }
    };

    ws.onerror = (err) => {
      console.error('[ROOT] WebSocket error:', err);
      ws.close();
    };
  }, [serverUrl]); // Only depend on serverUrl, NOT state

  // Connect on mount
  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      clearTimeout(reconnectTimer.current);
      clearInterval(heartbeatTimer.current);
      if (wsRef.current) {
        wsRef.current.onclose = null; // Prevent reconnect on cleanup
        wsRef.current.close();
      }
    };
  }, [connect]);

  // Send message to relay
  const send = useCallback((msg: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  return { state, send };
}
