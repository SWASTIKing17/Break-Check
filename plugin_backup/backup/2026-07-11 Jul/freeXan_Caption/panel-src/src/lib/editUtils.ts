/**
 * freeXan Caption — Edit Tab Utilities
 * Shared helpers for the Command Center port.
 */
import { csi } from './csi';

export const lockStore = {
  KEY: 'freexan_caption_phrase_locks_v1',
  _read() {
    try { return JSON.parse(localStorage.getItem(this.KEY) || '{}'); }
    catch (e) { return {}; }
  },
  _write(map: Record<string, number>) {
    try { localStorage.setItem(this.KEY, JSON.stringify(map)); } catch (e) { /* quota */ }
  },
  get(id: string): boolean { return !!this._read()[id]; },
  set(id: string, locked: boolean) {
    const m = this._read();
    if (locked) m[id] = 1; else delete m[id];
    this._write(m);
  }
};

export const phraseIdOf = (phrase: any) => {
  const c = phrase && phrase.clips && phrase.clips[0];
  return c ? `${c.track}-${c.index}` : `empty-${Math.random()}`;
};

const _genericXmpCache = new Map<string, any>();
export const readGenericClipXMP = async (trackIndex: number, clipIndex: number) => {
  const cacheKey = `${trackIndex}-${clipIndex}`;
  if (_genericXmpCache.has(cacheKey)) return _genericXmpCache.get(cacheKey);

  const script = `(function() { try {
    var seq = app.project.activeSequence;
    if (!seq) return JSON.stringify({ok:false, error:'no sequence'});
    var track = seq.videoTracks[${trackIndex}];
    if (!track) return JSON.stringify({ok:false, error:'no track'});
    var clip = track.clips[${clipIndex}];
    if (!clip) return JSON.stringify({ok:false, error:'no clip'});
    if (typeof _smIsGenericClip !== 'function' || !_smIsGenericClip(clip)) {
      return JSON.stringify({ok:true, data:null});
    }
    if (typeof _smReadWordTimings !== 'function') {
      return JSON.stringify({ok:false, error:'no reader'});
    }
    var data = _smReadWordTimings(clip.projectItem);
    return JSON.stringify({ok:true, data: data || null});
  } catch (e) { return JSON.stringify({ok:false, error: String(e)}); } })()`;

  try {
    const result: any = await csi.evalScriptRaw(script);
    let out = null;
    try {
      const parsed = JSON.parse(result);
      if (parsed && parsed.ok && parsed.data) {
        out = parsed.data;
      }
    } catch (e) {
      // Ignore parse errors
    }
    _genericXmpCache.set(cacheKey, out);
    return out;
  } catch (e) {
    _genericXmpCache.set(cacheKey, null);
    return null;
  }
};

export const enrichPhrasesWithMogrtMode = async (phrases: any[]) => {
  if (!Array.isArray(phrases) || phrases.length === 0) return phrases;
  await Promise.all(phrases.map(async (phrase) => {
    if (!phrase || !phrase.clips || phrase.clips.length === 0) return;
    if (phrase.mogrtMode === 'generic' && Array.isArray(phrase.wordDistribution)) return;
    
    const first = phrase.clips[0];
    if (!first || typeof first.track !== 'number' || typeof first.index !== 'number') {
      phrase.mogrtMode = phrase.mogrtMode || 'freexan';
      return;
    }

    const xmp = await readGenericClipXMP(first.track, first.index);
    if (xmp && Array.isArray(xmp.words) && xmp.words.length > 0) {
      phrase.mogrtMode = 'generic';
      phrase.wordTimings = xmp.words;
      phrase.wordDistribution = Array.isArray(xmp.distribution) && xmp.distribution.length > 0
        ? xmp.distribution
        : [xmp.words.map((_: any, i: number) => i)];
      phrase.textInputCount = xmp.textInputCount || phrase.wordDistribution.length;
      phrase.textInputNames = Array.isArray(xmp.textInputNames) ? xmp.textInputNames : [];
    } else {
      phrase.mogrtMode = phrase.mogrtMode || 'freexan';
    }
  }));
  return phrases;
};
