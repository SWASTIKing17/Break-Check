/**
 * Premiere Pro Simulator - freeXan Caption Debugger
 * Version: 1.0.0
 * Purpose: Allows testing the plugin in standalone browsers (Chrome/Firefox) 
 * by mocking the Adobe ExtendScript environment.
 * 
 * STRICT ISOLATION: This script self-destructs if it detects a real Adobe environment.
 */

(function() {
    // 1. ENVIRONMENT DETECTION
    const isAdobe = (typeof CSInterface !== "undefined") || (window.__adobe_cep__);
    const isBrowser = (window.location.protocol === 'http:' || window.location.protocol === 'https:' || window.location.hostname === 'localhost');

    if (isAdobe) {
        console.log("Debugger: Adobe environment detected. Self-destructing to ensure production safety.");
        return; // Silent exit
    }

    if (!isBrowser) {
        console.warn("Debugger: Standalone environment expected but protocol is unknown. Proceeding with caution.");
    }

    console.log("%c[freeXan Caption Debugger] Activating Premiere Pro Simulator...", "color: #3399ff; font-weight: bold;");

    // 2. STATE MANAGEMENT
    const state = {
        calls: [],
        activeCallIdx: -1,
        isMinimized: false
    };

    // 3. MOCK CSINTERFACE
    window.CSInterface = function() {
        this.evalScript = function(script, callback) {
            logCall(script, callback);
        };
    };

    // 4. UI CONSTRUCTION
    const createUI = () => {
        const root = document.createElement('div');
        root.id = 'pp-simulator-root';
        root.innerHTML = `
            <div class="pp-sim-header" id="pp-sim-header">
                <div class="pp-sim-title">Premiere Pro Simulator <span class="pp-sim-badge">V1.0</span></div>
                <div id="pp-sim-toggle" style="cursor: pointer;">—</div>
            </div>
            <div class="pp-sim-body" id="pp-sim-logs">
                <div style="color: #666; font-style: italic; text-align: center; margin-top: 20px;">
                    Waiting for API calls from the panel...
                </div>
            </div>
            <div class="pp-sim-response-zone">
                <div class="pp-sim-presets">
                    <span class="pp-sim-preset" data-val='{"status": "success"}'>Success JSON</span>
                    <span class="pp-sim-preset" data-val='1'>True</span>
                    <span class="pp-sim-preset" data-val='0'>False</span>
                    <span class="pp-sim-preset" data-val='[]'>Empty Array</span>
                </div>
                <textarea id="pp-sim-response-input" placeholder='Paste JSON or String response here...'></textarea>
                <div class="pp-sim-actions">
                    <button class="pp-sim-btn pp-sim-btn-secondary" id="pp-sim-clear">Clear Logs</button>
                    <button class="pp-sim-btn pp-sim-btn-primary" id="pp-sim-send">Send to Panel</button>
                </div>
            </div>
        `;
        document.body.appendChild(root);

        // UI Event Listeners
        document.getElementById('pp-sim-header').onclick = () => {
            state.isMinimized = !state.isMinimized;
            root.classList.toggle('minimized', state.isMinimized);
            document.getElementById('pp-sim-toggle').innerText = state.isMinimized ? '□' : '—';
        };

        document.getElementById('pp-sim-send').onclick = sendResponse;
        document.getElementById('pp-sim-clear').onclick = clearLogs;

        // Preset Listeners
        root.querySelectorAll('.pp-sim-preset').forEach(preset => {
            preset.onclick = (e) => {
                document.getElementById('pp-sim-response-input').value = e.target.getAttribute('data-val');
            };
        });
    };

    const logCall = (script, callback) => {
        const call = {
            id: Date.now(),
            script: script,
            callback: callback,
            timestamp: new Date().toLocaleTimeString()
        };
        state.calls.push(call);
        state.activeCallIdx = state.calls.length - 1;
        renderLogs();
        
        // Highlight response area
        const input = document.getElementById('pp-sim-response-input');
        input.focus();
        input.classList.add('glow');
        setTimeout(() => input.classList.remove('glow'), 1000);
    };

    const renderLogs = () => {
        const container = document.getElementById('pp-sim-logs');
        if (!container) return;

        if (state.calls.length === 0) {
            container.innerHTML = `<div style="color: #666; font-style: italic; text-align: center; margin-top: 20px;">Waiting for API calls...</div>`;
            return;
        }

        container.innerHTML = state.calls.map((call, idx) => `
            <div class="pp-sim-log-item ${idx === state.activeCallIdx ? 'active' : ''}" onclick="window.ppSimulator.selectCall(${idx})">
                <div class="pp-sim-script-meta">
                    <span>CALL #${idx + 1}</span>
                    <span>${call.timestamp}</span>
                </div>
                <div class="pp-sim-script-content">${escapeHtml(call.script)}</div>
            </div>
        `).join('');
        
        container.scrollTop = container.scrollHeight;
    };

    const sendResponse = () => {
        if (state.activeCallIdx === -1) {
            alert("No active API call to respond to.");
            return;
        }

        const response = document.getElementById('pp-sim-response-input').value;
        const call = state.calls[state.activeCallIdx];

        console.log(`%c[Debugger] Sending response to CALL #${state.activeCallIdx + 1}`, "color: #33ff99;");
        console.log("Response:", response);

        if (typeof call.callback === 'function') {
            call.callback(response);
        }

        // Clean up
        state.calls.splice(state.activeCallIdx, 1);
        state.activeCallIdx = state.calls.length - 1;
        document.getElementById('pp-sim-response-input').value = '';
        renderLogs();
    };

    const clearLogs = () => {
        state.calls = [];
        state.activeCallIdx = -1;
        renderLogs();
    };

    const escapeHtml = (text) => {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    };

    // Global hook for selection
    window.ppSimulator = {
        selectCall: (idx) => {
            state.activeCallIdx = idx;
            renderLogs();
        }
    };

    // Initialize
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', createUI);
    } else {
        createUI();
    }

})();
