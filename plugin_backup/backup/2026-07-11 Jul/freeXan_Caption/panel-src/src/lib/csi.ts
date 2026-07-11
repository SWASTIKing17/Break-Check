/**
 * freeXan Caption — CSInterface Wrapper
 *
 * Provides typed access to Adobe's CSInterface for the React app.
 * CSInterface.js is loaded via <script> before the React bundle,
 * so `new CSInterface()` is available globally.
 */

/** Thin wrapper around Adobe's global CSInterface */
class CSI {
  private cs: CSInterface | null = null;

  private get(): CSInterface {
    if (!this.cs) {
      if (typeof CSInterface === 'undefined') {
        throw new Error('[freeXan Caption] CSInterface not available — are we outside CEP?');
      }
      this.cs = new CSInterface();
    }
    return this.cs;
  }

  /** True when running inside a CEP panel (Premiere/AE) */
  get isAvailable(): boolean {
    return typeof CSInterface !== 'undefined' && !!window.__adobe_cep__;
  }

  /** Execute an ExtendScript expression and return the raw string result */
  evalScriptRaw(script: string): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.isAvailable) {
        console.warn(`[CSI Mock] evalScript: ${script.substring(0, 80)}...`);
        resolve('');
        return;
      }
      this.get().evalScript(script, (result: string) => {
        // ── DEBUG: log every raw CEP callback value ──────────────────────
        // This tells us exactly what Premiere is handing back before we
        // make any decision. Look for unexpected values like null, "Error",
        // or empty string when you expect "OPEN".
        const snippet = script.substring(0, 60);
        if (result === 'EvalScript error.' || result === 'undefined') {
          console.error(
            '%c[CSI]%c evalScript REJECTED',
            'color:#f87171;font-weight:bold', 'color:inherit',
            `\n  script : "${snippet}..."`,
            `\n  result : "${result}"`
          );
          reject(new Error(`EvalScript rejected with "${result}" | script: ${snippet}`));
        } else {
          // Only log when result is non-trivially short (avoids noise on empty "" returns)
          if (result && result.length > 0) {
            console.log(
              '%c[CSI]%c evalScript OK',
              'color:#60a5fa;font-weight:bold', 'color:inherit',
              `\n  script : "${snippet}..."`,
              `\n  result : "${result.substring(0, 120)}${result.length > 120 ? '…' : ''}"`
            );
          } else {
            console.log(
              '%c[CSI]%c evalScript → empty string',
              'color:#94a3b8;font-weight:bold', 'color:inherit',
              `\n  script : "${snippet}..."`
            );
          }
          resolve(result || '');
        }
      });
    });
  }

  /**
   * Call a named JSX function with optional JSON-serializable params.
   * Handles the {ok, data, error} envelope + legacy JSON fallback.
   */
  async callJSX<T = unknown>(funcName: string, params?: unknown): Promise<T> {
    const script = params !== undefined
      ? `${funcName}(${JSON.stringify(params)})`
      : `${funcName}()`;

    console.log(
      '%c[JS→JSX]%c %s',
      'color: #00bcd4; font-weight: bold;',
      'color: default;',
      funcName,
      params ?? ''
    );

    const raw = await this.evalScriptRaw(script);

    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && 'ok' in parsed) {
        if (parsed.ok) return parsed.data as T;
        throw new Error(parsed.error || 'Unknown Backend Error');
      }
      return parsed as T;
    } catch {
      return raw as unknown as T;
    }
  }

  /** Check if a JSX function exists in the engine's global scope */
  async probeFunction(funcName: string): Promise<boolean> {
    if (!this.isAvailable) return false;
    const result = await this.evalScriptRaw(`typeof ${funcName}`);
    return result === 'function';
  }

  /** Subscribe to a CSXS event */
  on(eventId: string, handler: (event: CSEvent) => void): void {
    if (!this.isAvailable) return;
    this.get().addEventListener(eventId, handler);
  }

  /** Unsubscribe from a CSXS event */
  off(eventId: string, handler: (event: CSEvent) => void): void {
    if (!this.isAvailable) return;
    this.get().removeEventListener(eventId, handler);
  }

  /** Dispatch a CSXS event */
  dispatch(eventId: string, payload?: string): void {
    if (!this.isAvailable) return;
    const event = new CSEvent();
    event.type = eventId;
    event.scope = 'APPLICATION';
    event.data = payload ?? '';
    this.get().dispatchEvent(event);
  }

  /** Get the extension's filesystem path */
  getExtensionPath(): string {
    if (!this.isAvailable) return '';
    return this.get().getSystemPath('extension');
  }
}

/** Singleton CSI instance — use this everywhere */
export const csi = new CSI();
