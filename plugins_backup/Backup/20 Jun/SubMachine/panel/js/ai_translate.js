(function () {
    'use strict';

    var GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent';

    var SYSTEM_PROMPT = [
        'You are a Hindi to Hinglish subtitle converter.',
        '',
        'TASK: Transliterate each Hindi SRT block from Devanagari script to Hinglish (Roman/Latin script).',
        'This is TRANSLITERATION only — do NOT translate meaning or substitute Hindi words with English words.',
        '',
        'RULES:',
        '1. Convert Devanagari to Roman letters using standard Hinglish phonetics.',
        '2. Capitalise ONLY the first letter of each block. All other letters lowercase (except abbreviations: BJP, PM, OBC etc.).',
        '3. Replace Devanagari full stop (।) with Latin full stop (.). Keep commas, ?, ! as-is.',
        '4. Copy timestamps EXACTLY — do not change them at all.',
        '5. Renumber blocks sequentially starting from 1.',
        '6. Remove ALL remaining Devanagari characters from output.',
        '7. No citation markers, no code fences, no extra blank lines within a block.',
        '',
        'PHONETICS:',
        'अ→a  आ→aa  इ→i  ई→ee  उ→u  ऊ→oo  ए→e  ऐ→ai  ओ→o  औ→au/aw',
        'क→k  ख→kh  ग→g  घ→gh  च→ch  छ→chh  ज→j  झ→jh',
        'ट→t  ठ→th  ड→d  ढ→dh  त→t  थ→th  द→d  ध→dh',
        'न→n  प→p  फ→ph/f  ब→b  भ→bh  म→m  य→y  र→r  ल→l',
        'व→v/w  श/ष→sh  स→s  ह→h  ड़→r  ढ़→rh',
        'Halant(्) = no vowel: क्या→kya (not kaya)',
        'anusvara(ं) → n or m depending on next consonant',
        '',
        'WRONG → CORRECT:',
        'HAi→Hai   HOoN→Hoon   AaPKEe→Aapke   JISKA→Jiska   HAiN→Hain',
        '',
        'OUTPUT: Raw SRT text ONLY. No explanations, no code blocks, no filename.'
    ].join('\n');

    var _inputPath = null;
    var _isRunning = false;

    function el(id) { return document.getElementById(id); }

    function setStatus(msg, isError) {
        var s = el('ai-status');
        if (!s) return;
        s.textContent = msg;
        s.style.color = isError ? '#ff6b6b' : '#29BFBE';
    }

    function setProgress(pct) {
        var bar = el('ai-progress-bar');
        if (!bar) return;
        bar.style.width = pct + '%';
        bar.textContent = pct + '%';
        bar.setAttribute('aria-valuenow', pct);
    }

    function setRunning(running) {
        _isRunning = running;
        var btn = el('ai-translate-btn');
        if (!btn) return;
        btn.disabled = running;
        btn.innerHTML = running
            ? '<i class="fas fa-spinner fa-spin" style="margin-right:8px;"></i>Translating...'
            : '<i class="fas fa-magic" style="margin-right:8px;"></i>Translate to Hinglish';
    }

    function selectFile() {
        if (!window.cep) {
            // Browser debug fallback
            _inputPath = 'C:/debug/test.srt';
            el('ai-srt-path').value = _inputPath;
            setStatus('Debug: file set.');
            el('ai-translate-btn').disabled = false;
            return;
        }
        var result = window.cep.fs.showOpenDialog(false, false, 'Select Hindi SRT', '', ['srt']);
        if (result.err === 0 && result.data && result.data.length > 0) {
            _inputPath = result.data[0];
            el('ai-srt-path').value = _inputPath;
            el('ai-translate-btn').disabled = false;
            setStatus('File selected. Ready to translate.');
        }
    }

    function translate() {
        if (_isRunning) return;

        var keyInput = el('ai-api-key');
        var apiKey = (keyInput ? keyInput.value.trim() : '') || localStorage.getItem('sm_gemini_key') || '';

        if (!apiKey) {
            setStatus('Enter your Gemini API key first.', true);
            showKeySection(true);
            return;
        }
        localStorage.setItem('sm_gemini_key', apiKey);

        if (!_inputPath) {
            setStatus('Select a Hindi SRT file first.', true);
            return;
        }

        var fs;
        try { fs = require('fs'); } catch (e) {
            setStatus('Node.js unavailable — run inside Premiere Pro.', true);
            return;
        }

        var srtContent;
        try {
            srtContent = fs.readFileSync(_inputPath, 'utf8');
        } catch (e) {
            setStatus('Cannot read file: ' + e.message, true);
            return;
        }

        if (!srtContent || !srtContent.trim()) {
            setStatus('SRT file is empty.', true);
            return;
        }

        // Hide previous output
        var outSection = el('ai-output-section');
        if (outSection) outSection.style.display = 'none';

        setRunning(true);
        setProgress(15);
        setStatus('Sending to Gemini...');

        callGemini(apiKey, srtContent, function (err, translated) {
            if (err) {
                setRunning(false);
                setProgress(0);
                setStatus('Error: ' + err, true);
                return;
            }

            setProgress(85);
            setStatus('Saving output...');

            var outputPath = _inputPath.replace(/\.srt$/i, '_Hinglish.srt');
            try {
                fs.writeFileSync(outputPath, translated, 'utf8');
            } catch (e) {
                setRunning(false);
                setProgress(0);
                setStatus('Cannot save file: ' + e.message, true);
                return;
            }

            setProgress(100);
            setRunning(false);

            var filename = outputPath.split(/[\\/]/).pop();
            setStatus('✓ Done! Saved: ' + filename);

            // Show output section
            if (outSection) outSection.style.display = 'block';
            var outPathEl = el('ai-output-path');
            if (outPathEl) outPathEl.value = outputPath;

            // Auto-populate Workflow tab SRT field so user can click Create Subs immediately
            var workflowInput = el('srtFilePath');
            if (workflowInput) {
                workflowInput.value = outputPath;
                workflowInput.dispatchEvent(new Event('change'));
            }
        });
    }

    function callGemini(apiKey, srtContent, callback) {
        var body = JSON.stringify({
            systemInstruction: {
                parts: [{ text: SYSTEM_PROMPT }]
            },
            contents: [{
                role: 'user',
                parts: [{ text: 'Convert this Hindi SRT to Hinglish:\n\n' + srtContent }]
            }],
            generationConfig: {
                temperature: 0.1,
                maxOutputTokens: 8192
            }
        });

        var xhr = new XMLHttpRequest();
        xhr.open('POST', GEMINI_URL, true);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.setRequestHeader('X-goog-api-key', apiKey);

        xhr.onload = function () {
            if (xhr.status !== 200) {
                var msg = 'HTTP ' + xhr.status;
                try {
                    var errData = JSON.parse(xhr.responseText);
                    if (errData.error && errData.error.message) msg = errData.error.message;
                } catch (e) {}
                callback(msg, null);
                return;
            }

            var data;
            try { data = JSON.parse(xhr.responseText); } catch (e) {
                callback('Invalid JSON from API', null);
                return;
            }

            var text = '';
            try {
                text = data.candidates[0].content.parts[0].text;
            } catch (e) {
                callback('Unexpected API response structure', null);
                return;
            }

            // Strip code fences the model may add despite instructions
            text = text.replace(/^```[^\n]*\n?/, '').replace(/\n?```\s*$/, '').trim();

            if (!text) { callback('Empty response from Gemini', null); return; }

            callback(null, text);
        };

        xhr.onerror = function () {
            callback('Network error — check internet connection', null);
        };

        xhr.send(body);
    }

    function showKeySection(show) {
        var s = el('ai-key-section');
        if (s) s.style.display = show ? 'block' : 'none';
    }

    function saveKey() {
        var keyInput = el('ai-api-key');
        if (!keyInput) return;
        var key = keyInput.value.trim();
        if (!key) { setStatus('Enter a valid API key.', true); return; }
        localStorage.setItem('sm_gemini_key', key);
        showKeySection(false);
        setStatus('API key saved.');
    }

    function init() {
        var savedKey = localStorage.getItem('sm_gemini_key') || '';
        var keyInput = el('ai-api-key');
        if (keyInput && savedKey) keyInput.value = savedKey;
        showKeySection(!savedKey);

        var translateBtn = el('ai-translate-btn');
        if (translateBtn) translateBtn.disabled = true;

        var selectBtn = el('ai-select-btn');
        if (selectBtn) selectBtn.addEventListener('click', selectFile);

        if (translateBtn) translateBtn.addEventListener('click', translate);

        var saveKeyBtn = el('ai-save-key-btn');
        if (saveKeyBtn) saveKeyBtn.addEventListener('click', saveKey);

        var settingsBtn = el('ai-settings-btn');
        if (settingsBtn) {
            settingsBtn.addEventListener('click', function () {
                var s = el('ai-key-section');
                if (s) s.style.display = (s.style.display === 'none' || s.style.display === '') ? 'block' : 'none';
            });
        }

        var workflowBtn = el('ai-goto-workflow-btn');
        if (workflowBtn) {
            workflowBtn.addEventListener('click', function () {
                var tab = el('tab-1');
                if (tab) tab.click();
            });
        }

        // Drag-drop on the path input
        var pathInput = el('ai-srt-path');
        if (pathInput) {
            pathInput.addEventListener('dragenter', function (e) { e.stopPropagation(); e.preventDefault(); });
            pathInput.addEventListener('dragover', function (e) { e.stopPropagation(); e.preventDefault(); });
            pathInput.addEventListener('drop', function (e) {
                e.stopPropagation();
                e.preventDefault();
                var f = e.dataTransfer.files[0];
                if (f && f.name.toLowerCase().endsWith('.srt')) {
                    var fp = f.path || f.name;
                    _inputPath = fp;
                    pathInput.value = fp;
                    setStatus('File selected. Ready to translate.');
                    if (translateBtn) translateBtn.disabled = false;
                }
            });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

}());
