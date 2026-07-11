const fs = require('fs');
const path = require('path');

const audioJsPath = path.join(__dirname, 'cep-extension', 'audio.js');
let code = fs.readFileSync(audioJsPath, 'utf8');

// 1. App State
code = code.replace(
  'var audioElement = null;',
  'var wavesurfer = null;\nvar wsRegions = null;\nvar tonePitchShift = null;'
);

// 2. drawLargeWaveform
// We just empty it out since Wavesurfer handles it
code = code.replace(
  /function drawLargeWaveform\(\) \{[\s\S]*?\}/,
  'function drawLargeWaveform() { /* handled by wavesurfer */ }'
);

// 3. selectAudio
const selectAudioReplacement = `function selectAudio(audio) {
    selectedAudio = audio;
    isPlaying = false;
    trimStart = 0;
    trimEnd = 0;

    var cleanPath = 'file:///' + audio.file_path.replace(/\\\\/g, '/');

    if (wavesurfer) {
        wavesurfer.destroy();
        wavesurfer = null;
    }
    if (tonePitchShift) {
        tonePitchShift.dispose();
        tonePitchShift = null;
    }

    var type = classifyAudio(audio);
    var nameEl = document.getElementById('drawer-name');
    var badgeEl = document.getElementById('drawer-type-badge');
    if (nameEl) nameEl.textContent = stripExtension(audio.name);
    if (badgeEl) { badgeEl.textContent = type.toUpperCase(); badgeEl.className = 'drawer-type-badge ' + type; }
    setPlayButtonState(false);
    openDrawer();
    renderGrid();
    renderFolderTree();

    var hs = document.getElementById('handle-start');
    var he = document.getElementById('handle-end');
    if (hs) hs.style.display = 'none';
    if (he) he.style.display = 'none';
    
    // Clear old waveform canvas
    var wc = document.getElementById('waveform-canvas');
    if (wc) wc.style.display = 'none';

    var media = new Audio(cleanPath);

    wavesurfer = WaveSurfer.create({
        container: '#waveform-container',
        waveColor: type === 'bgm' ? '#F7567C' : '#00E5FF',
        progressColor: type === 'bgm' ? '#8E2DE2' : '#00C896',
        cursorColor: '#FFFFFF',
        barWidth: 2,
        barGap: 1,
        barRadius: 2,
        height: '100%',
        media: media
    });

    wsRegions = wavesurfer.registerPlugin(WaveSurfer.Regions.create());

    var toneCtx = Tone.getContext().rawContext;
    var source = toneCtx.createMediaElementSource(media);
    tonePitchShift = new Tone.PitchShift({ pitch: 0 }).toDestination();
    source.connect(tonePitchShift);

    wavesurfer.on('ready', function() {
        var dur = wavesurfer.getDuration();
        trimStart = 0;
        trimEnd = dur;
        updateTimecodeLabels();

        wsRegions.addRegion({
            start: trimStart,
            end: trimEnd,
            color: 'rgba(255, 255, 255, 0.1)',
            drag: false,
            resize: true
        });

        if (!audio.duration && ws && ws.readyState === WebSocket.OPEN) {
            try { ws.send(JSON.stringify({ type: 'update_duration', filePath: audio.file_path, duration: dur })); } catch(e) {}
        }
        
        var pitchVal = parseInt(document.getElementById('slider-pitch').value) || 0;
        tonePitchShift.pitch = pitchVal;
        
        var speedVal = parseFloat(document.getElementById('slider-speed').value) / 100;
        wavesurfer.setPlaybackRate(speedVal);
    });

    wsRegions.on('region-updated', function(region) {
        trimStart = region.start;
        trimEnd = region.end;
        updateTimecodeLabels();
    });

    wavesurfer.on('audioprocess', function(currentTime) {
        var ph = document.getElementById('waveform-playhead');
        if (ph) ph.style.display = 'none'; // hidden, wavesurfer does it

        if (currentTime >= trimEnd) {
            pauseAudio();
            wavesurfer.setTime(trimStart);
        }
    });

    wavesurfer.on('finish', function() { pauseAudio(); });
}`;
code = code.replace(/function selectAudio\(audio\) \{[\s\S]*?\/\* ── Playback ───────────────────────────────────────────────── \*\//, selectAudioReplacement + '\n\n/* ── Playback ───────────────────────────────────────────────── */');

// 4. Playback
code = code.replace(
  /function playAudio\(\) \{[\s\S]*?\}\n/,
  `function playAudio() {
    if (!wavesurfer) return;
    if (wavesurfer.getCurrentTime() >= trimEnd || wavesurfer.getCurrentTime() < trimStart) {
        wavesurfer.setTime(trimStart);
    }
    
    // Ensure Web Audio context is started (required by browsers)
    if (Tone.context.state !== 'running') { Tone.context.resume(); }
    
    wavesurfer.play().catch(function(e) { extLog('playback error: ' + e); });
    isPlaying = true;
    setPlayButtonState(true);
    if (syncTimeline) startSyncPlay();
}\n`
);

code = code.replace(
  /function pauseAudio\(\) \{[\s\S]*?\}\n/,
  `function pauseAudio() {
    if (!wavesurfer) return;
    wavesurfer.pause();
    isPlaying = false;
    setPlayButtonState(false);
    if (syncTimeline) stopSyncPlay();
}\n`
);

// 5. Trim Handles - disable positionTrimHandles and initTrimHandles logic since Wavesurfer does it
code = code.replace(
  /function positionTrimHandles\(\) \{[\s\S]*?\}/,
  'function positionTrimHandles() { /* handled by wavesurfer */ }'
);
code = code.replace(
  /function initTrimHandles\(\) \{[\s\S]*?\}/,
  'function initTrimHandles() { /* handled by wavesurfer */ }'
);

// 6. Init UI Sliders (speed and pitch)
code = code.replace(
  'if (audioElement) audioElement.playbackRate = v;',
  'if (wavesurfer) wavesurfer.setPlaybackRate(v);'
);
code = code.replace(
  'if (audioElement) audioElement.playbackRate = 1.0;',
  'if (wavesurfer) wavesurfer.setPlaybackRate(1.0);'
);
code = code.replace(
  `valPitch.textContent = this.value + ' st';`,
  `valPitch.textContent = this.value + ' st';\n            if (tonePitchShift) tonePitchShift.pitch = parseInt(this.value);`
);
code = code.replace(
  `if (v) v.textContent = '0 st';`,
  `if (v) v.textContent = '0 st';\n            if (tonePitchShift) tonePitchShift.pitch = 0;`
);

// 7. Update handleImport duration grab
code = code.replace(
  `var dur = audioElement ? audioElement.duration : (selectedAudio.duration || 0);`,
  `var dur = wavesurfer ? wavesurfer.getDuration() : (selectedAudio.duration || 0);`
);

fs.writeFileSync(audioJsPath, code, 'utf8');
console.log('Modified audio.js successfully!');
