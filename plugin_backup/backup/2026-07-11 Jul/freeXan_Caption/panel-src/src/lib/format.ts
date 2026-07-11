/**
 * freeXan Caption — Format Utilities
 * Small pure-function helpers for string/path/time formatting.
 */

/** Format seconds to MM:SS.mmm timecode */
export function formatTime(seconds: number | null | undefined): string {
  if (!seconds) return '00:00.000';
  const date = new Date(0);
  date.setMilliseconds(seconds * 1000);
  return date.toISOString().substring(14, 23);
}

/** Extract filename from a full path */
export function basename(filepath: string): string {
  const sep = filepath.includes('/') ? '/' : '\\';
  const parts = filepath.split(sep);
  return parts[parts.length - 1] || filepath;
}

/** Truncate a string with ellipsis */
export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.substring(0, maxLen - 1) + '…';
}
