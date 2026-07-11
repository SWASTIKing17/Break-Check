/**
 * freeXan Caption — Node API Wrapper
 * Safely access Node.js APIs in the CEP environment without
 * breaking the Vite browser build.
 */

let fs: typeof import('fs') | null = null;
let path: typeof import('path') | null = null;
let os: typeof import('os') | null = null;
let child_process: typeof import('child_process') | null = null;
let zlib: typeof import('zlib') | null = null;

if (typeof window !== 'undefined' && window.cep_node && window.cep_node.require) {
  try {
    fs = window.cep_node.require('fs');
    path = window.cep_node.require('path');
    os = window.cep_node.require('os');
    child_process = window.cep_node.require('child_process');
    zlib = window.cep_node.require('zlib');
  } catch (e) {
    console.warn('[freeXan Node] Failed to require node modules:', e);
  }
}

export const node = {
  get fs() {
    if (!fs) throw new Error('Node fs module not available');
    return fs;
  },
  get path() {
    if (!path) throw new Error('Node path module not available');
    return path;
  },
  get os() {
    if (!os) throw new Error('Node os module not available');
    return os;
  },
  get child_process() {
    if (!child_process) throw new Error('Node child_process module not available');
    return child_process;
  },
  get zlib() {
    if (!zlib) throw new Error('Node zlib module not available');
    return zlib;
  },
  get isAvailable() {
    return !!fs && !!path;
  }
};
