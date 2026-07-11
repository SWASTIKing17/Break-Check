/**
 * freeXan Caption — PhraseRow
 * Represents a single phrase containing multiple word bubbles.
 * Supports generic MOGRTs (single clip) and freeXan MOGRTs (multi clip).
 * Integrates SortableJS for word transfer.
 */
import React, { useRef, useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';
import Sortable from 'sortablejs';
import { Phrase } from '@/store/editStore';
import { formatTime } from '@/lib/format';
import { WordBubble } from './WordBubble';

interface PhraseRowProps {
  phrase: Phrase;
  pIdx: number;
  activeClipId: string | null;
  selection: string[];
  editingClipId: string | null;
  playheadClipId: string | null;
  timelineMapRef: React.MutableRefObject<Phrase[]>;
  onBubbleClick: (target: any, clipId: string, e: React.MouseEvent) => void;
  onBubbleEdit: (target: any, pIdx: number, cIdx: number, newText?: string | null) => void;
  onLock: (pIdx: number, locked: boolean) => void;
  onPhraseSelect: (pIdx: number, isShiftOrCtrl: boolean) => void;
  onSplit: (pIdx: number, cIdx: number) => void;
  onTransferRef: React.MutableRefObject<any>;
  onInvalidDropRef: React.MutableRefObject<any>;
  onSelectByMogrt?: (mogrtName: string) => void;
}

export const PhraseRow: React.FC<PhraseRowProps> = ({
  phrase, pIdx, activeClipId, selection, editingClipId, playheadClipId, timelineMapRef,
  onBubbleClick, onBubbleEdit, onLock, onPhraseSelect, onSplit,
  onTransferRef, onInvalidDropRef, onSelectByMogrt
}) => {
  const rowRef = useRef<HTMLDivElement>(null);
  const bubbleZoneRef = useRef<HTMLDivElement>(null);

  // Live refs for Sortable callbacks
  const phraseRef = useRef(phrase); phraseRef.current = phrase;
  const pIdxRef = useRef(pIdx);     pIdxRef.current = pIdx;
  const selectionRef = useRef(selection); selectionRef.current = selection;

  const isPhraseFullySelected = useMemo(() => {
    if (!phrase || !phrase.clips || phrase.clips.length === 0) return false;
    return phrase.clips.every((_, i) => selection.includes(`${pIdx}-${i}`));
  }, [phrase, selection, pIdx]);

  const rawMogrtName = phrase.clips?.[0]?.mogrtName || 'unknown';
  const cleanMogrtName = rawMogrtName.split(/[/\\]/).pop()?.replace(/\.mogrt$/i, '').trim().toLowerCase() || 'unknown';
  const nameHash = cleanMogrtName.split('').reduce((a: number, b: string) => {
    a = ((a << 5) - a) + b.charCodeAt(0);
    return a & a;
  }, 0);
  const hue = Math.abs(nameHash) % 360;
  // A subtle glass tint using the generated hue
  const rowStyle = {
    backgroundColor: `hsla(${hue}, 50%, 50%, 0.08)`,
    borderColor: `hsla(${hue}, 65%, 55%, 0.4)`,
    borderLeft: `4px solid hsla(${hue}, 80%, 65%, 0.9)`
  };

  const isGenericMode = phrase?.mogrtMode === 'generic'
    && Array.isArray(phrase.wordDistribution) && phrase.wordDistribution.length > 0
    && Array.isArray(phrase.wordTimings) && phrase.wordTimings.length > 0;

  useEffect(() => {
    if (!bubbleZoneRef.current || isGenericMode) return;
    let lastCrossRowMoveOk: boolean | null = null;
    
    const sortable = Sortable.create(bubbleZoneRef.current, {
      group: 'phrases',
      sort: false, // drag between phrases, not reordering within phrase
      animation: 150,
      ghostClass: 'sortable-ghost',
      chosenClass: 'sortable-chosen',
      dragClass: 'sortable-drag',
      draggable: '.cc-word-pill',
      onStart: (evt) => {
        lastCrossRowMoveOk = null;
        const wordIdx = parseInt(evt.item.dataset.wordIndex || '0');
        const phraseLive = phraseRef.current;
        const pIdxLive = pIdxRef.current;
        const map = timelineMapRef.current;
        
        document.querySelectorAll('.cc-phrase-row').forEach(r => r.classList.remove('cc-valid-target'));

        if (phraseLive.isLocked) return;

        if (wordIdx === 0 && pIdxLive > 0) {
          const prev = map[pIdxLive - 1];
          if (prev && !prev.isLocked) {
            document.querySelector(`.cc-phrase-row[data-phrase-id="${pIdxLive - 1}"]`)?.classList.add('cc-valid-target');
          }
        }
        if (wordIdx === phraseLive.clips.length - 1 && pIdxLive < map.length - 1) {
          const next = map[pIdxLive + 1];
          if (next && !next.isLocked) {
            document.querySelector(`.cc-phrase-row[data-phrase-id="${pIdxLive + 1}"]`)?.classList.add('cc-valid-target');
          }
        }
      },
      onMove: (evt) => {
        const fromIdx = parseInt(evt.from.dataset.phraseId || '0');
        const toIdx = parseInt(evt.to.dataset.phraseId || '0');
        if (fromIdx === toIdx) return true;
        
        const wordIdx = parseInt(evt.dragged.dataset.wordIndex || '0');
        const map = timelineMapRef.current;
        let ok = true;
        
        if (Math.abs(fromIdx - toIdx) !== 1) ok = false;
        else if (!map[fromIdx] || !map[toIdx]) ok = false;
        else if (map[fromIdx].isLocked || map[toIdx].isLocked) ok = false;
        else {
          const phraseLength = map[fromIdx].clips.length;
          const sel = selectionRef.current || [];
          const selPositions = sel
            .filter(s => parseInt(s.split('-')[0]) === fromIdx)
            .map(s => parseInt(s.split('-')[1]))
            .sort((a, b) => a - b);
            
          let firstPos = wordIdx, lastPos = wordIdx;
          if (sel.includes(`${fromIdx}-${wordIdx}`) && selPositions.length > 1) {
            let contiguous = true;
            for (let i = 1; i < selPositions.length; i++) {
              if (selPositions[i] !== selPositions[i - 1] + 1) { contiguous = false; break; }
            }
            if (contiguous && selPositions.length < phraseLength) {
              firstPos = selPositions[0];
              lastPos = selPositions[selPositions.length - 1];
            }
          }
          if (toIdx < fromIdx && firstPos !== 0) ok = false;
          if (toIdx > fromIdx && lastPos !== phraseLength - 1) ok = false;
        }
        lastCrossRowMoveOk = ok;
        return ok;
      },
      onEnd: (evt) => {
        document.querySelectorAll('.cc-phrase-row').forEach(r => r.classList.remove('cc-valid-target'));
        if (evt.from !== evt.to) {
          const draggables = Array.from(evt.from.querySelectorAll('.cc-word-pill'));
          const refNode = draggables[evt.oldIndex || 0] || null;
          evt.from.insertBefore(evt.item, refNode);
          onTransferRef.current && onTransferRef.current(evt);
        } else if (lastCrossRowMoveOk === false) {
          onInvalidDropRef.current && onInvalidDropRef.current(evt.item);
        }
        lastCrossRowMoveOk = null;
      }
    });
    
    return () => sortable.destroy();
  }, [isGenericMode, onTransferRef, onInvalidDropRef, timelineMapRef]);

  if (!phrase || !phrase.clips) return null;

  return (
    <motion.div
      ref={rowRef}
      className={`cc-phrase-row ${isPhraseFullySelected ? 'cc-is-selected' : ''} ${phrase.isLocked ? 'cc-is-locked' : ''}`}
      data-phrase-id={pIdx}
      onClick={(e) => onPhraseSelect(pIdx, e.shiftKey || e.ctrlKey || e.metaKey)}
      style={rowStyle}
    >
      <div className="cc-phrase-header">
        <div className="cc-phrase-meta" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ color: 'var(--fx-accent-teal)', fontWeight: 800 }}>#{pIdx + 1}</span>
          <span>•</span>
          <span>{formatTime(phrase.start)}</span>
          {rawMogrtName && rawMogrtName !== 'unknown' && (
            <>
              <span>•</span>
              <span
                style={{
                  backgroundColor: `hsla(${hue}, 60%, 50%, 0.15)`,
                  color: `hsl(${hue}, 85%, 75%)`,
                  border: `1px solid hsla(${hue}, 60%, 50%, 0.35)`,
                  padding: '1px 6px',
                  borderRadius: '10px',
                  fontSize: '10px',
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  cursor: 'pointer'
                }}
                title={`Assigned MOGRT: ${rawMogrtName} — Click to select all phrases with this MOGRT`}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectByMogrt && onSelectByMogrt(rawMogrtName);
                }}
              >
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: `hsl(${hue}, 80%, 65%)`, boxShadow: `0 0 4px hsla(${hue}, 80%, 65%, 0.6)` }}></span>
                {rawMogrtName.replace(/\.mogrt$/i, '')}
              </span>
            </>
          )}
        </div>
        <div className="cc-phrase-actions" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            className="cc-btn cc-lock-btn"
            onClick={(e) => { e.stopPropagation(); onLock(pIdx, !phrase.isLocked); }}
            style={{ background: 'none', border: 'none', color: phrase.isLocked ? '#F0AD4E' : '#444', fontSize: '11px', padding: 0 }}
            title={phrase.isLocked ? 'Locked — click to unlock' : 'Click to lock phrase'}
          >
            {phrase.isLocked ? '🔒' : '🔓'}
          </button>
        </div>
      </div>
      
      {isGenericMode ? (
        phrase.wordDistribution?.map((wordIndices, inputIdx) => {
          const inputLabel = (phrase.textInputNames && phrase.textInputNames[inputIdx]) || `Line ${inputIdx + 1}`;
          return (
            <div
              className="cc-bubble-zone cc-bubble-zone-grouped"
              key={`gen-${pIdx}-${inputIdx}`}
              data-phrase-id={pIdx}
              data-input-index={inputIdx}
            >
              <span className="cc-input-label" title={inputLabel}>{inputLabel}</span>
              {wordIndices.map((wIdx: number, posInRow: number) => {
                const word = phrase.wordTimings?.[wIdx];
                if (!word) return null;
                const backingClip = phrase.clips[0];
                const isLastInRow = posInRow === wordIndices.length - 1;
                return (
                  <WordBubble
                    key={`gen-${pIdx}-${inputIdx}-${wIdx}`}
                    clip={backingClip}
                    word={word}
                    pIdx={pIdx}
                    cIdx={wIdx}
                    isActive={activeClipId === `${pIdx}-${wIdx}`}
                    isSelected={selection.includes(`${pIdx}-${wIdx}`)}
                    isEditing={editingClipId === `${pIdx}-${wIdx}`}
                    isPlayhead={playheadClipId === `${pIdx}-${wIdx}`}
                    isPhraseLocked={!!phrase.isLocked}
                    isLast={isLastInRow}
                    onClick={onBubbleClick}
                    onDoubleClick={onBubbleEdit}
                    onSplit={onSplit}
                    onEditCommit={(newText) => onBubbleEdit(backingClip, pIdx, wIdx, newText)}
                    onEditCancel={() => onBubbleEdit(null, -1, -1, null)}
                  />
                );
              })}
            </div>
          );
        })
      ) : (
        <div className="cc-bubble-zone" ref={bubbleZoneRef} data-phrase-id={pIdx}>
          {phrase.clips.map((clip, cIdx) => (
            <WordBubble
              key={`${pIdx}-${cIdx}-${clip.index}`}
              clip={clip} pIdx={pIdx} cIdx={cIdx}
              isActive={activeClipId === `${pIdx}-${cIdx}`}
              isSelected={selection.includes(`${pIdx}-${cIdx}`)}
              isEditing={editingClipId === `${pIdx}-${cIdx}`}
              isPlayhead={playheadClipId === `${pIdx}-${cIdx}`}
              isPhraseLocked={!!phrase.isLocked}
              isLast={cIdx === phrase.clips.length - 1}
              onClick={onBubbleClick}
              onDoubleClick={onBubbleEdit}
              onSplit={onSplit}
              onEditCommit={(newText) => onBubbleEdit(clip, pIdx, cIdx, newText)}
              onEditCancel={() => onBubbleEdit(null, -1, -1, null)}
            />
          ))}
        </div>
      )}
    </motion.div>
  );
};
