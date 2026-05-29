// ── UI Micro-interaction Utilities ───────────────────────────────────────────

function updateNavIndicator() {
  const bar = document.getElementById('nav-active-bar');
  if (!bar) return;
  const active = document.querySelector('.nav-item.active');
  if (!active) return;
  const navMenu = active.closest('.nav-menu');
  if (!navMenu) return;
  const menuRect = navMenu.getBoundingClientRect();
  const itemRect = active.getBoundingClientRect();
  bar.style.top    = (itemRect.top - menuRect.top) + 'px';
  bar.style.height = itemRect.height + 'px';
}

// Typewriter reveal for a single element — caps at 200ms total
function animatePreviewValue(el, newText) {
  if (!el || el.textContent === newText) return;
  if (el._pwTimer) clearInterval(el._pwTimer);
  const chars = String(newText);
  const stepMs = Math.max(8, Math.min(200 / Math.max(chars.length, 1), 16));
  el.textContent = '';
  let i = 0;
  el._pwTimer = setInterval(() => {
    el.textContent += chars[i++];
    if (i >= chars.length) { clearInterval(el._pwTimer); el._pwTimer = null; }
  }, stepMs);
}

// Hash a string to a hue (0-359) for avatar backgrounds
function clientHue(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) { h = (h << 5) - h + name.charCodeAt(i); h |= 0; }
  return Math.abs(h) % 360;
}

// ── Date/Time Variable Utilities ─────────────────────────────────────────────
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function resolveVars(str) {
  if (!str) return str;
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  return String(str)
    .replace(/\{Year\}/gi,  now.getFullYear())
    .replace(/\{Month\}/gi, MONTH_NAMES[now.getMonth()])
    .replace(/\{Date\}/gi,  pad(now.getDate()))
    .replace(/\{HH\}/gi,    pad(now.getHours()))
    .replace(/\{MM\}/gi,    pad(now.getMinutes()))
    .replace(/\{SS\}/gi,    pad(now.getSeconds()));
}

// Returns true if str contains Windows-invalid filename chars outside of {Variable} tokens.
function hasInvalidChars(str) {
  const stripped = str.replace(/\{[^}]*\}/g, '');
  return /[\\/:*?"<>|]/.test(stripped);
}

// ── Asset Slot Helpers ────────────────────────────────────────────────────────
const SLOT_META = {
  video: { label: 'Video', icon: '🎬', color: '#7B4DFF' },
  audio: { label: 'Audio', icon: '🎵', color: '#10D28F' },
  image: { label: 'Image', icon: '🖼',  color: '#FFB547' },
};

// Returns the set of slot types already used in ftsTree (folder structure)
function usedFolderSlots() {
  return new Set((typeof ftsTree !== 'undefined' ? ftsTree : []).filter(n => n.node_type === 'slot').map(n => n.slot_type));
}

// Returns the set of slot types already used in ftsPremiere (Premiere bins)
function usedBinSlots() {
  return new Set((typeof ftsPremiere !== 'undefined' ? ftsPremiere : []).filter(n => n.slotType).map(n => n.slotType));
}

// Builds and returns a slot-picker popover element for the given context.
// onPick(slotType) is called when user selects a slot. usedSet = Set of already-used slot types.
function buildSlotPicker(usedSet, onPick) {
  const picker = document.createElement('div');
  picker.className = 'slot-picker';
  Object.entries(SLOT_META).forEach(([type, meta]) => {
    const btn = document.createElement('button');
    btn.className = 'slot-picker-btn' + (usedSet.has(type) ? ' slot-picker-btn--used' : '');
    btn.disabled = usedSet.has(type);
    btn.innerHTML = `${meta.icon} ${meta.label}`;
    btn.addEventListener('click', (e) => { e.stopPropagation(); onPick(type); picker.remove(); });
    picker.appendChild(btn);
  });
  // Close on outside click
  const close = (e) => { if (!picker.contains(e.target)) { picker.remove(); document.removeEventListener('click', close, true); } };
  setTimeout(() => document.addEventListener('click', close, true), 0);
  return picker;
}
// ─────────────────────────────────────────────────────────────────────────────

// Builds and returns an async asset-import picker populated from the DB assets library.
// onPick(asset) is called with the full DB asset row when user selects one.
async function buildAssetPicker(onPick) {
  const picker = document.createElement('div');
  picker.className = 'slot-picker asset-import-picker';

  const assets = await window.api.db.getAssets();

  if (!assets.length) {
    const empty = document.createElement('div');
    empty.className = 'asset-pick-empty';
    empty.textContent = 'No assets in library. Add files in the Assets section first.';
    picker.appendChild(empty);
  } else {
    assets.forEach(a => {
      const btn = document.createElement('button');
      btn.className = 'slot-picker-btn';
      const fileName = a.file_path.split(/[\\/]/).pop();
      btn.innerHTML = `<span class="asset-pick-name">${a.name}</span><span class="asset-pick-file">${fileName}</span>`;
      btn.addEventListener('click', (e) => { e.stopPropagation(); onPick(a); picker.remove(); });
      picker.appendChild(btn);
    });
  }

  const close = (e) => { if (!picker.contains(e.target)) { picker.remove(); document.removeEventListener('click', close, true); } };
  setTimeout(() => document.addEventListener('click', close, true), 0);
  return picker;
}

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
const statusText    = document.getElementById('status-text');

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
const settingSeqResolution = document.getElementById('setting-seq-resolution');
const settingSeqFps        = document.getElementById('setting-seq-fps');
const btnSaveSettings     = document.getElementById('btn-save-settings');
const saveStatus          = document.getElementById('save-status');

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

const dbTemplatesList       = document.getElementById('db-templates-list');
const dbNewTemplateName     = document.getElementById('db-new-template-name');
const dbNewTemplatePath     = document.getElementById('db-new-template-path');
const btnBrowseTemplate     = document.getElementById('btn-browse-template');
const dbTemplateClientSel   = document.getElementById('db-template-client-select');
const dbTemplateFunnelSel   = document.getElementById('db-template-funnel-select');
const btnDbAddTemplate      = document.getElementById('btn-db-add-template');

const dbTasksList           = document.getElementById('db-tasks-list');
const dbNewTaskName         = document.getElementById('db-new-task-name');
const dbNewTaskInitials     = document.getElementById('db-new-task-initials');
const btnDbAddTask          = document.getElementById('btn-db-add-task');

const dbNewFunnelInitials   = document.getElementById('db-new-funnel-initials');

const dbAssetsList          = document.getElementById('db-assets-list');
const dbNewAssetName        = document.getElementById('db-new-asset-name');
const dbNewAssetCategory    = document.getElementById('db-new-asset-category');
const dbNewAssetPath        = document.getElementById('db-new-asset-path');
const btnBrowseAsset        = document.getElementById('btn-browse-asset');
const dbAssetClientSel      = document.getElementById('db-asset-client-select');
const dbAssetFunnelSel      = document.getElementById('db-asset-funnel-select');
const btnDbAddAsset         = document.getElementById('btn-db-add-asset');

// ── Init ──────────────────────────────────────────────────────────────────────

window.addEventListener('DOMContentLoaded', async () => {
  btnMinimize.addEventListener('click', () => window.api.minimizeWindow());
  btnClose.addEventListener('click', () => window.api.closeWindow());

  // Tab navigation
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const tabId = item.getAttribute('data-tab');
      navItems.forEach(n => n.classList.remove('active'));
      tabContents.forEach(t => t.classList.remove('active'));
      item.classList.add('active');
      document.getElementById(tabId).classList.add('active');
      requestAnimationFrame(updateNavIndicator);
    });
  });
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

function focusClientDropdown() {
  // Switch to Builder tab if user was elsewhere, then focus client.
  switchToTab('tab-builder');
  // setTimeout lets the tab become visible before focus is taken.
  setTimeout(() => selectClient.focus(), 0);
}

// ── Builder ───────────────────────────────────────────────────────────────────

// In-memory cache for quick lookup during form submit
let dbFunnels = [];
let dbTasks   = [];

async function loadBuilderDropdowns() {
  // Clients & funnels: load once. Tasks now depend on (client+funnel) so load on demand.
  dbClients = await window.api.db.getClients();
  dbFunnels = await window.api.db.getAllFunnels();
  dbTasks   = await window.api.db.getTasks();  // master list — used by manage panel

  fillSelectWithInitials(selectClient, dbClients, 'Select client...');
  refreshFunnelDropdown(); // populates funnel dropdown filtered by selected client (none = all)
  selectFunnel.disabled = false;

  await refreshTaskDropdownForPair();
}

// Load only tasks attached to the currently selected (client, funnel).
async function refreshTaskDropdownForPair() {
  const clientId = parseInt(selectClient.value) || null;
  const funnelId = parseInt(selectFunnel.value) || null;

  if (!clientId || !funnelId) {
    selectTask.disabled = true;
    btnManageTasks.disabled = true;
    selectTask.innerHTML = '<option value="">Select client + funnel first</option>';
    return;
  }

  const attached = await window.api.db.getFunnelTasks(clientId, funnelId);
  const prevTaskId = parseInt(selectTask.value) || null;

  selectTask.disabled = false;
  btnManageTasks.disabled = false;

  if (attached.length === 0) {
    selectTask.innerHTML = '<option value="">No tasks attached — click + to add</option>';
  } else {
    fillSelectWithInitials(selectTask, attached, 'No task');
    // Restore previous selection if still valid
    if (prevTaskId && attached.find(t => t.id === prevTaskId)) {
      selectTask.value = String(prevTaskId);
    }
  }
}

// Renders each option as "Name (INITIALS)" and stores initials in dataset
// so the initials-search behavior can target it.
function fillSelectWithInitials(selectEl, rows, placeholder) {
  const current = selectEl.value;
  selectEl.innerHTML = `<option value="">${placeholder}</option>`;
  rows.forEach(r => {
    const opt = document.createElement('option');
    opt.value = r.id;
    opt.textContent = r.initials ? `${r.name} (${r.initials})` : r.name;
    opt.dataset.initials = r.initials || '';
    opt.dataset.name = r.name;
    selectEl.appendChild(opt);
  });
  if (current) selectEl.value = current;
}

// ── Initials-first keystroke search on native <select> ────────────────────────
// Typing "AK" selects the option whose initials start with AK (e.g. Aditya kundli).
// Falls back to name-prefix match if no initials match found.
function enableInitialsSearch(selectEl) {
  let buffer = '';
  let bufferTimer = null;

  selectEl.addEventListener('keydown', (e) => {
    // Only intercept printable single-char keys.
    if (e.key.length !== 1 || e.ctrlKey || e.altKey || e.metaKey) return;
    e.preventDefault();

    buffer += e.key.toUpperCase();
    if (bufferTimer) clearTimeout(bufferTimer);
    bufferTimer = setTimeout(() => { buffer = ''; }, 1200);

    // Pass 1: match by initials prefix
    let foundIdx = -1;
    for (let i = 1; i < selectEl.options.length; i++) {
      const ini = (selectEl.options[i].dataset.initials || '').toUpperCase();
      if (ini && ini.startsWith(buffer)) { foundIdx = i; break; }
    }
    // Pass 2: fall back to name prefix
    if (foundIdx === -1) {
      for (let i = 1; i < selectEl.options.length; i++) {
        const nm = (selectEl.options[i].dataset.name || '').toUpperCase();
        if (nm.startsWith(buffer)) { foundIdx = i; break; }
      }
    }
    if (foundIdx >= 0) {
      selectEl.selectedIndex = foundIdx;
      selectEl.dispatchEvent(new Event('change'));
    }
  });

  // Reset buffer when focus leaves
  selectEl.addEventListener('blur', () => { buffer = ''; });
}

function populateClientSelect(selectEl, clients, placeholder) {
  const current = selectEl.value;
  selectEl.innerHTML = `<option value="">${placeholder}</option>`;
  clients.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = `${c.name} (${c.initials})`;
    selectEl.appendChild(opt);
  });
  if (current) selectEl.value = current;
}

// Funnels are independent of clients now — kept in case future scoping is added.
async function refreshFunnelsDropdown() {
  const current = selectFunnel.value;
  const funnels = await window.api.db.getAllFunnels();
  selectFunnel.disabled = false;
  selectFunnel.innerHTML = '<option value="">Select funnel...</option>';
  funnels.forEach(f => {
    const opt = document.createElement('option');
    opt.value = f.id;
    opt.textContent = f.name;
    selectFunnel.appendChild(opt);
  });
  if (current) selectFunnel.value = current;
}

async function refreshTasksDropdown() {
  const current = selectTask.value;
  const tasks = await window.api.db.getTasks();
  selectTask.innerHTML = '<option value="">No task</option>';
  tasks.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t.id;
    opt.textContent = t.name;
    selectTask.appendChild(opt);
  });
  if (current) selectTask.value = current;
}

function getSelectedClientData() {
  const id = parseInt(selectClient.value);
  return dbClients.find(c => c.id === id) || null;
}

async function updateTemplateHint() {
  const clientId = parseInt(selectClient.value) || null;
  const funnelId = parseInt(selectFunnel.value) || null;
  if (!clientId && !funnelId) {
    resolvedTemplateHint.style.display = 'none';
    return;
  }
  const templates = await window.api.db.getTemplates();
  // Mirror resolve logic: funnel first, then client
  let found = null;
  if (funnelId) found = templates.find(t => t.funnel_id === funnelId);
  if (!found && clientId) found = templates.find(t => t.client_id === clientId && !t.funnel_id);
  if (found) {
    resolvedTemplateName.textContent = found.name;
    resolvedTemplateHint.style.display = 'flex';
  } else if (configState.templateFile) {
    resolvedTemplateName.textContent = configState.templateFile.split(/[\\/]/).pop() + ' (global)';
    resolvedTemplateHint.style.display = 'flex';
  } else {
    resolvedTemplateHint.style.display = 'none';
  }
}

function refreshFunnelDropdown() {
  const clientId = parseInt(selectClient.value) || null;
  const prevFunnel = selectFunnel.value;
  const filtered = clientId
    ? dbFunnels.filter(f => f.client_id == clientId || f.client_id == null)
    : dbFunnels;
  fillSelectWithInitials(selectFunnel, filtered, 'Select funnel...');
  // Restore previous selection only if it's still in the filtered list
  if (prevFunnel && filtered.find(f => f.id == prevFunnel)) {
    selectFunnel.value = prevFunnel;
  }
}

function bindBuilderEvents() {
  const fgFunnel = document.getElementById('form-group-funnel');
  const fgTask   = document.getElementById('form-group-task');

  selectClient.addEventListener('change', async () => {
    refreshFunnelDropdown();
    selectFunnel.value = '';
    // Reveal funnel when client is chosen, hide task until funnel chosen
    if (selectClient.value) {
      fgFunnel && fgFunnel.classList.remove('inactive');
    } else {
      fgFunnel && fgFunnel.classList.add('inactive');
      fgTask   && fgTask.classList.add('inactive');
    }
    updatePreviews();
    await refreshTaskDropdownForPair();
    closeManagePanel();
    await updateTemplateHint();
  });

  selectFunnel.addEventListener('change', async () => {
    // Reveal task when funnel is chosen
    if (selectFunnel.value) {
      fgTask && fgTask.classList.remove('inactive');
    } else {
      fgTask && fgTask.classList.add('inactive');
    }
    updatePreviews();
    await refreshTaskDropdownForPair();
    closeManagePanel();
    await updateTemplateHint();
  });

  selectTask.addEventListener('change', updatePreviews);
  inputProject.addEventListener('input', () => {
    const val = inputProject.value;
    if (val && hasInvalidChars(val)) {
      inputProject.classList.add('input-invalid');
    } else {
      inputProject.classList.remove('input-invalid');
    }
    updatePreviews();
  });

  // ── Enter-to-advance keyboard flow ───────────────────────────────────────
  // setTimeout(0) lets the browser commit the dropdown selection first,
  // then we move focus to the next field on the next tick.
  // Advances even on empty selection — funnel/task get randomized silently at submit.
  selectClient.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') setTimeout(() => {
      if (selectClient.value) selectFunnel.focus();
    }, 0);
  });

  selectFunnel.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') setTimeout(async () => {
      await refreshTaskDropdownForPair();
      if (!selectTask.disabled) selectTask.focus();
      else inputProject.focus();
    }, 0);
  });

  selectTask.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') setTimeout(() => {
      inputProject.focus();
    }, 0);
  });
  // Project Name Enter is handled natively by the form submit handler.

  btnGotoDbClient.addEventListener('click', () => switchToTab('tab-database'));
  btnGotoDbFunnel.addEventListener('click', () => switchToTab('tab-database'));

  btnManageTasks.addEventListener('click', openManagePanel);
  btnCloseManage.addEventListener('click', closeManagePanel);
  btnSaveManageTasks.addEventListener('click', saveManagedTasks);

  projectForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!configState.targetDir) {
      showStatusMessage('Set a workspace first.', 'error');
      switchToTab('tab-settings');
      return;
    }

    const client = getSelectedClientData();
    if (!client) {
      showStatusMessage('Select a client.', 'error');
      return;
    }

    // Funnel: pick a random one from the library if user didn't choose
    let funnelId = parseInt(selectFunnel.value) || null;
    let funnel = funnelId ? dbFunnels.find(f => f.id === funnelId) : null;
    if (!funnel && dbFunnels.length > 0) {
      funnel = dbFunnels[Math.floor(Math.random() * dbFunnels.length)];
      funnelId = funnel.id;
    }
    if (!funnel) {
      // No funnels in the library at all — user must add one first
      showStatusMessage('Add at least one funnel in the Library first.', 'error');
      return;
    }

    // Task: pick randomly from those attached to (client + funnel) if user didn't choose
    let taskId = parseInt(selectTask.value) || null;
    let task = taskId ? dbTasks.find(t => t.id === taskId) : null;
    if (!task) {
      const attached = await window.api.db.getFunnelTasks(client.id, funnelId);
      if (attached.length > 0) {
        task = attached[Math.floor(Math.random() * attached.length)];
      }
    }

    const projectVal = inputProject.value.trim();
    if (hasInvalidChars(projectVal)) {
      inputProject.classList.add('input-invalid');
      inputProject.focus();
      return;
    }
    const btnSubmit = document.getElementById('btn-create');
    const originalHTML = btnSubmit.innerHTML;

    try {
      btnSubmit.disabled = true;
      btnSubmit.classList.add('btn-loading');
      btnSubmit.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" stroke-width="2" fill="none" style="animation:spin 0.8s linear infinite"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg> Building…';

      const result = await window.api.createProject({
        clientName:     client.name,
        clientInitials: client.initials,
        funnelName:     funnel.name,
        funnelInitials: funnel.initials,
        taskName:       task ? task.name : '',
        taskInitials:   task ? task.initials : '',
        projectName:    projectVal,
        targetDir:      configState.targetDir,
        clientId:       client.id,
        funnelId,
        taskId:         task ? task.id : null
      });

      if (result.success) {
        inputProject.value = '';
        updatePreviews();
        // Brief success flash on button before showing alert
        btnSubmit.classList.remove('btn-loading');
        btnSubmit.classList.add('btn-done');
        btnSubmit.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" stroke-width="2.5" fill="none"><polyline points="20 6 9 17 4 12"/></svg> Done';
        await new Promise(r => setTimeout(r, 900));
        alert(`Project Ready.\n\nLocation: ${result.projectPath}\nProject File: ${result.openedFile || 'None'}`);
        window.api.openFolder(result.projectPath);
      }
    } catch (err) {
      alert('Flow Failed — ' + err.message);
    } finally {
      btnSubmit.disabled = false;
      btnSubmit.classList.remove('btn-loading', 'btn-done');
      btnSubmit.innerHTML = originalHTML;
    }
  });
}

// ── Manage Tasks panel ───────────────────────────────────────────────────────

async function openManagePanel() {
  const clientId = parseInt(selectClient.value) || null;
  const funnelId = parseInt(selectFunnel.value) || null;
  if (!clientId || !funnelId) return;

  const client = dbClients.find(c => c.id === clientId);
  const funnel = dbFunnels.find(f => f.id === funnelId);
  managePairLabel.textContent = `${client.name} · ${funnel.name}`;

  // Refresh master + attached
  const [allTasks, attached] = await Promise.all([
    window.api.db.getTasks(),
    window.api.db.getFunnelTasks(clientId, funnelId)
  ]);
  const attachedIds = new Set(attached.map(t => t.id));

  manageTasksList.innerHTML = '';
  if (allTasks.length === 0) {
    manageTasksList.innerHTML = '<div class="manage-empty">No tasks in Library. Add some in the Library tab first.</div>';
  } else {
    allTasks.forEach(t => {
      const label = document.createElement('label');
      label.className = 'manage-task-item';
      label.innerHTML = `
        <input type="checkbox" value="${t.id}" ${attachedIds.has(t.id) ? 'checked' : ''}>
        <span>${escapeHtml(t.name)}</span>
        <span class="task-ini">${escapeHtml(t.initials || '')}</span>`;
      manageTasksList.appendChild(label);
    });
  }

  managePanel.hidden = false;
}

function closeManagePanel() {
  managePanel.hidden = true;
}

async function saveManagedTasks() {
  const clientId = parseInt(selectClient.value) || null;
  const funnelId = parseInt(selectFunnel.value) || null;
  if (!clientId || !funnelId) return;

  const checked = Array.from(manageTasksList.querySelectorAll('input[type="checkbox"]:checked'))
    .map(cb => parseInt(cb.value));

  await window.api.db.setFunnelTasks(clientId, funnelId, checked);
  closeManagePanel();
  await refreshTaskDropdownForPair();
}

function switchToTab(tabId) {
  navItems.forEach(n => n.classList.remove('active'));
  tabContents.forEach(t => t.classList.remove('active'));
  const navItem = document.querySelector(`[data-tab="${tabId}"]`);
  if (navItem) navItem.classList.add('active');
  const tab = document.getElementById(tabId);
  if (tab) tab.classList.add('active');
  requestAnimationFrame(updateNavIndicator);
}

// ── Settings ──────────────────────────────────────────────────────────────────

async function savePathSettings() {
  try {
    const result = await window.api.saveConfig({
      targetDir:         settingTargetDir.value.trim(),
      templateFile:      configState.templateFile      || '',
      folderStructure:   configState.folderStructure,
      autoPopup:         settingAutoPopup.checked,
      defaultBins:       configState.defaultBins       || [],
      defaultSequences:  configState.defaultSequences  || [],
      seqResolution:     settingSeqResolution.value    || '1920x1080',
      seqFps:            settingSeqFps.value           || '25'
    });
    configState = result;
    updatePreviews();
  } catch (err) {
    console.error('Auto-save settings failed:', err);
  }
}

function bindSettingsEvents() {
  btnSelectDir.addEventListener('click', async () => {
    const dir = await window.api.selectDirectory();
    if (dir) {
      settingTargetDir.value = dir;
      configState.targetDir = dir;
      await savePathSettings();
    }
  });

  // Auto-save when user manually types or pastes a path and leaves the field
  settingTargetDir.addEventListener('change', async () => {
    configState.targetDir = settingTargetDir.value.trim();
    await savePathSettings();
  });

  settingSeqResolution.addEventListener('change', savePathSettings);
  settingSeqFps.addEventListener('change', savePathSettings);

  btnSaveSettings.addEventListener('click', async () => {
    try {
      const result = await window.api.saveConfig({
        targetDir:        settingTargetDir.value,
        templateFile:     configState.templateFile      || '',
        folderStructure:  configState.folderStructure,
        autoPopup:        settingAutoPopup.checked,
        defaultBins:      configState.defaultBins       || [],
        defaultSequences: configState.defaultSequences  || [],
        seqResolution:    settingSeqResolution.value    || '1920x1080',
        seqFps:           settingSeqFps.value           || '25'
      });
      configState = result;
      showStatusMessage('Settings Saved', 'success');
      updatePreviews();
    } catch (err) {
      showStatusMessage('Save Failed — ' + err.message, 'error');
    }
  });
}

// ── Database Tab ──────────────────────────────────────────────────────────────

function bindDatabaseEvents() {
  // Clients
  btnDbAddClient.addEventListener('click', async () => {
    const name = dbNewClientName.value.trim();
    const initials = dbNewClientInitials.value.trim().toUpperCase();
    if (!name || !initials) return;
    await window.api.db.addClient(name, initials);
    dbNewClientName.value = '';
    dbNewClientInitials.value = '';
    await refreshDatabaseTab();
    await loadBuilderDropdowns();
  });

  // Funnels — clientId now optional (NULL = global funnel)
  dbFunnelClientSelect.addEventListener('change', async () => {
    await refreshFunnelsList();
  });

  btnDbAddFunnel.addEventListener('click', async () => {
    const clientId = parseInt(dbFunnelClientSelect.value) || null;
    const name = dbNewFunnelName.value.trim();
    const initials = dbNewFunnelInitials.value.trim().toUpperCase();
    if (!name) return;
    if (await window.api.db.funnelConflict(name, clientId, null)) {
      alert(`A funnel "${name}" already exists at this scope.`);
      return;
    }
    await window.api.db.addFunnel(clientId, name, initials);
    dbNewFunnelName.value = '';
    dbNewFunnelInitials.value = '';
    await refreshFunnelsList();
    await refreshTemplatesFunnelDropdown();
    await refreshAssetsFunnelDropdown();
    await loadBuilderDropdowns();
  });

  // Tasks
  btnDbAddTask.addEventListener('click', async () => {
    const name = dbNewTaskName.value.trim();
    const initials = dbNewTaskInitials.value.trim().toUpperCase();
    if (!name) return;
    if (await window.api.db.taskConflict(name, null)) {
      alert(`A task "${name}" already exists.`);
      return;
    }
    await window.api.db.addTask(name, initials);
    dbNewTaskName.value = '';
    dbNewTaskInitials.value = '';
    await refreshTasksList();
    await loadBuilderDropdowns();
  });

  // Templates
  dbTemplateClientSel.addEventListener('change', async () => {
    await refreshTemplatesFunnelDropdown();
  });

  btnBrowseTemplate.addEventListener('click', async () => {
    const file = await window.api.selectFile();
    if (file) dbNewTemplatePath.value = file;
  });

  btnDbAddTemplate.addEventListener('click', async () => {
    const name     = dbNewTemplateName.value.trim();
    const filePath = dbNewTemplatePath.value.trim();
    const clientId = parseInt(dbTemplateClientSel.value) || null;
    const funnelId = parseInt(dbTemplateFunnelSel.value) || null;
    if (!name || !filePath) return;

    // Check for an existing template at the exact same scope
    const all = await window.api.db.getTemplates();
    const existing = all.find(t => {
      const cMatch = clientId ? t.client_id === clientId : t.client_id === null;
      const fMatch = funnelId ? t.funnel_id === funnelId : t.funnel_id === null;
      return cMatch && fMatch;
    });

    if (existing) {
      const scopeLabel = existing.funnel_name
        ? `${existing.client_name} / ${existing.funnel_name}`
        : existing.client_name || 'Global';
      const confirmed = confirm(
        `"${existing.name}" is already the template for "${scopeLabel}".\n\nReplace it with "${name}"?`
      );
      if (!confirmed) return;
      await window.api.db.deleteTemplate(existing.id);
    }

    await window.api.db.addTemplate(clientId, funnelId, name, filePath);
    dbNewTemplateName.value = '';
    dbNewTemplatePath.value = '';
    await refreshTemplatesList();
  });

  // Assets
  dbAssetClientSel.addEventListener('change', async () => {
    await refreshAssetsFunnelDropdown();
  });

  btnBrowseAsset.addEventListener('click', async () => {
    const selected = await window.api.ft.selectAsset();
    if (selected) {
      dbNewAssetPath.value = selected;
      if (!dbNewAssetName.value.trim()) {
        dbNewAssetName.value = selected.split(/[\\/]/).pop().replace(/\.[^.]+$/, '');
      }
    }
  });

  btnDbAddAsset.addEventListener('click', async () => {
    const name     = dbNewAssetName.value.trim();
    const filePath = dbNewAssetPath.value.trim();
    const category = dbNewAssetCategory.value;
    const clientId = parseInt(dbAssetClientSel.value) || null;
    const funnelId = parseInt(dbAssetFunnelSel.value) || null;
    if (!name || !filePath) return;
    await window.api.db.addAsset(clientId, funnelId, name, filePath, category, '');
    dbNewAssetName.value = '';
    dbNewAssetPath.value = '';
    await refreshAssetsList();
  });
}

async function refreshDatabaseTab() {
  const clients = await window.api.db.getClients();
  dbClients = clients;

  renderClientsList(clients);
  populateClientSelect(dbFunnelClientSelect, clients, 'Global (no client)');
  populateClientSelect(dbTemplateClientSel, clients, 'Global (no client)');
  populateClientSelect(dbAssetClientSel, clients, 'Global (no client)');

  await refreshFunnelsList();
  await refreshTasksList();
  await refreshTemplatesList();
  await refreshAssetsList();
}

async function refreshFunnelsList() {
  // Single getAll call — covers both global funnels and client-scoped ones.
  const all = await window.api.db.getAllFunnels();
  const clientId = parseInt(dbFunnelClientSelect.value) || null;
  const filtered = clientId ? all.filter(f => f.client_id === clientId) : all;
  renderFunnelsList(filtered);
}

async function refreshTasksList() {
  const tasks = await window.api.db.getTasks();
  renderTasksList(tasks);
}

async function refreshTemplatesFunnelDropdown() {
  const clientId = parseInt(dbTemplateClientSel.value) || null;
  dbTemplateFunnelSel.innerHTML = '<option value="">No funnel scope</option>';
  if (clientId) {
    const funnels = await window.api.db.getFunnels(clientId);
    funnels.forEach(f => {
      const opt = document.createElement('option');
      opt.value = f.id;
      opt.textContent = f.name;
      dbTemplateFunnelSel.appendChild(opt);
    });
  }
}

async function refreshAssetsFunnelDropdown() {
  const clientId = parseInt(dbAssetClientSel.value) || null;
  dbAssetFunnelSel.innerHTML = '<option value="">No funnel scope</option>';
  if (clientId) {
    const funnels = await window.api.db.getFunnels(clientId);
    funnels.forEach(f => {
      const opt = document.createElement('option');
      opt.value = f.id;
      opt.textContent = f.name;
      dbAssetFunnelSel.appendChild(opt);
    });
  }
}

async function refreshTemplatesList() {
  const templates = await window.api.db.getTemplates();
  renderTemplatesList(templates);
}

async function refreshAssetsList() {
  const assets = await window.api.db.getAssets();
  renderAssetsList(assets);
}

// Render helpers

function renderClientsList(clients) {
  dbClientsList.innerHTML = '';
  if (!clients.length) {
    dbClientsList.innerHTML = '<div class="db-empty">No clients yet</div>';
    return;
  }
  clients.forEach(c => {
    const row = makeClientRow(c);
    dbClientsList.appendChild(row);
  });
}

function makeClientRow(c) {
  const row = document.createElement('div');
  row.className = 'db-list-item';
  row.dataset.editable = '1';
  row.title = 'Double-click to edit';
  const hue = clientHue(c.name);
  row.innerHTML = `
    <div class="db-client-avatar" style="background:hsl(${hue},50%,28%)">${escapeHtml((c.initials || c.name).slice(0, 2).toUpperCase())}</div>
    <span class="db-item-name">${escapeHtml(c.name)}</span>
    <span class="db-scope-badge">${escapeHtml(c.initials)}</span>
    <button class="btn-db-delete" title="Delete client">
      <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2" fill="none"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
    </button>`;

  row.querySelector('.btn-db-delete').addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!confirm(`Delete client "${c.name}"? This removes all associated funnels, templates, and assets.`)) return;
    await window.api.db.deleteClient(c.id);
    await refreshDatabaseTab();
    await loadBuilderDropdowns();
  });

  row.addEventListener('dblclick', () => enterClientEdit(row, c));
  return row;
}

function enterClientEdit(row, c) {
  row.classList.add('editing');
  row.removeAttribute('data-editable');
  row.innerHTML = `
    <input type="text" class="ed-name" value="${escapeAttr(c.name)}" placeholder="Client name" style="flex:1.5">
    <input type="text" class="ed-initials" value="${escapeAttr(c.initials)}" placeholder="Initials" maxlength="6" style="max-width:80px">
    <button class="btn-edit-save">Save</button>
    <button class="btn-edit-cancel">Cancel</button>
    <div class="db-edit-error" style="display:none"></div>`;

  const nameIn = row.querySelector('.ed-name');
  const iniIn  = row.querySelector('.ed-initials');
  const errBox = row.querySelector('.db-edit-error');
  nameIn.focus(); nameIn.select();

  row.querySelector('.btn-edit-save').addEventListener('click', async () => {
    const newName = nameIn.value.trim();
    const newIni  = iniIn.value.trim().toUpperCase();
    if (!newName || !newIni) { showErr(errBox, 'Name and initials required.'); return; }
    if (await window.api.db.clientConflict(newName, c.id)) {
      showErr(errBox, `Another client is already named "${newName}".`); return;
    }
    await window.api.db.updateClient(c.id, newName, newIni);
    await refreshDatabaseTab();
    await loadBuilderDropdowns();
  });

  row.querySelector('.btn-edit-cancel').addEventListener('click', () => {
    row.replaceWith(makeClientRow(c));
  });

  // Save on Enter, cancel on Esc
  row.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') row.querySelector('.btn-edit-save').click();
    if (e.key === 'Escape') row.querySelector('.btn-edit-cancel').click();
  });
}

function renderFunnelsList(funnels) {
  dbFunnelsList.innerHTML = '';
  if (!funnels.length) {
    dbFunnelsList.innerHTML = '<div class="db-empty">No funnels yet</div>';
    return;
  }
  funnels.forEach(f => dbFunnelsList.appendChild(makeFunnelRow(f)));
}

function makeFunnelRow(f) {
  const row = document.createElement('div');
  row.className = 'db-list-item';
  row.dataset.editable = '1';
  row.title = 'Double-click to edit';
  const scope = f.client_name || 'Global';
  row.innerHTML = `
    <span class="db-item-name">${escapeHtml(f.name)}</span>
    <span class="db-scope-badge db-scope-badge--cat">${escapeHtml(f.initials || '—')}</span>
    <span class="db-scope-badge">${escapeHtml(scope)}</span>
    <button class="btn-db-delete" title="Delete funnel">
      <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2" fill="none"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
    </button>`;

  row.querySelector('.btn-db-delete').addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!confirm(`Delete funnel "${f.name}"?`)) return;
    await window.api.db.deleteFunnel(f.id);
    await refreshFunnelsList();
    await loadBuilderDropdowns();
  });

  row.addEventListener('dblclick', () => enterFunnelEdit(row, f));
  return row;
}

function enterFunnelEdit(row, f) {
  row.classList.add('editing');
  row.removeAttribute('data-editable');
  const clientOpts = ['<option value="">Global</option>']
    .concat(dbClients.map(c => `<option value="${c.id}" ${c.id === f.client_id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`))
    .join('');
  row.innerHTML = `
    <input type="text" class="ed-name" value="${escapeAttr(f.name)}" placeholder="Funnel name" style="flex:1.5">
    <input type="text" class="ed-initials" value="${escapeAttr(f.initials)}" placeholder="Initials" maxlength="6" style="max-width:80px">
    <select class="ed-client">${clientOpts}</select>
    <button class="btn-edit-save">Save</button>
    <button class="btn-edit-cancel">Cancel</button>
    <div class="db-edit-error" style="display:none"></div>`;

  const nameIn = row.querySelector('.ed-name');
  const iniIn  = row.querySelector('.ed-initials');
  const cliSel = row.querySelector('.ed-client');
  const errBox = row.querySelector('.db-edit-error');
  nameIn.focus(); nameIn.select();

  row.querySelector('.btn-edit-save').addEventListener('click', async () => {
    const newName = nameIn.value.trim();
    const newIni  = iniIn.value.trim().toUpperCase();
    const newClientId = parseInt(cliSel.value) || null;
    if (!newName) { showErr(errBox, 'Name required.'); return; }
    if (await window.api.db.funnelConflict(newName, newClientId, f.id)) {
      const scopeLabel = newClientId ? (dbClients.find(c => c.id === newClientId)?.name || 'this client') : 'Global';
      showErr(errBox, `Another funnel "${newName}" already exists in ${scopeLabel}.`);
      return;
    }
    await window.api.db.updateFunnel(f.id, newClientId, newName, newIni);
    await refreshFunnelsList();
    await loadBuilderDropdowns();
  });

  row.querySelector('.btn-edit-cancel').addEventListener('click', () => {
    row.replaceWith(makeFunnelRow(f));
  });

  row.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') row.querySelector('.btn-edit-save').click();
    if (e.key === 'Escape') row.querySelector('.btn-edit-cancel').click();
  });
}

function renderTasksList(tasks) {
  dbTasksList.innerHTML = '';
  if (!tasks.length) {
    dbTasksList.innerHTML = '<div class="db-empty">No tasks yet</div>';
    return;
  }
  tasks.forEach(t => dbTasksList.appendChild(makeTaskRow(t)));
}

function makeTaskRow(t) {
  const row = document.createElement('div');
  row.className = 'db-list-item';
  row.dataset.editable = '1';
  row.title = 'Double-click to edit';
  row.innerHTML = `
    <span class="db-item-name">${escapeHtml(t.name)}</span>
    <span class="db-scope-badge db-scope-badge--cat">${escapeHtml(t.initials || '—')}</span>
    <button class="btn-db-delete" title="Delete task">
      <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2" fill="none"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
    </button>`;

  row.querySelector('.btn-db-delete').addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!confirm(`Delete task "${t.name}"?`)) return;
    await window.api.db.deleteTask(t.id);
    await refreshTasksList();
    await loadBuilderDropdowns();
  });

  row.addEventListener('dblclick', () => enterTaskEdit(row, t));
  return row;
}

function enterTaskEdit(row, t) {
  row.classList.add('editing');
  row.removeAttribute('data-editable');
  row.innerHTML = `
    <input type="text" class="ed-name" value="${escapeAttr(t.name)}" placeholder="Task name" style="flex:1.5">
    <input type="text" class="ed-initials" value="${escapeAttr(t.initials)}" placeholder="Initials" maxlength="6" style="max-width:80px">
    <button class="btn-edit-save">Save</button>
    <button class="btn-edit-cancel">Cancel</button>
    <div class="db-edit-error" style="display:none"></div>`;

  const nameIn = row.querySelector('.ed-name');
  const iniIn  = row.querySelector('.ed-initials');
  const errBox = row.querySelector('.db-edit-error');
  nameIn.focus(); nameIn.select();

  row.querySelector('.btn-edit-save').addEventListener('click', async () => {
    const newName = nameIn.value.trim();
    const newIni  = iniIn.value.trim().toUpperCase();
    if (!newName) { showErr(errBox, 'Name required.'); return; }
    if (await window.api.db.taskConflict(newName, t.id)) {
      showErr(errBox, `Another task "${newName}" already exists.`); return;
    }
    await window.api.db.updateTask(t.id, newName, newIni);
    await refreshTasksList();
    await loadBuilderDropdowns();
  });

  row.querySelector('.btn-edit-cancel').addEventListener('click', () => {
    row.replaceWith(makeTaskRow(t));
  });

  row.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') row.querySelector('.btn-edit-save').click();
    if (e.key === 'Escape') row.querySelector('.btn-edit-cancel').click();
  });
}

// ── Helpers for inline edit ──────────────────────────────────────────────────
function showErr(el, msg) { el.textContent = msg; el.style.display = 'block'; }
function escapeHtml(s)    { return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function escapeAttr(s)    { return escapeHtml(s).replace(/`/g, '&#96;'); }

function renderTemplatesList(templates) {
  dbTemplatesList.innerHTML = '';
  if (!templates.length) {
    dbTemplatesList.innerHTML = '<div class="db-empty">No templates yet</div>';
    return;
  }
  templates.forEach(t => {
    const scope = t.funnel_name
      ? `${t.client_name} / ${t.funnel_name}`
      : t.client_name
        ? t.client_name
        : 'Global';
    const fileName = t.file_path.split(/[\\/]/).pop();
    const row = document.createElement('div');
    row.className = 'db-list-item';
    row.innerHTML = `
      <span class="db-item-name">${t.name}</span>
      <span class="db-item-file" title="${t.file_path}">${fileName}</span>
      <span class="db-scope-badge">${scope}</span>
      <button class="btn-db-delete" data-id="${t.id}" title="Delete template">
        <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2" fill="none"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
      </button>`;
    row.querySelector('.btn-db-delete').addEventListener('click', async () => {
      if (!confirm(`Delete template "${t.name}"?`)) return;
      await window.api.db.deleteTemplate(t.id);
      await refreshTemplatesList();
    });
    dbTemplatesList.appendChild(row);
  });
}

function renderAssetsList(assets) {
  dbAssetsList.innerHTML = '';
  if (!assets.length) {
    dbAssetsList.innerHTML = '<div class="db-empty">No preset assets yet</div>';
    return;
  }
  assets.forEach(a => {
    const scope = a.funnel_name
      ? `${a.client_name} / ${a.funnel_name}`
      : a.client_name
        ? a.client_name
        : 'Global';
    const fileName = a.file_path.split(/[\\/]/).pop();
    const row = document.createElement('div');
    row.className = 'db-list-item';
    row.innerHTML = `
      <span class="db-item-name">${a.name}</span>
      <span class="db-item-file" title="${a.file_path}">${fileName}</span>
      <span class="db-scope-badge db-scope-badge--cat">${a.category}</span>
      <span class="db-scope-badge">${scope}</span>
      <button class="btn-db-delete" data-id="${a.id}" title="Delete asset">
        <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2" fill="none"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
      </button>`;
    row.querySelector('.btn-db-delete').addEventListener('click', async () => {
      if (!confirm(`Delete asset "${a.name}"?`)) return;
      await window.api.db.deleteAsset(a.id);
      await refreshAssetsList();
    });
    dbAssetsList.appendChild(row);
  });
}

// Refresh DB tab when switched to
document.querySelector('[data-tab="tab-database"]').addEventListener('click', () => {
  refreshDatabaseTab();
});

// ── Settings Helpers ──────────────────────────────────────────────────────────

async function loadAndApplyConfig() {
  try {
    configState = await window.api.getConfig();
    settingTargetDir.value        = configState.targetDir || '';
    settingAutoPopup.checked      = configState.autoPopup !== false;
    settingSeqResolution.value    = configState.seqResolution || '1920x1080';
    settingSeqFps.value           = configState.seqFps || '25';
    updatePreviews();
  } catch (err) {
    console.error('Error loading config:', err);
  }
}

function makeListRow(name, onRemove) {
  const row = document.createElement('div');
  row.className = 'structure-row';
  const label = document.createElement('span');
  label.className = 'structure-folder-name';
  label.textContent = name;
  const removeBtn = document.createElement('button');
  removeBtn.className = 'btn-remove-folder';
  removeBtn.title = 'Remove';
  removeBtn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>`;
  removeBtn.addEventListener('click', onRemove);
  row.appendChild(label);
  row.appendChild(removeBtn);
  return row;
}

// ── Preview ───────────────────────────────────────────────────────────────────

function updatePreviews() {
  const client     = getSelectedClientData();
  const funnelId   = parseInt(selectFunnel.value) || null;
  const funnel     = dbFunnels.find(f => f.id === funnelId);
  const taskId     = parseInt(selectTask.value) || null;
  const task       = taskId ? dbTasks.find(t => t.id === taskId) : null;
  const projectVal = resolveVars(inputProject.value.trim() || 'PROJECT');

  // Folder uses FULL names; file uses INITIALS.
  const clientName  = client ? client.name : 'CLIENT';
  const clientIni   = client ? client.initials : 'CLI';
  const funnelName  = funnel ? funnel.name : 'FUNNEL';
  const funnelIni   = funnel ? (funnel.initials || funnel.name) : 'FNL';
  const taskName    = task ? task.name : '';
  const taskIni     = task ? (task.initials || task.name) : '';

  const folderParts = [clientName, funnelName];
  if (taskName) folderParts.push(taskName);
  folderParts.push(projectVal);
  const rootFolderName = folderParts.join(' - ');

  // Date hierarchy preview
  const _now = new Date();
  const _pad = n => String(n).padStart(2, '0');
  const _month = MONTH_NAMES[_now.getMonth()];
  const datePath = `${_month}${_now.getFullYear()}  →  ${_pad(_now.getDate())} ${_month}`;

  const fileParts = [clientIni, funnelIni];
  if (taskIni) fileParts.push(taskIni);
  fileParts.push(projectVal);
  const projectFileName = `${fileParts.join('_')}_v01.prproj`;

  if (previewDatePath) animatePreviewValue(previewDatePath, datePath);
  animatePreviewValue(previewRoot, rootFolderName);
  animatePreviewValue(previewFile, projectFileName);
  treeRootLabel.textContent = rootFolderName;
  refreshBuilderTree().catch(() => {});
}

// Show Default template always; only swap to a specific template when Task is selected
// and an exact Client+Funnel+Task assignment exists with nodes.
async function refreshBuilderTree() {
  const clientId = parseInt(selectClient.value) || null;
  const funnelId = parseInt(selectFunnel.value) || null;
  const taskId   = parseInt(selectTask.value)   || null;

  // Only look for a specific template once all three dropdowns are filled
  let nodes = defaultBuilderNodes;
  if (clientId && funnelId && taskId && ftsTemplates.length) {
    const assigned = ftsTemplates.find(
      t => t.asgn_client_id == clientId && t.asgn_funnel_id == funnelId && t.asgn_task_id == taskId
    );
    if (assigned && assigned.id) {
      const assignedNodes = await window.api.ft.getNodes(assigned.id);
      if (assignedNodes.length > 0) nodes = assignedNodes;
    }
  }

  builderTreeNodes = nodes;
  renderBuilderTree(previewFile.textContent || 'PROJECT_v01.prproj');
}

let _treeNodeIdx = 0;

function renderBuilderTree(fileName) {
  folderTreeList.innerHTML = '';
  _treeNodeIdx = 0;
  if (!builderTreeNodes.length) return;
  const roots = builderTreeNodes.filter(n => n.parent_id == null);
  roots.forEach(n => renderBuilderTreeNode(n, fileName, 0));
}

function renderBuilderTreeNode(node, fileName, depth) {
  if (node.node_type === 'asset') return;
  const item = document.createElement('div');
  item.className = 'tree-item stagger-in';
  item.style.animationDelay = (_treeNodeIdx++ * 28) + 'ms';
  if (depth > 0) item.style.paddingLeft = (depth * 14) + 'px';
  item.textContent = node.name;
  folderTreeList.appendChild(item);

  if (node.name === '01_Project_Files') {
    const fileItem = document.createElement('div');
    fileItem.className = 'tree-item project-file stagger-in';
    fileItem.style.animationDelay = (_treeNodeIdx++ * 28) + 'ms';
    fileItem.style.paddingLeft = ((depth + 1) * 14) + 'px';
    fileItem.textContent = fileName;
    folderTreeList.appendChild(fileItem);
  }

  builderTreeNodes
    .filter(n => n.parent_id === node.id)
    .forEach(child => renderBuilderTreeNode(child, fileName, depth + 1));
}

// ── Folder Template Editor ────────────────────────────────────────────────────

async function loadFolderTemplates() {
  if (!ftTemplateSelect) return;
  ftTemplates = await window.api.ft.getAll();
  ftTemplateSelect.innerHTML = '';
  ftTemplates.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t.id;
    opt.textContent = t.is_default ? `${t.name} ★` : t.name;
    ftTemplateSelect.appendChild(opt);
  });
  if (ftTemplates.length > 0) {
    const current = ftTemplates.find(t => t.id === ftActiveId) || ftTemplates[0];
    ftActiveId = current.id;
    ftTemplateSelect.value = String(ftActiveId);
    await loadFtTemplateData(ftActiveId);
  }
  // Populate assignment client dropdown
  ftAssignClient.innerHTML = '<option value="">Any Client</option>';
  dbClients.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.name;
    ftAssignClient.appendChild(opt);
  });
  await refreshFtAssignFunnels();
}

async function loadFtTemplateData(id) {
  const tpl = ftTemplates.find(t => t.id === id);
  if (!tpl) return;

  // Update prproj path and open mode fields
  ftPrprojPath.value = tpl.prproj_path || '';
  const modeInputs = document.querySelectorAll('input[name="ft-open-mode"]');
  modeInputs.forEach(r => { r.checked = r.value === (tpl.open_mode || 'copy_to_new'); });

  const nodes = await window.api.ft.getNodes(id);
  ftTree = nodes.map(n => ({
    ...n,
    tempId: n.id,
    _expanded: true
  }));
  renderFtTree();
  await renderAssignments(id);
}

function ftGetChildren(parentId) {
  return ftTree.filter(n => n.parent_id === (parentId ?? null));
}

function ftNextTempId() {
  return -(Date.now() + Math.random() * 1000 | 0);
}

function renderFtTree() {
  ftTreeEl.innerHTML = '';
  const roots = ftTree.filter(n => n.parent_id === null);
  roots.forEach(n => renderFtNode(n, 0));
}

function renderFtNode(node, depth) {
  const children = ftGetChildren(node.tempId ?? node.id);
  const isFolder = node.node_type === 'folder';

  const row = document.createElement('div');
  row.className = 'ft-node' + (isFolder ? '' : ' ft-asset');
  row.style.paddingLeft = (6 + depth * 16) + 'px';
  row.dataset.nodeId = node.tempId ?? node.id;

  const toggle = document.createElement('span');
  toggle.className = 'ft-toggle';
  if (isFolder && children.length > 0) {
    toggle.textContent = node._expanded ? '▾' : '▸';
    toggle.addEventListener('click', () => {
      node._expanded = !node._expanded;
      renderFtTree();
    });
  }

  const icon = document.createElement('span');
  icon.className = 'ft-icon';
  icon.textContent = isFolder ? '📁' : '📎';

  const nameEl = document.createElement('span');
  nameEl.className = 'ft-name';
  nameEl.textContent = node.name;
  nameEl.title = node.asset_path || node.name;
  nameEl.addEventListener('dblclick', () => {
    nameEl.contentEditable = 'true';
    nameEl.focus();
    document.execCommand('selectAll', false, null);
  });
  nameEl.addEventListener('blur', () => {
    const newName = nameEl.textContent.trim();
    if (newName && hasInvalidChars(newName)) {
      nameEl.textContent = node.name;
      nameEl.contentEditable = 'false';
      renderFtTree();
      return;
    }
    if (newName) ftRenameNode(node.tempId ?? node.id, newName);
    nameEl.contentEditable = 'false';
    renderFtTree();
  });
  nameEl.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); nameEl.blur(); }
    if (e.key === 'Escape') { nameEl.textContent = node.name; nameEl.blur(); }
  });

  const actions = document.createElement('div');
  actions.className = 'ft-node-actions';

  if (isFolder) {
    const addFolderBtn = document.createElement('button');
    addFolderBtn.className = 'ft-node-btn';
    addFolderBtn.textContent = '+ Folder';
    addFolderBtn.addEventListener('click', () => {
      ftAddFolderNode(node.tempId ?? node.id);
      node._expanded = true;
      renderFtTree();
    });

    actions.appendChild(addFolderBtn);
  }

  const delBtn = document.createElement('button');
  delBtn.className = 'ft-node-btn ft-del-btn';
  delBtn.textContent = '✕';
  delBtn.title = 'Remove';
  delBtn.addEventListener('click', () => {
    ftRemoveNode(node.tempId ?? node.id);
    renderFtTree();
  });
  actions.appendChild(delBtn);

  row.appendChild(toggle);
  row.appendChild(icon);
  row.appendChild(nameEl);
  row.appendChild(actions);
  ftTreeEl.appendChild(row);

  if (isFolder && node._expanded) {
    children.forEach(child => renderFtNode(child, depth + 1));
  }
}

function ftAddFolderNode(parentId) {
  const tempId = ftNextTempId();
  const sortOrder = ftTree.filter(n => n.parent_id === parentId).length;
  ftTree.push({ tempId, id: null, parent_id: parentId, node_type: 'folder', name: 'New Folder', asset_path: null, sort_order: sortOrder, _expanded: true });
}

function ftAddAssetNode(parentId, assetPath) {
  const name = assetPath.replace(/\\/g, '/').split('/').pop();
  const tempId = ftNextTempId();
  const sortOrder = ftTree.filter(n => n.parent_id === parentId).length;
  ftTree.push({ tempId, id: null, parent_id: parentId, node_type: 'asset', name, asset_path: assetPath, sort_order: sortOrder, _expanded: false });
}

function ftRemoveNode(nodeKey) {
  const toRemove = new Set();
  const collect = (key) => {
    toRemove.add(key);
    ftTree.filter(n => n.parent_id === key).forEach(child => collect(child.tempId ?? child.id));
  };
  collect(nodeKey);
  ftTree = ftTree.filter(n => !toRemove.has(n.tempId ?? n.id));
}

function ftRenameNode(nodeKey, newName) {
  const node = ftTree.find(n => (n.tempId ?? n.id) === nodeKey);
  if (node) node.name = newName;
}

function ftBuildSavePayload() {
  // Return flat array in topological order with parent_id referencing tempId
  const result = [];
  const visit = (parentId) => {
    const children = ftTree.filter(n => n.parent_id === parentId);
    children.forEach(n => {
      result.push({
        id:         n.id,
        tempId:     n.tempId ?? n.id,
        parent_id:  parentId,
        node_type:  n.node_type,
        name:       n.name,
        asset_path: n.asset_path || null,
        sort_order: result.length
      });
      if (n.node_type === 'folder') visit(n.tempId ?? n.id);
    });
  };
  visit(null);
  return result;
}

async function saveFolderTemplate(templateId) {
  const nodes = ftBuildSavePayload();
  await window.api.ft.setNodes(templateId, nodes);

  const tpl = ftTemplates.find(t => t.id === templateId);
  if (tpl) {
    const modeEl = document.querySelector('input[name="ft-open-mode"]:checked');
    await window.api.ft.update(
      templateId,
      tpl.name,
      ftPrprojPath.value.trim() || null,
      modeEl ? modeEl.value : 'copy_to_new'
    );
  }

  await loadFolderTemplates();
  showStatusMessage('Template saved', 'success');
}

async function renderAssignments(templateId) {
  const assignments = await window.api.ft.getAssignments(templateId);
  ftAssignmentsList.innerHTML = '';
  if (!assignments.length) {
    ftAssignmentsList.innerHTML = '<div class="db-empty">No assignments — used as Default for all projects.</div>';
    return;
  }
  assignments.forEach(a => {
    const label = a.funnel_name
      ? `${a.client_name || 'Any'} / ${a.funnel_name}`
      : a.client_name || 'Any Client';
    const row = document.createElement('div');
    row.className = 'ft-assignment-row';
    row.innerHTML = `<span>${escapeHtml(label)}</span>`;
    const rmBtn = document.createElement('button');
    rmBtn.className = 'ft-node-btn ft-del-btn';
    rmBtn.textContent = 'Remove';
    rmBtn.style.fontSize = '10px';
    rmBtn.addEventListener('click', async () => {
      await window.api.ft.unassign(templateId, a.client_id, a.funnel_id);
      await renderAssignments(templateId);
    });
    row.appendChild(rmBtn);
    ftAssignmentsList.appendChild(row);
  });
}

async function refreshFtAssignFunnels() {
  const clientId = parseInt(ftAssignClient.value) || null;
  ftAssignFunnel.innerHTML = '<option value="">Any Funnel</option>';
  if (clientId) {
    const funnels = await window.api.db.getFunnels(clientId);
    funnels.forEach(f => {
      const opt = document.createElement('option');
      opt.value = f.id;
      opt.textContent = f.name;
      ftAssignFunnel.appendChild(opt);
    });
  }
}

function bindFolderTemplateEvents() {
  if (!ftTemplateSelect) return;
  ftTemplateSelect.addEventListener('change', async () => {
    ftActiveId = parseInt(ftTemplateSelect.value) || null;
    if (ftActiveId) await loadFtTemplateData(ftActiveId);
  });

  ftBtnNew.addEventListener('click', async () => {
    const name = prompt('New template name:');
    if (!name || !name.trim()) return;
    await window.api.ft.create(name.trim());
    await loadFolderTemplates();
  });

  ftBtnSetDefault.addEventListener('click', async () => {
    if (!ftActiveId) return;
    await window.api.ft.setDefault(ftActiveId);
    await loadFolderTemplates();
    showStatusMessage('Default template updated', 'success');
  });

  ftBtnDelete.addEventListener('click', async () => {
    if (!ftActiveId) return;
    const tpl = ftTemplates.find(t => t.id === ftActiveId);
    if (tpl && tpl.is_default) { alert('Cannot delete the Default template.'); return; }
    if (!confirm(`Delete template "${tpl?.name}"?`)) return;
    await window.api.ft.delete(ftActiveId);
    ftActiveId = null;
    await loadFolderTemplates();
  });

  ftBtnBrowsePrproj.addEventListener('click', async () => {
    const file = await window.api.ft.selectPrproj();
    if (file) ftPrprojPath.value = file;
  });

  ftBtnClearPrproj.addEventListener('click', () => { ftPrprojPath.value = ''; });

  ftBtnAddRoot.addEventListener('click', () => {
    const name = ftNewRootName.value.trim();
    if (!name) return;
    ftAddFolderNode(null);
    ftTree[ftTree.length - 1].name = name;
    ftNewRootName.value = '';
    renderFtTree();
  });

  ftNewRootName.addEventListener('keypress', e => {
    if (e.key === 'Enter') { e.preventDefault(); ftBtnAddRoot.click(); }
  });

  ftBtnSave.addEventListener('click', async () => {
    if (!ftActiveId) return;
    await saveFolderTemplate(ftActiveId);
  });

  ftBtnSaveNew.addEventListener('click', async () => {
    if (!ftActiveId) return;
    const name = prompt('Save as new template:');
    if (!name || !name.trim()) return;
    const result = await window.api.ft.create(name.trim());
    const newId = result.lastInsertRowid;
    await loadFolderTemplates();
    ftActiveId = newId;
    ftTemplateSelect.value = String(newId);
    await saveFolderTemplate(newId);
  });

  ftAssignClient.addEventListener('change', refreshFtAssignFunnels);

  ftBtnAssign.addEventListener('click', async () => {
    if (!ftActiveId) return;
    const clientId = parseInt(ftAssignClient.value) || null;
    const funnelId = parseInt(ftAssignFunnel.value) || null;
    await window.api.ft.assign(ftActiveId, clientId, funnelId);
    await renderAssignments(ftActiveId);
  });
}

// ── Folder Structure Templates — Database tab ────────────────────────────────

async function loadFtsTemplates() {
  ftsTemplates = await window.api.ft.getAll();

  // Pre-load Default template nodes so the builder tree is always ready
  const defTpl = ftsTemplates.find(t => t.is_default) || await window.api.ft.getDefault();
  if (defTpl) {
    defaultBuilderNodes = await window.api.ft.getNodes(defTpl.id);
  }

  renderFtsList();
  populateFtsDropdowns();
  if (ftsActiveId) {
    const still = ftsTemplates.find(t => t.id === ftsActiveId);
    if (still) await selectFtsTemplate(ftsActiveId);
  }
  await refreshBuilderTree();
}

function renderFtsList() {
  ftsListEl.innerHTML = '';
  const filterClient = parseInt(ftsFilterClient.value) || null;
  const filterFunnel = parseInt(ftsFilterFunnel.value) || null;
  const filterTask   = parseInt(ftsFilterTask.value)   || null;

  // Deduplicate by id (getAll JOINs produce one row per assignment)
  const seen = new Set();
  const visible = ftsTemplates.filter(t => {
    if (seen.has(t.id)) return false;
    seen.add(t.id);
    if (t.is_default) return true;
    if (filterClient && t.asgn_client_id !== filterClient) return false;
    if (filterFunnel && t.asgn_funnel_id !== filterFunnel) return false;
    if (filterTask   && t.asgn_task_id   !== filterTask)   return false;
    return true;
  });

  visible.forEach(t => {
    const item = document.createElement('div');
    item.className = 'fts-list-item' + (t.id === ftsActiveId ? ' active' : '');
    item.dataset.id = t.id;

    const name = document.createElement('span');
    name.className = 'fts-list-item-name';
    name.textContent = t.is_default ? `${t.name} ★` : t.name;

    const label = document.createElement('span');
    label.className = 'fts-list-item-label';
    if (t.client_name || t.funnel_name || t.task_name) {
      label.textContent = [t.client_name, t.funnel_name, t.task_name].filter(Boolean).join(' · ');
    } else if (!t.is_default) {
      label.textContent = 'Unassigned';
    }

    item.appendChild(name);
    item.appendChild(label);

    if (!t.is_default) {
      const del = document.createElement('button');
      del.className = 'fts-list-del';
      del.textContent = '×';
      del.title = 'Delete template';
      del.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm(`Delete template "${t.name}"? This cannot be undone.`)) return;
        await window.api.ft.delete(t.id);
        if (ftsActiveId === t.id) { ftsActiveId = null; ftsPanelEl.hidden = true; }
        await loadFtsTemplates();
      });
      item.appendChild(del);
    }

    item.addEventListener('click', () => selectFtsTemplate(t.id));
    ftsListEl.appendChild(item);
  });
}

function populateFtsDropdowns() {
  // Assignment dropdowns (inside panel, edit mode)
  ftsClientSel.innerHTML = '<option value="">Any Client</option>';
  dbClients.forEach(c => {
    const o = document.createElement('option');
    o.value = c.id; o.textContent = c.name;
    ftsClientSel.appendChild(o);
  });
  refreshFtsFunnels();
  refreshFtsTasks();

  // Filter dropdowns (above list, always enabled)
  const prevClient = ftsFilterClient.value;
  ftsFilterClient.innerHTML = '<option value="">All Clients</option>';
  dbClients.forEach(c => {
    const o = document.createElement('option');
    o.value = c.id; o.textContent = c.name;
    ftsFilterClient.appendChild(o);
  });
  ftsFilterClient.value = prevClient;
  refreshFtsFilterFunnels();
}

function refreshFtsFilterFunnels() {
  const clientId = parseInt(ftsFilterClient.value) || null;
  const prevFunnel = ftsFilterFunnel.value;
  ftsFilterFunnel.innerHTML = '<option value="">All Funnels</option>';
  const funnels = clientId ? dbFunnels.filter(f => f.client_id === clientId) : dbFunnels;
  funnels.forEach(f => {
    const o = document.createElement('option');
    o.value = f.id; o.textContent = f.name;
    ftsFilterFunnel.appendChild(o);
  });
  ftsFilterFunnel.value = prevFunnel;
  refreshFtsFilterTasks();
}

function refreshFtsFilterTasks() {
  const prevTask = ftsFilterTask.value;
  ftsFilterTask.innerHTML = '<option value="">All Tasks</option>';
  dbTasks.forEach(t => {
    const o = document.createElement('option');
    o.value = t.id; o.textContent = t.name;
    ftsFilterTask.appendChild(o);
  });
  ftsFilterTask.value = prevTask;
}

function refreshFtsFunnels() {
  const clientId = parseInt(ftsClientSel.value) || null;
  ftsFunnelSel.innerHTML = '<option value="">Any Funnel</option>';
  const funnels = clientId ? dbFunnels.filter(f => f.client_id === clientId) : dbFunnels;
  funnels.forEach(f => {
    const o = document.createElement('option');
    o.value = f.id; o.textContent = f.name;
    ftsFunnelSel.appendChild(o);
  });
  refreshFtsTasks();
}

function refreshFtsTasks() {
  ftsTaskSel.innerHTML = '<option value="">Any Task</option>';
  dbTasks.forEach(t => {
    const o = document.createElement('option');
    o.value = t.id; o.textContent = t.name;
    ftsTaskSel.appendChild(o);
  });
}

async function selectFtsTemplate(id) {
  ftsActiveId = id;
  renderFtsList();

  const tpl = ftsTemplates.find(t => t.id === id);
  if (!tpl) return;

  ftsTree = await window.api.ft.getNodes(id);
  ftsTree.forEach(n => { n.tempId = n.id; n._expanded = true; });

  // 01_Project_Files is mandatory in every template — inject if absent, always lock
  const pfIdx = ftsTree.findIndex(n => n.parent_id == null && n.name === '01_Project_Files');
  if (pfIdx === -1) {
    ftsTree.unshift({ tempId: 'pf-' + id, id: null, parent_id: null, node_type: 'folder', name: '01_Project_Files', asset_path: null, sort_order: -1, _locked: true, _expanded: true });
  } else {
    ftsTree[pfIdx]._locked = true;
    ftsTree[pfIdx]._expanded = true;
  }
  const rawBinsData = JSON.parse(tpl.bins_json || '[]');
  if (rawBinsData.length > 0 && typeof rawBinsData[0] === 'string') {
    // Migrate old flat string format → bin nodes
    let tid = 1;
    ftsPremiere = rawBinsData.map((name, i) => ({ tempId: tid++, name, type: 'bin', parent_id: null, sort_order: i, _expanded: true }));
    const rawSeqs = JSON.parse(tpl.sequences_json || '[]');
    rawSeqs.forEach((name, i) => {
      ftsPremiere.push({ tempId: tid++, name, type: 'sequence', parent_id: null, sort_order: i, width: 1920, height: 1080, fps: 25 });
    });
  } else {
    ftsPremiere = rawBinsData.map(n => ({ ...n, _expanded: n._expanded ?? true }));
  }

  // Set dropdowns to current assignment (read-only)
  ftsClientSel.value = tpl.asgn_client_id || '';
  refreshFtsFunnels();
  ftsFunnelSel.value = tpl.asgn_funnel_id || '';
  refreshFtsTasks();
  ftsTaskSel.value   = tpl.asgn_task_id   || '';

  ftsTemplateNameInput.value = tpl.name;
  renderFtsTree();
  renderPremiereTree();
  ftsPanelEl.hidden = false;
}

function renderFtsTree() {
  ftsTreeEl.innerHTML = '';
  const roots = ftsTree.filter(n => n.parent_id == null);
  roots.forEach(n => ftsTreeEl.appendChild(renderFtsNode(n, 0)));
}

function renderFtsNode(node, depth) {
  const wrap = document.createElement('div');

  // ── Slot node (asset-routing marker) ───────────────────────────────────────
  if (node.node_type === 'slot') {
    const meta = SLOT_META[node.slot_type] || { label: node.slot_type, icon: '📌', color: '#9A9DAC' };
    const row = document.createElement('div');
    row.className = 'ft-node ft-slot-node';
    row.style.paddingLeft = (8 + depth * 16) + 'px';
    const badge = document.createElement('span');
    badge.className = 'ft-slot-badge';
    badge.style.setProperty('--slot-color', meta.color);
    badge.textContent = `${meta.icon} ${meta.label}`;
    row.appendChild(badge);
    if (ftsEditMode) {
      const del = document.createElement('button');
      del.className = 'ft-node-btn ft-del-btn';
      del.textContent = '✕';
      del.title = `Remove ${meta.label} slot`;
      del.addEventListener('click', () => {
        ftsTree = ftsTree.filter(n => (n.tempId ?? n.id) !== (node.tempId ?? node.id));
        renderFtsTree();
      });
      row.appendChild(del);
    }
    wrap.appendChild(row);
    return wrap;
  }

  // ── Regular folder / asset node ────────────────────────────────────────────
  const row = document.createElement('div');
  row.className = 'ft-node' + (node.node_type === 'asset' ? ' ft-asset' : '');
  row.style.paddingLeft = (8 + depth * 16) + 'px';

  const children = ftsTree.filter(n => n.parent_id === (node.tempId ?? node.id));
  const toggle = document.createElement('span');
  toggle.className = 'ft-toggle';
  if (node.node_type === 'folder' && children.length > 0) {
    toggle.textContent = node._expanded ? '▾' : '▸';
    toggle.style.cursor = 'pointer';
    toggle.addEventListener('click', () => { node._expanded = !node._expanded; renderFtsTree(); });
  }

  const icon = document.createElement('span');
  icon.className = 'ft-icon';
  icon.textContent = node.node_type === 'asset' ? '📎' : '📁';

  const nameEl = document.createElement('span');
  nameEl.className = 'ft-name';
  nameEl.textContent = node.name;

  if (ftsEditMode && !node._locked) {
    nameEl.contentEditable = 'true';
    nameEl.addEventListener('blur', () => {
      const newName = nameEl.textContent.trim();
      if (newName && hasInvalidChars(newName)) { nameEl.textContent = node.name; nameEl.contentEditable = 'false'; return; }
      if (newName) node.name = newName;
    });
  }

  row.appendChild(toggle);
  row.appendChild(icon);
  row.appendChild(nameEl);

  if (node._locked) {
    const lbadge = document.createElement('span');
    lbadge.className = 'ft-lock-badge';
    lbadge.title = 'This folder is required in every template';
    row.appendChild(lbadge);
  }

  if (ftsEditMode) {
    const actions = document.createElement('div');
    actions.className = 'ft-node-actions';

    if (node.node_type === 'folder') {
      const addFolder = document.createElement('button');
      addFolder.className = 'ft-node-btn';
      addFolder.textContent = '+ Folder';
      addFolder.addEventListener('click', () => {
        const key = node.tempId ?? node.id;
        ftsTree.push({ tempId: Date.now(), id: null, parent_id: key, node_type: 'folder', name: 'New Folder', asset_path: null, slot_type: null, sort_order: ftsTree.length, _expanded: true });
        node._expanded = true;
        renderFtsTree();
      });
      actions.appendChild(addFolder);

      // + Asset button — adds a Video/Audio/Image routing slot under this folder
      const addAssetBtn = document.createElement('button');
      addAssetBtn.className = 'ft-node-btn ft-asset-slot-btn';
      addAssetBtn.textContent = '+ Asset';
      addAssetBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const picker = buildSlotPicker(usedFolderSlots(), (slotType) => {
          const key = node.tempId ?? node.id;
          ftsTree.push({ tempId: Date.now() + 1, id: null, parent_id: key, node_type: 'slot', name: SLOT_META[slotType].label, asset_path: null, slot_type: slotType, sort_order: ftsTree.length, _expanded: false });
          node._expanded = true;
          renderFtsTree();
        });
        addAssetBtn.parentElement.parentElement.appendChild(picker);
      });
      actions.appendChild(addAssetBtn);
    }

    if (!node._locked) {
      const del = document.createElement('button');
      del.className = 'ft-node-btn ft-del-btn';
      del.textContent = '✕';
      del.addEventListener('click', () => {
        const removeKeys = new Set();
        const collect = (key) => {
          removeKeys.add(key);
          ftsTree.filter(n => n.parent_id === key).forEach(c => collect(c.tempId ?? c.id));
        };
        collect(node.tempId ?? node.id);
        ftsTree = ftsTree.filter(n => !removeKeys.has(n.tempId ?? n.id));
        renderFtsTree();
      });
      actions.appendChild(del);
    }
    row.appendChild(actions);
  }

  wrap.appendChild(row);

  if (node._expanded) {
    if (node._locked) wrap.appendChild(renderLockedPrprojNode(depth + 1));
    children.forEach(child => wrap.appendChild(renderFtsNode(child, depth + 1)));
  }

  return wrap;
}

function renderLockedPrprojNode(depth) {
  const wrap = document.createElement('div');
  const row  = document.createElement('div');
  row.className = 'ft-node ft-asset ft-locked-file';
  row.style.paddingLeft = (8 + depth * 16) + 'px';

  const toggle = document.createElement('span');
  toggle.className = 'ft-toggle';

  const icon = document.createElement('span');
  icon.className = 'ft-icon';
  icon.textContent = '📄';

  const nameEl = document.createElement('span');
  nameEl.className = 'ft-name';
  nameEl.textContent = 'project.prproj';

  const badge = document.createElement('span');
  badge.className = 'ft-lock-badge';
  badge.title = 'Auto-generated when project is created';

  row.appendChild(toggle);
  row.appendChild(icon);
  row.appendChild(nameEl);
  row.appendChild(badge);
  wrap.appendChild(row);
  return wrap;
}

function renderPremiereTree() {
  ftsPremiereTreeEl.innerHTML = '';
  const renderNodes = (parentId, depth) => {
    ftsPremiere
      .filter(n => n.parent_id === parentId)
      .sort((a, b) => a.sort_order - b.sort_order)
      .forEach(node => {
        ftsPremiereTreeEl.appendChild(renderPremiereNode(node, depth));
        if (node.type === 'bin' && node._expanded) renderNodes(node.tempId, depth + 1);
      });
  };
  renderNodes(null, 0);
  if (!ftsPremiere.length) {
    ftsPremiereTreeEl.innerHTML = '<div class="db-empty" style="font-size:12px;padding:6px 4px;">No bins yet</div>';
  }
  premiereAddBinCard.hidden = !ftsEditMode;
}

function renderPremiereNode(node, depth) {
  // ── Import node (library asset attached to a bin) ─────────────────────────
  if (node.type === 'import') {
    const row = document.createElement('div');
    row.className = 'ft-node ft-premiere-import';
    row.style.paddingLeft = (6 + depth * 16) + 'px';
    row.dataset.nodeId = node.tempId;

    const toggle = document.createElement('span');
    toggle.className = 'ft-toggle';

    const icon = document.createElement('span');
    icon.className = 'ft-icon';
    icon.textContent = '📂';

    const nameEl = document.createElement('span');
    nameEl.className = 'ft-name';
    nameEl.textContent = node.name;

    const pathEl = document.createElement('span');
    pathEl.className = 'premiere-import-path';
    pathEl.textContent = node.file_path ? node.file_path.split(/[\\/]/).pop() : '';
    pathEl.title = node.file_path || '';

    row.appendChild(toggle);
    row.appendChild(icon);
    row.appendChild(nameEl);
    row.appendChild(pathEl);

    if (ftsEditMode) {
      const actions = document.createElement('div');
      actions.className = 'ft-node-actions';
      const del = document.createElement('button');
      del.className = 'ft-node-btn ft-del-btn';
      del.textContent = '✕';
      del.addEventListener('click', () => {
        ftsPremiere = ftsPremiere.filter(n => n.tempId !== node.tempId);
        renderPremiereTree();
      });
      actions.appendChild(del);
      row.appendChild(actions);
    }
    return row;
  }
  // ─────────────────────────────────────────────────────────────────────────

  const isBin = node.type === 'bin';
  const row = document.createElement('div');
  row.className = 'ft-node' + (isBin ? '' : ' ft-asset');
  row.style.paddingLeft = (6 + depth * 16) + 'px';
  row.dataset.nodeId = node.tempId;

  const toggle = document.createElement('span');
  toggle.className = 'ft-toggle';
  if (isBin && ftsPremiere.some(n => n.parent_id === node.tempId)) {
    toggle.textContent = node._expanded ? '▾' : '▸';
    toggle.style.cursor = 'pointer';
    toggle.addEventListener('click', () => { node._expanded = !node._expanded; renderPremiereTree(); });
  }

  const icon = document.createElement('span');
  icon.className = 'ft-icon';
  icon.textContent = isBin ? '🗂' : '🎞';

  const nameEl = document.createElement('span');
  nameEl.className = 'ft-name';
  nameEl.textContent = node.name;
  if (ftsEditMode) {
    nameEl.contentEditable = 'true';
    nameEl.addEventListener('blur', () => {
      const v = nameEl.textContent.trim();
      if (v) node.name = v; else nameEl.textContent = node.name;
    });
    nameEl.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); nameEl.blur(); } });
  }

  row.appendChild(toggle);
  row.appendChild(icon);
  row.appendChild(nameEl);

  // Show slot badge if this bin has an asset-routing slot assigned
  if (isBin && node.slotType && SLOT_META[node.slotType]) {
    const meta = SLOT_META[node.slotType];
    const slotBadge = document.createElement('span');
    slotBadge.className = 'ft-slot-badge ft-slot-badge--inline';
    slotBadge.style.setProperty('--slot-color', meta.color);
    slotBadge.textContent = `${meta.icon} ${meta.label}`;
    row.appendChild(slotBadge);
  }

  if (!isBin) {
    const badge = document.createElement('span');
    badge.className = 'premiere-seq-badge';
    badge.textContent = `${node.width}×${node.height} · ${node.fps}fps`;
    row.appendChild(badge);
  }

  if (ftsEditMode) {
    const actions = document.createElement('div');
    actions.className = 'ft-node-actions';
    if (isBin) {
      const addBinBtn = document.createElement('button');
      addBinBtn.className = 'ft-node-btn';
      addBinBtn.textContent = '+ Bin';
      addBinBtn.addEventListener('click', () => addPremiereBin(node.tempId));

      const addSeqBtn = document.createElement('button');
      addSeqBtn.className = 'ft-node-btn';
      addSeqBtn.textContent = '+ Seq';
      addSeqBtn.addEventListener('click', () => openSeqModal(node.tempId));

      // + Asset button — tags this bin as the destination for a media type
      const addAssetBtn = document.createElement('button');
      addAssetBtn.className = 'ft-node-btn ft-asset-slot-btn';
      addAssetBtn.textContent = node.slotType ? `${SLOT_META[node.slotType]?.icon} ${SLOT_META[node.slotType]?.label}` : '+ Asset';
      addAssetBtn.title = node.slotType ? 'Click to remove slot' : 'Tag this bin as Video / Audio / Image destination';
      addAssetBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (node.slotType) {
          // Toggle off — remove slot assignment
          node.slotType = null;
          renderPremiereTree();
          return;
        }
        const picker = buildSlotPicker(usedBinSlots(), (slotType) => {
          node.slotType = slotType;
          renderPremiereTree();
        });
        addAssetBtn.parentElement.parentElement.appendChild(picker);
      });

      // + Import button — attaches a DB library asset/folder to auto-import into this bin
      const addImportBtn = document.createElement('button');
      addImportBtn.className = 'ft-node-btn ft-import-btn';
      addImportBtn.textContent = '+ Import';
      addImportBtn.title = 'Attach a library asset — auto-imported into this bin at project open';
      addImportBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const existing = addImportBtn.parentElement.parentElement.querySelector('.asset-import-picker');
        if (existing) { existing.remove(); return; }
        const picker = await buildAssetPicker((asset) => {
          ftsPremiere.push({
            tempId:    Date.now(),
            type:      'import',
            name:      asset.name,
            file_path: asset.file_path,
            asset_id:  asset.id,
            parent_id: node.tempId,
            sort_order: ftsPremiere.filter(n => n.parent_id === node.tempId).length
          });
          node._expanded = true;
          renderPremiereTree();
        });
        addImportBtn.parentElement.parentElement.appendChild(picker);
      });

      actions.appendChild(addBinBtn);
      actions.appendChild(addSeqBtn);
      actions.appendChild(addAssetBtn);
      actions.appendChild(addImportBtn);
    }
    const del = document.createElement('button');
    del.className = 'ft-node-btn ft-del-btn';
    del.textContent = '✕';
    del.addEventListener('click', () => {
      const toRemove = new Set();
      const collect = (id) => {
        toRemove.add(id);
        ftsPremiere.filter(n => n.parent_id === id).forEach(c => collect(c.tempId));
      };
      collect(node.tempId);
      ftsPremiere = ftsPremiere.filter(n => !toRemove.has(n.tempId));
      renderPremiereTree();
    });
    actions.appendChild(del);
    row.appendChild(actions);
  }

  return row;
}

function addPremiereBin(parentId) {
  const newNode = {
    tempId: Date.now(),
    name: 'New Bin',
    type: 'bin',
    parent_id: parentId,
    sort_order: ftsPremiere.filter(n => n.parent_id === parentId).length,
    _expanded: true
  };
  ftsPremiere.push(newNode);
  if (parentId !== null) {
    const parent = ftsPremiere.find(n => n.tempId === parentId);
    if (parent) parent._expanded = true;
  }
  renderPremiereTree();
  requestAnimationFrame(() => {
    const nameEl = ftsPremiereTreeEl.querySelector(`[data-node-id="${newNode.tempId}"] .ft-name`);
    if (nameEl) {
      const range = document.createRange();
      range.selectNodeContents(nameEl);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      nameEl.focus();
    }
  });
}

function openSeqModal(parentId) {
  seqModalParentId = parentId;
  seqModalNameEl.value = '';
  // Reset dimension tiles to default (Landscape)
  document.querySelectorAll('.dim-tile').forEach(t => t.classList.remove('selected'));
  const defaultTile = document.querySelector('.dim-tile[data-value="1920x1080"]');
  if (defaultTile) defaultTile.classList.add('selected');
  if (seqModalDimsEl) seqModalDimsEl.value = '1920x1080';
  if (seqModalFpsEl) seqModalFpsEl.value = '25';
  seqModalOverlay.hidden = false;
  requestAnimationFrame(() => seqModalNameEl.focus());
}

function closeSeqModal() {
  seqModalOverlay.hidden = true;
  seqModalParentId = null;
}

function confirmAddSequence() {
  const name = seqModalNameEl.value.trim();
  if (!name) { seqModalNameEl.focus(); return; }
  const [w, h] = seqModalDimsEl.value.split('x').map(Number);
  const fps = parseFloat(seqModalFpsEl.value);
  ftsPremiere.push({
    tempId: Date.now(),
    name,
    type: 'sequence',
    parent_id: seqModalParentId,
    sort_order: ftsPremiere.filter(n => n.parent_id === seqModalParentId).length,
    width: w,
    height: h,
    fps
  });
  if (seqModalParentId !== null) {
    const parent = ftsPremiere.find(n => n.tempId === seqModalParentId);
    if (parent) parent._expanded = true;
  }
  renderPremiereTree();
  closeSeqModal();
}

function enterFtsEditMode() {
  ftsEditMode = true;
  ftsTreeEl.classList.remove('fts-tree-view');
  ftsTemplateNameInput.disabled = false;
  ftsClientSel.disabled = false;
  ftsFunnelSel.disabled = false;
  ftsTaskSel.disabled   = false;
  ftsAddRootRow.hidden  = false;
  ftsBtnEdit.textContent = 'Cancel';
  ftsBtnNew.textContent  = 'Save';
  renderFtsTree();
  renderPremiereTree();
}

async function exitFtsEditMode(cancelled) {
  ftsEditMode = false;
  ftsTreeEl.classList.add('fts-tree-view');
  ftsTemplateNameInput.disabled = true;
  ftsClientSel.disabled = true;
  ftsFunnelSel.disabled = true;
  ftsTaskSel.disabled   = true;
  ftsAddRootRow.hidden  = true;
  ftsBtnEdit.textContent = 'Edit';
  ftsBtnNew.textContent  = 'New';
  if (cancelled && ftsActiveId) await selectFtsTemplate(ftsActiveId);
  else { renderFtsTree(); renderPremiereTree(); }
}

async function saveFtsTemplate() {
  if (!ftsActiveId) return;

  const tplRec    = ftsTemplates.find(t => t.id === ftsActiveId);
  const name      = ftsTemplateNameInput.value.trim() || tplRec?.name || 'Template';
  const prproj    = tplRec?.prproj_path || null;
  const openMode  = tplRec?.open_mode || 'copy_to_new';
  const clientId  = parseInt(ftsClientSel.value)  || null;
  const funnelId  = parseInt(ftsFunnelSel.value)  || null;
  const taskId    = parseInt(ftsTaskSel.value)    || null;

  const assignments = await window.api.ft.getAssignments(ftsActiveId);
  const isShared    = assignments.length > 1;

  let targetId = ftsActiveId;

  if (isShared) {
    const choice = confirm(
      `This template is used by ${assignments.length} Client/Funnel/Task pairs.\n\n` +
      `OK = Overwrite (updates all pairs)\nCancel = Save as New (only for this pair)`
    );
    if (!choice) {
      const cloned = await window.api.ft.clone(ftsActiveId);
      targetId = cloned.id;
    }
  }

  await window.api.ft.update(targetId, name, prproj, openMode, ftsPremiere, []);
  await window.api.ft.setNodes(targetId, ftsTree);
  // Clear old assignment on targetId then set the new one
  const existing = await window.api.ft.getAssignments(targetId);
  for (const a of existing) {
    await window.api.ft.unassign(targetId, a.client_id, a.funnel_id, a.task_id);
  }
  if (clientId || funnelId || taskId) {
    await window.api.ft.assign(targetId, clientId, funnelId, taskId);
  }

  ftsActiveId = targetId;
  await loadFtsTemplates();
  await exitFtsEditMode(false);
}

function switchFtsTab(tab) {
  // tab: 'folder' | 'premiere'
  ftsTabBtnFolder.classList.toggle('active',   tab === 'folder');
  ftsTabBtnPremiere.classList.toggle('active', tab === 'premiere');
  ftsTabPanelFolder.hidden   = (tab !== 'folder');
  ftsTabPanelPremiere.hidden = (tab !== 'premiere');
}

function bindFtsEvents() {
  ftsTabBtnFolder.addEventListener('click',   () => switchFtsTab('folder'));
  ftsTabBtnPremiere.addEventListener('click', () => switchFtsTab('premiere'));

  ftsBtnEdit.addEventListener('click', () => {
    if (ftsEditMode) exitFtsEditMode(true);
    else if (ftsActiveId) enterFtsEditMode();
  });

  ftsBtnNew.addEventListener('click', async () => {
    if (ftsEditMode) {
      await saveFtsTemplate();
    } else if (ftsActiveId) {
      const cloned = await window.api.ft.clone(ftsActiveId);
      ftsActiveId = cloned.id;
      await loadFtsTemplates();
      await selectFtsTemplate(ftsActiveId);
      enterFtsEditMode();
    }
  });

  ftsBtnCreateNew.addEventListener('click', async () => {
    const result = await window.api.ft.create('New Template', null, 'copy_to_new', [], []);
    ftsActiveId = result.lastInsertRowid;
    await loadFtsTemplates();
    await selectFtsTemplate(ftsActiveId);
    enterFtsEditMode();
  });

  ftsClientSel.addEventListener('change', refreshFtsFunnels);
  ftsFunnelSel.addEventListener('change', refreshFtsTasks);

  ftsFilterClient.addEventListener('change', () => { refreshFtsFilterFunnels(); renderFtsList(); });
  ftsFilterFunnel.addEventListener('change', () => { refreshFtsFilterTasks();   renderFtsList(); });
  ftsFilterTask.addEventListener('change',   () => renderFtsList());

  ftsBtnAddRoot.addEventListener('click', () => {
    const name = ftsNewRootName.value.trim();
    if (!name) return;
    if (hasInvalidChars(name)) {
      ftsNewRootName.classList.add('input-invalid');
      return;
    }
    ftsNewRootName.classList.remove('input-invalid');
    ftsTree.push({ tempId: Date.now(), id: null, parent_id: null, node_type: 'folder', name, asset_path: null, sort_order: ftsTree.length, _expanded: true });
    ftsNewRootName.value = '';
    renderFtsTree();
  });
  ftsNewRootName.addEventListener('input', () => {
    if (!hasInvalidChars(ftsNewRootName.value)) ftsNewRootName.classList.remove('input-invalid');
  });
  ftsNewRootName.addEventListener('keypress', e => {
    if (e.key === 'Enter') { e.preventDefault(); ftsBtnAddRoot.click(); }
  });

  // Ghost add-bin card
  premiereAddBinCard.addEventListener('click', () => { if (ftsEditMode) addPremiereBin(null); });

  // Sequence modal
  seqModalAddBtn.addEventListener('click', confirmAddSequence);
  seqModalCancelBtn.addEventListener('click', closeSeqModal);
  seqModalCloseBtn.addEventListener('click', closeSeqModal);
  seqModalOverlay.addEventListener('click', e => { if (e.target === seqModalOverlay) closeSeqModal(); });

  // Dimension tile selection
  document.querySelectorAll('.dim-tile').forEach(tile => {
    tile.addEventListener('click', () => {
      document.querySelectorAll('.dim-tile').forEach(t => t.classList.remove('selected'));
      tile.classList.add('selected');
      if (seqModalDimsEl) seqModalDimsEl.value = tile.dataset.value;
    });
  });
  seqModalNameEl.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); confirmAddSequence(); } });
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function showStatusMessage(message, type) {
  saveStatus.textContent = message;
  saveStatus.className = `status-msg ${type}`;
  setTimeout(() => { saveStatus.className = 'status-msg'; }, 3000);
}
