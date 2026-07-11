const { contextBridge, ipcRenderer, webUtils } = require('electron');

let onDropCallback = null;
let onUrlDropCallback = null;

ipcRenderer.on('native-pill-files-dropped', (event, data) => {
  if (onDropCallback && data && Array.isArray(data.filePaths)) {
    onDropCallback(data.filePaths, data.modKeys || {});
  }
});

window.addEventListener('dragover', (e) => {
  e.preventDefault();
}, true);

window.addEventListener('drop', (e) => {
  // CRITICAL: Electron's default behaviour on file drop is to navigate the
  // renderer to the file's file:// URL, which would replace the overlay's
  // HTML with the dropped file (or a blank page if the file can't render).
  // That broke the halo picker — clicks died and the renderer flashed white.
  e.preventDefault();
  e.stopPropagation();

  const filePaths = [];
  const filesDetails = [];
  
  if (e.dataTransfer && e.dataTransfer.files) {
    for (let i = 0; i < e.dataTransfer.files.length; i++) {
      const file = e.dataTransfer.files[i];
      const p = webUtils.getPathForFile(file);
      filesDetails.push({
        name: file.name,
        size: file.size,
        type: file.type,
        resolvedPath: p
      });
      if (p) {
        filePaths.push(p);
      }
    }
  }
  
  ipcRenderer.send('log-from-preload', {
    event: 'window-drop-capture',
    totalFilesReceived: e.dataTransfer && e.dataTransfer.files ? e.dataTransfer.files.length : 0,
    filesDetails: filesDetails,
    pathsCount: filePaths.length,
    paths: filePaths
  });

  if (filePaths.length > 0 && onDropCallback) {
    // Forward modifier state so the overlay can detect Ctrl (route picker)
    // and Shift (move mode). These are reliable on drop events even when
    // the source window (e.g. File Explorer) holds keyboard focus.
    onDropCallback(filePaths, {
      ctrlKey:  !!e.ctrlKey,
      shiftKey: !!e.shiftKey,
      altKey:   !!e.altKey
    });
    return;
  }

  // No local file paths — check for image URL dragged from a browser tab
  if (e.dataTransfer.types.includes('text/uri-list') && onUrlDropCallback) {
    const uriList = e.dataTransfer.getData('text/uri-list');
    const urls = uriList
      .split('\n')
      .map(u => u.trim())
      .filter(u => u && !u.startsWith('#') && /^https?:\/\//i.test(u));
    if (urls.length > 0) onUrlDropCallback(urls);
  }
}, true);

contextBridge.exposeInMainWorld('api', {
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  log: (component, msg) => ipcRenderer.send('write-log', { component, msg }),
  resolveDroppedPath: (file) => {
    try { return webUtils.getPathForFile(file); }
    catch (_) { return null; }
  },
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),
  getConfig: () => ipcRenderer.invoke('get-config'),
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  selectFile: () => ipcRenderer.invoke('select-file'),
  selectFiles: () => ipcRenderer.invoke('select-files'),
  createProject: (projectData) => ipcRenderer.invoke('create-project', projectData),
  openFolder: (path) => ipcRenderer.send('open-folder', path),
  closeWindow: () => ipcRenderer.send('close-window'),
  minimizeWindow: () => ipcRenderer.send('minimize-window'),
  maximizeWindow: () => ipcRenderer.send('maximize-window'),

  // Overlay specific APIs
  setIgnoreMouseEvents: (ignore, options) => ipcRenderer.send('set-ignore-mouse-events', ignore, options),
  importDroppedFiles: (filePaths, opts) => ipcRenderer.invoke('import-dropped-files', filePaths, opts || null),
  onOverlayUpdate: (callback) => ipcRenderer.on('overlay-update', (event, data) => callback(data)),
  onLinkMapUpdated: (callback) => ipcRenderer.on('overlay-link-map', (event, data) => callback(data || [])),
  overlayLog: (msg) => ipcRenderer.send('overlay-log', String(msg)),
  onMainWindowShown: (callback) => ipcRenderer.on('main-window-shown', () => callback()),
  requestStatus: () => ipcRenderer.send('request-status'),
  onFilesDropped: (callback) => { onDropCallback = callback; },
  onUrlsDropped: (callback) => { onUrlDropCallback = callback; },
  importBrowserImage: (url) => ipcRenderer.invoke('import-browser-image', url),
  moveOverlayWindow: (delta) => ipcRenderer.send('move-overlay-window', delta),
  resizeOverlay: (expanded) => ipcRenderer.send('resize-overlay', expanded),
  fetchSupabaseProfiles: () => ipcRenderer.invoke('fetch-supabase-profiles'),

  // Database API
  db: {
    getClients: () => ipcRenderer.invoke('db-get-clients'),
    addClient: (name, initials) => ipcRenderer.invoke('db-add-client', name, initials),
    updateClient: (id, name, initials) => ipcRenderer.invoke('db-update-client', id, name, initials),
    deleteClient: (id) => ipcRenderer.invoke('db-delete-client', id),

    getFunnels: (clientId) => ipcRenderer.invoke('db-get-funnels', clientId),
    getAllFunnels: () => ipcRenderer.invoke('db-get-all-funnels'),
    addFunnel: (clientId, name, initials) => ipcRenderer.invoke('db-add-funnel', clientId, name, initials),
    updateFunnel: (id, clientId, name, initials) => ipcRenderer.invoke('db-update-funnel', id, clientId, name, initials),
    funnelConflict: (name, clientId, excludeId) => ipcRenderer.invoke('db-funnel-conflict', name, clientId, excludeId),
    deleteFunnel: (id) => ipcRenderer.invoke('db-delete-funnel', id),

    getTasks: () => ipcRenderer.invoke('db-get-tasks'),
    addTask: (name, initials) => ipcRenderer.invoke('db-add-task', name, initials),
    updateTask: (id, name, initials) => ipcRenderer.invoke('db-update-task', id, name, initials),
    taskConflict: (name, excludeId) => ipcRenderer.invoke('db-task-conflict', name, excludeId),
    deleteTask: (id) => ipcRenderer.invoke('db-delete-task', id),

    getFunnelTasks: (clientId, funnelId) => ipcRenderer.invoke('db-get-funnel-tasks', clientId, funnelId),
    setFunnelTasks: (clientId, funnelId, taskIds) => ipcRenderer.invoke('db-set-funnel-tasks', clientId, funnelId, taskIds),

    clientConflict: (name, excludeId) => ipcRenderer.invoke('db-client-conflict', name, excludeId),

    getTemplates: () => ipcRenderer.invoke('db-get-templates'),
    addTemplate: (clientId, funnelId, name, filePath) => ipcRenderer.invoke('db-add-template', clientId, funnelId, name, filePath),
    deleteTemplate: (id) => ipcRenderer.invoke('db-delete-template', id),

    getAssets: () => ipcRenderer.invoke('db-get-assets'),
    addAsset: (clientId, funnelId, name, filePath, category, tags) => ipcRenderer.invoke('db-add-asset', clientId, funnelId, name, filePath, category, tags),
    updateAsset: (id, name, filePath, clientId, funnelId) => ipcRenderer.invoke('db-update-asset', id, name, filePath, clientId, funnelId),
    deleteAsset: (id) => ipcRenderer.invoke('db-delete-asset', id),

    getUsers: () => ipcRenderer.invoke('db-get-users'),
    addUser: (name, initials, hex) => ipcRenderer.invoke('db-add-user', name, initials, hex),
    updateUser: (id, name, initials, hex) => ipcRenderer.invoke('db-update-user', id, name, initials, hex),
    deleteUser: (id) => ipcRenderer.invoke('db-delete-user', id),

    getWatchedFolders: () => ipcRenderer.invoke('db-get-watched-folders'),
    addWatchedFolder: (folderPath) => ipcRenderer.invoke('db-add-watched-folder', folderPath),
    deleteWatchedFolder: (id) => ipcRenderer.invoke('db-delete-watched-folder', id),
    selectAudioFolder: () => ipcRenderer.invoke('db-select-audio-folder'),

    // MOGRT library (MisterBloomX) — mirrors the audio folder API.
    getMogrtFolders: () => ipcRenderer.invoke('mogrt-get-watched-folders'),
    addMogrtFolder: (folderPath) => ipcRenderer.invoke('mogrt-add-folder', folderPath),
    deleteMogrtFolder: (id) => ipcRenderer.invoke('mogrt-delete-folder', id),
    selectMogrtFolder: () => ipcRenderer.invoke('mogrt-select-folder'),
  },

  // Folder Template API
  ft: {
    getAll:         ()                                          => ipcRenderer.invoke('ft-get-all'),
    getNodes:       (id)                                        => ipcRenderer.invoke('ft-get-nodes', id),
    create:         (name, prprojPath, openMode, bins, seqs, templateType) => ipcRenderer.invoke('ft-create', name, prprojPath, openMode, bins, seqs, templateType),
    update:         (id, name, prprojPath, openMode, bins, seqs, templateType) => ipcRenderer.invoke('ft-update', id, name, prprojPath, openMode, bins, seqs, templateType),
    delete:         (id)                                        => ipcRenderer.invoke('ft-delete', id),
    setDefault:     (id)                                        => ipcRenderer.invoke('ft-set-default', id),
    setNodes:       (id, nodes)                                 => ipcRenderer.invoke('ft-set-nodes', id, nodes),
    getAssignments: (id)                                        => ipcRenderer.invoke('ft-get-assignments', id),
    assign:         (tId, cId, fId, taskId)                     => ipcRenderer.invoke('ft-assign', tId, cId, fId, taskId),
    unassign:       (tId, cId, fId, taskId)                     => ipcRenderer.invoke('ft-unassign', tId, cId, fId, taskId),
    clone:          (id)                                        => ipcRenderer.invoke('ft-clone', id),
    getDefault:     ()                                          => ipcRenderer.invoke('ft-get-default'),
    selectAsset:    ()                                          => ipcRenderer.invoke('ft-select-asset'),
    selectPrproj:   ()                                          => ipcRenderer.invoke('select-file'),
  },
  sendBugReport: (reportText) => ipcRenderer.invoke('send-bug-report', reportText),
  exportDiagnostics: () => ipcRenderer.invoke('export-diagnostics')
});

contextBridge.exposeInMainWorld('freeXanLog', (level, event, correlationId, payload) => {
  ipcRenderer.send('log', { level: level || 'info', event: event || 'ui:event', source: 'electron-renderer', correlationId: correlationId || null, payload: payload || {} });
});
