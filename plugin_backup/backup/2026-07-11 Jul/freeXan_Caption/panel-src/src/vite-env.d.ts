/// <reference types="vite/client" />

/**
 * Adobe CSInterface global — loaded via <script src="js/CSInterface.js">
 * before the React bundle. We declare it here so TypeScript doesn't complain.
 */
declare class CSInterface {
  evalScript(script: string, callback?: (result: string) => void): void;
  addEventListener(type: string, listener: (event: CSEvent) => void): void;
  removeEventListener(type: string, listener: (event: CSEvent) => void): void;
  dispatchEvent(event: CSEvent): void;
  getSystemPath(pathType: string): string;
  requestOpenExtension(extensionId: string): void;
  closeExtension(): void;
}

declare class CSEvent {
  type: string;
  scope: string;
  appId: string;
  extensionId: string;
  data: string;
}

/**
 * Adobe CEP global — available in CEP panel environment.
 */
declare interface Window {
  __adobe_cep__?: {
    evalScript(script: string, callback?: (result: string) => void): void;
  };
  cep_node?: {
    Buffer: typeof Buffer;
    process: typeof process;
    require: NodeRequire;
  };
}
