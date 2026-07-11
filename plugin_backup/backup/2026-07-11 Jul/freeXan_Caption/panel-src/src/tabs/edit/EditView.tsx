import React, { useEffect, useRef, useMemo, useCallback } from 'react';
import { useEditStore } from '@/store/editStore';
import { useWorkflowStore } from '@/store/workflowStore';
import { useJsx } from '@/hooks/useJsx';
import { useSessionStore } from '@/store/sessionStore';
import { PhraseRow } from './components/PhraseRow';
import { ToastZone } from './components/ToastZone';
import { EmptyDashboard } from './components/Dashboard';
import { PropertyGroup } from './components/Inspector';
import { lockStore, enrichPhrasesWithMogrtMode, phraseIdOf } from '@/lib/editUtils';
import { generateWbwSrt, generatePhrasedSrt } from '@/lib/exportUtils';
import './EditView.css';

export const EditView: React.FC = () => {
  const { execute, loading } = useJsx();
  const mogrtPath = useWorkflowStore((s) => s.mogrtPath);
  // Read connection state so the playhead poller can skip when there's no sequence.
  // This prevents the 171K+ "No active sequence" errors that flood the ExtendScript bridge.
  const connection = useSessionStore((s) => s.connection);
  const setCtiSecs = useSessionStore((s) => s.setCtiSecs);
  
  // Local volatile state
  const [isBusy, setIsBusy] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [log, setLog] = React.useState('Ready');
  
  // Playhead follower
  const [playheadClipId, setPlayheadClipId] = React.useState<string | null>(null);
  const autoFollowRef = useRef(true);
  const followTimerRef = useRef<any>(null);
  const navigatorRef = useRef<HTMLDivElement>(null);
  
  // Inspector
  const [inspectorProps, setInspectorProps] = React.useState<any[]>([]);
  const [searchFilter, setSearchFilter] = React.useState('');
  const [pinnedProps, setPinnedProps] = React.useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('freexan_caption_pinned_props_v1') || '[]'); }
    catch { return []; }
  });
  
  const inspectorDebounceRef = useRef<Record<string, any>>({});
  
  // Zustand store
  const { timelineMap, selectedClipId, activePhraseIdx, toasts, setTimelineMap, setActivePhraseIdx, addToast, reset } = useEditStore();
  const [selection, setSelection] = React.useState<string[]>([]);
  const [editingClipId, setEditingClipId] = React.useState<string | null>(null);

  const timelineMapRef = useRef(timelineMap);
  timelineMapRef.current = timelineMap;
  
  const onTransferRef = useRef<any>(null);
  const onInvalidDropRef = useRef<any>(null);
  const requestIdRef = useRef(0);

  // Contiguity and Full Selection Memos
  const selectionContiguity = useMemo(() => {
    if (selection.length < 2) return { isContiguous: false, phraseIndices: [] };
    const pIndices = [...new Set(selection.map(s => parseInt(s.split('-')[0])))].sort((a, b) => a - b);
    const isContiguous = (pIndices[pIndices.length - 1] - pIndices[0]) === (pIndices.length - 1);
    return { isContiguous, phraseIndices: pIndices };
  }, [selection]);

  const fullySelectedPhrases = useMemo(() => {
    if (selection.length === 0) return [];
    const pIndices = [...new Set(selection.map(s => parseInt(s.split('-')[0])))];
    return pIndices.filter(pIdx => {
      const phrase = timelineMap[pIdx];
      if (!phrase || !Array.isArray(phrase.clips)) return false;
      const allIds = phrase.clips.map((_, i) => `${pIdx}-${i}`);
      return allIds.every(id => selection.includes(id));
    });
  }, [selection, timelineMap]);

  // --- Handlers ---
  const applyPersistedLocks = (map: any[]) => map.map(p => ({ ...p, isLocked: p.isLocked || lockStore.get(phraseIdOf(p)) }));

  const refreshTimeline = useCallback(async (silent = false) => {
    const myReq = ++requestIdRef.current;
    try {
      setIsBusy(true);
      if (!silent) setLog('Scanning...');
      const response = await execute('getTimelinePhraseMap');
      if (myReq !== requestIdRef.current) return;
      
      const fresh = Array.isArray(response) ? response : [];
      setTimelineMap(applyPersistedLocks(fresh));
      
      try {
        await enrichPhrasesWithMogrtMode(fresh);
        if (myReq !== requestIdRef.current) return;
        setTimelineMap(applyPersistedLocks([...fresh])); 
      } catch (e) {
        console.warn('[CC] Enrichment failed:', e);
      }
      setLog('Ready');
    } catch (e: any) {
      if (myReq !== requestIdRef.current) return;
      setLog('Scan Failed');
      addToast('Scan failed: ' + (e.message || 'unknown'), 'error');
    } finally {
      if (myReq === requestIdRef.current) {
        setIsBusy(false); setProgress(0);
      }
    }
  }, [execute, setTimelineMap, addToast]);

  useEffect(() => {
    refreshTimeline();
  }, [refreshTimeline]);

  // Inspector Fetching
  useEffect(() => {
    const fetchInspector = async () => {
      if (selection.length === 0) {
        setInspectorProps([]); return;
      }
      const pIndices = [...new Set(selection.map(s => parseInt(s.split('-')[0])))];
      if (pIndices.length !== 1) {
        setInspectorProps([]); return;
      }
      const pIdx = pIndices[0];
      const phrase = timelineMapRef.current[pIdx];
      if (!phrase || phrase.clips.length === 0) return;

      const firstSelectedCIdx = parseInt(selection[0].split('-')[1]);
      const clip = phrase.clips[firstSelectedCIdx];
      if (!clip) return;

      try {
        const props = await execute('inspectMogrtProperties', { trackIndex: clip.track, clipIndex: clip.index });
        setInspectorProps(Array.isArray(props) ? props : []);
      } catch (e) {
        setInspectorProps([]);
      }
    };
    fetchInspector();
  }, [selection, execute]);

  // Playhead follower
  // Interval: 500ms (was 250ms) — halves bridge traffic.
  // Guard: skip entirely when connection !== 'connected' (no active sequence means
  // getPlayheadTime will always throw, flooding the bridge with silent errors).
  useEffect(() => {
    let prevCti: number | null = null;

    const tick = async () => {
      // Skip the JSX call when Premiere has no active sequence.
      // This was causing 171,000+ "No active sequence" exceptions per session.
      if (connection !== 'connected') return;

      try {
        const cti: any = await execute('getPlayheadTime');
        if (typeof cti !== 'number' || isNaN(cti)) return;

        const isPlaying = prevCti !== null && Math.abs(cti - prevCti) > 0.05;
        prevCti = cti;
        setCtiSecs(cti); // broadcast to shared store — ParamsView reads this

        const FRAME_EPS = 0.001;
        const map = timelineMapRef.current;
        let found: string | null = null;
        let foundStart = -Infinity;
        for (let pi = 0; pi < map.length; pi++) {
          if (!map[pi].clips) continue;
          for (let ci = 0; ci < map[pi].clips.length; ci++) {
            const c = map[pi].clips[ci];
            if (cti + FRAME_EPS >= c.start && cti < c.end && c.start > foundStart) {
              found = `${pi}-${ci}`;
              foundStart = c.start;
            }
          }
        }

        setPlayheadClipId(found);

        if (isPlaying && autoFollowRef.current && found) {
          const el = document.getElementById(`cc-word-${found}`);
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      } catch (e) {
        // Silently fail if getPlayheadTime throws
      }
    };

    const intervalId = setInterval(tick, 500); // 500ms — was 250ms
    return () => clearInterval(intervalId);
  }, [execute, connection]);

  useEffect(() => {
    const nav = navigatorRef.current;
    if (!nav) return;
    const onScroll = () => {
      autoFollowRef.current = false;
      if (followTimerRef.current) clearTimeout(followTimerRef.current);
      followTimerRef.current = setTimeout(() => {
        autoFollowRef.current = true;
      }, 3000);
    };
    nav.addEventListener('scroll', onScroll, { passive: true });
    return () => nav.removeEventListener('scroll', onScroll);
  }, []);

  const togglePin = (propName: string) => {
    setPinnedProps(prev => {
      const next = prev.includes(propName) ? prev.filter(p => p !== propName) : [...prev, propName];
      localStorage.setItem('freexan_caption_pinned_props_v1', JSON.stringify(next));
      return next;
    });
  };

  const filteredProps = useMemo(() => {
    if (!searchFilter) return inspectorProps;
    return inspectorProps.filter(p => (p.displayName || '').toLowerCase().includes(searchFilter.toLowerCase()));
  }, [inspectorProps, searchFilter]);

  const handlePropChange = (propIndex: number, propName: string, newValue: any) => {
    setInspectorProps(prev => prev.map(p => p.index === propIndex ? { ...p, value: newValue } : p));
    const pIndices = [...new Set(selection.map(s => parseInt(s.split('-')[0])))];
    if (pIndices.length !== 1) return;
    const phrase = timelineMapRef.current[pIndices[0]];
    if (!phrase) return;

    const targetClips = phrase.clips.map(c => ({ trackIndex: c.track, clipIndex: c.index }));

    if (inspectorDebounceRef.current[propName]) clearTimeout(inspectorDebounceRef.current[propName]);
    inspectorDebounceRef.current[propName] = setTimeout(() => {
      execute('updatePhraseMogrtProperty', {
        targetClips, propIndex, propName, value: newValue
      }).catch(e => {
        addToast(`Failed to update ${propName}`, 'error');
      });
    }, 150);
  };

  const handleBubbleEdit = async (clip: any, pIdx: number, cIdx: number, newText?: string | null) => {
    if (newText === undefined) {
      if (timelineMap[pIdx]?.isLocked) { addToast('Phrase is locked', 'error'); return; }
      setEditingClipId(`${pIdx}-${cIdx}`);
      return;
    }
    if (newText === null) { setEditingClipId(null); return; }

    const phrase = timelineMap[pIdx];
    if (!phrase) { setEditingClipId(null); return; }

    const currentMap = timelineMap.map(p => ({ ...p, clips: [...p.clips] }));
    currentMap[pIdx].clips[cIdx] = { ...currentMap[pIdx].clips[cIdx], text: newText };
    setTimelineMap(currentMap);
    setEditingClipId(null);

    const newPhraseText = currentMap[pIdx].clips.map(c => c.text).join(' ');

    try {
      setIsBusy(true); setLog('Updating phrase text...'); setProgress(30);
      await Promise.all(phrase.clips.map(c =>
        execute('updateMogrtProperty', {
          trackIndex: c.track, clipIndex: c.index, propName: 'Text Input', value: newPhraseText
        })
      ));
      setProgress(100); setLog('Text updated');
      setTimeout(() => setProgress(0), 800);
    } catch (e: any) {
      setLog('Rename Failed');
      addToast('Rename failed: ' + (e.message || 'unknown'), 'error');
      refreshTimeline();
    } finally {
      setIsBusy(false);
    }
  };

  const handleLock = (idx: number, locked: boolean) => {
    const phrase = timelineMap[idx];
    if (!phrase) return;
    lockStore.set(phraseIdOf(phrase), locked);
    setTimelineMap(timelineMap.map((p, i) => i === idx ? { ...p, isLocked: locked } : p));
  };

  // --- Real ExtendScript Actions ---
  const handleSyncPhrase = async () => {
    const targetId = playheadClipId;
    if (isBusy || !targetId) {
      addToast('Playhead is not positioned over any word.', 'error');
      return;
    }
    
    const [pIdxStr, cIdxStr] = targetId.split('-');
    const pIdx = parseInt(pIdxStr);
    const cIdx = parseInt(cIdxStr);
    
    const masterPhrase = timelineMap[pIdx];
    if (!masterPhrase || masterPhrase.isLocked) { addToast('Master phrase is locked', 'error'); return; }

    const masterClip = masterPhrase.clips[cIdx];

    const selectedPIndices = [...new Set(selection.map(s => parseInt(s.split('-')[0])))];
    let targetPIndices = selectedPIndices.length > 0 ? selectedPIndices : [pIdx];
    
    if (!targetPIndices.includes(pIdx)) {
      targetPIndices.push(pIdx);
    }

    let targetClips: any[] = [];
    targetPIndices.forEach(tIdx => {
      const p = timelineMap[tIdx];
      if (p && !p.isLocked && p.mogrtMode === masterPhrase.mogrtMode) {
        targetClips.push(...p.clips.map((c: any) => ({ trackIndex: c.track, clipIndex: c.index })));
      }
    });

    try {
      setIsBusy(true);
      setLog(`Syncing ${targetPIndices.length} Phrase(s)…`);
      const result: any = await execute('syncPhraseWithMaster', {
        masterClip: { trackIndex: masterClip.track, clipIndex: masterClip.index },
        targetClips: targetClips
      });
      const msg = `Synced ${result.syncedCount} clip${result.syncedCount !== 1 ? 's' : ''} to match the playhead word.`;
      addToast(msg, 'success');
      setLog(msg);
      setTimeout(() => { setProgress(0); refreshTimeline(true); }, 800);
    } catch (e: any) {
      addToast('Sync Phrase failed: ' + (e.message || 'unknown'), 'error');
      setLog('Sync failed');
    } finally {
      setIsBusy(false);
    }
  };

  const handleReplaceMogrt = async (externalFilePath: string | null = null, externalParams: any = null) => {
    if (isBusy) return;
    const pIndices = [...new Set(selection.map(s => parseInt(s.split('-')[0])))];
    if (pIndices.length === 0) return;
    
    const phrasesToReplace = pIndices.map(idx => timelineMap[idx]).filter(Boolean);
    if (phrasesToReplace.some(p => p.isLocked)) { 
      addToast('Cannot replace: one or more selected phrases are locked', 'error'); 
      return; 
    }

    let mogrtFilePath = externalFilePath;
    
    if (!mogrtFilePath) {
      try {
        const fs = (window as any).require('fs');
        const path = (window as any).require('path');
        const csInterface = new (window as any).CSInterface();
        const activeMogrtTxt = path.join(csInterface.getSystemPath((window as any).SystemPath.USER_DATA), 'freeXan', 'active_mogrt.txt');
        
        if (fs.existsSync(activeMogrtTxt)) {
          const storedPath = fs.readFileSync(activeMogrtTxt, 'utf8').trim();
          if (storedPath && fs.existsSync(storedPath)) {
            mogrtFilePath = storedPath;
          }
        }
      } catch (e) {
        console.warn('Failed to read active_mogrt.txt during replace', e);
      }
    }

    if (!mogrtFilePath) {
      if (!(window as any).cep || !(window as any).cep.fs) {
        addToast('Mister BloomX is disconnected and no MOGRT is selected.', 'error');
        return;
      }
      const dlg = (window as any).cep.fs.showOpenDialog(false, false, 'Select Replacement MOGRT', '', ['mogrt']);
      if (!dlg || dlg.err !== 0 || !dlg.data || !dlg.data.length) return;
      mogrtFilePath = dlg.data[0];
    }

    const fs = (window as any).require('fs');
    const path = (window as any).require('path');
    const csInterface = new (window as any).CSInterface();
    const activeVarJson = path.join(csInterface.getSystemPath((window as any).SystemPath.USER_DATA), 'freeXan', 'active_variation.json');
    let variationParams = externalParams;
    if (!variationParams) {
      try {
        if (fs.existsSync(activeVarJson)) {
          variationParams = JSON.parse(fs.readFileSync(activeVarJson, 'utf8'));
        }
      } catch (e) {
        console.warn('Failed to read active_variation.json', e);
      }
    }

    try {
      setIsBusy(true);
      setLog(`Replacing ${phrasesToReplace.length} Phrase(s)…`);
      let totalReplaced = 0;
      let totalStyled = 0;
      
      const normalizeName = (name: string) => {
        return name
          .replace(/\.[^/.]+$/, "") // Remove extensions
          .replace(/\s+\d+$/, "")   // Remove trailing space + numbers
          .trim()
          .toLowerCase();
      };
      
      const newBaseName = (mogrtFilePath || "").split(/[\\/]/).pop() || "";
      
      for (let i = 0; i < phrasesToReplace.length; i++) {
        const phrase = phrasesToReplace[i];
        const phraseClips = phrase.clips.map((c: any) => ({ trackIndex: c.track, clipIndex: c.index }));
        const oldBaseName = phrase.clips[0]?.mogrtName || "";
        
        const isSameMogrt = normalizeName(newBaseName) === normalizeName(oldBaseName);
        console.log('[EditView] Replace Triggered - Phrase:', i, { isSameMogrt, variationParams, newBaseName, oldBaseName });

        // ALWAYS parse and filter variationParams before applying to either engine
        let styleOnlyData: any = null;
        let parsedParams = variationParams;
        if (parsedParams) {
          if (typeof parsedParams === 'string') {
             try { parsedParams = JSON.parse(parsedParams); } catch (e) { console.warn('Failed to parse variationParams', e); }
          }
          const textInputNames = ["\u24c9 Text Input", "Ⓢ Text Input", "Text Input", "Text", "Ⓣ Text Input"];
          const progressionNames = ["\u24c9 Word Progression", "Ⓢ Word Progression", "Word Progression", "Ⓣ Word Progression"];
          const isPSR = (pName: string) => ["Position", "Scale", "Rotation", "Opacity"].includes(pName);
          
          const filterLogic = (key: string) => {
             if (textInputNames.includes(key)) return false;
             if (progressionNames.includes(key)) return false;
             if (key.includes('Ⓢ') || key.includes('Ⓑ') || key.includes('Ⓣ')) return false;
             if (isPSR(key)) return false;
             return true;
          };

          if (Array.isArray(parsedParams)) {
             styleOnlyData = parsedParams.filter((item: any) => item && item.displayName && filterLogic(item.displayName));
          } else if (parsedParams._raw && Array.isArray(parsedParams._raw)) {
             styleOnlyData = parsedParams._raw.filter((item: any) => item && item.displayName && filterLogic(item.displayName));
          } else {
             styleOnlyData = {};
             for (const key in parsedParams) {
                if (key === '_raw') continue;
                if (filterLogic(key)) styleOnlyData[key] = parsedParams[key];
             }
          }
        }

        if (isSameMogrt && styleOnlyData) {
          const payload = {
            phraseClips,
            variationParams: styleOnlyData
          };

          console.log('[EditView] Executing applyStyleToPhrase with:', payload);
          const result: any = await execute('applyStyleToPhrase', payload);
          console.log('[EditView] applyStyleToPhrase Result:', result);

          if (result && result.status === "Ok") {
             totalStyled += result.styled;
             try {
                const debugDir = 'c:\\Swastik Development\\FreeXan Development\\Debug';
                if (!fs.existsSync(debugDir)) {
                   fs.mkdirSync(debugDir, { recursive: true });
                }
                const debugFilePath = path.join(debugDir, 'ReplaceDebugLog.txt');
                let fileContent = "=== REPLACE OPERATION LOG ===\n";
                fileContent += "Date: " + new Date().toLocaleString() + "\n\n";
                fileContent += "--- RAW VARIATION DATA FROM MISTER BLOOMX ---\n";
                fileContent += JSON.stringify(parsedParams, null, 2) + "\n\n";
                fileContent += "--- FILTERED DATA SENT TO PREMIERE ---\n";
                fileContent += JSON.stringify(styleOnlyData, null, 2) + "\n\n";
                fileContent += "--- EXTENDSCRIPT ENGINE EXECUTION LOGS ---\n";
                if (result.logs && result.logs.length > 0) {
                   fileContent += result.logs.join("\n");
                    
                    try {
                      const debugEvent = new (window as any).CSEvent("com.freexan.debug.log", "APPLICATION");
                      debugEvent.data = JSON.stringify({
                        level: "INFO",
                        message: "--- STYLE INJECTION LOGS ---\n" + result.logs.join("\n"),
                        source: "EditView: applyStyleToPhrase"
                      });
                      csInterface.dispatchEvent(debugEvent);
                    } catch (e) { console.warn("Failed to dispatch to debug log", e); }
                 }
                fs.writeFileSync(debugFilePath, fileContent, 'utf8');
             } catch (err) {
                console.error("Failed to write debug log file", err);
             }

             if (result.logs && result.logs.length > 0) {
                // alert("DEBUG LOGS SAVED TO:\nc:\\Swastik Development\\FreeXan Development\\Debug\\ReplaceDebugLog.txt\n\nPlease check this file to see exactly what properties were processed and what failed.");
                // Silenced alert, logs are now in the debug panel.
             }
          } else if (result && result.status === "Error") {
             alert("DEBUG ERROR: " + result.message);
          }
        } else {
          const payload = {
            mogrtFilePath,
            phraseClips,
            variationParams: styleOnlyData
          };
          console.log('[EditView] Executing replacePhraseWithMogrt with:', payload);
          const result: any = await execute('replacePhraseWithMogrt', payload);
          console.log('[EditView] replacePhraseWithMogrt Result:', result);
          if (result && result.replaced) totalReplaced += result.replaced;
        }
        setProgress(((i + 1) / phrasesToReplace.length) * 100);
      }
      
      const msgParts = [];
      if (totalReplaced > 0) msgParts.push(`Replaced ${totalReplaced} clip${totalReplaced !== 1 ? 's' : ''}`);
      if (totalStyled > 0) msgParts.push(`Styled ${totalStyled} clip${totalStyled !== 1 ? 's' : ''}`);
      const msg = msgParts.length ? msgParts.join(' & ') : 'No clips updated.';
      
      addToast(msg, 'success');
      setLog(msg);
      setTimeout(() => { setProgress(0); refreshTimeline(true); }, 800);
    } catch (e: any) {
      addToast('Replace MOGRT failed: ' + (e.message || 'unknown'), 'error');
      setLog('Replace failed');
    } finally {
      setIsBusy(false);
    }
  };

  const handleMerge = async () => {
    if (isBusy || !selectionContiguity.isContiguous) return;
    const phraseIndices = selectionContiguity.phraseIndices;
    const targetIdx = phraseIndices[0];
    if (phraseIndices.some(i => timelineMap[i]?.isLocked)) {
      addToast('Cannot merge: a selected phrase is locked', 'error');
      return;
    }

    // OPTIMISTIC MERGE
    const currentMap = timelineMap.map(p => ({ ...p, clips: [...p.clips] }));
    let mergedClips: any[] = [];
    phraseIndices.forEach(idx => { mergedClips = [...mergedClips, ...currentMap[idx].clips]; });
    currentMap[targetIdx].clips = mergedClips;
    const sortedDesc = [...phraseIndices].sort((a, b) => b - a);
    sortedDesc.forEach(idx => { if (idx !== targetIdx) currentMap.splice(idx, 1); });
    setTimelineMap(currentMap);
    setSelection([]);

    try {
      setIsBusy(true); setProgress(30); setLog('Merging Phrases...');
      const selectedClips = mergedClips.map(c => ({ trackIndex: c.track, clipIndex: c.index }));
      await execute('sm_tools_join_v28', { selectedClips });
      setProgress(100); setLog('Merge completed');
      setTimeout(() => { setProgress(0); refreshTimeline(true); }, 1500);
    } catch (e: any) {
      setLog('Merge Failed');
      addToast('Merge failed: ' + (e.message || 'unknown'), 'error');
      setIsBusy(false); refreshTimeline();
    }
  };

  const handleSplit = async (pIdx: number, cIdx: number) => {
    if (isBusy) return;
    const phrase = timelineMap[pIdx];
    if (!phrase) return;
    if (phrase.isLocked) { addToast('Phrase is locked', 'error'); return; }
    const clip = phrase.clips[cIdx];

    // OPTIMISTIC SPLIT
    const currentMap = timelineMap.map(p => ({ ...p, clips: [...p.clips] }));
    const target = currentMap[pIdx];
    const leftClips = target.clips.slice(0, cIdx + 1);
    const rightClips = target.clips.slice(cIdx + 1);
    target.clips = leftClips;
    const newPhrase = { ...phrase, clips: rightClips, start: rightClips[0]?.start || phrase.start, isLocked: false };
    currentMap.splice(pIdx + 1, 0, newPhrase);
    setTimelineMap(currentMap);

    try {
      setIsBusy(true); setProgress(30); setLog('Surgical Split...');
      await execute('sm_tools_split_v28', { trackIndex: clip.track, clipIndex: clip.index, splitAtWordIdx: cIdx });
      setProgress(100); setLog('Split completed');
      setTimeout(() => { setProgress(0); refreshTimeline(true); }, 1500);
    } catch (e: any) {
      setLog('Split Failed');
      addToast('Split failed: ' + (e.message || 'unknown'), 'error');
      setIsBusy(false); refreshTimeline();
    }
  };

  const handleSaveWbwSrt = () => {
    if (isBusy || timelineMap.length === 0) return;
    const cepFs = (window as any).cep?.fs;
    if (!cepFs) return;
    const srt = generateWbwSrt(timelineMap);
    const result = cepFs.showSaveDialogEx("Save Word-by-Word SRT", "", ["srt"], "subtitles_wbw.srt", "");
    if (result.err === 0 && result.data) {
      const fs = (window as any).require('fs');
      fs.writeFileSync(result.data, srt, 'utf8');
      addToast('WBW SRT saved successfully!', 'success');
    }
  };

  const handleSavePhrasedSrt = () => {
    if (isBusy || timelineMap.length === 0) return;
    const cepFs = (window as any).cep?.fs;
    if (!cepFs) return;
    const srt = generatePhrasedSrt(timelineMap);
    const result = cepFs.showSaveDialogEx("Save Phrased SRT", "", ["srt"], "subtitles_phrased.srt", "");
    if (result.err === 0 && result.data) {
      const fs = (window as any).require('fs');
      fs.writeFileSync(result.data, srt, 'utf8');
      addToast('Phrased SRT saved successfully!', 'success');
    }
  };

  const handleWordTransfer = async (evt: any) => {
    const sourceIdx = parseInt(evt.from.dataset.phraseId);
    const targetIdx = parseInt(evt.to.dataset.phraseId);
    const wordIdx = parseInt(evt.item.dataset.wordIndex);
    const map = timelineMapRef.current;
    const sourcePhrase = map[sourceIdx];
    const targetPhrase = map[targetIdx];
    if (!sourcePhrase || !targetPhrase) return;
    if (sourcePhrase.isLocked || targetPhrase.isLocked) {
      addToast('Phrase is locked', 'error');
      return;
    }
    const draggedClip = sourcePhrase.clips[wordIdx];
    if (!draggedClip) return;

    const movingToPrev = targetIdx < sourceIdx;
    const draggedId = `${sourceIdx}-${wordIdx}`;

    let movedPositions = [wordIdx];

    const selInThisPhrase = selection
      .filter(s => parseInt(s.split('-')[0]) === sourceIdx)
      .map(s => parseInt(s.split('-')[1]))
      .sort((a, b) => a - b);

    if (selection.includes(draggedId) && selInThisPhrase.length > 1) {
      let contiguous = true;
      for (let i = 1; i < selInThisPhrase.length; i++) {
        if (selInThisPhrase[i] !== selInThisPhrase[i - 1] + 1) { contiguous = false; break; }
      }
      const firstPos = selInThisPhrase[0];
      const lastPos = selInThisPhrase[selInThisPhrase.length - 1];
      const phraseLen = sourcePhrase.clips.length;
      const anchored = movingToPrev ? (firstPos === 0) : (lastPos === phraseLen - 1);
      const partial = selInThisPhrase.length < phraseLen;

      if (contiguous && anchored && partial) {
        movedPositions = selInThisPhrase;
      }
    }

    const movedClips = movedPositions.map(p => sourcePhrase.clips[p]).filter(Boolean);
    if (movedClips.length === 0) return;

    const currentMap = map.map(p => ({ ...p, clips: [...p.clips] }));
    const positionsDesc = [...movedPositions].sort((a, b) => b - a);
    positionsDesc.forEach(p => currentMap[sourceIdx].clips.splice(p, 1));
    if (movingToPrev) {
      currentMap[targetIdx].clips = [...currentMap[targetIdx].clips, ...movedClips];
    } else {
      currentMap[targetIdx].clips = [...movedClips, ...currentMap[targetIdx].clips];
    }
    setTimelineMap(currentMap);

    try {
      setIsBusy(true);
      setLog(movedClips.length > 1 ? `Transferring ${movedClips.length} words...` : 'Redistributing Words...');
      setProgress(30);
      await execute('executeWordTransfer', {
        sourcePhraseIdx: sourceIdx,
        targetPhraseIdx: targetIdx,
        clipIds: movedClips.map(c => `${c.track}-${c.index}`)
      });
      setProgress(100); setLog('Surgery completed');
      setTimeout(() => { setProgress(0); refreshTimeline(true); }, 1500);
    } catch (e: any) {
      setLog('Surgery Failed');
      addToast('Surgery failed: ' + (e.message || 'unknown'), 'error');
      setIsBusy(false); setProgress(0); refreshTimeline();
    }
  };
  onTransferRef.current = handleWordTransfer;

  const handleSaveStyle = async () => {
    if (isBusy) return;
    try {
      setIsBusy(true); setLog('Saving Style...');
      const dump: any = await execute('syncAllGetData', {});
      if (!dump || dump.status !== 'Complete' || !dump.masterMogrtData || dump.masterMogrtData.length === 0) {
        addToast('Could not read active MOGRT under playhead. Make sure a clip is under the playhead.', 'error');
        setIsBusy(false); setLog('Save aborted'); return;
      }
      
      // We also need the source path which is not returned by syncAllGetData.
      // We can grab it from getMogrtDumpForActiveClip just for the path.
      const pathDump: any = await execute('getMogrtDumpForActiveClip');
      if (!pathDump || !pathDump.sourceMogrtPath) {
        addToast('Source .mogrt path not found on the project item.', 'error');
        setIsBusy(false); setLog('Save aborted'); return;
      }

      // Mister BloomX expects a flat object keyed by displayName. 
      // We also attach the raw array as _raw so ExtendScript can preserve the parameter indices.
      const params: any = {};
      dump.masterMogrtData.forEach((v: any) => {
          if (v.kind !== 'text') {
              params[v.displayName] = v.value;
          }
      });
      params._raw = dump.masterMogrtData;

      const fs = (window as any).require('fs');
      const path = (window as any).require('path');
      const csInterface = new (window as any).CSInterface();
      const dbPath = path.join(csInterface.getSystemPath((window as any).SystemPath.USER_DATA), 'freeXan', 'mogrt_variations.json');

      let db: any = {};
      if (fs.existsSync(dbPath)) {
        try { db = JSON.parse(fs.readFileSync(dbPath, 'utf8')); } catch(e) {}
      }
      
      const mogrtKey = pathDump.sourceMogrtPath.replace(/\\/g, '/');
      if (!db[mogrtKey]) db[mogrtKey] = [];
      
      const newId = Date.now().toString(36).toUpperCase();
      const existingCount = db[mogrtKey].length;
      
      db[mogrtKey].push({
        id: newId,
        name: 'Variation ' + (existingCount + 1),
        parameters: params,
        thumbnailPath: null
      });

      const dir = path.dirname(dbPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf8');

      try {
        const debugEvent = new (window as any).CSEvent("com.freexan.debug.log", "APPLICATION");
        debugEvent.data = JSON.stringify({
          level: "INFO",
          message: "Saved Variation Parameters:\n" + JSON.stringify(params, null, 2),
          source: "EditView: Save Style"
        });
        csInterface.dispatchEvent(debugEvent);
      } catch (e) { console.warn("Failed to dispatch debug log", e); }

      const event = new (window as any).CSEvent("com.freexan.caption.variationSaved", "APPLICATION");
      event.data = pathDump.sourceMogrtPath;
      csInterface.dispatchEvent(event);

      addToast(`Style saved to BloomX!`, 'success');
      setLog('Style Saved');
    } catch (e: any) {
      addToast('Save Style failed: ' + (e.message || 'unknown'), 'error');
      setLog('Save Style failed');
    } finally {
      setIsBusy(false);
    }
  };

  // Listen for Mister BloomX commands
  useEffect(() => {
    const onReplaceEvent = (e: CustomEvent) => {
      const payload = e.detail;
      if (payload && payload.mogrtPath) {
        const params = payload.parameters || null;
        handleReplaceMogrt(payload.mogrtPath, params);
      }
    };
    window.addEventListener('freexan-caption:replace_selected', onReplaceEvent as EventListener);
    return () => window.removeEventListener('freexan-caption:replace_selected', onReplaceEvent as EventListener);
  }, [selection, timelineMap, isBusy, mogrtPath]);

  // Group props
  const propGroups = useMemo(() => {
    const groups: { name: string; props: any[] }[] = [];
    const pinned = filteredProps.filter(p => pinnedProps.includes(p.displayName));
    if (pinned.length) groups.push({ name: '📌 Pinned', props: pinned });
    
    const colors = filteredProps.filter(p => p.type === 'color' && !pinnedProps.includes(p.displayName));
    if (colors.length) groups.push({ name: '🎨 Colors', props: colors });
    
    const others = filteredProps.filter(p => p.type !== 'color' && !pinnedProps.includes(p.displayName));
    if (others.length) groups.push({ name: '⚙️ Settings', props: others });
    
    return groups;
  }, [filteredProps, pinnedProps]);

  return (
    <div className="cc-root" id="react-edit-root">
      <div id="cc-toolbar" className="cc-toolbar">
        <span style={{ fontWeight: 800, color: 'var(--fx-accent)', padding: '0 16px' }}>EDIT TAB</span>
        
        <div style={{ flex: 1 }}></div>
        <div className="cc-header-actions" style={{ display: 'flex', gap: '8px', paddingRight: '8px' }}>
          <button className="cc-btn" onClick={() => { setIsBusy(false); refreshTimeline(); }}>↻ Refresh</button>
          <button className="cc-btn" onClick={handleSaveStyle} disabled={isBusy} title="Save the current active clip's parameters as a style preset in Mister BloomX">🎨 Save Style</button>
          <button
            className="cc-btn"
            onClick={handleSaveWbwSrt}
            disabled={isBusy || timelineMap.length === 0}
            title="Save Word-by-Word SRT"
          >
            <i className="fas fa-file-export" /> Save WBW Srt.
          </button>
          <button
            className="cc-btn"
            onClick={handleSavePhrasedSrt}
            disabled={isBusy || timelineMap.length === 0}
            title="Save Phrased SRT"
          >
            <i className="fas fa-file-export" /> Save Phrased Srt.
          </button>
        </div>
      </div>
      
      <div style={{ gridRow: 1, gridColumn: 1, position: 'relative', zIndex: 10000, pointerEvents: 'none' }}>
        <ToastZone />
      </div>

      <div className="cc-main-grid">
        <div className="cc-navigator" ref={navigatorRef} onClick={(e) => {
          if (e.target === e.currentTarget) { setSelection([]); setEditingClipId(null); }
        }}>
          {timelineMap.length === 0 ? (
            <EmptyDashboard onRefresh={() => refreshTimeline()} />
          ) : (
            <div className="cc-phrase-list">
              {timelineMap.map((phrase, pIdx) => (
                <PhraseRow
                  key={phraseIdOf(phrase)}
                  phrase={phrase} pIdx={pIdx}
                  activeClipId={selectedClipId} selection={selection}
                  editingClipId={editingClipId} playheadClipId={playheadClipId}
                  timelineMapRef={timelineMapRef}
                  onTransferRef={onTransferRef}
                  onInvalidDropRef={onInvalidDropRef}
                  onBubbleClick={(clip, id, event) => {
                    event.stopPropagation();
                    if (event.shiftKey || event.ctrlKey || event.metaKey) {
                      setSelection(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);
                    } else {
                      setSelection([id]);
                      execute('setPlayheadTime', { seconds: clip.start + 0.01 }).catch(() => {});
                    }
                  }}
                  onBubbleEdit={handleBubbleEdit}
                  onLock={handleLock}
                  onPhraseSelect={(idx, isMulti) => {
                    const p = timelineMap[idx];
                    if (!p || !p.clips) return;
                    const ids = p.clips.map((_, i) => `${idx}-${i}`);
                    if (isMulti) {
                      setSelection(prev => ids.every(id => prev.includes(id)) ? prev.filter(id => !ids.includes(id)) : [...new Set([...prev, ...ids])]);
                    } else setSelection(ids);
                  }}
                  onSelectByMogrt={(targetName) => {
                    const cleanTarget = targetName.split(/[/\\]/).pop()?.replace(/\.mogrt$/i, '').trim().toLowerCase() || '';
                    if (!cleanTarget) return;
                    const allMatchingIds: string[] = [];
                    let phraseCount = 0;
                    timelineMap.forEach((p, idx) => {
                      if (!p || !p.clips || p.clips.length === 0) return;
                      const pName = p.clips[0]?.mogrtName || '';
                      const cleanP = pName.split(/[/\\]/).pop()?.replace(/\.mogrt$/i, '').trim().toLowerCase() || '';
                      if (cleanP === cleanTarget) {
                        phraseCount++;
                        p.clips.forEach((_, i) => allMatchingIds.push(`${idx}-${i}`));
                      }
                    });
                    setSelection(allMatchingIds);
                    addToast(`Selected ${phraseCount} phrase(s) (${allMatchingIds.length} words) using ${targetName.replace(/\.mogrt$/i, '')}`, 'info');
                  }}
                  onSplit={handleSplit}
                />
              ))}
            </div>
          )}
        </div>

        {/* Inspector removed per user request (now handled by Params tab exclusively) */}
      </div>

      <div className="cc-footer" style={{ display: 'flex', flexDirection: 'column', position: 'relative' }}>
        {isBusy && progress > 0 && (
          <div style={{
            position: 'absolute', top: 0, left: 0, height: '2px', width: '100%',
            backgroundColor: 'rgba(255,255,255,0.1)'
          }}>
            <div style={{
              height: '100%', width: `${progress}%`,
              backgroundColor: '#00A6D6',
              boxShadow: '0 0 8px rgba(0, 166, 214, 0.8)',
              transition: 'width 0.2s ease-out'
            }} />
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', padding: '4px 16px', boxSizing: 'border-box' }}>
          <div className="cc-footer-log" style={{ padding: 0 }}>{log}</div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button 
              className="cc-btn" 
              onClick={handleSyncPhrase} 
              disabled={isBusy || !playheadClipId}
              title="Sync style from the word under the playhead to all other words in its phrase"
            >
              <i className="fas fa-sync-alt" /> Sync
            </button>
            <button 
              className="cc-btn" 
              onClick={() => handleReplaceMogrt()} 
              disabled={isBusy || fullySelectedPhrases.length === 0}
              title="Replace MOGRT of the selected phrases"
            >
              <i className="fas fa-exchange-alt" /> Replace
            </button>
            <button 
              className="cc-btn" 
              onClick={handleMerge} 
              disabled={isBusy || !selectionContiguity.isContiguous}
              title="Merge contiguous selected phrases/words"
            >
              <i className="fas fa-compress-arrows-alt" /> Merge
            </button>
          </div>
        </div>
        <div className="cc-footer-progress" style={{ width: `${progress}%`, position: 'absolute', bottom: 0, left: 0, height: '2px' }}></div>
      </div>
    </div>
  );
};

