// ── Database Tab ──────────────────────────────────────────────────────────────

// Allow dragging a file or folder onto a readonly path input to fill it in.
// Uses the resolvedPath that preload sets on dropped files via webUtils.getPathForFile.
function bindPathInputDrop(inputEl, opts) {
  if (!inputEl) return;
  inputEl.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    inputEl.classList.add('drag-hover');
  });
  inputEl.addEventListener('dragleave', (e) => {
    e.stopPropagation();
    inputEl.classList.remove('drag-hover');
  });
  inputEl.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    inputEl.classList.remove('drag-hover');
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (!file) return;
    // preload uses webUtils.getPathForFile, but for INPUT drops we need to call the same.
    // window.api doesn't expose it; rely on File.path (Electron extension, available pre-30 but removed in 32+).
    // Use webUtils via a small global helper exposed at startup — see preload.js.
    const p = (window.api.resolveDroppedPath ? window.api.resolveDroppedPath(file) : file.path) || '';
    if (!p) return;
    inputEl.value = p;
    if (opts && typeof opts.onSet === 'function') opts.onSet(p);
  });
}

function bindDatabaseEvents() {
  // Clients
  btnDbAddClient.addEventListener('click', async () => {
    const name = dbNewClientName.value.trim();
    const initials = dbNewClientInitials.value.trim().toUpperCase();
    if (!name || !initials) return;
    window.api.log('database', `Adding Client: ${name} (${initials})`);
    await window.api.db.addClient(name, initials);
    dbNewClientName.value = '';
    dbNewClientInitials.value = '';
    await refreshDatabaseTab();
    await loadBuilderDropdowns();
    if (typeof populateFtsDropdowns === 'function') populateFtsDropdowns();
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
      window.api.log('database', `Funnel conflict detected: ${name} for Client ID ${clientId}`);
      alert(`A funnel "${name}" already exists at this scope.`);
      return;
    }
    window.api.log('database', `Adding Funnel: ${name} (${initials}) for Client ID ${clientId}`);
    await window.api.db.addFunnel(clientId, name, initials);
    dbNewFunnelName.value = '';
    dbNewFunnelInitials.value = '';
    await refreshFunnelsList();
    await refreshAssetsFunnelDropdown();
    await loadBuilderDropdowns();
    if (typeof populateFtsDropdowns === 'function') populateFtsDropdowns();
  });

  // Tasks
  btnDbAddTask.addEventListener('click', async () => {
    const name = dbNewTaskName.value.trim();
    const initials = dbNewTaskInitials.value.trim().toUpperCase();
    if (!name) return;
    if (await window.api.db.taskConflict(name, null)) {
      window.api.log('database', `Task conflict detected: ${name}`);
      alert(`A task "${name}" already exists.`);
      return;
    }
    window.api.log('database', `Adding Task: ${name} (${initials})`);
    await window.api.db.addTask(name, initials);
    dbNewTaskName.value = '';
    dbNewTaskInitials.value = '';
    await refreshTasksList();
    await loadBuilderDropdowns();
    if (typeof populateFtsDropdowns === 'function') populateFtsDropdowns();
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

  // Drag-and-drop a file or folder onto path inputs to fill them in
  bindPathInputDrop(dbNewAssetPath, {
    onSet: (p) => {
      if (!dbNewAssetName.value.trim()) {
        dbNewAssetName.value = p.split(/[\\/]/).pop().replace(/\.[^.]+$/, '');
      }
    }
  });
  btnDbAddAsset.addEventListener('click', async () => {
    const name     = dbNewAssetName.value.trim();
    const filePath = dbNewAssetPath.value.trim();
    const clientId = parseInt(dbAssetClientSel.value) || null;
    const funnelId = parseInt(dbAssetFunnelSel.value) || null;
    if (!name || !filePath) return;
    await window.api.db.addAsset(clientId, funnelId, name, filePath, 'other', '');
    dbNewAssetName.value = '';
    dbNewAssetPath.value = '';
    await refreshAssetsList();
  });

  // Refresh DB tab when switched to
  document.querySelector('[data-tab="tab-database"]').addEventListener('click', () => {
    refreshDatabaseTab();
  });
}

async function refreshDatabaseTab() {
  const clients = await window.api.db.getClients();
  dbClients = clients;

  renderClientsList(clients);
  populateClientSelect(dbFunnelClientSelect, clients, 'Global (no client)');
  populateClientSelect(dbAssetClientSel, clients, 'Global (no client)');

  await refreshFunnelsList();
  await refreshTasksList();
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

async function refreshAssetsList() {
  const assets = await window.api.db.getAssets();
  renderAssetsList(assets);
}

// ── Render helpers ────────────────────────────────────────────────────────────

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
  // Group funnels by lowercase name so the same funnel saved for multiple
  // clients renders as a single card with one tag per client.
  const groups = new Map();
  funnels.forEach(f => {
    const key = (f.name || '').toLowerCase();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(f);
  });
  for (const rows of groups.values()) {
    dbFunnelsList.appendChild(makeFunnelGroupRow(rows));
  }
}

function makeFunnelGroupRow(rows) {
  const primary = rows[0];
  const row = document.createElement('div');
  row.className = 'db-list-item';
  row.dataset.editable = '1';
  row.title = 'Double-click to rename · click a client tag × to remove that scope';

  // Initials chip (uses primary; multiple distinct initials shown as "A · B")
  const distinctInitials = Array.from(new Set(rows.map(r => r.initials).filter(Boolean)));
  const initialsLabel = distinctInitials.length ? distinctInitials.join(' · ') : '—';

  // One scope chip per row, each removable independently
  const scopeChips = rows.map(f =>
    `<span class="db-scope-badge funnel-scope-chip" data-funnel-id="${f.id}">${escapeHtml(f.client_name || 'Global')}<button class="funnel-scope-x" title="Remove this scope" data-funnel-id="${f.id}">×</button></span>`
  ).join('');

  row.innerHTML = `
    <span class="db-item-name">${escapeHtml(primary.name)}</span>
    <span class="db-scope-badge db-scope-badge--cat">${escapeHtml(initialsLabel)}</span>
    ${scopeChips}
    <button class="btn-db-delete" title="Delete funnel (all scopes)">
      <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2" fill="none"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
    </button>`;

  // Per-scope removal: deletes only that one underlying funnel row
  row.querySelectorAll('.funnel-scope-x').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = parseInt(btn.dataset.funnelId);
      const target = rows.find(r => r.id === id);
      if (!target) return;
      const scopeLabel = target.client_name || 'Global';
      if (!confirm(`Remove "${primary.name}" from ${scopeLabel}?`)) return;
      await window.api.db.deleteFunnel(id);
      await refreshFunnelsList();
      await loadBuilderDropdowns();
    });
  });

  // Whole-group delete: deletes every row sharing this name
  row.querySelector('.btn-db-delete').addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!confirm(`Delete funnel "${primary.name}" from all ${rows.length} scope(s)?`)) return;
    for (const r of rows) await window.api.db.deleteFunnel(r.id);
    await refreshFunnelsList();
    await loadBuilderDropdowns();
  });

  // Dblclick to rename all rows in the group at once
  row.addEventListener('dblclick', () => enterFunnelGroupEdit(row, rows));
  return row;
}

function enterFunnelGroupEdit(row, rows) {
  const primary = rows[0];
  row.classList.add('editing');
  row.removeAttribute('data-editable');
  row.innerHTML = `
    <input type="text" class="ed-name" value="${escapeAttr(primary.name)}" placeholder="Funnel name" style="flex:1.5">
    <input type="text" class="ed-initials" value="${escapeAttr(primary.initials || '')}" placeholder="Initials" maxlength="6" style="max-width:80px">
    <button class="btn-edit-save">Save</button>
    <button class="btn-edit-cancel">Cancel</button>
    <span class="manage-empty" style="font-size:10px">Applies to all ${rows.length} scope(s)</span>
    <div class="db-edit-error" style="display:none"></div>`;
  const nameIn = row.querySelector('.ed-name');
  const iniIn  = row.querySelector('.ed-initials');
  const errBox = row.querySelector('.db-edit-error');
  nameIn.focus(); nameIn.select();

  row.querySelector('.btn-edit-save').addEventListener('click', async () => {
    const newName = nameIn.value.trim();
    const newIni  = iniIn.value.trim().toUpperCase();
    if (!newName) { showErr(errBox, 'Name required.'); return; }
    for (const r of rows) {
      await window.api.db.updateFunnel(r.id, r.client_id, newName, newIni);
    }
    await refreshFunnelsList();
    await loadBuilderDropdowns();
  });

  row.querySelector('.btn-edit-cancel').addEventListener('click', () => {
    refreshFunnelsList();
  });

  row.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') row.querySelector('.btn-edit-save').click();
    if (e.key === 'Escape') row.querySelector('.btn-edit-cancel').click();
  });
}

// Kept for backwards compat — used by old callers (none currently after F-UI-023)
function makeFunnelRow(f) { return makeFunnelGroupRow([f]); }

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

function renderAssetsList(assets) {
  dbAssetsList.innerHTML = '';
  if (!assets.length) {
    dbAssetsList.innerHTML = '<div class="db-empty">No preset assets yet</div>';
    return;
  }
  assets.forEach(a => dbAssetsList.appendChild(makeAssetRow(a)));
}

function makeAssetRow(a) {
  const scope = a.funnel_name
    ? `${a.client_name} / ${a.funnel_name}`
    : a.client_name
      ? a.client_name
      : 'Global';
  const fileName = a.file_path.split(/[\\/]/).pop();
  const row = document.createElement('div');
  row.className = 'db-list-item';
  row.dataset.editable = '1';
  row.title = 'Double-click to edit';
  row.innerHTML = `
    <span class="db-item-name">${escapeHtml(a.name)}</span>
    <span class="db-item-file" title="${escapeAttr(a.file_path)}">${escapeHtml(fileName)}</span>
    <span class="db-scope-badge">${escapeHtml(scope)}</span>
    <button class="btn-db-delete" data-id="${a.id}" title="Delete asset">
      <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2" fill="none"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
    </button>`;
  row.querySelector('.btn-db-delete').addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!confirm(`Delete asset "${a.name}"?`)) return;
    await window.api.db.deleteAsset(a.id);
    await refreshAssetsList();
  });
  row.addEventListener('dblclick', () => enterAssetEdit(row, a));
  return row;
}

function enterAssetEdit(row, a) {
  row.classList.add('editing');
  row.removeAttribute('data-editable');
  row.title = '';
  row.innerHTML = `
    <input type="text" class="ed-name" value="${escapeAttr(a.name)}" placeholder="Asset name" style="flex:1">
    <input type="text" class="ed-path" value="${escapeAttr(a.file_path)}" placeholder="File path" style="flex:2">
    <button class="btn-secondary btn-sm ed-browse">Browse</button>
    <button class="btn-edit-save">Save</button>
    <button class="btn-edit-cancel">Cancel</button>
    <div class="db-edit-error" style="display:none"></div>`;

  const nameIn = row.querySelector('.ed-name');
  const pathIn = row.querySelector('.ed-path');
  const errBox = row.querySelector('.db-edit-error');
  nameIn.focus(); nameIn.select();

  // Allow drag-drop on the path input during edit
  bindPathInputDrop(pathIn);

  row.querySelector('.ed-browse').addEventListener('click', async () => {
    const selected = await window.api.ft.selectAsset();
    if (selected) pathIn.value = selected;
  });

  row.querySelector('.btn-edit-save').addEventListener('click', async () => {
    const newName = nameIn.value.trim();
    const newPath = pathIn.value.trim();
    if (!newName || !newPath) { showErr(errBox, 'Name and path required.'); return; }
    await window.api.db.updateAsset(a.id, newName, newPath, a.client_id, a.funnel_id);
    await refreshAssetsList();
  });

  row.querySelector('.btn-edit-cancel').addEventListener('click', () => {
    row.replaceWith(makeAssetRow(a));
  });

  row.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') row.querySelector('.btn-edit-save').click();
    if (e.key === 'Escape') row.querySelector('.btn-edit-cancel').click();
  });
}
