/**
 * freeXan Caption Tools Refactor (v2.7.2 - Bug Fix: Probe + QE Protection)
 *
 * Why this file exists:
 * The original panel.js is minified and locked. This script intercepts
 * the 3 Tools tab buttons after they load and replaces their click
 * handlers with our smarter, collision-aware logic.
 *
 * Key fixes in v2.7.2:
 * - FIXED: typeof probe now uses direct evalScript (not callJSX which appended '()')
 * - FIXED: splitPhraseGetMogrtData QE crash fixed in main.jsx
 * - FIXED: clipEnd no longer passed from JS (was always undefined)
 * - ADDED: Full console logging for debugging in Premiere DevTools
 */

(function() {

    // ==========================================
    // CORE: JSX Communication Bridge
    // ==========================================

    /**
     * Calls an ExtendScript (JSX) function by name and waits for the result.
     * @param {string} funcName - The JSX function to call.
     * @param {object} params   - Data to pass (JSON-encoded). Omit for no-arg calls.
     */
    async function callJSX(funcName, params) {
        const script = (params !== undefined)
            ? funcName + '(' + JSON.stringify(params) + ')'
            : funcName + '()';

        console.log('%c[JS->JSX]%c Request: %s', 'color: #00bcd4; font-weight: bold;', 'color: default;', funcName, params || '');

        return new Promise(function(resolve, reject) {
            window.__adobe_cep__.evalScript(script, function(res) {
                if (!res || res === 'EvalScript error.') {
                    console.error('%c[JSX->JS]%c CRASH on %s', 'color: #f44336; font-weight: bold;', 'color: default;', funcName);
                    reject(new Error('JSX CRASH: \'' + funcName + '\' failed.'));
                } else {
                    console.log('%c[JSX->JS]%c Response from %s: %s', 'color: #4caf50; font-weight: bold;', 'color: default;', funcName, res.substring(0, 150) + (res.length > 150 ? '...' : ''));
                    try {
                        var parsed = JSON.parse(res);
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

    /**
     * Checks if a JSX function exists in the engine's global scope.
     *
     * Why NOT use callJSX for this:
     * callJSX always appends '()' to the function name. So calling
     * callJSX('typeof sm_tools_split_v27') would build the string:
     *   'typeof sm_tools_split_v27()'
     * ...which CALLS the function and gets typeof of its return value ("string"),
     * not typeof the function itself ("function"). So we use evalScript directly.
     *
     * @param {string} funcName - The name of the JSX function to probe.
     * @returns {Promise<boolean>} True if the function exists.
     */
    function probeJSXFunction(funcName) {
        return new Promise(function(resolve) {
            window.__adobe_cep__.evalScript('typeof ' + funcName, function(res) {
                console.log('[freeXan Caption] Probe "' + funcName + '":', res);
                resolve(res === 'function');
            });
        });
    }

    // ==========================================
    // INIT: Intercept Buttons
    // ==========================================

    /**
     * Replaces the legacy onclick handlers on all 3 Tools buttons.
     * Uses "clone & replace" to completely wipe listeners set by panel.js.
     */
    function initToolsRefactor() {
        console.log('[freeXan Caption] Tools Interceptor v2.7.2 starting...');

        var buttonMap = {
            'syncAll':       function(e) { handleSyncGeneric(e, 'all'); },
            'syncText':      function(e) { handleSyncGeneric(e, 'text'); },
            'syncStyle':     function(e) { handleSyncGeneric(e, 'style'); },
            'syncPSR':       function(e) { handleSyncGeneric(e, 'psr'); },
            'joinSelection': handleSplitJoinSelection,
            'splitPhrase':   handleSplitPhrase,
            'joinPhrases':   handleJoinPhrases,
            'removeWordBtn': handleRemoveWord,
            'addWordBtn':    handleAddWord
        };

        Object.keys(buttonMap).forEach(function(id) {
            var original = document.getElementById(id);
            if (!original) {
                console.warn('[freeXan Caption] Button not found on page:', id);
                return;
            }
            // Clone wipes ALL event listeners from minified panel.js
            var clone = original.cloneNode(true);
            clone.removeAttribute('onclick');
            original.parentNode.replaceChild(clone, original);

            clone.addEventListener('click', function(e) {
                console.log('%c[USER]%c Clicked Button: %s', 'color: #ff9800; font-weight: bold;', 'color: default;', id);
                buttonMap[id](e);
            });
            console.log('[freeXan Caption] Intercepted:', id);
        });

        console.log('[freeXan Caption] Tools Interceptor ready.');
    }

    // ==========================================
    // HANDLER: Join (2+ selected clips)
    // ==========================================

    /**
     * Handles the "Join 2 Entire Phrases" (Master Join).
     * Merges multiple phrases into one.
     */
    // Animated progress bar helper: pulses 0 -> 95 while running, snaps to 100 on done.
    function startProgress() {
        var bar = document.getElementById('progressBarTools');
        if (!bar) return { stop: function(){} };
        bar.style.width = '0%';
        bar.innerText = '0%';
        var pct = 0;
        var iv = setInterval(function() {
            pct = Math.min(pct + 3, 95);
            bar.style.width = pct + '%';
            bar.innerText = pct + '%';
        }, 80);
        return {
            stop: function(success) {
                clearInterval(iv);
                bar.style.width = '100%';
                bar.innerText = success === false ? 'Failed' : 'Complete!';
                setTimeout(function() {
                    bar.style.width = '0%';
                    bar.innerText = '0%';
                }, 1500);
            }
        };
    }

    async function handleJoinPhrases(e) {
        if (e) { e.preventDefault(); e.stopImmediatePropagation(); }
        console.log('[freeXan Caption] Join Phrases triggered.');

        var progress = null;
        try {
            var isLoaded = await probeJSXFunction('sm_tools_join_v28');
            if (!isLoaded) {
                alert('freeXan Caption: Join backend (v2.8) not found.\n\nPlease fully restart Premiere Pro and try again.');
                return;
            }

            console.log('[freeXan Caption] Gathering selection data...');
            var data = await callJSX('joinGetSelection', {});

            if (data.status !== 'Complete' || !data.selectedMogrtData || data.selectedMogrtData.length < 2) {
                alert('Instruction: Select at least 2 freeXan Caption clips (from 2+ phrases) to join.');
                return;
            }

            var params = { selectedClips: [] };
            for (var i = 0; i < data.selectedMogrtData.length; i++) {
                params.selectedClips.push({
                    trackIndex: data.selectedMogrtData[i].trackNumber,
                    clipIndex: data.selectedMogrtData[i].clipNumber
                });
            }

            progress = startProgress();
            var result = await callJSX('sm_tools_join_v28', params);
            if (result.status === 'Error') {
                progress.stop(false); progress = null;
                alert('Join Failed\n\nDetails: ' + result.message);
            } else {
                progress.stop(true); progress = null;
                console.log('[freeXan Caption] Join complete.');
            }
        } catch (err) {
            if (progress) progress.stop(false);
            alert('freeXan Caption Critical Error (Join):\n\n' + err.message);
        }
    }

    /**
     * Handles the "Split & Join Selection" (Word Surgery).
     * Redistributes words between two phrases.
     */
    async function handleSplitJoinSelection(e) {
        if (e) { e.preventDefault(); e.stopImmediatePropagation(); }
        console.log('[freeXan Caption] Split & Join Selection triggered.');

        var progress = null;
        try {
            var isLoaded = await probeJSXFunction('sm_tools_split_join_v28');
            if (!isLoaded) {
                alert('freeXan Caption: Split & Join backend (v2.8) not found.\n\nPlease fully restart Premiere Pro and try again.');
                return;
            }

            console.log('[freeXan Caption] Gathering selection data...');
            var data = await callJSX('joinGetSelection', {});

            if (data.status !== 'Complete' || !data.selectedMogrtData || data.selectedMogrtData.length < 2) {
                alert('Instruction: Select at least 2 freeXan Caption clips contiguous across phrases.');
                return;
            }

            var params = { selectedClips: [] };
            for (var i = 0; i < data.selectedMogrtData.length; i++) {
                params.selectedClips.push({
                    trackIndex: data.selectedMogrtData[i].trackNumber,
                    clipIndex: data.selectedMogrtData[i].clipNumber
                });
            }

            progress = startProgress();
            var result = await callJSX('sm_tools_split_join_v28', params);
            if (result.status === 'Error') {
                progress.stop(false); progress = null;
                alert('Split & Join Failed\n\nDetails: ' + result.message);
            } else {
                progress.stop(true); progress = null;
                console.log('[freeXan Caption] Split & Join complete.');
            }
        } catch (err) {
            if (progress) progress.stop(false);
            alert('freeXan Caption Critical Error (Split & Join):\n\n' + err.message);
        }
    }

    // ==========================================
    // HANDLER: Split (at playhead)
    // ==========================================

    /**
     * Splits the phrase the playhead is currently over.
     *
     * WHY NO SELECTION REQUIRED:
     * Blueprint Â§2.1 says: "User places the playhead over the clip intended to be
     * the LAST word of Phrase A." Selection is NOT mentioned. The playhead alone
     * determines which clip is the anchor.
     */

    /**
     * Unified Handler for all Sync operations.
     * Replaces legacy panel.js logic with robust v2.8 handling.
     */
    async function handleSyncGeneric(e, type) {
        if (e) { e.preventDefault(); e.stopImmediatePropagation(); }
        console.log('[freeXan Caption] Sync (' + type + ') triggered.');

        var progressBar = document.getElementById('progressBarTools');
        var spinner = document.getElementById('gifSpinnerTools');
        var staticIcon = document.getElementById('staticSpinnerTools');

        try {
            var getDataFunc = (type === 'text') ? 'syncTextGetData' : 'syncAllGetData';
            var data = await callJSX(getDataFunc, {});

            if (data.status !== 'Complete' || !data.selectedMogrtData || data.selectedMogrtData.length < 1) {
                alert('Instruction: Select at least 1 master clip (under playhead) and other clips to sync.');
                return;
            }

            // Master data check
            if (!data.masterMogrtData || data.masterMogrtData.length === 0) {
                alert('Instruction: Place playhead over the "Source" clip you want to copy settings FROM.');
                return;
            }

            console.log('[freeXan Caption] Syncing ' + data.selectedMogrtData.length + ' clips...');
            if (spinner) { spinner.style.display = 'inline'; }
            if (staticIcon) { staticIcon.style.display = 'none'; }

            const total = data.selectedMogrtData.length;

            // Pre-calculate filtered property lists
            const textInputNames = ["\u24c9 Text Input", "Ⓢ Text Input", "Text Input", "Text", "Ⓣ Text Input"];
            const progressionNames = ["\u24c9 Word Progression", "Ⓢ Word Progression", "Word Progression", "Ⓣ Word Progression"];

            const fullData = data.masterMogrtData.filter(p => !progressionNames.includes(p.displayName));

            // PSR keyword test — shared by both psrData (include) and styleOnlyData (exclude)
            const isPSR = p =>
                p.displayName.indexOf('Position') !== -1 ||
                p.displayName.indexOf('Scale') !== -1 ||
                p.displayName.indexOf('Rotation') !== -1 ||
                p.displayName.indexOf('Transform') !== -1;

            // V3: Ⓢ/Ⓑ glyph-blocked data for cross-phrase — these are phrase-specific and must never cross boundaries
            // Also explicitly exclude Master Transform (PSR) properties — those belong only to Sync PSR
            const styleOnlyData = fullData
                .filter(p => !textInputNames.includes(p.displayName))
                .filter(p => p.displayName.indexOf('Ⓢ') === -1)   // Ⓢ
                .filter(p => p.displayName.indexOf('Ⓑ') === -1)   // Ⓑ
                .filter(p => !isPSR(p));                            // Master Transform
            const textOnlyData = data.masterMogrtData.filter(p => textInputNames.includes(p.displayName));
            // V6: PSR data — only Master Transform Group properties (internal MGT, NOT Premiere Motion)
            const psrData = fullData.filter(isPSR);

            // Build a single batch payload — one JSX call for all clips (no N round-trips)
            const batchFunc = (type === 'text') ? 'sm_sync_text_batch' : 'sm_sync_batch';
            const batchPayload = JSON.parse(JSON.stringify(data));

            // --- PHRASE-AWARE FILTERING ---
            if (type === 'all') {
                batchPayload.updatedMogrtData = fullData;
            } else if (type === 'style') {
                batchPayload.updatedMogrtData = styleOnlyData;
            } else if (type === 'text') {
                batchPayload.updatedMogrtData = textOnlyData;
            } else if (type === 'psr') {
                batchPayload.updatedMogrtData = psrData;
            }

            if (type !== 'psr') {
                batchPayload.masterPositionValue = undefined;
                batchPayload.masterScaleValue = undefined;
                batchPayload.masterRotationValue = undefined;
            }

            console.log('[freeXan Caption] Dispatching batch sync (' + batchFunc + ') for ' + total + ' clips.');
            if (progressBar) { progressBar.style.width = '50%'; progressBar.innerText = 'Syncing...'; }

            try {
                const batchResult = await callJSX(batchFunc, batchPayload);
                const synced = (batchResult && batchResult.count != null) ? batchResult.count : total;
                const skipped = (batchResult && batchResult.skipped != null) ? batchResult.skipped : 0;
                console.log('[freeXan Caption] Batch sync done | synced=' + synced + ' skipped=' + skipped);

                if (progressBar) {
                    progressBar.style.width = '100%';
                    progressBar.innerText = skipped > 0 ? ('Done (' + skipped + ' skipped)') : 'Sync Complete!';
                    setTimeout(function() {
                        progressBar.style.width = '0%';
                        progressBar.innerText = '0%';
                    }, 2000);
                }
            } catch (err) {
                console.error('[freeXan Caption] Sync Error:', err);
                alert('freeXan Caption Sync Failed:\n' + err.message);
            } finally {
                if (spinner) { spinner.style.display = 'none'; }
                if (staticIcon) { staticIcon.style.display = 'inline'; }
                if (progressBar) {
                    progressBar.style.backgroundColor = '#29BFBE';
                    setTimeout(function() {
                        progressBar.style.width = '0%';
                        progressBar.innerText = '0%';
                    }, 2000);
                }
            }

        } catch (err) {
            alert('freeXan Caption Critical Error (Sync):\n\n' + err.message);
            if (spinner) { spinner.style.display = 'none'; }
            if (staticIcon) { staticIcon.style.display = 'inline'; }
        }
    }
    async function handleSplitPhrase(e) {
        if (e) { e.preventDefault(); e.stopImmediatePropagation(); }
        console.log('[freeXan Caption] Split triggered.');

        var progress = null;
        try {
            var isLoaded = await probeJSXFunction('sm_tools_split_v28');
            if (!isLoaded) {
                alert('freeXan Caption: Split backend (v2.8) not found.\n\nPlease fully restart Premiere Pro and try again.');
                return;
            }

            // Step 1: Get ALL clip data + playhead position from the backend.
            // NOTE: We pass an empty object so splitPhraseGetMogrtData returns
            // both the playhead time AND the data of all selected clips.
            // If nothing is selected, we'll scan all tracks via the backend.
            var data = await callJSX('splitPhraseGetMogrtData', { splitVideoTrack: 1 });

            if (data.status === 'Error') {
                alert('Split Error:\n\n' + data.message);
                return;
            }

            // Step 2: Find the clip that is directly under the playhead.
            // We do NOT require a selection â€” the playhead is the sole trigger.
            var playhead = data.playhead;
            var masterClip = null;

            if (data.selectedClipData && data.selectedClipData.length > 0) {
                // Check selected clips first (fast path)
                for (var i = 0; i < data.selectedClipData.length; i++) {
                    var c = data.selectedClipData[i];
                    if (c.clipStart <= playhead && c.clipEnd >= playhead) {
                        masterClip = c;
                        break;
                    }
                }
            }

            if (!masterClip) {
                // No selected clip under playhead â€” ask the backend to scan ALL tracks
                var scanResult = await callJSX('findClipUnderPlayhead', {});
                if (scanResult && scanResult.status === 'Found') {
                    masterClip = scanResult;
                }
            }

            if (!masterClip) {
                alert('Instruction: Place your playhead (blue line) over the freeXan Caption subtitle you want to split, then click Split.\n\nTip: You do not need to select any clips â€” just position the playhead.');
                return;
            }

            var params = {
                trackIndex: masterClip.trackNumber,
                clipIndex:  masterClip.clipNumber
            };
            console.log('[freeXan Caption] Split params:', JSON.stringify(params));

            progress = startProgress();
            var result = await callJSX('sm_tools_split_v28', params);
            if (result.status === 'Error') {
                progress.stop(false); progress = null;
                alert('Split Failed\n\nDetails: ' + result.message);
            } else {
                progress.stop(true); progress = null;
                console.log('[freeXan Caption] Split complete (v2.8.3).');
            }

        } catch (err) {
            if (progress) progress.stop(false);
            alert('freeXan Caption Critical Error (Split):\n\n' + err.message);
        }
    }

    // ==========================================
    // HANDLER: Remove Word
    // ==========================================

    async function handleRemoveWord(e) {
        var progress = startProgress();
        try {
            var clipData = await callJSX('findClipUnderPlayhead', {});
            if (!clipData || clipData.status !== 'Found') {
                progress.stop(false);
                alert('Place your playhead over the word you want to remove.');
                return;
            }
            var result = await callJSX('sm_tools_remove_word_v28', {
                trackIndex: clipData.trackNumber,
                clipIndex: clipData.clipNumber
            });
            progress.stop(result && result.status === 'Complete');
            if (result && result.status !== 'Complete')
                alert('Remove Word: ' + (result.message || 'Unknown error'));
        } catch(err) {
            progress.stop(false);
            alert('Remove Word failed: ' + err.message);
        }
    }

    // ==========================================
    // HANDLER: Add Word
    // ==========================================

    async function handleAddWord(e) {
        var newWordInput = document.getElementById('addWordInput');
        var newWord = newWordInput ? newWordInput.value.trim() : '';
        if (!newWord) {
            alert('Type the new word in the input box first, then click Add Word.');
            return;
        }

        var progress = startProgress();
        try {
            var clipData = await callJSX('findClipUnderPlayhead', {});
            if (!clipData || clipData.status !== 'Found') {
                progress.stop(false);
                alert('Place your playhead over the word you want to add AFTER.');
                return;
            }
            var result = await callJSX('sm_tools_add_word_v28', {
                trackIndex: clipData.trackNumber,
                clipIndex: clipData.clipNumber,
                newWord: newWord
            });
            progress.stop(result && result.status === 'Complete');
            if (result && result.status === 'Complete') {
                if (newWordInput) newWordInput.value = '';  // clear input on success
            } else {
                alert('Add Word: ' + (result ? result.message : 'Unknown error'));
            }
        } catch(err) {
            progress.stop(false);
            alert('Add Word failed: ' + err.message);
        }
    }


    // ==========================================
    // BOOT
    // ==========================================

    if (document.readyState === 'complete') {
        initToolsRefactor();
    } else {
        window.addEventListener('load', initToolsRefactor);
    }

})();

