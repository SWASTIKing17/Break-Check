/**
 * freeXan Caption — MCP/CLI Action Dispatcher
 *
 * Receives `plugin_action` messages from the freeXan main process over
 * WebSocket and routes them to JSX functions via `csi.callJSX`. Each
 * supported action has its own handler entry below.
 *
 * Result envelope sent back:
 *   { type: 'plugin_action_result', requestId, result }   on success
 *   { type: 'plugin_action_result', requestId, error }    on failure
 *
 * To add a new action: drop another entry into `handlers`.
 */

import { csi } from '@/lib/csi';

type Handler = (args: Record<string, unknown>) => Promise<unknown>;

const handlers: Record<string, Handler> = {
  /**
   * caption_create — one-shot equivalent of the entire Workflow tab.
   * Calls the JSX wrapper `runCaptionWorkflow(args)` which reads a
   * word-by-word Hinglish SRT, phrases it, runs getData() + a
   * createCaptions() loop, and returns a summary JSON.
   *
   * Required args:  hinglishSrtPath (string), mogrtPath (string)
   * Optional args:  charsPerPhrase (number, default 100), trackStart (number, default 1)
   */
  caption_create: async (args) => {
    if (!args || typeof args !== 'object') {
      throw new Error('caption_create: args object required');
    }
    if (!args.hinglishSrtPath || typeof args.hinglishSrtPath !== 'string') {
      throw new Error('caption_create: missing or invalid hinglishSrtPath');
    }
    if (!args.mogrtPath || typeof args.mogrtPath !== 'string') {
      throw new Error('caption_create: missing or invalid mogrtPath');
    }

    // runCaptionWorkflow returns JSON.stringified { status: "Success"|"Error", ... }.
    // csi.callJSX parses it for us. ExtendScript-side errors come back as
    // { status: "Error", message: "..." } — we surface those as thrown errors so
    // the MCP/CLI side gets a clean HTTP 500 / error response.
    const result = await csi.callJSX<{ status?: string; message?: string }>(
      'runCaptionWorkflow',
      args
    );

    if (!result || typeof result !== 'object') {
      throw new Error('runCaptionWorkflow returned an empty or non-object response');
    }
    if (result.status === 'Error') {
      throw new Error(result.message || 'runCaptionWorkflow reported an unspecified error');
    }
    return result;
  },

  /**
   * caption_ping — health check. Confirms the Caption panel's MCP handler is
   * loaded AND that the ExtendScript engine is reachable.
   */
  caption_ping: async () => {
    const ok = await csi.probeFunction('runCaptionWorkflow');
    return {
      pluginConnected: true,
      jsxLoaded: ok,
      supportedActions: getSupportedActions(),
    };
  },
};

/**
 * Look up and run an action handler. Returns the handler's resolved value.
 * Throws if `action` is unknown or the handler rejects.
 */
export async function dispatchPluginAction(
  action: string,
  args: Record<string, unknown> | undefined
): Promise<unknown> {
  const handler = handlers[action];
  if (!handler) {
    throw new Error(
      `Unknown action: "${action}". Supported: ${getSupportedActions().join(', ')}`
    );
  }
  return await handler(args || {});
}

export function getSupportedActions(): string[] {
  return Object.keys(handlers);
}
