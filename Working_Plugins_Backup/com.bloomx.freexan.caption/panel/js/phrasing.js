/**
 * freeXan Caption Phrasing Logic
 * Why: This script allows using a second SRT to define phrase boundaries,
 * overriding the character-limit slider. It intercepts the "Create Subs"
 * button and preprocesses the SRT data.
 */

(function() {
    const fs = require('fs');
    const path = require('path');

    let selectedHindiSrtPath = null;

    function initPhrasing() {
        const toggle = document.getElementById('phrasingModeToggle');
        const container = document.getElementById('phrasingSrtContainer');
        const slider = document.getElementById('range-slider__range');
        const selectPhrasingBtn = document.getElementById('selectPhrasingSRT');
        const phrasingSrtInput = document.getElementById('phrasingSRTPath');
        const contentSrtInput = document.getElementById('srtFilePath');
        const createBtn = document.getElementById('createCaptions');

        if (!toggle || !container || !createBtn) return;

        // File Selection for Phrasing SRT
        selectPhrasingBtn.addEventListener('click', function() {
            const result = window.cep.fs.showOpenDialog(false, false, "Select Phrasing SRT", "", ["srt"]);
            if (result.err === 0 && result.data.length > 0) {
                phrasingSrtInput.value = result.data[0];
            }
        });

        // Auto-Select Phrasing SRT based on suffix
        const checkAutoSelect = () => {
            const contentPath = contentSrtInput.value;
            if (!contentPath || phrasingSrtInput.value) return; // Don't override if already set

            const dir = path.dirname(contentPath);
            const ext = path.extname(contentPath);
            const base = path.basename(contentPath, ext);

            const suffixes = [" Phased", "_phrased", " (phrased)", ".phrased"];
            for (const suffix of suffixes) {
                const autoPath = path.join(dir, base + suffix + ext);
                if (fs.existsSync(autoPath)) {
                    phrasingSrtInput.value = autoPath;
                    return true;
                }
            }
            return false;
        };

        // UI State Management
        toggle.addEventListener('change', function() {
            const sliderContainer = slider.parentElement;
            const sliderLabel = sliderContainer.previousElementSibling;

            if (this.checked) {
                container.style.display = 'flex';
                slider.disabled = true;
                sliderContainer.style.opacity = '0.4';
                sliderContainer.style.pointerEvents = 'none';
                if (sliderLabel) {
                    sliderLabel.style.opacity = '0.4';
                    sliderLabel.style.pointerEvents = 'none';
                }
                checkAutoSelect();
            } else {
                container.style.display = 'none';
                slider.disabled = false;
                sliderContainer.style.opacity = '1';
                sliderContainer.style.pointerEvents = 'auto';
                if (sliderLabel) {
                    sliderLabel.style.opacity = '1';
                    sliderLabel.style.pointerEvents = 'auto';
                }
            }
        });

        // Trigger auto-select when content SRT changes
        contentSrtInput.addEventListener('change', () => {
            if (toggle.checked) checkAutoSelect();
        });

        // Intercept Create Subs safely
        const newBtn = createBtn.cloneNode(true);
        newBtn.id = "createCaptions_Intercept";
        createBtn.style.display = 'none'; // Hide original
        createBtn.parentNode.insertBefore(newBtn, createBtn);

        newBtn.addEventListener('click', async function(e) {
            e.preventDefault();

            const contentPath = contentSrtInput.value;
            const phrasingPath = phrasingSrtInput.value;
            const mogrtInput = document.getElementById('mogrtFile');
            let mogrtPath = mogrtInput ? mogrtInput.value : null;

            // Auto-fetch from Mister BloomX active selection on every click
            try {
                const cs = window.csInterface || new window.CSInterface();
                const fxDir = require('path').join(cs.getSystemPath(window.SystemPath.USER_DATA), 'freeXan');
                const tempFile = require('path').join(fxDir, 'active_mogrt.txt');
                if (require('fs').existsSync(tempFile)) {
                    const latestMogrt = require('fs').readFileSync(tempFile, 'utf8').trim();
                    if (latestMogrt) {
                        mogrtPath = latestMogrt;
                        if (mogrtInput) {
                            mogrtInput.value = mogrtPath;
                            mogrtInput.dispatchEvent(new Event('change'));
                        }
                    }
                }
            } catch(e) { console.error("Could not read active MOGRT from BloomX:", e); }

            if (!contentPath) {
                alert("Please select a Content SRT file.");
                return;
            }
            if (toggle.checked && !phrasingPath) {
                alert("Please select a Phrasing SRT file.");
                return;
            }
            if (!mogrtPath) {
                alert("Please select a MOGRT in MISTER BloomX or drop one into the Workflow tab.");
                return;
            }

            try {
                // Change UI to reflect processing steps
                newBtn.innerHTML = 'Processing (Step 1/5)... <i class="fas fa-spinner fa-spin"></i>';
                newBtn.disabled = true;

                const contentData = parseSRT(contentPath);
                if (contentData.length === 0) {
                    throw new Error("Content SRT file is empty or invalid.");
                }

                // 1. Fetch Backend Data
                newBtn.innerHTML = 'Processing (Step 2/5)... Loading Background Data';
                
                let mogrtDef = null;
                try {
                    const mogrtBuf = fs.readFileSync(mogrtPath);
                    const zip = await window.JSZip.loadAsync(mogrtBuf);
                    const defFile = zip.file('definition.json') || Object.values(zip.files).find(f => f.name && f.name.endsWith('definition.json'));
                    if (defFile) mogrtDef = await defFile.async('string');
                } catch (e) {
                    console.warn('[freeXan Caption] Could not pre-read MOGRT definition: ' + e.message);
                }

                const hiddenAssetInput = document.getElementById('smAssetFolderPath');
                const assetPath = hiddenAssetInput ? hiddenAssetInput.value : null;
                
                const hiddenTagInput = document.getElementById('smAssetTag');
                const assetTag = hiddenTagInput ? hiddenTagInput.value : null;

                const requestData = { 
                    srtFilePath: contentPath, 
                    mogrtFilePath: mogrtPath,
                    mogrtDefinition: mogrtDef, // Shadow Definition
                    assetFolderPath: assetPath, // Asset Isolation Path
                    assetTag: assetTag // Unique Tag
                };
                const safeScriptConfig = 'getData(' + JSON.stringify(requestData) + ')';
                
                const backendDataStr = await new Promise((resolve, reject) => {
                    const timeout = setTimeout(() => reject(new Error("Timeout! Premiere Pro did not respond.")), 20000);
                    window.__adobe_cep__.evalScript(safeScriptConfig, function(res) {
                        clearTimeout(timeout);
                        resolve(res);
                    });
                });
                
                if (!backendDataStr || backendDataStr.indexOf("EvalScript error") > -1) {
                    throw new Error("Backend script failure (Check selected inputs/Mogrt)");
                }

                newBtn.innerHTML = 'Processing (Step 3/5)... Parsing Engine';
                const backendData = JSON.parse(backendDataStr);

                // Generic MOGRT support: read mode from backend, default to "freexan" for backward compat
                const mogrtMode = backendData.mogrtMode || "freexan";
                const textInputCount = backendData.mogrtTextInputCount || 1;

                // Compute one-frame duration from the sequence's actual frame rate.
                // Used as the timing tolerance when assigning words to phrase buckets.
                const _fpsMap = {"100":24,"101":25,"102":29.97,"103":29.97,"104":30,"105":50,"106":59.94,"107":59.94,"108":60,"110":23.976,"113":48};
                const _seqFPS = _fpsMap[backendData.myFrameRateCode] || 25;
                const frameDuration = 1 / _seqFPS;

                if (backendData.activeSequence !== true) {
                    throw new Error(backendData.message || "No active sequence found.");
                }

                // 2. Perform Precise Native Phrase Grouping
                newBtn.innerHTML = 'Processing (Step 4/5)... Mapping Words';
                
                // CRITICAL: Split Content SRT into individual words first to avoid block-overlaps
                let splitContentWords = [];
                contentData.forEach(block => {
                    const textWords = block.text.split(/\s+/).filter(w => w.length > 0);
                    if (textWords.length === 0) return;
                    
                    const blockDuration = block.end - block.start;
                    const wordDuration = blockDuration / textWords.length;
                    
                    textWords.forEach((wordText, idx) => {
                        splitContentWords.push({
                            start: block.start + (idx * wordDuration),
                            end: block.start + ((idx + 1) * wordDuration),
                            text: wordText
                        });
                    });
                });

                // --- GAP BRIDGE PASS (Flicker Prevention) ---
                // Close small gaps between words to ensure the captions are continuous.
                // If a gap is less than 2s, we stretch the current word to touch the next one.
                for (let g = 0; g < splitContentWords.length - 1; g++) {
                    let currentWord = splitContentWords[g];
                    let nextWord = splitContentWords[g + 1];
                    let gap = nextWord.start - currentWord.end;
                    if (gap > 0 && gap < 2) {
                        currentWord.end = nextWord.start;
                    }
                }

                let phrasingData = [];
                if (toggle.checked) {
                    // PHRASING MODE: Use external Phasing SRT
                    phrasingData = parseSRT(phrasingPath);
                    if (phrasingData.length === 0) throw new Error("Phrasing SRT file is empty or invalid.");
                } else {
                    // STANDARD MODE: Use Character Limit Slider
                    const maxChars = parseInt(slider.value) || 20;
                    console.log('[freeXan Caption] Standard Mode: Grouping by ' + maxChars + ' characters');
                    
                    let currentPhraseWords = [];
                    let currentLength = 0;
                    splitContentWords.forEach(word => {
                        if (currentLength + word.text.length + 1 > maxChars && currentPhraseWords.length > 0) {
                            phrasingData.push({
                                start: currentPhraseWords[0].start,
                                end: currentPhraseWords[currentPhraseWords.length - 1].end,
                                text: currentPhraseWords.map(w => w.text).join(' ')
                            });
                            currentPhraseWords = [];
                            currentLength = 0;
                        }
                        currentPhraseWords.push(word);
                        currentLength += word.text.length + 1;
                    });
                    if (currentPhraseWords.length > 0) {
                        phrasingData.push({
                            start: currentPhraseWords[0].start,
                            end: currentPhraseWords[currentPhraseWords.length - 1].end,
                            text: currentPhraseWords.map(w => w.text).join(' ')
                        });
                    }
                }
                
                // --- PHRASE GAP BRIDGE PASS ---
                // Even if words are bridged, the phrases themselves might have gaps
                // (especially if using an external Phrasing SRT). 
                for (let p = 0; p < phrasingData.length - 1; p++) {
                    let currentPhrase = phrasingData[p];
                    let nextPhrase = phrasingData[p + 1];
                    let pGap = nextPhrase.start - currentPhrase.end;
                    if (pGap > 0 && pGap < 2) {
                        currentPhrase.end = nextPhrase.start;
                    }
                }

                let allWordsData = [];
                let phraseNumber = 1;

                for (let i = 0; i < phrasingData.length; i++) {
                    const phrase = phrasingData[i];
                    
                    const words = splitContentWords.filter(word => {
                        const overlapStart = Math.max(word.start, phrase.start);
                        const overlapEnd = Math.min(word.end, phrase.end);
                        const overlapDuration = overlapEnd - overlapStart;
                        const wordDuration = word.end - word.start;
                        
                        // Word belongs if it starts in phrase OR overlaps heavily
                        return (word.start >= phrase.start - frameDuration && word.start < phrase.end - (frameDuration / 2)) ||
                               (overlapDuration > wordDuration * 0.5);
                    });

                    if (words.length > 0) {
                        const phraseText = words.map(w => w.text).join(' '); // Use Content SRT text (e.g. Hinglish)
                        const numWords = words.length;
                        const videoTrack = ((phraseNumber - 1) % 3) + 1;

                        if (mogrtMode === "generic") {
                            // Generic MOGRT: one clip per phrase, backend distributes words across text inputs
                            const phraseWordTimings = words.map(w => ({
                                text: w.text,
                                start: Math.max(w.start, phrase.start), // clamp to phrase bounds
                                end:   Math.min(w.end, phrase.end)
                            }));
                            allWordsData.push({
                                wordStart:         phrase.start,
                                wordEnd:           phrase.end,
                                wordText:          phraseText,
                                phraseText:        phraseText,
                                phraseNumber:      phraseNumber,
                                numWords:          1,
                                progressionValue:  1,
                                videoTrack:        videoTrack,
                                mogrtMode:         "generic",
                                textInputCount:    textInputCount,
                                phraseWordTimings: phraseWordTimings
                            });
                            phraseNumber++;
                        } else {
                            // freeXan Caption mode (default): one entry per word with progression
                            words.forEach((word, wIdx) => {
                                // SAFETY: Clamp word timings to Phrase bounds to prevent overlaps between phrases
                                const clampedStart = Math.max(word.start, phrase.start);
                                const clampedEnd = Math.min(word.end, phrase.end);

                                allWordsData.push({
                                    wordStart: clampedStart,
                                    wordEnd: clampedEnd,
                                    wordText: word.text,
                                    phraseText: phraseText,
                                    phraseNumber: phraseNumber,
                                    numWords: numWords,
                                    progressionValue: wIdx + 1,
                                    videoTrack: videoTrack
                                });
                            });
                            phraseNumber++;
                        }
                    } else {
                        // Empty-words branch — handle generic mode for consistency
                        if (mogrtMode === "generic") {
                            allWordsData.push({
                                wordStart:         phrase.start,
                                wordEnd:           phrase.end,
                                wordText:          phrase.text,
                                phraseText:        phrase.text,
                                phraseNumber:      phraseNumber,
                                numWords:          1,
                                progressionValue:  1,
                                videoTrack:        ((phraseNumber - 1) % 3) + 1,
                                mogrtMode:         "generic",
                                textInputCount:    textInputCount,
                                phraseWordTimings: [{
                                    text:  phrase.text,
                                    start: phrase.start,
                                    end:   phrase.end
                                }]
                            });
                        } else {
                            allWordsData.push({
                                wordStart: phrase.start,
                                wordEnd: phrase.end,
                                wordText: phrase.text,
                                phraseText: phrase.text,
                                phraseNumber: phraseNumber,
                                numWords: 1,
                                progressionValue: 1,
                                videoTrack: ((phraseNumber - 1) % 3) + 1
                            });
                        }
                        phraseNumber++;
                    }
                } // <-- Missing brace restored

                // 3. Fire Native ExtendScript Sequentially
                newBtn.innerHTML = 'Processing (Step 5/5)... Drawing on Timeline';
                const progressBar = document.getElementById('progressBarWorkflow');
                
                for (let t = 0; t < allWordsData.length; t++) {
                    let r = allWordsData[t];
                    r.mogrtProjectItem = backendData.desiredMogrtProjectItem;
                    r.mogrtNodeId = backendData.desiredMogrtNodeId;
                    r.firstVideoTrack = backendData.firstVideoTrack;
                    r.secondVideoTrack = backendData.secondVideoTrack;
                    r.thirdVideoTrack = backendData.thirdVideoTrack;
                    r.totalWords = allWordsData.length;
                    r.wordNumber = t + 1;
                    r.isLastWordInPhrase = false;
                    
                    if (t < allWordsData.length - 1) {
                        if (allWordsData[t+1].progressionValue === 1) {
                            r.isLastWordInPhrase = true; 
                        }
                    } else {
                        r.isLastWordInPhrase = true;
                    }

                    // Update Progress Bar
                    if (progressBar) {
                        const percent = Math.round(((t + 1) / allWordsData.length) * 100);
                        progressBar.style.width = percent + '%';
                        progressBar.innerHTML = percent + '%';
                    }

                    // Directly place MOGRT onto timeline - sequentially to avoid flooding JS Event Queue
                    await new Promise(resolve => {
                        window.__adobe_cep__.evalScript('createCaptions(' + JSON.stringify(r) + ')', function(res) {
                            resolve(res);
                        });
                    });
                }

                // Finalize Progress
                if (progressBar) {
                    progressBar.style.width = '100%';
                    progressBar.innerHTML = 'Bridging gaps...';
                }

                // --- NATIVE TIMELINE GAP BRIDGE ---
                // Wait for all clips to be placed, then use ExtendScript to bridge gaps
                // exactly like the merge function does, avoiding tick/rounding errors.
                await new Promise(resolve => {
                    window.__adobe_cep__.evalScript('bridgeCaptionGaps()', function(res) {
                        resolve(res);
                    });
                });

                if (progressBar) {
                    progressBar.innerHTML = 'Complete!';
                    setTimeout(() => {
                        progressBar.style.width = '0%';
                        progressBar.innerHTML = '0%';
                    }, 3000);
                }

                newBtn.innerHTML = 'Create Subs <i style="margin-left:5px;" class="fas fa-caret-right"></i>';
                newBtn.disabled = false;

            } catch (err) {
                newBtn.innerHTML = '<span style="color:red; font-size:10px;">Err: ' + err.message + '</span>';
                console.error(err);
                setTimeout(() => {
                    newBtn.innerHTML = 'Create Subs <i style="margin-left:5px;" class="fas fa-caret-right"></i>';
                    newBtn.disabled = false;
                }, 5000);
            }
        });

    }

    /**
     * Ports the split_srt.py logic to JavaScript.
     * Splits an SRT file into word-by-word segments.
     * Two-phase: 1. Select File, 2. Process File
     */
    function resetSplitBtn(splitBtn) {
        selectedHindiSrtPath = null;
        splitBtn.innerHTML = `<i class="fas fa-file-export" style="margin-right: 8px;"></i>Split for Hindi`;
        splitBtn.style.borderColor = "#29BFBE";
        splitBtn.style.color = "#29BFBE";
    }

    async function executeSplitSrt() {
        const splitBtn = document.getElementById('splitHindiSRT');

        // PHASE 1: File Selection (or re-selection if already picked)
        if (!selectedHindiSrtPath) {
            const result = window.cep.fs.showOpenDialog(false, false, "Select SRT to Split for Hindi", "", ["srt"]);
            if (result.err === 0 && result.data.length > 0) {
                selectedHindiSrtPath = result.data[0];
                const fileName = path.basename(selectedHindiSrtPath);
                splitBtn.innerHTML = `<i class="fas fa-check" style="margin-right: 8px;"></i>${fileName} — Click to process, right-click to cancel`;
                splitBtn.style.borderColor = "#4CAF50";
                splitBtn.style.color = "#4CAF50";
                splitBtn.title = "Click to process. Right-click to cancel and pick a different file.";
                splitBtn.oncontextmenu = (e) => { e.preventDefault(); resetSplitBtn(splitBtn); splitBtn.oncontextmenu = null; splitBtn.title = ""; };
                console.log('[freeXan Caption] Hindi Split: File selected - ' + selectedHindiSrtPath);
            }
            return;
        }

        // PHASE 2: Processing
        try {
            const inputPath = selectedHindiSrtPath;
            const dir = path.dirname(inputPath);
            const ext = path.extname(inputPath);
            const base = path.basename(inputPath, ext);

            // Naming convention: Word_by_word_[originalName].srt in the same folder
            const outputPath = path.join(dir, `Word_by_word_${base}${ext}`);

            // Read input file — strip UTF-8 BOM if present (common in Windows-saved SRTs)
            const content = fs.readFileSync(inputPath, 'utf8').replace(/^﻿/, '').trim();
            const blocks = content.split(/\r?\n\r?\n/);
            const newBlocks = [];
            let newSeqNum = 1;

            blocks.forEach(block => {
                const lines = block.split(/\r?\n/);
                if (lines.length < 3) return;

                const times = lines[1];
                if (!times.includes(' --> ')) return;

                const [startStr, endStr] = times.split(' --> ');
                const startMs = parseMs(startStr);
                const endMs = parseMs(endStr);

                const text = lines.slice(2).join(' ').trim();
                const words = text.split(/\s+/).filter(w => w.length > 0);

                if (words.length === 0) return;

                const totalDuration = endMs - startMs;
                const wordDuration = totalDuration / words.length;

                words.forEach((word, i) => {
                    const wordStartMs = startMs + (i * wordDuration);
                    const wordEndMs = startMs + ((i + 1) * wordDuration);

                    const newBlock = `${newSeqNum}\n${formatMs(wordStartMs)} --> ${formatMs(wordEndMs)}\n${word}\n`;
                    newBlocks.push(newBlock);
                    newSeqNum++;
                });
            });

            fs.writeFileSync(outputPath, newBlocks.join('\n'), 'utf8');
            alert(`Successfully processed!\n\nCreated: Word_by_word_${base}${ext}\nLocation: ${dir}`);
            resetSplitBtn(splitBtn);
            splitBtn.oncontextmenu = null;
            splitBtn.title = "";

        } catch (err) {
            alert("Error splitting SRT: " + err.message);
            resetSplitBtn(splitBtn);
            splitBtn.oncontextmenu = null;
            splitBtn.title = "";
        }
    }

    function parseMs(timeStr) {
        const parts = timeStr.trim().split(/[:,]/);
        return parseInt(parts[0]) * 3600000 + 
               parseInt(parts[1]) * 60000 + 
               parseInt(parts[2]) * 1000 + 
               parseInt(parts[3]);
    }

    function formatMs(ms) {
        ms = Math.floor(ms);
        const h = Math.floor(ms / 3600000);
        ms %= 3600000;
        const m = Math.floor(ms / 60000);
        ms %= 60000;
        const s = Math.floor(ms / 1000);
        ms %= 1000;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
    }


    /**
     * Robust timestamp to seconds conversion.
     * Handles standard HH:MM:SS,mmm as well as malformed inputs like 00:10:966.
     */
    function timeToSeconds(timeStr) {
        if (!timeStr) return 0;
        
        // Split by all non-digit characters (covers :, . and , separators)
        const parts = timeStr.trim().split(/\D+/).filter(p => p.length > 0);
        
        let ms = 0, s = 0, m = 0, h = 0;
        const rev = parts.reverse();
        
        // Map from right to left: milliseconds, seconds, minutes, hours
        if (rev[0]) ms = parseInt(rev[0], 10) / 1000;
        if (rev[1]) s = parseInt(rev[1], 10);
        if (rev[2]) m = parseInt(rev[2], 10);
        if (rev[3]) h = parseInt(rev[3], 10);
        
        return h * 3600 + m * 60 + s + ms;
    }

    function secondsToTime(secs) {
        const h = Math.floor(secs / 3600);
        const m = Math.floor((secs % 3600) / 60);
        const s = Math.floor(secs % 60);
        const ms = Math.floor((secs % 1) * 1000);
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
    }

    function generateSRT(data) {
        return data.map((seg, i) => {
            return `${i + 1}\n${secondsToTime(seg.start)} --> ${secondsToTime(seg.end)}\n${seg.text}\n`;
        }).join('\n');
    }

    function parseSRT(filePath) {
        const data = fs.readFileSync(filePath, 'utf8');
        const rawSegments = data.split(/\r?\n\r?\n/);
        return rawSegments.map(seg => {
            const lines = seg.split(/\r?\n/).filter(l => l.trim().length > 0);
            if (lines.length < 3) return null;
            // Matches any proper trailing string so malformed inputs won't break
            const timeMatch = lines[1].match(/(\d{2}:\d{2}:\d{2},\d{3}) --> (.*)/);
            if (!timeMatch) return null;
            return {
                start: timeToSeconds(timeMatch[1]),
                end: timeToSeconds(timeMatch[2]),
                text: lines.slice(2).join(' ').trim()
            };
        }).filter(s => s !== null);
    }

    function initAutoCaption() {
        if (!document.getElementById('createCaptionAuto')) return;

        // Show/hide API key section based on stored key
        const storedKey = localStorage.getItem('sm_gemini_key') || '';
        if (wfKeySection) wfKeySection.style.display = storedKey ? 'none' : 'block';
        if (wfKeyInput && storedKey) wfKeyInput.value = storedKey;

        // Save key button
        if (wfSaveKeyBtn && wfKeyInput && wfKeySection) {
            wfSaveKeyBtn.addEventListener('click', function() {
                const k = wfKeyInput.value.trim();
                if (!k) return;
                localStorage.setItem('sm_gemini_key', k);
                wfKeySection.style.display = 'none';
            });
        }

        // Advanced toggle
        if (wfAdvancedToggle && wfAdvancedContent) {
            wfAdvancedToggle.addEventListener('click', function() {
                const hidden = wfAdvancedContent.style.display === 'none' || !wfAdvancedContent.style.display;
                wfAdvancedContent.style.display = hidden ? 'block' : 'none';
                wfAdvancedToggle.innerHTML = (hidden ? '▼' : '▶') + ' Manual Mode (Advanced)';
            });
        }

        autoBtn.addEventListener('click', async function() {
            const mogrtInput = document.getElementById('mogrtFile');
            const mogrtPath = mogrtInput ? mogrtInput.value : '';
            if (!mogrtPath) {
                alert('Please select a MOGRT file first.');
                return;
            }

            const apiKey = localStorage.getItem('sm_gemini_key') || '';
            if (!apiKey) {
                if (wfKeySection) { wfKeySection.style.display = 'block'; }
                return;
            }

            autoBtn.disabled = true;
            const originalHtml = autoBtn.innerHTML;

            try {
                // Step 1a: Try reading from selected clips in Premiere timeline
                autoBtn.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-right:8px;"></i>Reading selection...';
                let hindiSrt = null;

                if (window.__adobe_cep__) {
                    const selRes = await new Promise((resolve) => {
                        const t = setTimeout(() => resolve(null), 8000);
                        window.__adobe_cep__.evalScript('sm_read_selected_clips_as_srt()', function(r) {
                            clearTimeout(t);
                            resolve(r);
                        });
                    });
                    if (selRes) {
                        let parsed;
                        try { parsed = JSON.parse(selRes); } catch(e) {}
                        if (parsed && parsed.ok && parsed.data) hindiSrt = parsed.data;
                    }
                }

                // Step 1b: Fallback — open file picker for Hindi SRT
                if (!hindiSrt) {
                    autoBtn.innerHTML = originalHtml;
                    let pickedPath = '';
                    if (window.cep && window.cep.fs) {
                        const result = window.cep.fs.showOpenDialog(false, false, 'Select Hindi SRT (or select C1 caption clips in Premiere first)', '', ['srt']);
                        if (!result || result.err !== 0 || !result.data || !result.data.length) {
                            autoBtn.disabled = false;
                            return;
                        }
                        pickedPath = result.data[0];
                    } else {
                        pickedPath = prompt('Debug: enter Hindi SRT path');
                        if (!pickedPath) { autoBtn.disabled = false; return; }
                    }
                    autoBtn.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-right:8px;"></i>Reading SRT...';
                    const fsRead = require('fs');
                    hindiSrt = fsRead.readFileSync(pickedPath, 'utf8');
                    if (!hindiSrt || !hindiSrt.trim()) throw new Error('Selected SRT file is empty.');
                }

                // Step 2: Translate Hindi → Hinglish via Gemini
                autoBtn.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-right:8px;"></i>Translating (1/2)...';
                const translatedSrt = await new Promise((resolve, reject) => {
                    window.aiTranslate.callGemini(apiKey, hindiSrt, function(err, res) {
                        if (err) reject(new Error(err));
                        else resolve(res);
                    });
                });

                // Step 3: Write Hinglish SRT to temp file and trigger existing pipeline
                autoBtn.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-right:8px;"></i>Creating captions (2/2)...';
                const os = require('os');
                const fsNode = require('fs');
                const pathNode = require('path');
                const tempPath = pathNode.join(os.tmpdir(), 'sm_auto_' + Date.now() + '.srt');
                fsNode.writeFileSync(tempPath, translatedSrt, 'utf8');

                const srtInput = document.getElementById('srtFilePath');
                if (srtInput) {
                    srtInput.value = tempPath;
                    srtInput.dispatchEvent(new Event('change'));
                }

                autoBtn.disabled = false;
                autoBtn.innerHTML = originalHtml;

                const existingBtn = document.getElementById('createCaptions_Intercept');
                if (existingBtn) {
                    existingBtn.click();
                } else {
                    const fallbackBtn = document.getElementById('createCaptions');
                    if (fallbackBtn) fallbackBtn.click();
                }

            } catch (err) {
                autoBtn.disabled = false;
                autoBtn.innerHTML = '<span style="color:#ff6b6b; font-size:10px;">Error: ' + err.message + '</span>';
                setTimeout(() => { autoBtn.innerHTML = originalHtml; }, 5000);
                console.error('[freeXan Caption] Auto Caption error:', err);
            }
        });
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            initPhrasing();
            const splitBtn = document.getElementById('splitHindiSRT');
            if (splitBtn) splitBtn.addEventListener('click', executeSplitSrt);
        });
    } else {
        initPhrasing();
        const splitBtn = document.getElementById('splitHindiSRT');
        if (splitBtn) splitBtn.addEventListener('click', executeSplitSrt);
    }
})();
