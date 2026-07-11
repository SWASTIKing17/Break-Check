/**
 * SubMachine - Clean Panel Logic (v3.2.1-Clean)
 * 
 * Why this file exists:
 * This is a completely rebuilt entry point that removes 2MB of obfuscated 
 * aescripts licensing bloat while maintaining compatibility with the 
 * existing SubMachine UI and backend.
 * 
 * Credits: Rebuilt from scratch/OLDpanel.js using panel/js/panel.js as a bypass reference.
 */

(function () {
    'use strict';

    // ==========================================
    // 1. CORE: Adobe CEP Bridge (CSInterface)
    // ==========================================
    const csInterface = new CSInterface();
    const fs = require('fs');
    const path = require('path');

    // Global license status used by ui_manager.js and other modules
    window.isValidLicense = true; 
    var v = true; // Legacy minified alias for license status

    /**
     * Entry point called by panel.html <body onload="initPanel()">
     */
    window.initPanel = function() {
        console.log('[SubMachine] Clean Initialization Starting...');
        
        // Apply the same hardcoded key check logic from the current production version
        startWithKeyCheck();
    };

    /**
     * Bypasses original aescripts obfuscation and checks for the custom local key.
     */
    function startWithKeyCheck() {
        const VALID_KEY = 'SWASTIKing17';
        const userKey = localStorage.getItem('sm_license_key');

        if (userKey === VALID_KEY) {
            console.log('[SubMachine] Activation Verified (Hardcoded Bypass)');
            bootPlugin();
        } else {
            console.log('[SubMachine] Activation Required');
            showActivationOverlay();
        }
    }

    /**
     * Final boot sequence. In the original obfuscated code, this was 'b()'.
     */
    function bootPlugin() {
        v = true;
        window.isValidLicense = true;

        // Hide activation UI if it exists
        const overlay = document.getElementById('activation-overlay');
        if (overlay) overlay.style.display = 'none';

        // Trigger the UI Manager and other refactored modules
        if (window.SubMachineUI) {
            window.SubMachineUI.init();
        }

        console.log('[SubMachine] Plugin fully booted and unlocked.');
    }

    /**
     * Creates a simple activation overlay if the key is missing.
     */
    function showActivationOverlay() {
        // Only create if it doesn't exist
        if (document.getElementById('activation-overlay')) return;

        const overlay = document.createElement('div');
        overlay.id = 'activation-overlay';
        overlay.style = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(20,20,20,0.95);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;color:white;font-family:sans-serif;";
        
        overlay.innerHTML = `
            <h2 style="color:#29BFBE">SubMachine Activation</h2>
            <p style="font-size:12px;opacity:0.7">Please enter your license key to continue</p>
            <input type="text" id="sm-key-input" placeholder="Enter Key..." style="background:#333;border:1px solid #555;color:white;padding:10px;border-radius:5px;width:200px;text-align:center;margin:10px 0;">
            <button id="sm-activate-btn" style="background:#29BFBE;border:none;color:white;padding:10px 20px;border-radius:20px;cursor:pointer;font-weight:bold;">Activate</button>
        `;

        document.body.appendChild(overlay);

        document.getElementById('sm-activate-btn').onclick = function() {
            const input = document.getElementById('sm-key-input').value;
            if (input === 'SWASTIKing17') {
                localStorage.setItem('sm_license_key', input);
                bootPlugin();
            } else {
                alert('Invalid Activation Key.');
            }
        };
    }

    // ==========================================
    // 2. HELPERS: Theme Management (Legacy Support)
    // ==========================================
    csInterface.addEventListener('com.adobe.csxs.events.ThemeColorChanged', function() {
        // The original panel.js handled theme swapping here. 
        // We now delegate this to CSS variables in panel.css.
        console.log('[SubMachine] Theme changed detected.');
    });

})();
