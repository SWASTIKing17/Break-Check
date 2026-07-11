// ── Global State ─────────────────────────────────────────────────────────────

let configState = {
  targetDir: '',
  templateFile: '',
  folderStructure: [],
  autoPopup: true,
  defaultBins: [],
  defaultSequences: [],
  seqResolution: '1920x1080',
  seqFps: '25'
};

// Builder tab — in-memory caches (populated by loadBuilderDropdowns)
let dbFunnels = [];
let dbTasks   = [];

// Folder Template tree state (old settings-based editor — guards prevent crashes)
let ftTemplates  = [];
let ftActiveId   = null;
let ftTree       = [];

// Builder tab — resolved template preview
let builderResolvedId  = null;
let builderTreeNodes   = [];
let defaultBuilderNodes = []; // Default template nodes, pre-loaded on startup

// Folder Structure Templates — Database tab
let ftsTemplates  = [];
let ftsActiveId   = null;
let ftsTree       = [];
let ftsPremiere   = [];   // premiere tree: bins + sequences (replaces ftsBins/ftsSequences)
let seqModalParentId = null;
let ftsEditMode   = false;

// Holds all clients loaded from DB (used across tabs)
let dbClients = [];

// ── DOM: Shared ───────────────────────────────────────────────────────────────

const navItems      = document.querySelectorAll('.nav-item');
const tabContents   = document.querySelectorAll('.tab-content');
const btnMinimize   = document.getElementById('btn-minimize');
const btnClose      = document.getElementById('btn-close');
const btnMaximize   = document.getElementById('btn-maximize');
const statusText    = document.getElementById('status-text');
const saveStatus    = document.getElementById('save-status');

// ── DOM: Builder ──────────────────────────────────────────────────────────────

const projectForm           = document.getElementById('project-form');
const selectClient          = document.getElementById('select-client');
const selectFunnel          = document.getElementById('select-funnel');
const selectTask            = document.getElementById('select-task');
const inputProject          = document.getElementById('input-project');
const previewDatePath       = document.getElementById('preview-date-path');
const previewRoot           = document.getElementById('preview-root');
const previewFile           = document.getElementById('preview-file');
const treeRootLabel         = document.getElementById('tree-root-label');
const folderTreeList        = document.getElementById('folder-tree-list');
const resolvedTemplateHint  = document.getElementById('resolved-template-hint');
const resolvedTemplateName  = document.getElementById('resolved-template-name');
const btnGotoDbClient       = document.getElementById('btn-goto-db-client');
const btnGotoDbFunnel       = document.getElementById('btn-goto-db-funnel');
const btnManageTasks        = document.getElementById('btn-manage-tasks');
const managePanel           = document.getElementById('manage-tasks-panel');
const managePairLabel       = document.getElementById('manage-pair-label');
const manageTasksList       = document.getElementById('manage-tasks-list');
const btnSaveManageTasks    = document.getElementById('btn-save-manage-tasks');
const btnCloseManage        = document.getElementById('btn-close-manage');

// ── DOM: Settings ─────────────────────────────────────────────────────────────

const settingTargetDir    = document.getElementById('setting-target-dir');
const btnSelectDir        = document.getElementById('btn-select-dir');
const settingAutoPopup    = document.getElementById('setting-auto-popup');
const btnSaveSettings     = document.getElementById('btn-save-settings');

// ── DOM: Folder Template Editor ───────────────────────────────────────────────

const ftTemplateSelect  = document.getElementById('ft-template-select');
const ftTreeEl          = document.getElementById('ft-tree');
const ftNewRootName     = document.getElementById('ft-new-root-name');
const ftBtnAddRoot      = document.getElementById('ft-btn-add-root');
const ftBtnSave         = document.getElementById('ft-btn-save');
const ftBtnSaveNew      = document.getElementById('ft-btn-save-new');
const ftBtnNew          = document.getElementById('ft-btn-new');
const ftBtnSetDefault   = document.getElementById('ft-btn-set-default');
const ftBtnDelete       = document.getElementById('ft-btn-delete');
const ftPrprojPath      = document.getElementById('ft-prproj-path');
const ftBtnBrowsePrproj = document.getElementById('ft-btn-browse-prproj');
const ftBtnClearPrproj  = document.getElementById('ft-btn-clear-prproj');
const ftAssignClient    = document.getElementById('ft-assign-client');
const ftAssignFunnel    = document.getElementById('ft-assign-funnel');
const ftBtnAssign       = document.getElementById('ft-btn-assign');
const ftAssignmentsList = document.getElementById('ft-assignments-list');

// ── DOM: Folder Structure Templates (Database tab) ───────────────────────────

const ftsListEl       = document.getElementById('fts-list');
const ftsPanelEl      = document.getElementById('fts-panel');
const ftsBtnEdit      = document.getElementById('fts-btn-edit');
const ftsBtnNew       = document.getElementById('fts-btn-new');
const ftsBtnCreateNew = document.getElementById('fts-btn-create-new');
const ftsBtnSave          = document.getElementById('fts-btn-save');
const ftsNewModalOverlay  = document.getElementById('fts-new-modal-overlay');
const ftsNewModalClose    = document.getElementById('fts-new-modal-close');
const ftsModalBtnFresh    = document.getElementById('fts-modal-btn-fresh');
const ftsModalBtnDuplicate= document.getElementById('fts-modal-btn-duplicate');
const ftsModalBtnBrowse   = document.getElementById('fts-modal-btn-browse');
const ftsPrprojSection    = document.getElementById('fts-prproj-section');
const ftsPrprojInput      = document.getElementById('fts-prproj-input');
const ftsPrprojBrowseBtn  = document.getElementById('fts-prproj-browse');
const ftsClientSel    = document.getElementById('fts-client');
const ftsFunnelSel    = document.getElementById('fts-funnel');
const ftsTaskSel      = document.getElementById('fts-task');
const ftsTreeEl       = document.getElementById('fts-tree');
const ftsAddRootRow   = document.getElementById('fts-add-root-row');
const ftsNewRootName  = document.getElementById('fts-new-root-name');
const ftsBtnAddRoot   = document.getElementById('fts-btn-add-root');
const ftsPremiereTreeEl   = document.getElementById('fts-premiere-tree');
const premiereAddBinCard  = document.getElementById('premiere-add-bin-card');
const seqModalOverlay     = document.getElementById('seq-modal-overlay');
const seqModalNameEl      = document.getElementById('seq-modal-name');
const seqModalDimsEl      = document.getElementById('seq-modal-dims');
const seqModalFpsEl       = document.getElementById('seq-modal-fps');
const seqModalAddBtn      = document.getElementById('seq-modal-add');
const seqModalCancelBtn   = document.getElementById('seq-modal-cancel');
const seqModalCloseBtn    = document.getElementById('seq-modal-close');
const ftsTabBtnFolder   = document.getElementById('fts-tab-btn-folder');
const ftsTabBtnPremiere = document.getElementById('fts-tab-btn-premiere');
const ftsTabPanelFolder   = document.getElementById('fts-tab-panel-folder');
const ftsTabPanelPremiere = document.getElementById('fts-tab-panel-premiere');
const ftsFilterClient     = document.getElementById('fts-filter-client');
const ftsFilterFunnel     = document.getElementById('fts-filter-funnel');
const ftsFilterTask       = document.getElementById('fts-filter-task');
const ftsTemplateNameInput = document.getElementById('fts-template-name');

// ── DOM: Database ─────────────────────────────────────────────────────────────

const dbClientsList         = document.getElementById('db-clients-list');
const dbNewClientName       = document.getElementById('db-new-client-name');
const dbNewClientInitials   = document.getElementById('db-new-client-initials');
const btnDbAddClient        = document.getElementById('btn-db-add-client');

const dbFunnelsList         = document.getElementById('db-funnels-list');
const dbFunnelClientSelect  = document.getElementById('db-funnel-client-select');
const dbNewFunnelName       = document.getElementById('db-new-funnel-name');
const btnDbAddFunnel        = document.getElementById('btn-db-add-funnel');

const dbTasksList           = document.getElementById('db-tasks-list');
const dbNewTaskName         = document.getElementById('db-new-task-name');
const dbNewTaskInitials     = document.getElementById('db-new-task-initials');
const btnDbAddTask          = document.getElementById('btn-db-add-task');

const dbNewFunnelInitials   = document.getElementById('db-new-funnel-initials');

const dbAssetsList          = document.getElementById('db-assets-list');
const dbNewAssetName        = document.getElementById('db-new-asset-name');
const dbNewAssetPath        = document.getElementById('db-new-asset-path');
const btnBrowseAsset        = document.getElementById('btn-browse-asset');
const dbAssetClientSel      = document.getElementById('db-asset-client-select');
const dbAssetFunnelSel      = document.getElementById('db-asset-funnel-select');
const btnDbAddAsset         = document.getElementById('btn-db-add-asset');

// ── Init ──────────────────────────────────────────────────────────────────────

window.addEventListener('DOMContentLoaded', async () => {
  btnMinimize.addEventListener('click', () => window.api.minimizeWindow());
  btnClose.addEventListener('click', () => window.api.closeWindow());
  if (btnMaximize) btnMaximize.addEventListener('click', () => window.api.maximizeWindow());

  // Show app version after "by BloomX"
  try {
    const v = await window.api.getAppVersion();
    const el = document.getElementById('brand-version');
    if (el && v) el.textContent = ' v' + v;
  } catch (_) { /* non-fatal */ }

  // Helper for generating correlationId
  const getCid = () => crypto.randomUUID ? crypto.randomUUID() : 'ui-' + Date.now() + '-' + Math.floor(Math.random()*1000);

  // Tab navigation
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const tabId = item.getAttribute('data-tab');
      if (!tabId) return;
      const cid = getCid();
      if (window.freeXanLog) window.freeXanLog('info', 'ui:tab-click', cid, { tabId, optimistic: true });
      navItems.forEach(n => n.classList.remove('active'));
      tabContents.forEach(t => t.classList.remove('active'));
      item.classList.add('active');
      document.getElementById(tabId).classList.add('active');
      requestAnimationFrame(updateNavIndicator);
    });
  });

  // Bug Report Modal logic
  const btnReportBug = document.getElementById('btn-report-bug');
  const bugModal = document.getElementById('bug-report-modal');
  const btnCloseBugModal = document.getElementById('btn-close-bug-modal');
  const btnSubmitBugReport = document.getElementById('btn-submit-bug-report');
  const bugReportText = document.getElementById('bug-report-text');
  const bugReportStatus = document.getElementById('bug-report-status');

  function setBugStatus(msg, color) {
    if (bugReportStatus) {
      bugReportStatus.textContent = msg;
      bugReportStatus.style.color = color || '#aaa';
    }
  }

  if (btnReportBug) {
    btnReportBug.addEventListener('click', () => {
      const cid = getCid();
      if (window.freeXanLog) window.freeXanLog('info', 'ui:report-bug-open', cid, { modal: 'open' });
      setBugStatus('', '');
      if (bugModal) bugModal.style.display = 'flex';
      if (bugReportText) bugReportText.focus();
    });
  }

  if (btnCloseBugModal) {
    btnCloseBugModal.addEventListener('click', () => {
      const cid = getCid();
      if (window.freeXanLog) window.freeXanLog('info', 'ui:report-bug-close', cid, { modal: 'close' });
      setBugStatus('', '');
      if (bugModal) bugModal.style.display = 'none';
    });
  }

  if (btnSubmitBugReport) {
    btnSubmitBugReport.addEventListener('click', async () => {
      const text = bugReportText ? bugReportText.value.trim() : '';
      const cid = getCid();

      // Guard: ensure preload API bridge is available
      if (!window.api || typeof window.api.sendBugReport !== 'function') {
        setBugStatus('⚠ App API not ready. Please restart FreeXan and try again.', '#ffaa00');
        if (window.freeXanLog) window.freeXanLog('warn', 'ui:report-bug-no-api', cid, {});
        return;
      }

      if (window.freeXanLog) window.freeXanLog('info', 'ui:report-bug-submit', cid, { reportLength: text.length });

      btnSubmitBugReport.textContent = '⏳ Sending…';
      btnSubmitBugReport.disabled = true;
      setBugStatus('Bundling diagnostic logs…', '#aaa');

      try {
        const result = await window.api.sendBugReport(text);
        if (window.freeXanLog) window.freeXanLog('info', 'ui:report-bug-resolve', cid, { status: 'success', result });
        setBugStatus('✅ Report sent to swastik@bloomxsolutions.com!', '#4caf50');
        if (bugReportText) bugReportText.value = '';
        // Auto-close modal after 2.5 s
        setTimeout(() => {
          if (bugModal) bugModal.style.display = 'none';
          setBugStatus('', '');
        }, 2500);
      } catch (e) {
        if (window.freeXanLog) window.freeXanLog('error', 'ui:report-bug-reject', cid, { error: e.message });
        setBugStatus('❌ Failed: ' + (e.message || 'unknown error'), '#ff5252');
      } finally {
        btnSubmitBugReport.textContent = 'Send Report';
        btnSubmitBugReport.disabled = false;
      }
    });
  }

  // Position indicator after layout is ready
  requestAnimationFrame(updateNavIndicator);

  // Bind all events before any async calls — if an async init throws, buttons still work
  bindBuilderEvents();
  bindSettingsEvents();
  bindDatabaseEvents();
  bindFolderTemplateEvents();
  bindFtsEvents();

  try { await loadAndApplyConfig(); }   catch (e) { console.error('loadAndApplyConfig:', e); }
  try { await loadBuilderDropdowns(); } catch (e) { console.error('loadBuilderDropdowns:', e); }
  try { await loadFolderTemplates(); }  catch (e) { console.error('loadFolderTemplates:', e); }
  try { await loadFtsTemplates(); }     catch (e) { console.error('loadFtsTemplates:', e); }

  // Final guaranteed builder tree render (catches any earlier race conditions)
  try { await refreshBuilderTree(); }   catch (e) { /* non-fatal */ }

  // Enable initials-first keystroke search on Builder dropdowns
  enableInitialsSearch(selectClient);
  enableInitialsSearch(selectFunnel);
  enableInitialsSearch(selectTask);

  // Auto-focus the Client dropdown so typing initials works immediately.
  focusClientDropdown();
  window.api.onMainWindowShown(() => focusClientDropdown());
});
