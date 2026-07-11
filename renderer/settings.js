// ── Settings ──────────────────────────────────────────────────────────────────

async function loadAndApplyConfig() {
  try {
    configState = await window.api.getConfig();
    settingTargetDir.value        = configState.targetDir || '';
    settingAutoPopup.checked      = configState.autoPopup !== false;
    updatePreviews();
  } catch (err) {
    console.error('Error loading config:', err);
  }
}

async function savePathSettings() {
  try {
    const result = await window.api.saveConfig({
      targetDir:         settingTargetDir.value.trim(),
      templateFile:      configState.templateFile      || '',
      folderStructure:   configState.folderStructure,
      autoPopup:         settingAutoPopup.checked,
      defaultBins:       configState.defaultBins       || [],
      defaultSequences:  configState.defaultSequences  || []
    });
    configState = result;
    updatePreviews();
  } catch (err) {
    console.error('Auto-save settings failed:', err);
  }
}

async function refreshWatchedFoldersList() {
  const listEl = document.getElementById('watched-folders-list');
  if (!listEl) return;
  listEl.innerHTML = '';
  try {
    const folders = await window.api.db.getWatchedFolders();
    if (folders.length === 0) {
      listEl.innerHTML = '<div style="color: #7d7d8e; padding: 6px; font-size: 11px;">No watched folders yet.</div>';
      return;
    }
    folders.forEach(f => {
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.justifyContent = 'space-between';
      row.style.padding = '4px 6px';
      row.style.borderBottom = '1px solid #1c1c28';
      row.style.fontSize = '11px';

      const span = document.createElement('span');
      span.innerText = f.folder_path;
      span.style.color = '#e5e5eb';
      span.style.whiteSpace = 'nowrap';
      span.style.overflow = 'hidden';
      span.style.textOverflow = 'ellipsis';
      span.style.flex = '1';
      span.style.marginRight = '8px';
      row.appendChild(span);

      const delBtn = document.createElement('button');
      delBtn.innerText = '×';
      delBtn.style.background = 'none';
      delBtn.style.border = 'none';
      delBtn.style.color = '#ef4444';
      delBtn.style.cursor = 'pointer';
      delBtn.style.fontWeight = 'bold';
      delBtn.style.fontSize = '14px';
      delBtn.style.padding = '0 4px';
      delBtn.onclick = async () => {
        if (confirm(`Remove watched folder "${f.folder_path}"? SFX inside will no longer be indexed.`)) {
          await window.api.db.deleteWatchedFolder(f.id);
          refreshWatchedFoldersList();
        }
      };
      row.appendChild(delBtn);

      listEl.appendChild(row);
    });
  } catch (e) {
    console.error('Failed to load watched folders:', e);
  }
}

async function refreshMogrtFoldersList() {
  const listEl = document.getElementById('mogrt-folders-list');
  if (!listEl) return;
  listEl.innerHTML = '';
  try {
    const folders = await window.api.db.getMogrtFolders();
    if (folders.length === 0) {
      listEl.innerHTML = '<div style="color: #7d7d8e; padding: 6px; font-size: 11px;">No watched folders yet.</div>';
      return;
    }
    folders.forEach(f => {
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.justifyContent = 'space-between';
      row.style.padding = '4px 6px';
      row.style.borderBottom = '1px solid #1c1c28';
      row.style.fontSize = '11px';

      const span = document.createElement('span');
      span.innerText = f.folder_path;
      span.style.color = '#e5e5eb';
      span.style.whiteSpace = 'nowrap';
      span.style.overflow = 'hidden';
      span.style.textOverflow = 'ellipsis';
      span.style.flex = '1';
      span.style.marginRight = '8px';
      row.appendChild(span);

      const delBtn = document.createElement('button');
      delBtn.innerText = '×';
      delBtn.style.background = 'none';
      delBtn.style.border = 'none';
      delBtn.style.color = '#ef4444';
      delBtn.style.cursor = 'pointer';
      delBtn.style.fontWeight = 'bold';
      delBtn.style.fontSize = '14px';
      delBtn.style.padding = '0 4px';
      delBtn.onclick = async () => {
        if (confirm(`Remove watched folder "${f.folder_path}"? MOGRTs inside will no longer be indexed.`)) {
          await window.api.db.deleteMogrtFolder(f.id);
          refreshMogrtFoldersList();
        }
      };
      row.appendChild(delBtn);

      listEl.appendChild(row);
    });
  } catch (e) {
    console.error('Failed to load MOGRT folders:', e);
  }
}

async function refreshSyncedProfilesList() {
  const listEl = document.getElementById('synced-profiles-list');
  if (!listEl) return;
  listEl.innerHTML = '';
  try {
    const users = await window.api.db.getUsers();
    if (users.length === 0) {
      listEl.innerHTML = '<div style="color: #7d7d8e; padding: 6px; font-size: 11px;">No team profiles synced yet. Click "Sync Team Profiles".</div>';
      return;
    }
    users.forEach(u => {
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.padding = '6px 8px';
      row.style.borderBottom = '1px solid #1c1c28';
      row.style.fontSize = '12px';

      const dot = document.createElement('span');
      dot.style.display = 'inline-block';
      dot.style.width = '10px';
      dot.style.height = '10px';
      dot.style.borderRadius = '50%';
      dot.style.backgroundColor = u.hex_color;
      dot.style.marginRight = '8px';
      row.appendChild(dot);

      const nameSpan = document.createElement('span');
      nameSpan.innerText = u.name;
      nameSpan.style.color = '#e5e5eb';
      nameSpan.style.flex = '1';
      row.appendChild(nameSpan);
      
      const initSpan = document.createElement('span');
      initSpan.innerText = u.initials;
      initSpan.style.color = '#7d7d8e';
      initSpan.style.fontWeight = 'bold';
      row.appendChild(initSpan);

      listEl.appendChild(row);
    });
  } catch (e) {
    console.error('Failed to load users for settings panel:', e);
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

  btnSaveSettings.addEventListener('click', async () => {
    try {
      const result = await window.api.saveConfig({
        targetDir:        settingTargetDir.value,
        templateFile:     configState.templateFile      || '',
        folderStructure:  configState.folderStructure,
        autoPopup:        settingAutoPopup.checked,
        defaultBins:      configState.defaultBins       || [],
        defaultSequences: configState.defaultSequences  || []
      });
      configState = result;
      showStatusMessage('Settings Saved', 'success');
      updatePreviews();
    } catch (err) {
      showStatusMessage('Save Failed — ' + err.message, 'error');
    }
  });

  // Watched folders buttons
  const btnBrowseAudioDir = document.getElementById('btn-browse-audio-dir');
  if (btnBrowseAudioDir) {
    btnBrowseAudioDir.addEventListener('click', async () => {
      const dir = await window.api.db.selectAudioFolder();
      if (dir) {
        await window.api.db.addWatchedFolder(dir);
        refreshWatchedFoldersList();
      }
    });
  }

  const btnBrowseMogrtDir = document.getElementById('btn-browse-mogrt-dir');
  if (btnBrowseMogrtDir) {
    btnBrowseMogrtDir.addEventListener('click', async () => {
      const dir = await window.api.db.selectMogrtFolder();
      if (dir) {
        await window.api.db.addMogrtFolder(dir);
        refreshMogrtFoldersList();
      }
    });
  }

  // Load initial folders lists
  refreshWatchedFoldersList();
  refreshMogrtFoldersList();
  refreshSyncedProfilesList();

  // Supabase Sync Logic
  const btnSyncSupabase = document.getElementById('btn-sync-supabase');
  if (btnSyncSupabase) {
    btnSyncSupabase.addEventListener('click', async () => {
      const urlInput = "https://toidowlqmqbmtrfjvzgt.supabase.co";
      const keyInput = "sb_publishable_KSuDUKzHr8kzRV2YlnpP_g_osCedHm8";
      const statusDiv = document.getElementById('sync-status');
      
      try {
        btnSyncSupabase.innerText = 'Syncing...';
        btnSyncSupabase.disabled = true;
        
        const data = await window.api.fetchSupabaseProfiles();
        if (!Array.isArray(data)) throw new Error('Invalid data format from Supabase.');
        
        // Wipe local users and insert new ones
        const users = await window.api.db.getUsers();
        for (const u of users) {
          await window.api.db.deleteUser(u.id);
        }
        
        for (const profile of data) {
          await window.api.db.addUser(profile.full_name, profile.initials, profile.hex_color);
        }
        
        await refreshSyncedProfilesList();
        
        statusDiv.innerText = `Successfully synced ${data.length} profiles!`;
        statusDiv.style.color = '#22c55e';
      } catch (err) {
        if (window.api && window.api.log) window.api.log('settings', 'SYNC ERROR: ' + err.stack);
        statusDiv.innerText = err.message + ' (Check logs)';
        statusDiv.style.color = '#ff5252';
      } finally {
        btnSyncSupabase.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" style="margin-right: 6px; vertical-align: -2px;"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>Sync Team Profiles';
        btnSyncSupabase.disabled = false;
      }
    });
  }
}
