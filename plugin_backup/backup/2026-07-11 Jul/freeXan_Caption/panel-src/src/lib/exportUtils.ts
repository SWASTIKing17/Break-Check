import { Phrase } from '../store/editStore';

function formatSrtTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds - Math.floor(seconds)) * 1000);
  
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
}

export function generateWbwSrt(timelineMap: Phrase[]): string {
  let srt = '';
  let counter = 1;
  for (const phrase of timelineMap) {
    for (const clip of phrase.clips) {
      if (clip.start === undefined || clip.end === undefined) continue;
      srt += `${counter}\n`;
      srt += `${formatSrtTime(clip.start)} --> ${formatSrtTime(clip.end)}\n`;
      srt += `${clip.text || ''}\n\n`;
      counter++;
    }
  }
  return srt;
}

export function generatePhrasedSrt(timelineMap: Phrase[]): string {
  let srt = '';
  let counter = 1;
  for (const phrase of timelineMap) {
    if (!phrase.clips || phrase.clips.length === 0) continue;
    
    // Find absolute start and end across all clips in the phrase
    let start = Number.MAX_VALUE;
    let end = 0;
    
    for (const clip of phrase.clips) {
      if (clip.start !== undefined && clip.start < start) start = clip.start;
      if (clip.end !== undefined && clip.end > end) end = clip.end;
    }
    
    if (start === Number.MAX_VALUE) continue;
    
    const text = phrase.clips.map(c => c.text || '').join(' ');
    
    srt += `${counter}\n`;
    srt += `${formatSrtTime(start)} --> ${formatSrtTime(end)}\n`;
    srt += `${text}\n\n`;
    counter++;
  }
  return srt;
}
