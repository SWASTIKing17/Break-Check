/**
 * freeXan Caption — WebSocket Client
 * Connects to the local freeXan service (Mister BloomX) to receive MOGRT paths
 * and project state.
 */
import { useEffect, useState, useCallback, useRef } from 'react';
import { useWorkflowStore } from '@/store/workflowStore';
import { csi } from '@/lib/csi';
import { CSXS_EVENTS } from '@/lib/events';
import { node } from '@/lib/node';
import { dispatchPluginAction } from '@/lib/captionMcpHandlers';

const WS_URL = 'ws://localhost:4554';

export function useFreeXanWs() {
  const [wsConnected, setWsConnected] = useState(false);
  const setMogrtPath = useWorkflowStore((s) => s.setMogrtPath);
  const wsRef = useRef<WebSocket | null>(null);

  const connect = useCallback(() => {
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    try {
      const ws = new WebSocket(WS_URL);
      
      ws.onopen = () => {
        setWsConnected(true);
        // Announce plugin identity for the MCP/CLI bridge (v3.5.4+). The main
        // process also auto-tags us via get_project_state below, but sending
        // ext_hello first makes the registration explicit + future-proof.
        ws.send(JSON.stringify({ type: 'ext_hello', plugin: 'caption', version: 'caption-1.0.0' }));
        ws.send(JSON.stringify({ type: 'get_project_state' }));
        // Enable integration auto-mode when BloomX is running
        useWorkflowStore.getState().setManualMode(4, false);
        // Request the currently selected MOGRT from BloomX immediately
        csi.dispatch(CSXS_EVENTS.BLOOMX_REQUEST_SELECTED);
      };

      ws.onmessage = (e) => {
        let msg;
        try { msg = JSON.parse(e.data); } catch (_) { return; }

        if (msg.type === 'cep_heartbeat_ping') {
          try { ws.send(JSON.stringify({ type: 'cep_heartbeat', source: 'caption' })); } catch(_) {}
          return;
        }

        if (msg.type === 'mogrt_ready') {
          const localPath = msg.localPath || msg.originalPath;
          if (localPath) {
            console.log('[freeXan WS] mogrt_ready received:', localPath);
            setMogrtPath(localPath);
            // Optionally, dispatch a custom event if other parts of the app need to react instantly
            window.dispatchEvent(new CustomEvent('freexan-ws:mogrt_ready', { detail: localPath }));
          }
        } else if (msg.type === 'project_state') {
          // Server sends {connected: boolean}; bloomxOpen is the legacy key name
          const isBloomxOpen = !!(msg.bloomxOpen ?? msg.connected);
          console.log('[freeXan WS] Received project_state, bloomxOpen/connected:', isBloomxOpen);
          useWorkflowStore.getState().setManualMode(4, !isBloomxOpen);
          
          if (isBloomxOpen && node.isAvailable) {
            try {
              const fxDir = node.path.join(node.os.homedir(), 'AppData', 'Roaming', 'freeXan');
              const activeMogrtTxt = node.path.join(fxDir, 'active_mogrt.txt');
              if (node.fs.existsSync(activeMogrtTxt)) {
                const storedPath = node.fs.readFileSync(activeMogrtTxt, 'utf8').trim();
                setMogrtPath(storedPath);
              } else {
                setMogrtPath('');
              }
            } catch (e) {
              console.warn('Failed to sync MOGRT path from active_mogrt.txt', e);
            }
          }
        } else if (msg.type === 'plugin_action') {
          // MCP/CLI dispatcher — the main process is asking us to run an
          // action and report back. Dispatch by action name; send a
          // plugin_action_result with the same requestId either way.
          const { requestId, action, args } = msg;
          console.log('[freeXan WS] plugin_action received:', action, 'requestId=' + requestId);
          dispatchPluginAction(action, args)
            .then((result) => {
              try {
                ws.send(JSON.stringify({ type: 'plugin_action_result', requestId, result }));
              } catch (sendErr) {
                console.warn('[freeXan WS] Failed to send plugin_action_result:', sendErr);
              }
            })
            .catch((err) => {
              const errorMsg = (err && err.message) ? err.message : String(err);
              console.warn('[freeXan WS] plugin_action handler rejected:', errorMsg);
              try {
                ws.send(JSON.stringify({ type: 'plugin_action_result', requestId, error: errorMsg }));
              } catch (sendErr) {
                console.warn('[freeXan WS] Failed to send plugin_action_result (error path):', sendErr);
              }
            });
        } else if (msg.type === 'bloomx_status') {
          const isOpen = !!(msg.open ?? msg.bloomxOpen);
          console.log('[freeXan WS] BloomX status changed, open:', isOpen);
          useWorkflowStore.getState().setManualMode(4, !isOpen);
          
          if (isOpen && node.isAvailable) {
            try {
              const fxDir = node.path.join(node.os.homedir(), 'AppData', 'Roaming', 'freeXan');
              const activeMogrtTxt = node.path.join(fxDir, 'active_mogrt.txt');
              if (node.fs.existsSync(activeMogrtTxt)) {
                const storedPath = node.fs.readFileSync(activeMogrtTxt, 'utf8').trim();
                setMogrtPath(storedPath);
              } else {
                setMogrtPath('');
              }
            } catch (e) {
              console.warn('Failed to sync MOGRT path from active_mogrt.txt', e);
            }
          }
        }
      };

      ws.onclose = () => {
        setWsConnected(false);
        wsRef.current = null;
        // Only auto-reconnect if the page is NOT being torn down
        if (!(window as any).__freexan_unloading) {
          setTimeout(connect, 2000);
        }
        // Fallback to manual mode when BloomX is closed (server is dead)
        try { useWorkflowStore.getState().setManualMode(4, true); } catch (_) {}
      };

      ws.onerror = (evt) => {
        // Swallow the error — onclose will fire next and handle reconnect.
        // We must NOT rethrow here; an unhandled WS error in a CEP panel can
        // crash Adobe's extension host and take down all sibling panels.
        console.warn('[freeXan WS] WebSocket error (non-fatal):', evt);
        try { setWsConnected(false); } catch (_) {}
        try { useWorkflowStore.getState().setManualMode(4, true); } catch (_) {}
      };

      wsRef.current = ws;
    } catch (e) {
      console.warn('[freeXan WS] Connect failed:', e);
    }
  }, [setMogrtPath]);

  // Listen to CSXS events from Mister BloomX
  useEffect(() => {
    const handleCsxsEvent = (event: any) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.action === 'apply_new') {
          console.log('[freeXan CSXS] MOGRT selected in BloomX:', payload.mogrtPath);
          setMogrtPath(payload.mogrtPath);
        } else if (payload.action === 'deselected') {
          console.log('[freeXan CSXS] MOGRT deselected in BloomX');
          setMogrtPath('');
        }
      } catch (e) {
        console.warn('Failed to parse CSXS executeAction payload', e);
      }
    };

    csi.on(CSXS_EVENTS.EXECUTE_ACTION, handleCsxsEvent);
    
    return () => {
      csi.off(CSXS_EVENTS.EXECUTE_ACTION, handleCsxsEvent);
    };
  }, [setMogrtPath]);

  useEffect(() => {
    connect();
    return () => {
      // Signal beforeunload so the reconnect timer doesn't fire after cleanup
      (window as any).__freexan_unloading = true;
      if (wsRef.current) {
        try { wsRef.current.close(1000, 'panel-unmount'); } catch (_) {}
        wsRef.current = null;
      }
    };
  }, [connect]);

  // Request BloomX to send the currently selected MOGRT
  const requestSelectedMogrt = useCallback(() => {
    csi.dispatch(CSXS_EVENTS.BLOOMX_REQUEST_SELECTED);
  }, []);

  return { wsConnected, requestSelectedMogrt };
}
