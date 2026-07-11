/**
 * freeXan Caption — Param Utils
 * Logic for extracting template.json from .aegraphic ZIPs.
 */
import { node } from '@/lib/node';

export const readTemplateJson = (aegraphicPath: string) => {
  if (!node.isAvailable || !aegraphicPath) return null;
  try {
    if (!node.fs.existsSync(aegraphicPath)) return null;
    const buf = node.fs.readFileSync(aegraphicPath);

    // 1. Find EOCD
    let eocd = -1;
    for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65558); i--) {
      if (buf[i]===0x50 && buf[i+1]===0x4B && buf[i+2]===0x05 && buf[i+3]===0x06) {
        eocd = i; break;
      }
    }
    if (eocd < 0) return null;

    const cdOffset = buf.readUInt32LE(eocd + 16);
    const cdEntries = buf.readUInt16LE(eocd + 10);

    // 2. Scan central directory
    let pos = cdOffset;
    for (let e = 0; e < cdEntries; e++) {
      if (buf[pos]!==0x50 || buf[pos+1]!==0x4B || buf[pos+2]!==0x01 || buf[pos+3]!==0x02) break;

      const method = buf.readUInt16LE(pos + 10);
      const cmpSize = buf.readUInt32LE(pos + 20);
      const fnLen = buf.readUInt16LE(pos + 28);
      const exLen = buf.readUInt16LE(pos + 30);
      const cmtLen = buf.readUInt16LE(pos + 32);
      const lhOffset = buf.readUInt32LE(pos + 42);
      const entryName = buf.slice(pos + 46, pos + 46 + fnLen).toString('utf8');

      if (entryName === 'template.json' || entryName.slice(-14) === '/template.json') {
        const lfnLen = buf.readUInt16LE(lhOffset + 26);
        const lexLen = buf.readUInt16LE(lhOffset + 28);
        const dataStart = lhOffset + 30 + lfnLen + lexLen;

        const raw = buf.slice(dataStart, dataStart + cmpSize);
        const content = (method === 8) ? node.zlib.inflateRawSync(raw as any) : raw;
        return JSON.parse(content.toString('utf8'));
      }
      pos += 46 + fnLen + exLen + cmtLen;
    }
  } catch (e) {}
  return null;
};

export const extractDisplayNames = (obj: any, depth: number, result: string[]): string[] | void => {
  if (!obj || typeof obj !== 'object' || depth > 10) return;
  if (!result) result = [];
  if (typeof obj.displayName === 'string' && obj.displayName) result.push(obj.displayName);
  const keys = Object.keys(obj);
  for (let k = 0; k < keys.length; k++) {
    const child = obj[keys[k]];
    if (child && typeof child === 'object') extractDisplayNames(child, depth + 1, result);
  }
  return result;
};

export const applySchema = (jsxParams: any[], schemaNames: string[]) => {
  const editable = jsxParams.filter(p => p.kind !== 'complex' && p.kind !== 'group');
  if (!schemaNames || !schemaNames.length) return editable;
  const byName: any = {};
  editable.forEach(p => { byName[p.displayName] = p; });
  const ordered = schemaNames.reduce((acc: any[], name) => {
    if (byName[name]) acc.push(byName[name]);
    return acc;
  }, []);
  return ordered.length > 0 ? ordered : editable;
};

export const normalizeClips = (rawClips: any[]) => {
  if (!rawClips || !rawClips.length) return [];
  return rawClips.map(clip => {
    const params = (clip.params || []).map((p: any) => {
      const isColor = p.kind === 'color';
      let value = p.val;
      let displayValue = null;
      const rawJson = p.rawJson || null;

      if (isColor) {
        const hex = p.val || '888888';
        value = { r: parseInt(hex.slice(0,2),16), g: parseInt(hex.slice(2,4),16), b: parseInt(hex.slice(4,6),16) };
      } else if (p.kind === 'text') {
        displayValue = p.val;
        value = p.val;
      }

      return {
        index: p.idx,
        displayName: p.name,
        kind: p.kind,
        value,
        isColor,
        displayValue,
        rawJson
      };
    });

    return { nodeId: clip.nodeId, name: clip.name, path: clip.path || '', params };
  });
};
