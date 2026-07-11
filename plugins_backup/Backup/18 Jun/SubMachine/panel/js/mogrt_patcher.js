/**
 * freeXan Caption MOGRT Patcher
 *
 * Reads a source .mogrt (ZIP), patches definition.json with new values, writes a new .mogrt.
 * Two parallel representations inside definition.json must both be updated:
 *   1. clientControls[].value          — the Premiere-facing value
 *   2. sourceInfoLocalized.en_US.appspecificsourceinfo (stringified JSON inside JSON)
 *      → capsuleparams.capParams[].capPropDefault — the AE-side default
 *
 * The two share the same UUID matchName; we reconcile via displayName lookup.
 */
(function (global) {
    const fs = require('fs').promises;
    const path = require('path');
    const JSZipLib = global.JSZip;
    if (!JSZipLib) {
        console.error('[MogrtPatcher] JSZip not loaded — patcher unavailable.');
        return;
    }

    // clientControls.type ↔ capPropType
    const CTRL = { CHECKBOX: 1, SLIDER: 2, ANGLE: 3, COLOR: 4, POINT_2D: 5, TEXT: 6, NOTE: 8, SCALE_2D: 9, GROUP: 10 };
    const CAP  = { TEXT: 0, SLIDER: 1, CHECKBOX: 2, COLOR: 3, NOTE: 4, ANGLE: 5, POINT_2D: 6, SCALE_2D: 7, GROUP: 8 };

    const getCtrlName = (ctrl) => ctrl && ctrl.uiName && ctrl.uiName.strDB && ctrl.uiName.strDB[0] && ctrl.uiName.strDB[0].str;

    // Returns scalar from any of: array (first elem), scalar (as-is), null/undefined (null).
    const firstOf = (v) => {
        if (Array.isArray(v)) return v.length ? v[0] : null;
        if (v === undefined || v === null) return null;
        return v;
    };
    const asArrayWrap = (v) => {
        if (Array.isArray(v)) return v;
        if (v === undefined || v === null) return null;
        return [v];
    };

    function encodeClientControlValue(type, value) {
        switch (type) {
            case CTRL.CHECKBOX: return !!value;
            case CTRL.SLIDER:
            case CTRL.ANGLE:   return Number(value);
            case CTRL.COLOR:   return Array.isArray(value) ? value.slice(0, 4) : value;
            case CTRL.POINT_2D:
                if (Array.isArray(value)) return { x: value[0], y: value[1] };
                return value;
            case CTRL.TEXT:    return { strDB: [{ localeString: 'en_US', str: String(value) }] };
            case CTRL.SCALE_2D:
                if (Array.isArray(value)) {
                    const arr = value.slice(0, 4);
                    while (arr.length < 4) arr.push(0);
                    return arr;
                }
                return value;
            default: return value;
        }
    }

    function encodeCapValue(capType, value) {
        switch (capType) {
            case CAP.TEXT:     return String(value);
            case CAP.SLIDER:
            case CAP.ANGLE:    return Number(value);
            case CAP.CHECKBOX: return !!value;
            case CAP.COLOR:    return Array.isArray(value) ? value.slice(0, 4) : value;
            case CAP.POINT_2D:
                if (Array.isArray(value)) return value.slice(0, 2);
                if (value && typeof value === 'object' && 'x' in value) return [value.x, value.y];
                return value;
            case CAP.SCALE_2D:
                if (Array.isArray(value)) {
                    const arr = value.slice(0, 4);
                    while (arr.length < 4) arr.push(0);
                    return arr;
                }
                return value;
            default: return value;
        }
    }

    function applyTextFontToCap(cap, font) {
        if (!font) return;
        const fields = ['fontEditValue', 'fontSizeEditValue', 'fontFSBoldValue', 'fontFSItalicValue', 'fontFSAllCapsValue', 'fontFSSmallCapsValue'];
        for (let i = 0; i < fields.length; i++) {
            const wrapped = asArrayWrap(font[fields[i]]);
            if (wrapped) cap[fields[i]] = wrapped;
        }
    }

    function applyTextFontToCtrl(ctrl, font) {
        if (!font) return;
        if (!ctrl.fonteditinfo) ctrl.fonteditinfo = {};
        const fields = ['fontEditValue', 'fontSizeEditValue', 'fontFSBoldValue', 'fontFSItalicValue', 'fontFSAllCapsValue', 'fontFSSmallCapsValue'];
        for (let i = 0; i < fields.length; i++) {
            const scalar = firstOf(font[fields[i]]);
            if (scalar !== null) ctrl.fonteditinfo[fields[i]] = scalar;
        }
    }

    async function patchMogrt(opts) {
        const { sourcePath, destPath } = opts;
        const values = opts.values || [];
        if (!sourcePath) throw new Error('Source path is missing.');
        if (!destPath) throw new Error('Destination path is missing.');

        const valuesByName = {};
        for (let i = 0; i < values.length; i++) {
            const v = values[i];
            if (v && v.displayName) valuesByName[v.displayName] = v;
        }

        let def = null;
        let sourceZip = null;
        let defPathInZip = 'definition.json';

        // 1. Try Metadata & Asset Isolation (Prioritize passed-in values from dump)
        let assetFolderPath = opts.smAssetFolder || null;
        let assetTag = opts.smAssetTag || null;
        let projDir = null;
        
        if (opts.smDef) {
            try { def = JSON.parse(opts.smDef); } catch (e) { console.warn('[MogrtPatcher] Failed to parse smDef from dump'); }
        }

        // Fallback to manual XMP read if dump didn't provide them
        if (!assetFolderPath || !assetTag || !def) {
            try {
                if (!def) {
                    const xmpResultStr = await window.__adobe_cep__.evalScript('readClipMetadata({field: "freeXan Caption_Definition"})');
                    const xmpResult = JSON.parse(xmpResultStr);
                    if (xmpResult && xmpResult.status === 'Success' && xmpResult.value) {
                        def = JSON.parse(xmpResult.value);
                    }
                }

                if (!assetFolderPath) {
                    const xmpAssetStr = await window.__adobe_cep__.evalScript('readClipMetadata({field: "freeXan Caption_Asset_Folder"})');
                    const xmpAsset = JSON.parse(xmpAssetStr);
                    if (xmpAsset && xmpAsset.status === 'Success' && xmpAsset.value) {
                        assetFolderPath = xmpAsset.value;
                    }
                }

                if (!assetTag) {
                    const xmpTagStr = await window.__adobe_cep__.evalScript('readClipMetadata({field: "freeXan Caption_Asset_Tag"})');
                    const xmpTag = JSON.parse(xmpTagStr);
                    if (xmpTag && xmpTag.status === 'Success' && xmpTag.value) {
                        assetTag = xmpTag.value;
                    }
                }
            } catch (e) {
                console.warn('[MogrtPatcher] Secondary XMP retrieval failed: ' + e.message);
            }
        }

        try {
            projDir = await new Promise(resolve => window.__adobe_cep__.evalScript('getProjectDirectory()', resolve));
        } catch (e) { /* ignore */ }

        // --- RELATIVE SEARCH (PRIORITY) ---
        // If we have a Tag and a Project Dir, try to find the folder relatively
        if (assetTag && projDir && projDir !== "Invalid Path") {
            const smAssetsRoot = path.join(projDir, 'SM_Assets');
            const fsSync = require('fs');
            if (fsSync.existsSync(smAssetsRoot)) {
                const folders = await fs.readdir(smAssetsRoot);
                const matchingFolder = folders.find(f => f.endsWith('_' + assetTag));
                if (matchingFolder) {
                    const relativeFolderPath = path.join(smAssetsRoot, matchingFolder);
                    console.log('[MogrtPatcher] Found Asset Folder via Tag search:', relativeFolderPath);
                    assetFolderPath = relativeFolderPath;
                }
            }
        }

        // 2. Load the source files
        if (assetFolderPath) {
            console.log('[MogrtPatcher] Scenario: Isolated Asset Folder');
            const fsSync = require('fs');
            if (fsSync.existsSync(assetFolderPath)) {
                if (!def) {
                    const defJsonPath = path.join(assetFolderPath, 'definition.json');
                    try {
                        const defStr = await fs.readFile(defJsonPath, 'utf8');
                        def = JSON.parse(defStr);
                    } catch (e) {
                        console.warn('Could not read definition.json in Asset Folder, will try other sources.');
                    }
                }

                // --- UPDATE DEFINITION ON DISK (User Request) ---
                if (def) {
                    // Update the values in the definition object
                    if (def.parameters) {
                        def.parameters.forEach(param => {
                            if (valuesByName[param.displayName]) {
                                param.value = valuesByName[param.displayName].value;
                            }
                        });
                    }
                    // Write back to disk
                    const defJsonPath = path.join(assetFolderPath, 'definition.json');
                    try {
                        await fs.writeFile(defJsonPath, JSON.stringify(def, null, 2));
                        console.log('[MogrtPatcher] Updated definition.json on disk in Asset Folder.');
                    } catch (e) {
                        console.warn('[MogrtPatcher] Failed to write updated definition to disk:', e.message);
                    }
                }

                sourceZip = new JSZipLib();
                
                // Helper to recursively add folder contents to ZIP
                async function addFilesToZip(dir, zipRoot, basePath = '') {
                    const items = await fs.readdir(dir, { withFileTypes: true });
                    for (const item of items) {
                        const fullPath = path.join(dir, item.name);
                        const relPath = path.join(basePath, item.name).replace(/\\/g, '/');
                        if (item.isDirectory()) {
                            await addFilesToZip(fullPath, zipRoot, relPath);
                        } else {
                            const fileData = await fs.readFile(fullPath);
                            zipRoot.file(relPath, fileData);
                        }
                    }
                }
                
                await addFilesToZip(assetFolderPath, sourceZip);
            } else {
                console.warn('[MogrtPatcher] Asset folder not found on disk, falling back to legacy paths.');
                assetFolderPath = null; // trigger fallback
            }
        }
        
        if (!assetFolderPath && sourcePath.toLowerCase().endsWith('.aegraphic')) {
            console.log('[MogrtPatcher] Scenario: Component Folder (.aegraphic)');
            const bundleRoot = path.dirname(sourcePath);
            
            if (!def) {
                const defJsonPath = path.join(bundleRoot, 'definition.json');
                try {
                    const defStr = await fs.readFile(defJsonPath, 'utf8');
                    def = JSON.parse(defStr);
                } catch (e) {
                    throw new Error('Could not find definition.json in XMP or next to .aegraphic: ' + defJsonPath);
                }
            }

            // Construct new ZIP from loose files
            sourceZip = new JSZipLib();
            sourceZip.file('project.aegraphic', await fs.readFile(sourcePath));
            
            // Add siblings (thumbs)
            const siblings = ['thumb.png', 'thumb.mp4'];
            for (const s of siblings) {
                const sPath = path.join(bundleRoot, s);
                try {
                    const sBuf = await fs.readFile(sPath);
                    sourceZip.file(s, sBuf);
                } catch (e) { /* ignore missing thumbs */ }
            }
        } else {
            console.log('[MogrtPatcher] Scenario: Single File (.mogrt)');
            const buf = await fs.readFile(sourcePath);
            sourceZip = await JSZipLib.loadAsync(buf);

            if (!def) {
                let defFile = sourceZip.file('definition.json');
                if (!defFile) {
                    const match = Object.keys(sourceZip.files).find(p => /(^|\/)definition\.json$/i.test(p));
                    if (match) {
                        defFile = sourceZip.file(match);
                        defPathInZip = match;
                    }
                }
                if (!defFile) throw new Error('definition.json not found in ZIP or XMP.');
                def = JSON.parse(await defFile.async('string'));
            }
        }

        // 3. Patch the JSON
        let patched = 0;
        const skipped = [];
        const ctrls = def.clientControls || [];
        for (let i = 0; i < ctrls.length; i++) {
            const ctrl = ctrls[i];
            const name = getCtrlName(ctrl);
            if (!name) continue;
            const v = valuesByName[name];
            if (!v) continue;
            try {
                ctrl.value = encodeClientControlValue(ctrl.type, v.value);
                if (ctrl.type === CTRL.TEXT && v.font) applyTextFontToCtrl(ctrl, v.font);
                patched++;
            } catch (e) {
                skipped.push(name + ' (clientControl encode failed: ' + e.message + ')');
            }
        }

        const en = def.sourceInfoLocalized && def.sourceInfoLocalized.en_US;
        if (en && en.appspecificsourceinfo) {
            let appInfo;
            try { appInfo = JSON.parse(en.appspecificsourceinfo); }
            catch (e) { throw new Error('Could not parse appspecificsourceinfo: ' + e.message); }

            const caps = (appInfo.capsuleparams && appInfo.capsuleparams.capParams) || [];
            for (let i = 0; i < caps.length; i++) {
                const cap = caps[i];
                const name = cap.capPropUIName;
                if (!name) continue;
                const v = valuesByName[name];
                if (!v) continue;
                try {
                    cap.capPropDefault = encodeCapValue(cap.capPropType, v.value);
                    if (cap.capPropType === CAP.TEXT && v.kind === 'text') {
                        const s = String(v.value);
                        cap.textEditValue = s;
                        cap.fontTextRunLength = [s.length];
                        applyTextFontToCap(cap, v.font);
                    }
                } catch (e) {
                    skipped.push(name + ' (capParam encode failed: ' + e.message + ')');
                }
            }
            en.appspecificsourceinfo = JSON.stringify(appInfo);
        }

        // 4. Assemble Final ZIP
        sourceZip.file(defPathInZip, JSON.stringify(def));
        const out = await sourceZip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
        await fs.writeFile(destPath, out);

        return { patched, skipped };
    }

    global.freeXanCaptionMogrtPatcher = { patchMogrt };
}(window));
