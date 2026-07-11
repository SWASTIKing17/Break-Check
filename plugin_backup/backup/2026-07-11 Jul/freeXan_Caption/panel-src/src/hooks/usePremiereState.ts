/**
 * freeXan Caption — usePremiereState Hook
 *
 * Polls active project / sequence / selection state from Premiere
 * and updates the session store. Used by the AppBar and StatusRail.
 *
 * DEBUG LOGGING ACTIVE — each disconnect path has a unique [DISC-n] tag.
 * Filter Premiere's CEP debug console by "usePremiereState" to see only this module.
 * Remove or gate behind a flag before final release.
 */
import { useEffect, useRef } from 'react';
import { csi } from '@/lib/csi';
import { useSessionStore, type ConnectionState } from '@/store/sessionStore';

const POLL_INTERVAL = 3000; // ms

// ─── File-based log writer ───────────────────────────────────────────────────
// Writes to: %APPDATA%\Adobe\CEP\extensions\com.bloomx.freexan.caption\panel\logs\connection_debug.log
// This is a dedicated file for connection/disconnect events only — separate from
// debug_jsx.log (which is the ExtendScript log and contains everything else).
const LOG_FILE_PATH = (() => {
  try {
    const csiObj = new (window as any).CSInterface();
    const extPath: string = csiObj.getSystemPath
      ? csiObj.getSystemPath((window as any).SystemPath?.EXTENSION ?? '')
      : '';
    if (extPath) return extPath + '/panel/logs/connection_debug.log';
    // Fallback: build from APPDATA
    const appdata = (window as any).process?.env?.APPDATA ?? '';
    return appdata + '\\Adobe\\CEP\\extensions\\com.bloomx.freexan.caption\\panel\\logs\\connection_debug.log';
  } catch { return ''; }
})();

function writeToLogFile(level: string, msg: string, args: unknown[]): void {
  try {
    const fs = (window as any).require?.('fs');
    if (!fs || !LOG_FILE_PATH) return;
    const ts = new Date().toISOString().slice(0, 23).replace('T', ' ');
    
    // Serialize additional args
    const argsStr = args.length > 0 
      ? ' ' + args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')
      : '';
      
    const line = `[${ts}] [${level}] ${msg}${argsStr}\n`;
    
    // Ensure logs directory exists
    const path = (window as any).require?.('path');
    if (path) {
      const dir = path.dirname(LOG_FILE_PATH);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    }
    fs.appendFileSync(LOG_FILE_PATH, line, 'utf8');
  } catch { /* never crash execution for a log write */ }
}
// ─────────────────────────────────────────────────────────────────────────────

// ─── Colour-coded console helpers ────────────────────────────────────────────
const TAG = '[usePremiereState]';

function logInfo(msg: string, ...args: unknown[]) {
  writeToLogFile('INFO', msg, args);
  console.log(`%c${TAG}%c ${msg}`, 'color:#60a5fa;font-weight:bold', 'color:inherit', ...args);
}
function logWarn(msg: string, ...args: unknown[]) {
  writeToLogFile('WARN', msg, args);
  console.warn(`%c${TAG}%c ${msg}`, 'color:#fbbf24;font-weight:bold', 'color:inherit', ...args);
}
function logError(msg: string, ...args: unknown[]) {
  writeToLogFile('ERROR', msg, args);
  console.error(`%c${TAG}%c ${msg}`, 'color:#f87171;font-weight:bold', 'color:inherit', ...args);
}
function logOk(msg: string, ...args: unknown[]) {
  writeToLogFile('OK', msg, args);
  console.log(`%c${TAG}%c ${msg}`, 'color:#34d399;font-weight:bold', 'color:inherit', ...args);
}

// Track the previous state so we only log when something actually changes
let _prevConnection: ConnectionState | null = null;

function setAndLog(
  setConnection: (s: ConnectionState) => void,
  next: ConnectionState,
  reason: string
) {
  if (next !== _prevConnection) {
    if (next === 'disconnected') {
      logError(`→ DISCONNECTED  reason: ${reason}`);
    } else if (next === 'project-open') {
      logWarn(`→ PROJECT-OPEN  reason: ${reason}`);
    } else {
      logOk(`→ CONNECTED  reason: ${reason}`);
    }
    _prevConnection = next;
  }
  setConnection(next);
}
// ─────────────────────────────────────────────────────────────────────────────

export function usePremiereState(): void {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollCountRef = useRef(0);

  const {
    setConnection,
    setProjectPath,
    setSequenceInfo,
    setSelectedClipsCount,
  } = useSessionStore();

  useEffect(() => {
    async function poll() {
      const tick = ++pollCountRef.current;
      const ts = new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm

      // ── Gate: CSInterface must be present ───────────────────────────────
      if (!csi.isAvailable) {
        logWarn(
          `[DISC-1] tick#${tick} ${ts} — CSInterface not available.` +
          ' CSInterface defined: ' + (typeof CSInterface !== 'undefined') +
          ' | __adobe_cep__: ' + !!(window as any).__adobe_cep__
        );
        setAndLog(setConnection, 'disconnected', '[DISC-1] CSInterface unavailable');
        return;
      }

      try {
        // ── Step 0: Engine Health Ping ────────────────────────────────────
        try {
          const ping = await csi.evalScriptRaw('1 + 1');
          logInfo(`tick#${tick} — Engine ping result: "${ping}"`);
        } catch (pingErr) {
          logError(`[DISC-ENGINE-DEAD] tick#${tick} — Engine ping failed!`, '\n  Error:', pingErr instanceof Error ? pingErr.message : pingErr);
          setAndLog(setConnection, 'disconnected', '[DISC-ENGINE-DEAD] ExtendScript bridge is completely dead.');
          return;
        }

        // ── Step 1: Is any project open? ──────────────────────────────────
        logInfo(`tick#${tick} ${ts} — polling app.project...`);
        let raw: string;
        try {
          raw = await csi.evalScriptRaw('(function(){ try { return (app && app.project) ? "OPEN" : ""; } catch(e) { return ""; } })()');
        } catch (evalErr) {
          // evalScriptRaw rejects on "EvalScript error." or "undefined"
          logError(
            `[DISC-2] tick#${tick} — evalScript threw on project check.`,
            '\n  Error:', evalErr instanceof Error ? evalErr.message : evalErr
          );
          setAndLog(setConnection, 'disconnected', '[DISC-2] evalScript exception on project check');
          return;
        }

        logInfo(`tick#${tick} — app.project raw result: "${raw}" (length: ${raw.length})`);

        if (!raw || raw === '' || raw === 'undefined') {
          logWarn(`[DISC-3] tick#${tick} — app.project returned falsy ("${raw}"). No project open.`);
          setAndLog(setConnection, 'disconnected', '[DISC-3] app.project returned empty');
          setProjectPath(null);
          setSequenceInfo(null, null);
          setSelectedClipsCount(0);
          return;
        }

        // ── Step 2: Grab project path ──────────────────────────────────────
        let projPath = '';
        try {
          projPath = await csi.evalScriptRaw('app.project ? app.project.path : ""');
          logInfo(`tick#${tick} — project path: "${projPath}"`);
        } catch (pathErr) {
          logWarn(`tick#${tick} — failed to read project path (non-fatal):`, pathErr);
        }
        setProjectPath(projPath === 'undefined' || projPath === '' ? null : projPath);

        // ── Step 3: Check active sequence ──────────────────────────────────
        try {
          const seqScript =
            'app.project.activeSequence ? JSON.stringify({' +
            'name: app.project.activeSequence.name,' +
            'fps: app.project.activeSequence.timebase' +
            '}) : ""';

          let seqRaw: string;
          try {
            seqRaw = await csi.evalScriptRaw(seqScript);
          } catch (seqEvalErr) {
            logWarn(
              `[PROJ-OPEN-1] tick#${tick} — evalScript threw on sequence check.` +
              ' Premiere is open but sequence query failed.',
              '\n  Error:', seqEvalErr instanceof Error ? seqEvalErr.message : seqEvalErr
            );
            setAndLog(setConnection, 'project-open', '[PROJ-OPEN-1] sequence evalScript threw');
            return;
          }

          logInfo(`tick#${tick} — activeSequence raw: "${seqRaw}" (length: ${seqRaw.length})`);

          if (seqRaw && seqRaw !== '' && seqRaw !== 'undefined') {
            try {
              const seq = JSON.parse(seqRaw);
              logOk(
                `tick#${tick} — sequence parsed OK:`,
                `name="${seq.name}" timebase="${seq.fps}"`
              );
              setSequenceInfo(seq.name || null, seq.fps || null);
              setAndLog(setConnection, 'connected', 'project + sequence found');
            } catch (jsonErr) {
              logWarn(
                `[PROJ-OPEN-2] tick#${tick} — sequence JSON.parse failed.` +
                ` Raw was: "${seqRaw}"`,
                '\n  ParseError:', jsonErr instanceof Error ? jsonErr.message : jsonErr
              );
              setAndLog(setConnection, 'project-open', '[PROJ-OPEN-2] sequence JSON parse error');
            }
          } else {
            logWarn(`[PROJ-OPEN-3] tick#${tick} — no active sequence (seqRaw="${seqRaw}").`);
            setSequenceInfo(null, null);
            setAndLog(setConnection, 'project-open', '[PROJ-OPEN-3] no active sequence');
          }

        } catch (seqOuterErr) {
          // Outer try catches anything we didn't handle inside
          logWarn(
            `[PROJ-OPEN-4] tick#${tick} — unexpected error in sequence block:`,
            seqOuterErr instanceof Error ? seqOuterErr.message : seqOuterErr
          );
          setAndLog(setConnection, 'project-open', '[PROJ-OPEN-4] unexpected sequence block error');
        }

      } catch (outerErr) {
        // Top-level catch — something very unexpected happened
        logError(
          `[DISC-4] tick#${tick} — unhandled outer exception in poll:`,
          '\n  Error:', outerErr instanceof Error ? outerErr.stack ?? outerErr.message : outerErr
        );
        setAndLog(setConnection, 'disconnected', '[DISC-4] unhandled outer exception');
      }
    }

    logInfo('Hook mounted — starting poll (interval: ' + POLL_INTERVAL + 'ms)');

    // Initial poll
    poll();

    // Set up interval
    timerRef.current = setInterval(poll, POLL_INTERVAL);

    return () => {
      logWarn('Hook unmounting — clearing poll interval');
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [setConnection, setProjectPath, setSequenceInfo, setSelectedClipsCount]);
}
