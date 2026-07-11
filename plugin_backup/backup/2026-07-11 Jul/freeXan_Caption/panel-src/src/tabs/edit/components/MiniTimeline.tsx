/**
 * freeXan Caption — MiniTimeline
 * A compact scrubbable timeline overview of phrases.
 */
import React from 'react';
import { Phrase } from '@/store/editStore';
import { formatTime } from '@/lib/format';

interface MiniTimelineProps {
  timelineMap: Phrase[];
  activePhraseIdx: number;
  onSelect: (idx: number) => void;
}

export const MiniTimeline: React.FC<MiniTimelineProps> = ({ timelineMap, activePhraseIdx, onSelect }) => {
  if (!timelineMap || timelineMap.length === 0) return null;
  
  const start = timelineMap[0]?.start || 0;
  const end = timelineMap[timelineMap.length - 1]?.end || 1;
  const totalDuration = Math.max(0.1, end - start);
  
  return (
    <div className="cc-mini-timeline">
      {timelineMap.map((phrase, idx) => {
        const phraseDur = Math.max(0, phrase.end - phrase.start);
        const width = (phraseDur / totalDuration) * 100;
        return (
          <div 
            key={idx}
            className={`cc-mini-phrase-block ${activePhraseIdx === idx ? 'is-active' : ''}`}
            style={{ width: `${Math.max(width, 2)}%` }}
            onClick={() => onSelect(idx)}
          >
            {idx % 5 === 0 && (
              <span className="cc-mini-time-label">{formatTime(phrase.start)}</span>
            )}
          </div>
        );
      })}
    </div>
  );
};
