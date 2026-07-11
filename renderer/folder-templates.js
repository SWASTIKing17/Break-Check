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

// BUG-10: Premiere tree tempIds — prefix + counter avoids millisecond collisions on rapid clicks
let _ptidCounter = 0;
function ftNextPremiereTempId() {
  return 'p_' + Date.now() + '_' + (++_ptidCounter);
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
    const conflict = ftTemplates.find(t =>
      t.id !== ftActiveId &&
      t.asgn_client_id == clientId &&
      t.asgn_funnel_id == funnelId &&
      (t.asgn_task_id == null)
    );
    if (conflict) {
      const currentName = ftTemplates.find(t => t.id === ftActiveId)?.name || 'this template';
      const ok = confirm(
        `"${conflict.name}" is already assigned to this Client / Funnel.\n\nReplace it with "${currentName}"?`
      );
      if (!ok) return;
    }
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

    if (t.template_type === 'file' && t.prproj_path) {
      const pathChip = document.createElement('span');
      pathChip.className = 'fts-list-item-path';
      pathChip.textContent = t.prproj_path.split(/[\\/]/).pop();
      pathChip.title = t.prproj_path;
      item.appendChild(pathChip);
    }

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
  // BUG-09: JSON.parse can throw on corrupted DB data — default to [] and warn
  let rawBinsData;
  try { rawBinsData = JSON.parse(tpl.bins_json || '[]'); } catch (_) {
    rawBinsData = [];
    console.warn('[freeXan] Template bins_json is corrupted — resetting to empty');
  }
  if (rawBinsData.length > 0 && typeof rawBinsData[0] === 'string') {
    // Migrate old flat string format → bin nodes
    let tid = 1;
    ftsPremiere = rawBinsData.map((name, i) => ({ tempId: tid++, name, type: 'bin', parent_id: null, sort_order: i, _expanded: true }));
    let rawSeqs;
    try { rawSeqs = JSON.parse(tpl.sequences_json || '[]'); } catch (_) { rawSeqs = []; }
    rawSeqs.forEach((name, i) => {
      ftsPremiere.push({ tempId: tid++, name, type: 'sequence', parent_id: null, sort_order: i, width: 1920, height: 1080, fps: 25 });
    });
  } else {
    ftsPremiere = rawBinsData.map(n => {
      const node = { ...n, _expanded: n._expanded ?? true };
      if (node.slotType && !node.slotTypes) {
        node.slotTypes = [node.slotType];
        delete node.slotType;
      }
      return node;
    });
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
  // Show/hide prproj section and Premiere tab based on template type
  const isFileTpl = tpl.template_type === 'file';
  if (ftsPrprojSection) ftsPrprojSection.hidden = !isFileTpl;
  if (isFileTpl) {
    if (ftsPrprojInput) ftsPrprojInput.value = tpl.prproj_path || '';
    const mode = tpl.open_mode || 'copy_to_new';
    document.querySelectorAll('#fts-openmode-toggle .fts-toggle-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.value === mode);
    });
    if (ftsTabBtnPremiere) { ftsTabBtnPremiere.disabled = true; ftsTabBtnPremiere.title = 'Not available for file-based templates'; }
    switchFtsTab('folder');
  } else {
    if (ftsTabBtnPremiere) { ftsTabBtnPremiere.disabled = false; ftsTabBtnPremiere.title = ''; }
  }
}

function renderFtsTree() {
  _closePicker(); // BUG-11: clean up stale picker listener before re-render
  closeShortcutPopover();
  ftsTreeEl.innerHTML = '';
  const roots = ftsTree.filter(n => n.parent_id == null);
  roots.forEach(n => ftsTreeEl.appendChild(renderFtsNode(n, 0)));
}

// ── Shortcut popover (tactile keycap picker for the link-shortcut field) ──
function closeShortcutPopover() {
  const existing = document.getElementById('ft-shortcut-pop');
  if (!existing) return;
  if (typeof existing._cleanup === 'function') existing._cleanup();
  existing.remove();
}

function openShortcutPopover(triggerEl, node, takenKeys) {
  closeShortcutPopover();

  const pop = document.createElement('div');
  pop.id = 'ft-shortcut-pop';
  pop.className = 'ft-shortcut-pop';

  // "None" — clears the assignment
  const none = document.createElement('button');
  none.type = 'button';
  none.className = 'ft-shortcut-none' + (!node.link_shortcut ? ' active' : '');
  none.textContent = 'No key';
  none.addEventListener('click', () => {
    node.link_shortcut = null;
    closeShortcutPopover();
    renderFtsTree();
  });
  pop.appendChild(none);

  // 2×4 keycap grid (1–8). 9 & 0 are reserved for future use.
  const grid = document.createElement('div');
  grid.className = 'ft-shortcut-grid';
  for (let k = 1; k <= 8; k++) {
    const key = document.createElement('button');
    key.type = 'button';
    const ks = String(k);
    const isCurrent = String(node.link_shortcut) === ks;
    const taken = takenKeys.has(ks) && !isCurrent;
    key.className = 'ft-shortcut-key' + (isCurrent ? ' active' : '') + (taken ? ' taken' : '');
    key.textContent = ks;
    if (taken) {
      key.disabled = true;
      key.title = `Key ${k} is already used by another folder`;
    } else {
      key.addEventListener('click', () => {
        node.link_shortcut = ks;
        closeShortcutPopover();
        renderFtsTree();
      });
    }
    grid.appendChild(key);
  }
  pop.appendChild(grid);

  // Position fixed near the trigger; flip if overflowing the viewport
  document.body.appendChild(pop);
  const r = triggerEl.getBoundingClientRect();
  const popH = pop.offsetHeight;
  const popW = pop.offsetWidth;
  let top  = r.bottom + 6;
  let left = r.left;
  if (top + popH > window.innerHeight - 8) top = Math.max(8, r.top - popH - 6);
  if (left + popW > window.innerWidth - 8) left = Math.max(8, window.innerWidth - popW - 8);
  pop.style.top  = top  + 'px';
  pop.style.left = left + 'px';

  // Keyboard: 1–9 to assign, Backspace/Delete to clear, Escape to close
  const onKey = (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      closeShortcutPopover();
    } else if (/^[1-8]$/.test(e.key)) {
      const isCurrent = String(node.link_shortcut) === e.key;
      if (!takenKeys.has(e.key) || isCurrent) {
        node.link_shortcut = e.key;
        closeShortcutPopover();
        renderFtsTree();
      }
    } else if (e.key === 'Backspace' || e.key === 'Delete') {
      node.link_shortcut = null;
      closeShortcutPopover();
      renderFtsTree();
    }
  };
  const onClickOutside = (e) => {
    if (!pop.contains(e.target) && e.target !== triggerEl) closeShortcutPopover();
  };
  document.addEventListener('keydown', onKey);
  // Defer click-outside binding by one tick so the opening click doesn't close it.
  setTimeout(() => document.addEventListener('click', onClickOutside, true), 0);
  pop._cleanup = () => {
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('click', onClickOutside, true);
  };
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
        const deletedParentId = node.parent_id; // BUG-14: capture before filter
        ftsTree = ftsTree.filter(n => (n.tempId ?? n.id) !== (node.tempId ?? node.id));
        let idx = 0; // BUG-14: re-index siblings after deletion
        ftsTree.filter(n => n.parent_id === deletedParentId).forEach(n => n.sort_order = idx++);
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

  // Link toggle: appears only when this folder's name matches a Premiere bin name.
  // When enabled, freeXan watches the disk folder and auto-imports new files into the matching bin.
  if (node.node_type === 'folder') {
    const folderName = (node.name || '').trim().toLowerCase();
    const hasMatchingBin = folderName && ftsPremiere.some(n => n.type === 'bin' && String(n.name).trim().toLowerCase() === folderName);
    if (hasMatchingBin) {
      const linkBtn = document.createElement('button');
      const isLinked = !!node.link_enabled;
      linkBtn.className = 'ft-link-toggle' + (isLinked ? ' linked' : '');
      linkBtn.textContent = isLinked ? '🔗' : '⛓️‍💥';
      linkBtn.title = isLinked
        ? `Linked: files added to "${node.name}" auto-import into the "${node.name}" bin. Click to unlink.`
        : `Click to link this folder to the "${node.name}" bin so files paste-imports become automatic.`;
      if (ftsEditMode) {
        linkBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          node.link_enabled = node.link_enabled ? 0 : 1;
          if (!node.link_enabled) node.link_shortcut = null;
          renderFtsTree();
        });
      } else {
        linkBtn.disabled = true;
      }
      row.appendChild(linkBtn);

      // Shortcut picker — number key 1..9 (or none). Hold this key while
      // dropping a file on the overlay pill to route it to this folder.
      if (isLinked) {
        const otherShortcuts = new Set(
          ftsTree
            .filter(n => n !== node && n.node_type === 'folder' && n.link_enabled && n.link_shortcut)
            .map(n => String(n.link_shortcut))
        );
        const trigger = document.createElement('button');
        trigger.className = 'ft-shortcut-trigger' + (node.link_shortcut ? ' assigned' : '');
        trigger.textContent = node.link_shortcut || '—';
        trigger.title = node.link_shortcut
          ? `Hold "${node.link_shortcut}" while dropping on the overlay to route here. Click to change.`
          : `Pick a key (1–9) to route drops onto this folder.`;
        if (ftsEditMode) {
          trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            openShortcutPopover(trigger, node, otherShortcuts);
          });
        } else {
          trigger.disabled = true;
        }
        row.appendChild(trigger);
      }
    }
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
        const key = node.tempId ?? node.id;
        // Slots already on THIS folder (as child slot nodes) — show "already added" not "used elsewhere"
        const thisFolderSlots = new Set(
          ftsTree.filter(n => n.parent_id === key && n.node_type === 'slot').map(n => n.slot_type)
        );
        const picker = buildSlotPicker(usedFolderSlots(), (slotType) => {
          ftsTree.push({ tempId: Date.now() + 1, id: null, parent_id: key, node_type: 'slot', name: SLOT_META[slotType].label, asset_path: null, slot_type: slotType, sort_order: ftsTree.length, _expanded: false });
          node._expanded = true;
          renderFtsTree();
        }, thisFolderSlots);
        openPickerNearButton(picker, addAssetBtn);
      });
      actions.appendChild(addAssetBtn);
    }

    if (!node._locked) {
      const del = document.createElement('button');
      del.className = 'ft-node-btn ft-del-btn';
      del.textContent = '✕';
      del.addEventListener('click', () => {
        const deletedParentId = node.parent_id; // BUG-14: capture before filter
        const removeKeys = new Set();
        const collect = (key) => {
          removeKeys.add(key);
          ftsTree.filter(n => n.parent_id === key).forEach(c => collect(c.tempId ?? c.id));
        };
        collect(node.tempId ?? node.id);
        ftsTree = ftsTree.filter(n => !removeKeys.has(n.tempId ?? n.id));
        let idx = 0; // BUG-14: re-index siblings after deletion
        ftsTree.filter(n => n.parent_id === deletedParentId).forEach(n => n.sort_order = idx++);
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
  _closePicker(); // BUG-11: clean up stale picker listener before re-render
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

  // Show slot badges — one colored chip per assigned slot type
  if (isBin && node.slotTypes && node.slotTypes.length > 0) {
    node.slotTypes.forEach(type => {
      const meta = SLOT_META[type];
      if (!meta) return;
      const slotBadge = document.createElement('span');
      slotBadge.className = 'ft-slot-badge ft-slot-badge--inline';
      slotBadge.style.setProperty('--slot-color', meta.color);
      const badgeLabel = document.createElement('span');
      badgeLabel.textContent = `${meta.icon} ${meta.label}`;
      slotBadge.appendChild(badgeLabel);
      if (ftsEditMode) {
        const removeX = document.createElement('span');
        removeX.className = 'slot-badge-remove';
        removeX.textContent = '×';
        removeX.title = `Remove ${meta.label} slot`;
        removeX.addEventListener('click', (e) => {
          e.stopPropagation();
          node.slotTypes = node.slotTypes.filter(t => t !== type);
          renderPremiereTree();
        });
        slotBadge.appendChild(removeX);
      }
      row.appendChild(slotBadge);
    });
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

      // + Asset button — tags this bin as a Video / Audio / Image destination
      // Hidden when all globally assignable slots are already taken.
      const thisBinSlots = new Set(node.slotTypes || []);
      const canAddSlots = Object.keys(SLOT_META).filter(t => !usedBinSlots().has(t));
      const addAssetBtn = document.createElement('button');
      addAssetBtn.className = 'ft-node-btn ft-asset-slot-btn';
      addAssetBtn.textContent = '+ Asset';
      addAssetBtn.title = 'Tag this bin as Video / Audio / Image destination';
      addAssetBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const existing = addAssetBtn.parentElement?.parentElement?.querySelector('.slot-picker');
        if (existing) { existing.remove(); } // fall through to re-open picker
        const picker = buildSlotPicker(usedBinSlots(), (slotType) => {
          if (!node.slotTypes) node.slotTypes = [];
          if (!node.slotTypes.includes(slotType)) node.slotTypes.push(slotType);
          renderPremiereTree();
        }, thisBinSlots, binSlotOwners());
        openPickerNearButton(picker, addAssetBtn);
      });

      // + Import button — attaches a DB library asset/folder to auto-import into this bin
      const addImportBtn = document.createElement('button');
      addImportBtn.className = 'ft-node-btn ft-import-btn';
      addImportBtn.textContent = '+ Import';
      addImportBtn.title = 'Attach a library asset — auto-imported into this bin at project open';
      addImportBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const existing = addImportBtn.parentElement.parentElement.querySelector('.asset-import-picker');
        if (existing) { existing.remove(); } // BUG-13: fall through to re-open picker
        const assetOpts = {
          clientId: parseInt(ftsClientSel.value) || null,
          funnelId: parseInt(ftsFunnelSel.value) || null
        };
        const picker = await buildAssetPicker((asset) => {
          ftsPremiere.push({
            tempId:    ftNextPremiereTempId(), // BUG-10: collision-safe id
            type:      'import',
            name:      asset.name,
            file_path: asset.file_path,
            asset_id:  asset.id,
            parent_id: node.tempId,
            sort_order: ftsPremiere.filter(n => n.parent_id === node.tempId).length
          });
          node._expanded = true;
          renderPremiereTree();
        }, assetOpts);
        openPickerNearButton(picker, addImportBtn);
      });

      actions.appendChild(addBinBtn);
      actions.appendChild(addSeqBtn);
      if (canAddSlots.length > 0) actions.appendChild(addAssetBtn); // hidden when all slots taken
      actions.appendChild(addImportBtn);
    }
    const del = document.createElement('button');
    del.className = 'ft-node-btn ft-del-btn';
    del.textContent = '✕';
    del.addEventListener('click', () => {
      const deletedParentId = node.parent_id; // BUG-14: capture before filter
      const toRemove = new Set();
      const collect = (id) => {
        toRemove.add(id);
        ftsPremiere.filter(n => n.parent_id === id).forEach(c => collect(c.tempId));
      };
      collect(node.tempId);
      ftsPremiere = ftsPremiere.filter(n => !toRemove.has(n.tempId));
      let idx = 0; // BUG-14: re-index siblings after deletion
      ftsPremiere.filter(n => n.parent_id === deletedParentId).forEach(n => n.sort_order = idx++);
      renderPremiereTree();
    });
    actions.appendChild(del);
    row.appendChild(actions);
  }

  return row;
}

function addPremiereBin(parentId) {
  const newNode = {
    tempId: ftNextPremiereTempId(), // BUG-10: collision-safe id
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
    tempId: ftNextPremiereTempId(), // BUG-10: collision-safe id
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
  // Enable prproj controls in edit mode for file templates
  const editingTpl = ftsTemplates.find(t => t.id === ftsActiveId);
  if (editingTpl && editingTpl.template_type === 'file') {
    if (ftsPrprojBrowseBtn) ftsPrprojBrowseBtn.disabled = false;
    document.querySelectorAll('#fts-openmode-toggle .fts-toggle-btn').forEach(b => { b.disabled = false; });
  }
  // Show Save button, hide in view mode
  if (ftsBtnSave) ftsBtnSave.hidden = false;
  ftsBtnEdit.textContent = 'Cancel';
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
  // Disable prproj controls and hide Save button
  if (ftsPrprojBrowseBtn) ftsPrprojBrowseBtn.disabled = true;
  document.querySelectorAll('#fts-openmode-toggle .fts-toggle-btn').forEach(b => { b.disabled = true; });
  if (ftsBtnSave) ftsBtnSave.hidden = true;
  ftsBtnEdit.textContent = 'Edit';
  if (cancelled && ftsActiveId) await selectFtsTemplate(ftsActiveId);
  else { renderFtsTree(); renderPremiereTree(); }
}

async function saveFtsTemplate() {
  if (!ftsActiveId) return;

  const tplRec    = ftsTemplates.find(t => t.id === ftsActiveId);
  const name      = ftsTemplateNameInput.value.trim() || tplRec?.name || 'Template';
  const isFileTpl   = tplRec?.template_type === 'file';
  const prproj      = isFileTpl
    ? (ftsPrprojInput?.value?.trim() || tplRec?.prproj_path || null)
    : (tplRec?.prproj_path || null);
  const openMode    = isFileTpl
    ? (document.querySelector('#fts-openmode-toggle .fts-toggle-btn.active')?.dataset.value || 'copy_to_new')
    : (tplRec?.open_mode || 'copy_to_new');
  const templateType = tplRec?.template_type || 'folder';
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

  await window.api.ft.update(targetId, name, prproj, openMode, ftsPremiere, [], templateType);
  await window.api.ft.setNodes(targetId, ftsTree);
  // Clear old assignment on targetId then set the new one
  const existing = await window.api.ft.getAssignments(targetId);
  for (const a of existing) {
    await window.api.ft.unassign(targetId, a.client_id, a.funnel_id, a.task_id);
  }
  if (clientId || funnelId || taskId) {
    const conflict = ftsTemplates.find(t =>
      t.id !== targetId &&
      t.asgn_client_id == clientId &&
      t.asgn_funnel_id == funnelId &&
      t.asgn_task_id == taskId
    );
    if (conflict) {
      const ok = confirm(
        `"${conflict.name}" is already assigned to this Client / Funnel / Task.\n\nReplace it with "${name}"?`
      );
      if (!ok) return;
    }
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
  // Re-render folder tree on tab return so link toggles refresh after the
  // user added/renamed bins on the Premiere tab.
  if (tab === 'folder') renderFtsTree();
}

function bindFtsEvents() {
  ftsTabBtnFolder.addEventListener('click',   () => switchFtsTab('folder'));
  ftsTabBtnPremiere.addEventListener('click', () => switchFtsTab('premiere'));

  ftsBtnEdit.addEventListener('click', () => {
    if (ftsEditMode) exitFtsEditMode(true);
    else if (ftsActiveId) enterFtsEditMode();
  });

  ftsBtnCreateNew.addEventListener('click', () => {
    if (ftsNewModalOverlay) ftsNewModalOverlay.hidden = false;
  });

  // Modal close
  if (ftsNewModalClose) ftsNewModalClose.addEventListener('click', () => { ftsNewModalOverlay.hidden = true; });
  if (ftsNewModalOverlay) ftsNewModalOverlay.addEventListener('click', e => { if (e.target === ftsNewModalOverlay) ftsNewModalOverlay.hidden = true; });

  // Modal — Start Fresh
  if (ftsModalBtnFresh) {
    ftsModalBtnFresh.addEventListener('click', async () => {
      ftsNewModalOverlay.hidden = true;
      const result = await window.api.ft.create('New Template', null, 'copy_to_new', [], [], 'folder');
      ftsActiveId = result.lastInsertRowid;
      await loadFtsTemplates();
      await selectFtsTemplate(ftsActiveId);
      enterFtsEditMode();
    });
  }

  // Modal — Duplicate Current
  if (ftsModalBtnDuplicate) {
    ftsModalBtnDuplicate.addEventListener('click', async () => {
      ftsNewModalOverlay.hidden = true;
      if (!ftsActiveId) return;
      const cloned = await window.api.ft.clone(ftsActiveId);
      ftsActiveId = cloned.id;
      await loadFtsTemplates();
      await selectFtsTemplate(ftsActiveId);
      enterFtsEditMode();
    });
  }

  // Modal — Browse Template (file-based template)
  if (ftsModalBtnBrowse) {
    ftsModalBtnBrowse.addEventListener('click', async () => {
      ftsNewModalOverlay.hidden = true;
      const filePath = await window.api.ft.selectPrproj();
      if (!filePath) return;
      const baseName = filePath.split(/[\\/]/).pop().replace(/\.prproj$/i, '') || 'File Template';
      // Use default template's actual folder structure
      const defaultTpl = ftsTemplates.find(t => t.is_default) || await window.api.ft.getDefault();
      let defaultNodes = [];
      if (defaultTpl) {
        const raw = await window.api.ft.getNodes(defaultTpl.id);
        defaultNodes = raw.map(n => ({
          id:         n.id,
          node_type:  n.node_type,
          name:       n.name,
          parent_id:  n.parent_id,
          sort_order: n.sort_order,
          asset_path: n.asset_path || null,
          slot_type:  n.slot_type  || null
        }));
      }
      const result = await window.api.ft.create(baseName, filePath, 'copy_to_new', [], [], 'file');
      const newId = result.lastInsertRowid;
      if (defaultNodes.length) await window.api.ft.setNodes(newId, defaultNodes);
      ftsActiveId = newId;
      await loadFtsTemplates();
      await selectFtsTemplate(ftsActiveId);
      enterFtsEditMode();
    });
  }

  // Save button (Feature 6 — replaces ftsBtnNew in edit mode)
  if (ftsBtnSave) {
    ftsBtnSave.addEventListener('click', async () => {
      await saveFtsTemplate();
    });
  }

  // Prproj browse button
  if (ftsPrprojBrowseBtn) {
    ftsPrprojBrowseBtn.addEventListener('click', async () => {
      const filePath = await window.api.ft.selectPrproj();
      if (filePath && ftsPrprojInput) ftsPrprojInput.value = filePath;
    });
  }

  document.querySelectorAll('#fts-openmode-toggle .fts-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      document.querySelectorAll('#fts-openmode-toggle .fts-toggle-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  ftsClientSel.addEventListener('change', () => { refreshFtsFunnels(); renderPremiereTree(); });
  ftsFunnelSel.addEventListener('change', () => { refreshFtsTasks(); renderPremiereTree(); });

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
