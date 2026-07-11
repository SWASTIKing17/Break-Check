/**
 * freeXan Caption Workflow Refactor
 * 
 * Why: The legacy panel.js logic for file selection is failing. 
 * This script intercepts the SRT and Mogrt buttons to restore 
 * file selection functionality.
 */

(function() {
    const fs = require('fs');
    const path = require('path');

    function initWorkflowRefactor() {
        console.log('[freeXan Caption] Workflow Refactor initializing...');

        const buttonMap = {
            'selectSRT': { inputId: 'srtFilePath', title: 'Select SRT File', filter: ['srt'] },
            'selectMogrt': { inputId: 'mogrtFile', title: 'Select MOGRT File', filter: ['mogrt'] }
        };

        Object.keys(buttonMap).forEach(id => {
            const btn = document.getElementById(id);
            if (!btn) return;

            // We use a capture-phase listener to intercept BEFORE panel.js bubbling listeners
            btn.addEventListener('click', async function(e) {
                console.log('[freeXan Caption] Intercepting ' + id);
                // Stop other listeners (like panel.js) from firing
                e.stopImmediatePropagation();
                e.preventDefault();

                const config = buttonMap[id];
                const result = window.cep.fs.showOpenDialog(false, false, config.title, "", config.filter);
                
                if (result.err === 0 && result.data.length > 0) {
                    const filePath = result.data[0];
                    const input = document.getElementById(config.inputId);
                    if (input) {
                        input.value = filePath;
                        
                        // --- FREEXAN CAPTION ASSET ISOLATION ---
                        if (id === 'selectMogrt') {
                            try {
                                console.log('[freeXan Caption] Asset Isolation: Extracting MOGRT...');
                                // 1. Get Project Path
                                const projPathStr = await new Promise(resolve => window.__adobe_cep__.evalScript('getProjectDirectory()', resolve));
                                if (projPathStr && projPathStr !== "Invalid Path") {
                                    const fsProm = require('fs').promises;
                                    const JSZipLib = window.JSZip;
                                    
                                    // 2. Generate Tag & Asset Folder Path
                                    const tag = Date.now().toString(36);
                                    const baseName = path.basename(filePath, '.mogrt');
                                    const assetDirName = baseName.replace(/[^a-zA-Z0-9]/g, '_') + '_' + tag;
                                    const smAssetsRoot = path.join(projPathStr, 'SM_Assets');
                                    const assetFolderPath = path.join(smAssetsRoot, assetDirName);
                                    
                                    // 3. Ensure Root exists
                                    if (!fs.existsSync(smAssetsRoot)) {
                                        await fsProm.mkdir(smAssetsRoot);
                                    }
                                    
                                    // 4. Create Asset Folder
                                    await fsProm.mkdir(assetFolderPath);
                                    
                                    // 5. Unzip files
                                    const mogrtBuf = await fsProm.readFile(filePath);
                                    const zip = await JSZipLib.loadAsync(mogrtBuf);
                                    
                                    for (const relPath of Object.keys(zip.files)) {
                                        const fileEntry = zip.files[relPath];
                                        if (!fileEntry.dir) {
                                            const fileData = await fileEntry.async('nodebuffer');
                                            const outPath = path.join(assetFolderPath, relPath);
                                            // Ensure parent dir of file exists (e.g. for "project/" structure)
                                            const parentDir = path.dirname(outPath);
                                            if (!fs.existsSync(parentDir)) {
                                                await fsProm.mkdir(parentDir, { recursive: true });
                                            }
                                            await fsProm.writeFile(outPath, fileData);
                                        }
                                    }
                                    
                                    console.log('[freeXan Caption] MOGRT Extracted to:', assetFolderPath);
                                    
                                    // 6. Store Asset Path and Tag in DOM for later use
                                    let hiddenInput = document.getElementById('smAssetFolderPath');
                                    if (!hiddenInput) {
                                        hiddenInput = document.createElement('input');
                                        hiddenInput.type = 'hidden';
                                        hiddenInput.id = 'smAssetFolderPath';
                                        document.body.appendChild(hiddenInput);
                                    }
                                    hiddenInput.value = assetFolderPath;

                                    let hiddenTag = document.getElementById('smAssetTag');
                                    if (!hiddenTag) {
                                        hiddenTag = document.createElement('input');
                                        hiddenTag.type = 'hidden';
                                        hiddenTag.id = 'smAssetTag';
                                        document.body.appendChild(hiddenTag);
                                    }
                                    hiddenTag.value = tag;
                                }
                            } catch (err) {
                                console.error('[freeXan Caption] Asset Isolation Failed:', err);
                            }
                        }

                        input.dispatchEvent(new Event('change'));
                        console.log('[freeXan Caption] File Selected (Refactored):', filePath);
                    }
                }
            }, true); // TRUE = Capture phase (runs before legacy listeners)
        });

        // Slider Fix (ensure value matches UI)
        const slider = document.getElementById('range-slider__range');
        const sliderValue = document.getElementById('range-slider__value');
        if (slider && sliderValue) {
            const updateSliderDisplay = (val) => {
                let aspectRatio = " (16x9)";
                if (val <= 25) aspectRatio = " (9x16)";
                else if (val <= 50) aspectRatio = " (1x1)";
                sliderValue.innerHTML = val + aspectRatio;
            };
            
            slider.addEventListener('input', function() {
                updateSliderDisplay(this.value);
            });
            
            // Initial sync
            updateSliderDisplay(slider.value);
        }

        console.log('[freeXan Caption] Workflow Refactor ready.');
    }

    if (document.readyState === 'complete') {
        initWorkflowRefactor();
    } else {
        window.addEventListener('load', initWorkflowRefactor);
    }
})();
