// ── Builder ───────────────────────────────────────────────────────────────────

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

// Per-pair Project Name memory (localStorage)
function _projectMemoryKey() {
  const c = parseInt(selectClient.value) || 0;
  const f = parseInt(selectFunnel.value) || 0;
  if (!c || !f) return null;
  return 'lastProject:' + c + ':' + f;
}
function loadProjectMemory() {
  const key = _projectMemoryKey();
  if (!key) return;
  try {
    const v = localStorage.getItem(key);
    if (v != null && !inputProject.value.trim()) {
      inputProject.value = v;
    }
  } catch (_) { /* localStorage disabled */ }
}
function saveProjectMemory(value) {
  const key = _projectMemoryKey();
  if (!key || !value) return;
  try { localStorage.setItem(key, value); } catch (_) { /* non-fatal */ }
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
    loadProjectMemory();
    updatePreviews();
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
    loadProjectMemory();
    updatePreviews();
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

  // Clickable date/time tokens — insert at cursor position in Project Name
  const tokenHint = document.getElementById('project-token-hint');
  if (tokenHint) {
    tokenHint.addEventListener('click', (e) => {
      const btn = e.target.closest('.token-chip');
      if (!btn) return;
      e.preventDefault();
      const token = btn.dataset.token;
      const start = inputProject.selectionStart ?? inputProject.value.length;
      const end   = inputProject.selectionEnd   ?? inputProject.value.length;
      inputProject.setRangeText(token, start, end, 'end');
      inputProject.focus();
      inputProject.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

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
        saveProjectMemory(projectVal);
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

function focusClientDropdown() {
  // Switch to Builder tab if user was elsewhere, then focus client.
  switchToTab('tab-builder');
  // setTimeout lets the tab become visible before focus is taken.
  setTimeout(() => selectClient.focus(), 0);
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

  const fileParts = [clientName, funnelName];
  if (taskName) fileParts.push(taskName);
  fileParts.push(projectVal);
  const projectFileName = `${fileParts.join(' - ')}_v01.prproj`;

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
