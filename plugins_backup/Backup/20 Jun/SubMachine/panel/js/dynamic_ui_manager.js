/**
 * =============================================================================
 * freeXan Caption Command Center — Dynamic UI Manager (v3.0)
 * 
 * WHY: This is the "Brain" of the Command Center. It manages the state of the
 * timeline, handles user interactions (clicking bubbles, editing properties),
 * and coordinates with the ExtendScript backend for real-time updates.
 * 
 * HOW: It uses a centralized AppState. Any change to the state triggers a 
 * re-render of the relevant UI component (Navigator or Inspector).
 * =============================================================================
 */

(function() {
    'use strict';

    // ==========================================
    // 1. APP STATE — The Source of Truth
    // ==========================================
    const AppState = {
        timelineMap: [],      // Array of { id, text, start, end, clips: [] }
        selection: [],        // IDs of currently multi-selected word bubbles
        activeClip: null,     // The clip object currently shown in the Inspector
        activeClipId: null,   // The ID (pIdx-cIdx) of the active clip for UI highlighting
        inspectorProps: [],   // Array of { displayName, value, type, index }
        isSyncEnabled: true,  // Global toggle for property broadcasting
        isBusy: false,        // UI lock during heavy JSX operations
        searchFilter: '',     // Property search string
        selectedPhrases: []   // Phrase pIdx values selected for merge
    };

    // ==========================================
    // 2. JSX BRIDGE — Communicating with Premiere
    // ==========================================
    async function callJSX(funcName, params) {
        const script = (params !== undefined)
            ? funcName + '(' + JSON.stringify(params) + ')'
            : funcName + '()';

        return new Promise(function(resolve, reject) {
            window.__adobe_cep__.evalScript(script, function(res) {
                if (!res || res === 'EvalScript error.') {
                    reject(new Error('JSX CRASH: ' + funcName));
                } else {
                    try {
                        const parsed = JSON.parse(res);
                        if (parsed && typeof parsed === 'object' && 'ok' in parsed) {
                            if (parsed.ok) {
                                resolve(parsed.data);
                            } else {
                                reject(new Error(parsed.error || 'Unknown Backend Error'));
                            }
                        } else {
                            resolve(parsed); // Legacy JSON
                        }
                    } catch (e) {
                        resolve(res); // Raw string
                    }
                }
            });
        });
    }

    // ==========================================
    // 3. RENDERERS — Turning State into DOM
    // ==========================================

    /**
     * Renders the entire Phrase Navigator (Left Column)
     */
    function renderNavigator() {
        const container = document.getElementById('cc-navigator');
        if (!container) return;

        // Clear existing (except empty state if needed)
        container.innerHTML = '';

        if (AppState.timelineMap.length === 0) {
            container.innerHTML = `
                <div class="cc-inspector-empty">
                    <span class="cc-empty-icon">📋</span>
                    <span>No phrases found.<br>Click <strong>↻ Refresh</strong> to scan timeline.</span>
                </div>`;
            return;
        }

        const fragment = document.createDocumentFragment();

        AppState.timelineMap.forEach((phrase, pIdx) => {
            const card = document.createElement('div');
            // Check if this phrase contains the active clip
            const hasActiveClip = AppState.activeClipId && AppState.activeClipId.startsWith(`${pIdx}-`);
            card.className = `cc-phrase-card ${hasActiveClip ? 'is-active' : ''}`;
            card.dataset.phraseId = pIdx;

            card.innerHTML = `
                <div class="cc-phrase-header">
                    <span class="cc-phrase-index">PHRASE ${pIdx + 1}</span>
                    <span class="cc-phrase-time">${formatTime(phrase.start)} → ${formatTime(phrase.end)}</span>
                    <button class="cc-lock-btn ${phrase.isLocked ? 'is-locked' : ''}" data-phrase-id="${pIdx}">
                        ${phrase.isLocked ? '🔒' : '🔓'}
                    </button>
                </div>
                <div class="cc-bubble-zone" data-phrase-id="${pIdx}"></div>
            `;

            const bubbleZone = card.querySelector('.cc-bubble-zone');
            phrase.clips.forEach((clip, cIdx) => {
                const bubble = document.createElement('span');
                const clipId = `${pIdx}-${cIdx}`;
                const isSelected = AppState.selection.includes(clipId);
                const isActive = AppState.activeClipId === clipId;

                bubble.className = `cc-word-bubble ${isActive ? 'is-active' : ''} ${isSelected ? 'is-selected' : ''}`;
                bubble.dataset.clipId = clipId;
                bubble.dataset.phraseId = pIdx;
                bubble.dataset.wordIndex = cIdx;
                bubble.style.animationDelay = `${(pIdx * 50) + (cIdx * 20)}ms`;

                bubble.innerHTML = `
                    ${clip.text}
                    <span class="cc-bubble-idx">${clip.progression || ''}</span>
                `;

                bubble.addEventListener('click', (e) => handleBubbleClick(clip, clipId, e));
                bubble.addEventListener('dblclick', (e) => {
                    e.stopPropagation();
                    handleWordEdit(bubble, clip, pIdx, cIdx, phrase);
                });
                bubbleZone.appendChild(bubble);
            });

            // Add Shift+Click handler on card body for phrase selection
            card.addEventListener('click', (e) => {
                if (!e.shiftKey) return;
                if (e.target.closest('.cc-word-bubble') || e.target.closest('.cc-lock-btn')) return;
                handlePhraseSelect(pIdx);
            });

            // Apply phrase-selected class if this phrase is in selectedPhrases
            if (AppState.selectedPhrases.includes(pIdx)) {
                card.classList.add('is-phrase-selected');
            }

            fragment.appendChild(card);

            // Insert gap-drop zone between phrases (but not after the last one)
            if (pIdx < AppState.timelineMap.length - 1) {
                const gap = document.createElement('div');
                gap.className = 'cc-drop-gap';
                gap.dataset.afterPhraseId = pIdx;
                fragment.appendChild(gap);

                // We'll initialize SortableJS on gaps later, after container append
            }
        });

        container.appendChild(fragment);

        // --- PHASE 4: Initialize SortableJS for Word Surgery ---
        const zones = container.querySelectorAll('.cc-bubble-zone');
        zones.forEach(zone => {
            new Sortable(zone, {
                group: 'phrases',
                animation: 150,
                swapThreshold: 0.65,
                invertSwap: true,
                fallbackOnBody: true,
                swapAnimation: {
                    duration: 150,
                    easing: 'cubic-bezier(1, 0, 0, 1)'
                },
                ghostClass: 'sortable-ghost',
                dragClass: 'is-dragging',
                onStart: function (evt) {
                    document.body.classList.add('cc-dragging-active');
                    document.querySelectorAll('.cc-phrase-card').forEach(c => c.classList.add('is-dragging-active'));
                },
                onEnd: function (evt) {
                    document.body.classList.remove('cc-dragging-active');
                    document.querySelectorAll('.cc-phrase-card').forEach(c => c.classList.remove('is-dragging-active', 'is-drop-target'));
                    handleWordTransfer(evt);
                },
                onDragOver: function (evt) {
                    const card = evt.to.closest('.cc-phrase-card');
                    document.querySelectorAll('.cc-phrase-card').forEach(c => {
                        if (c !== card) c.classList.remove('is-drop-target');
                    });
                    if (card) card.classList.add('is-drop-target');
                }
            });
        });

        // --- PHASE 5: Initialize SortableJS for Gap-Drop Split ---
        const gaps = container.querySelectorAll('.cc-drop-gap');
        gaps.forEach(gap => {
            new Sortable(gap, {
                group: { name: 'phrases', pull: false, put: true },
                animation: 150,
                swapThreshold: 0.1, // Very sensitive for gaps
                onAdd: function (evt) {
                    // Get the dragged bubble and extract its clip info
                    const wordBubble = evt.item;
                    const clipId = wordBubble.dataset.clipId;
                    const [pIdxStr, cIdxStr] = clipId.split('-');
                    const pIdx = parseInt(pIdxStr);
                    const cIdx = parseInt(cIdxStr);

                    // Return bubble to source immediately — JSX split will handle the real move
                    evt.from.insertBefore(wordBubble, evt.from.children[evt.oldIndex] || null);

                    // Get the clip object and call split
                    const clip = AppState.timelineMap[pIdx]?.clips[cIdx];
                    if (clip) {
                        handleGapDrop(clip);
                    }
                }
            });
        });

        updateStatus();
    }

    /**
     * Handles the logic when a word is dropped into a new phrase.
     */
    async function handleWordTransfer(evt) {
        const wordBubble = evt.item;
        const sourceZone = evt.from;
        const targetZone = evt.to;
        
        if (sourceZone === targetZone && evt.oldIndex === evt.newIndex) return;

        console.log('[Surgery] Transferring Word:', wordBubble.innerText);
        
        try {
            setLoading(true, 'Performing word surgery...');
            
            // Collect info for the backend
            const payload = {
                clipId: wordBubble.dataset.clipId,
                sourcePhraseIdx: sourceZone.dataset.phraseId,
                targetPhraseIdx: targetZone.dataset.phraseId,
                oldIndex: evt.oldIndex,
                newIndex: evt.newIndex
            };

            // Call the heavy lifting backend
            const result = await callJSX('executeWordTransfer', payload);
            
            if (result.status === 'Success') {
                // Refresh map to ensure UI is in sync with timeline
                await refreshTimeline();
            } else {
                alert('Surgery failed: ' + result.message);
                refreshTimeline(); // Revert UI
            }
        } catch (e) {
            console.error('Surgery error:', e);
            refreshTimeline();
        } finally {
            setLoading(false);
        }
    }

    /**
     * Renders the Property Inspector (Right Column)
     */
    function renderInspector() {
        const container = document.getElementById('cc-property-list');
        const title = document.getElementById('cc-inspector-title');
        const subtitle = document.getElementById('cc-inspector-subtitle');
        if (!container) return;

        if (!AppState.activeClip) {
            title.innerText = 'No Selection';
            subtitle.innerText = 'Click a word bubble to inspect';
            container.innerHTML = `
                <div class="cc-inspector-empty">
                    <span class="cc-empty-icon">🎛️</span>
                    <span>Select a word bubble to<br>view its properties</span>
                </div>`;
            return;
        }

        title.innerText = `Edit: "${AppState.activeClip.text}"`;
        // Find phrase index from activeClipId
        const pIdx = parseInt(AppState.activeClipId.split('-')[0]);
        subtitle.innerText = `Phrase ${pIdx + 1} | Time: ${formatTime(AppState.activeClip.start)}`;

        container.innerHTML = '';
        const fragment = document.createDocumentFragment();

        const filteredProps = AppState.inspectorProps.filter(p => 
            p.displayName.toLowerCase().includes(AppState.searchFilter.toLowerCase())
        );

        filteredProps.forEach(prop => {
            const card = document.createElement('div');
            card.className = 'cc-property-card';
            
            let controlHtml = '';
            let typeClass = 'type-slider';
            
            // Determine control type based on property metadata
            if (prop.type === 'color') {
                typeClass = 'type-color';
                controlHtml = `<div class="cc-color-swatch" style="background: ${prop.value}" data-prop="${prop.displayName}"></div>`;
            } else if (prop.type === 'text') {
                typeClass = 'type-text';
                controlHtml = `<div class="cc-text-value">${prop.value}</div>`;
            } else {
                controlHtml = `
                    <div class="cc-slider-control">
                        <input type="range" class="cc-slider-input" value="${prop.value}" min="0" max="100" data-prop="${prop.displayName}">
                        <span class="cc-slider-value">${Math.round(prop.value)}</span>
                    </div>`;
            }

            card.innerHTML = `
                <span class="cc-prop-type-icon ${typeClass}">●</span>
                <span class="cc-prop-label">${prop.displayName.replace('Ⓣ ', '')}</span>
                ${controlHtml}
                <div class="cc-sync-toggle ${AppState.isSyncEnabled ? 'is-active' : ''}" title="Broadcast this change">⟳</div>
            `;

            // Add event listeners for controls
            const input = card.querySelector('input');
            if (input) {
                input.addEventListener('input', (e) => {
                    card.querySelector('.cc-slider-value').innerText = e.target.value;
                    handlePropertyUpdate(prop.displayName, e.target.value);
                });
            }

            fragment.appendChild(card);
        });

        container.appendChild(fragment);
    }

    // ==========================================
    // 4. EVENT HANDLERS — Responding to Input
    // ==========================================

    async function handleBubbleClick(clip, id, event) {
        // 1. Playhead Snap (Add tiny offset to ensure we land INSIDE the first frame)
        callJSX('setPlayheadTime', { seconds: clip.start + 0.01 });

        // 2. Update State
        if (event.shiftKey) {
            if (AppState.selection.includes(id)) {
                AppState.selection = AppState.selection.filter(sid => sid !== id);
            } else {
                AppState.selection.push(id);
            }
        } else {
            AppState.selection = [id];
            AppState.activeClip = clip;
            AppState.activeClipId = id;
        }

        // 3. Fetch Properties
        try {
            setLoading(true);
            const props = await callJSX('inspectMogrtProperties', { trackIndex: clip.track, clipIndex: clip.index });
            AppState.inspectorProps = props;
            setLoading(false);
            
            // 4. Update UI (Surgical)
            updateSelectionUI();
            renderInspector();
            updateStatus();
        } catch (e) {
            console.error('Failed to fetch properties:', e);
            setLoading(false);
        }
    }

    function handleLock(phraseId, isLocked) {
        AppState.timelineMap[phraseId].isLocked = isLocked;
        
        // Update specific card visually without full re-render
        const card = document.querySelector(`.cc-phrase-card[data-phrase-id="${phraseId}"]`);
        if (card) {
            card.classList.toggle('is-locked', isLocked);
            const btn = card.querySelector('.cc-lock-btn');
            if (btn) btn.innerHTML = isLocked ? '🔒' : '🔓';
        }
    }

    async function handlePropertyUpdate(name, value) {
        // Broadcaster logic
        if (AppState.isSyncEnabled && AppState.selection.length > 1) {
            // Batch update all selected
            callJSX('broadcastPropertyUpdate', {
                propName: name,
                value: value,
                targetIDs: AppState.selection
            });
        } else {
            // Single update
            callJSX('updateMogrtProperty', {
                propName: name,
                value: value,
                trackIndex: AppState.activeClip.track,
                clipIndex: AppState.activeClip.index
            });
        }
    }

    function handleWordEdit(bubble, clip, _phraseIdx, wordIdx, phrase) {
        const originalHTML = bubble.innerHTML;
        bubble.innerHTML = `<input class="cc-bubble-edit-input" type="text" value="${clip.text}">`;
        const input = bubble.querySelector('input');

        function saveEdit() {
            const newWordText = input.value.trim();
            if (newWordText && newWordText !== clip.text) {
                setLoading(true, 'Updating word...');

                // Reconstruct phrase text: split by spaces, replace edited word, rejoin
                const words = phrase.text.split(/\s+/);
                words[wordIdx] = newWordText;
                const updatedPhraseText = words.join(' ');

                callJSX('updateSingleWordText', {
                    trackIndex: clip.track,
                    clipIndex: clip.index,
                    newText: updatedPhraseText
                }).then(() => {
                    refreshTimeline();
                }).catch(err => {
                    console.error('Word edit failed:', err);
                    bubble.innerHTML = originalHTML;
                    setLoading(false);
                });
            } else {
                bubble.innerHTML = originalHTML;
            }
        }

        function cancelEdit() {
            bubble.innerHTML = originalHTML;
        }

        input.focus();
        input.select();
        input.addEventListener('blur', saveEdit);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') saveEdit();
            if (e.key === 'Escape') cancelEdit();
        });
    }

    async function handleGapDrop(clip) {
        try {
            setLoading(true, 'Splitting phrase...');
            const result = await callJSX('sm_tools_split_v28', {
                trackIndex: clip.track,
                clipIndex: clip.index
            });

            if (result && result.status === 'Complete') {
                await refreshTimeline();
            } else {
                alert('Split failed: ' + (result?.message || 'Unknown error'));
                setLoading(false);
            }
        } catch (e) {
            console.error('Gap drop split error:', e);
            alert('Split failed: ' + e.message);
            setLoading(false);
        }
    }

    function handlePhraseSelect(phraseIdx) {
        const index = AppState.selectedPhrases.indexOf(phraseIdx);
        if (index > -1) {
            AppState.selectedPhrases.splice(index, 1);
        } else {
            AppState.selectedPhrases.push(phraseIdx);
        }

        // Update card CSS
        const card = document.querySelector(`.cc-phrase-card[data-phrase-id="${phraseIdx}"]`);
        if (card) {
            card.classList.toggle('is-phrase-selected', AppState.selectedPhrases.includes(phraseIdx));
        }

        // Enable/disable merge button
        const mergeBtn = document.getElementById('cc-btn-merge');
        if (mergeBtn) {
            mergeBtn.disabled = AppState.selectedPhrases.length < 2;
        }
    }

    async function handleMergePhrases() {
        if (AppState.selectedPhrases.length < 2) {
            alert('Select at least 2 phrases to merge.');
            return;
        }

        try {
            setLoading(true, 'Checking playhead...');

            const sorted = [...AppState.selectedPhrases].sort((a, b) => a - b);

            // The join tool uses the playhead to determine which phrase becomes the master.
            const playheadSecs = await callJSX('getPlayheadTime');
            const playheadOnMaster = sorted.some(pIdx => {
                const phrase = AppState.timelineMap[pIdx];
                return phrase && playheadSecs >= (phrase.start - 0.1) && playheadSecs <= (phrase.end + 0.1);
            });

            if (!playheadOnMaster) {
                setLoading(false);
                alert('Place your playhead on the clip you want to use as the master — its style will be applied to all merged clips — then click Merge again.');
                return;
            }

            setLoading(true, 'Merging phrases...');

            // Build selectedClips array: one clip from each selected phrase
            const selectedClips = sorted.map(pIdx => {
                const phrase = AppState.timelineMap[pIdx];
                const firstClip = phrase.clips[0];
                return { trackIndex: firstClip.track, clipIndex: firstClip.index };
            });

            const result = await callJSX('sm_tools_join_v28', { selectedClips });

            if (result && result.status === 'Complete') {
                AppState.selectedPhrases = [];
                const mergeBtn = document.getElementById('cc-btn-merge');
                if (mergeBtn) mergeBtn.disabled = true;
                await refreshTimeline();
            } else {
                alert('Merge failed: ' + (result?.message || 'Unknown error'));
                setLoading(false);
            }
        } catch (e) {
            console.error('Merge error:', e);
            alert('Merge failed: ' + e.message);
            setLoading(false);
        }
    }

    // -------- Generic MOGRT XMP enrichment (mirrors React file's helper) --------
    // Reads freeXan Caption_WordTimings off each generic clip's projectItem so the
    // UI can render words grouped by text-input row. Failures fall back to
    // freeXan Caption rendering. Cached per "track-index" to avoid duplicate reads.
    const _genericXmpCache = {};
    function readGenericClipXMP(trackIndex, clipIndex) {
        const key = trackIndex + '-' + clipIndex;
        if (_genericXmpCache.hasOwnProperty(key)) {
            return Promise.resolve(_genericXmpCache[key]);
        }
        if (!window.__adobe_cep__) {
            _genericXmpCache[key] = null;
            return Promise.resolve(null);
        }
        const script = '(function(){try{' +
            'var seq=app.project.activeSequence;' +
            'if(!seq)return JSON.stringify({ok:false});' +
            'var t=seq.videoTracks[' + trackIndex + '];if(!t)return JSON.stringify({ok:false});' +
            'var c=t.clips[' + clipIndex + '];if(!c)return JSON.stringify({ok:false});' +
            'if(typeof _smIsGenericClip!=="function"||!_smIsGenericClip(c))return JSON.stringify({ok:true,data:null});' +
            'if(typeof _smReadWordTimings!=="function")return JSON.stringify({ok:false});' +
            'var d=_smReadWordTimings(c.projectItem);' +
            'return JSON.stringify({ok:true,data:d||null});' +
            '}catch(e){return JSON.stringify({ok:false,error:String(e)});}})()';
        return new Promise(function(resolve) {
            const timer = setTimeout(function() { resolve(null); }, 5000);
            window.__adobe_cep__.evalScript(script, function(res) {
                clearTimeout(timer);
                if (!res || res === 'EvalScript error.') { _genericXmpCache[key] = null; return resolve(null); }
                try {
                    const parsed = JSON.parse(res);
                    const out = (parsed && parsed.ok && parsed.data) ? parsed.data : null;
                    _genericXmpCache[key] = out;
                    resolve(out);
                } catch (e) {
                    _genericXmpCache[key] = null;
                    resolve(null);
                }
            });
        });
    }

    async function enrichPhrasesWithMogrtMode(phrases) {
        if (!Array.isArray(phrases) || phrases.length === 0) return phrases;
        await Promise.all(phrases.map(async function(phrase) {
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
                phrase.wordDistribution = (Array.isArray(xmp.distribution) && xmp.distribution.length > 0)
                    ? xmp.distribution
                    : [xmp.words.map(function(_, i) { return i; })];
                phrase.textInputCount = xmp.textInputCount || phrase.wordDistribution.length;
                phrase.textInputNames = Array.isArray(xmp.textInputNames) ? xmp.textInputNames : [];
            } else {
                phrase.mogrtMode = phrase.mogrtMode || 'freexan';
            }
        }));
        return phrases;
    }

    async function refreshTimeline() {
        try {
            setLoading(true, 'Scanning timeline...');
            const response = await callJSX('getTimelinePhraseMap', {});

            // Check for backend errors returned as objects
            if (response && response.status === 'Error') {
                throw new Error(response.message || 'Unknown backend error');
            }

            const phrases = Array.isArray(response) ? response : [];
            AppState.timelineMap = phrases;
            AppState.selection = [];
            AppState.activeClip = null;
            AppState.activeClipId = null;
            // First paint with raw data so user sees something instantly.
            renderNavigator();
            renderInspector();
            // Async generic-MOGRT enrichment, then re-render. Failures fall back.
            try {
                await enrichPhrasesWithMogrtMode(phrases);
                AppState.timelineMap = phrases;
                renderNavigator();
            } catch (enrichErr) {
                console.warn('[freeXan Caption] Generic MOGRT enrichment failed:', enrichErr);
            }
            setLoading(false);
        } catch (e) {
            console.error('Refresh failed:', e);
            setLoading(false);
            alert('Timeline Scan Failed: ' + e.message);
        }
    }

    // ==========================================
    // 5. HELPERS
    // ==========================================

    function formatTime(seconds) {
        if (!seconds) return '00:00.000';
        const date = new Date(0);
        date.setSeconds(seconds);
        return date.toISOString().substr(14, 9);
    }

    function updateSelectionUI() {
        // Update Bubbles
        document.querySelectorAll('.cc-word-bubble').forEach(b => {
            const cid = b.dataset.clipId;
            b.classList.toggle('is-selected', AppState.selection.includes(cid));
            b.classList.toggle('is-active', AppState.activeClipId === cid);
        });

        // Update Phrase Cards
        document.querySelectorAll('.cc-phrase-card').forEach(card => {
            const pId = card.dataset.phraseId;
            const hasActiveClip = AppState.activeClipId && AppState.activeClipId.startsWith(`${pId}-`);
            card.classList.toggle('is-active', !!hasActiveClip);
        });
    }

    function setLoading(busy, text = 'Processing...') {
        AppState.isBusy = busy;
        const dot = document.getElementById('cc-status-dot');
        const statusText = document.getElementById('cc-status-text');
        if (dot) dot.className = `cc-status-dot ${busy ? 'is-busy' : ''}`;
        if (statusText) statusText.innerText = busy ? text : 'Ready';
    }

    function updateStatus() {
        const count = document.getElementById('cc-selection-count');
        if (count) count.innerText = `${AppState.selection.length} selected`;
    }

    // ==========================================
    // 6. INITIALIZATION
    // ==========================================
    function init() {
        console.log('[freeXan Caption] Command Center Engine Initializing...');
        
        // Bind Toolbar Buttons
        document.getElementById('cc-btn-refresh').addEventListener('click', refreshTimeline);
        
        // Property Search
        document.getElementById('cc-property-search').addEventListener('input', (e) => {
            AppState.searchFilter = e.target.value;
            renderInspector();
        });

        // Sync Toggle Global
        document.getElementById('cc-btn-sync').addEventListener('click', (e) => {
            AppState.isSyncEnabled = !AppState.isSyncEnabled;
            e.target.classList.toggle('cc-btn-primary', AppState.isSyncEnabled);
            renderInspector();
        });

        // Merge Button
        document.getElementById('cc-btn-merge').addEventListener('click', handleMergePhrases);

        console.log('[freeXan Caption] Command Center Engine Ready.');
    }

    // Export to global scope for debugging if needed
    window.freeXan CaptionCC = { AppState, refreshTimeline };

    // Boot
    if (document.readyState === 'complete') {
        init();
    } else {
        window.addEventListener('load', init);
    }

})();
