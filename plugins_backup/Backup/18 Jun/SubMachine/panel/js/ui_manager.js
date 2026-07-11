/**
 * freeXan Caption UI Manager
 * 
 * Why this file exists:
 * To handle the dynamic modal system, reducing HTML bloat and 
 * centralizing all user-facing strings.
 */

const freeXan CaptionUI = (function() {
    let strings = {};

    /**
     * Initializes the UI Manager by loading strings and setting up listeners.
     */
    async function init() {
        console.log('[freeXan Caption] UI Manager initializing...');
        
        try {
            // Load strings from centralized JSON
            const response = await fetch('../src/content/strings.json');
            strings = await response.json();
            
            setupEventListeners();
            console.log('[freeXan Caption] UI Manager ready.');
        } catch (err) {
            console.error('[freeXan Caption] Failed to load UI strings:', err);
        }
    }

    /**
     * Intercepts clicks on elements that should open modals.
     */
    function setupEventListeners() {
        // Many icons in the original HTML have the 'openModal' class
        // but their ID corresponds to the modal they want to open.
        // Example: <i id="selectSRTInfo" class="openModal"></i>
        // This should open "selectSRTInfoModal"
        
        document.addEventListener('click', function(e) {
            const target = e.target;
            
            if (target.classList.contains('openModal')) {
                const modalId = target.id + 'Modal';
                showModal(modalId);
            }
            
            // Handle close buttons on the generic modal
            if (target.id === 'genericModalClose' || target.classList.contains('close')) {
                hideModal();
            }
        });

        // Close modal when clicking outside content
        window.onclick = function(event) {
            const modal = document.getElementById('genericModal');
            if (event.target == modal) {
                hideModal();
            }
        };
    }

    /**
     * populates and shows the generic modal.
     * @param {string} id - The ID of the modal content to show.
     */
    function showModal(id) {
        const content = strings[id];
        const modal = document.getElementById('genericModal');
        
        if (!content || !modal) {
            console.warn('[freeXan Caption] No content found for modal ID:', id);
            // Fallback: If it's a legacy modal that still exists in HTML, it might be handled by panel.js
            return;
        }

        // Inject content
        document.getElementById('genericModalHeader').innerText = content.header || 'Information';
        document.getElementById('genericModalTitle').innerText = content.title || '';
        document.getElementById('genericModalBody').innerText = content.body || '';

        // Show the modal
        modal.style.display = 'block';
        console.log('[freeXan Caption] Showing Modal:', id);
    }

    function hideModal() {
        const modal = document.getElementById('genericModal');
        if (modal) modal.style.display = 'none';
    }

    return {
        init: init,
        showModal: showModal
    };
})();

// Boot UI Manager
if (document.readyState === 'complete') {
    freeXan CaptionUI.init();
} else {
    window.addEventListener('load', freeXan CaptionUI.init);
}
