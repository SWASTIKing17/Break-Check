/**
 * freeXan Caption — WordBubble
 * Interactive pill for a single word. Supports inline rename and splitting.
 */
import React, { useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Clip } from '@/store/editStore';

interface WordBubbleProps {
  clip: Clip;
  word?: any;
  pIdx: number;
  cIdx: number;
  isActive: boolean;
  isSelected: boolean;
  isLast: boolean;
  isEditing: boolean;
  isPhraseLocked: boolean;
  isPlayhead: boolean;
  onClick: (target: any, clipId: string, e: React.MouseEvent) => void;
  onDoubleClick: (target: any, pIdx: number, cIdx: number) => void;
  onSplit: (pIdx: number, cIdx: number) => void;
  onEditCommit: (val: string) => void;
  onEditCancel: () => void;
}

export const WordBubble: React.FC<WordBubbleProps> = ({
  clip, word, pIdx, cIdx, isActive, isSelected, isLast, isEditing, isPhraseLocked,
  isPlayhead, onClick, onDoubleClick, onSplit, onEditCommit, onEditCancel
}) => {
  const clipId = `${pIdx}-${cIdx}`;
  const inputRef = useRef<HTMLInputElement>(null);
  
  const displayText = (word && word.text) || (clip && clip.text) || '...';
  const clickTarget = word
    ? { ...clip, start: word.start, end: word.end, text: word.text, _genericWord: true }
    : clip;

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  return (
    <React.Fragment>
      {isEditing ? (
        <input
          ref={inputRef}
          className="cc-word-edit"
          defaultValue={displayText}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') {
              const v = (e.target as HTMLInputElement).value.trim();
              if (!v || v === displayText) onEditCancel();
              else onEditCommit(v);
            } else if (e.key === 'Escape') {
              onEditCancel();
            }
          }}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (!v || v === displayText) onEditCancel();
            else onEditCommit(v);
          }}
        />
      ) : (
        <div
          id={`cc-word-${pIdx}-${cIdx}`}
          className={[
            'cc-word-pill',
            isActive ? 'cc-is-active' : '',
            isSelected ? 'cc-is-selected' : '',
            isPhraseLocked ? 'cc-is-locked' : '',
            isPlayhead ? 'cc-is-playhead' : ''
          ].join(' ').trim()}
          data-clip-id={clipId}
          data-phrase-id={pIdx}
          data-word-index={cIdx}
          onClick={(e) => onClick(clickTarget, clipId, e)}
          onDoubleClick={(e) => { e.stopPropagation(); onDoubleClick(clickTarget, pIdx, cIdx); }}
        >
          {displayText}
        </div>
      )}
      {!isLast && (
        <motion.div 
          layout
          className="cc-laser-gap" 
          onClick={(e) => { e.stopPropagation(); onSplit(pIdx, cIdx); }}
        >
          <div className="cc-laser-line" />
        </motion.div>
      )}
    </React.Fragment>
  );
};
