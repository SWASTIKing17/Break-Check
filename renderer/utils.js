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

// BUG-15: ftsTree uses snake_case `slot_type` (maps to the DB column).
//          ftsPremiere uses camelCase `slotType` (lives only in bins_json, never touches the DB column).
//          This is intentional — do not unify without updating the DB layer.
// Returns the set of slot types already used in ftsTree (folder structure)
function usedFolderSlots() {
  return new Set((typeof ftsTree !== 'undefined' ? ftsTree : []).filter(n => n.node_type === 'slot').map(n => n.slot_type));
}

// Returns the set of slot types already used in ftsPremiere (Premiere bins)
function usedBinSlots() {
  const used = new Set();
  const tree = typeof ftsPremiere !== 'undefined' ? ftsPremiere : [];
  tree.forEach(n => {
    if (n.slotType)  used.add(n.slotType);
    if (n.slotTypes) n.slotTypes.forEach(t => used.add(t));
  });
  return used;
}

// Returns a map of { slotType → binName } so the picker can say "in 'Visual Assets'" instead of "used elsewhere"
function binSlotOwners() {
  const owners = {};
  const tree = typeof ftsPremiere !== 'undefined' ? ftsPremiere : [];
  tree.forEach(n => {
    const slots = n.slotTypes || (n.slotType ? [n.slotType] : []);
    slots.forEach(t => { if (!owners[t]) owners[t] = n.name || 'another bin'; });
  });
  return owners;
}

// BUG-11: module-level tracker for the currently open picker so we can clean up
// stale document click listeners if the picker is removed by a re-render.
let _activePickerCleanup = null;
function _closePicker() {
  if (_activePickerCleanup) { _activePickerCleanup(); _activePickerCleanup = null; }
}

// F-FTS-030: render a picker as a fixed-position overlay anchored under the
// triggering button — bypasses any scrollable / overflow parent that would clip it.
function openPickerNearButton(picker, anchorBtn) {
  picker.style.position = 'fixed';
  picker.style.zIndex   = '10000';
  picker.style.visibility = 'hidden';
  document.body.appendChild(picker);

  // Measure on next frame so the picker has dimensions
  requestAnimationFrame(() => {
    const rect = anchorBtn.getBoundingClientRect();
    const pw   = picker.offsetWidth;
    const ph   = picker.offsetHeight;
    const vw   = window.innerWidth;
    const vh   = window.innerHeight;
    let left = rect.left;
    let top  = rect.bottom + 4;
    if (left + pw > vw - 8) left = Math.max(8, vw - pw - 8);
    if (top + ph > vh - 8)  top  = Math.max(8, rect.top - ph - 4);
    picker.style.left = left + 'px';
    picker.style.top  = top + 'px';
    picker.style.visibility = '';
  });

  // Close on scroll / resize so it never drifts away from its anchor
  const onScrollOrResize = () => _closePicker();
  window.addEventListener('scroll', onScrollOrResize, true);
  window.addEventListener('resize', onScrollOrResize);
  // Extend the existing cleanup so listeners are removed too
  const prevCleanup = _activePickerCleanup;
  _activePickerCleanup = () => {
    window.removeEventListener('scroll', onScrollOrResize, true);
    window.removeEventListener('resize', onScrollOrResize);
    if (prevCleanup) prevCleanup();
  };
}

// Builds and returns a slot-picker popover element for the given context.
// onPick(slotType) is called when user selects a slot.
// usedSet   = all slot types already taken globally.
// ownSlots  = (optional) Set of slots already on this specific bin/folder — shows "already added".
// owners    = (optional) { slotType → name } map — shows "in '[name]'" instead of generic "used elsewhere".
function buildSlotPicker(usedSet, onPick, ownSlots, owners) {
  _closePicker(); // BUG-11: clean up any stale listener from a previous picker
  const picker = document.createElement('div');
  picker.className = 'slot-picker';
  Object.entries(SLOT_META).forEach(([type, meta]) => {
    const isOwn  = ownSlots && ownSlots.has(type);
    const isUsed = usedSet.has(type);
    const btn = document.createElement('button');
    btn.className = 'slot-picker-btn' + (isUsed ? ' slot-picker-btn--used' : '');
    btn.disabled = isUsed;
    let hint = '';
    if (isOwn)       hint = 'already added';
    else if (isUsed) hint = owners?.[type] ? `in "${owners[type]}"` : 'used elsewhere';
    btn.innerHTML = `<span>${meta.icon} ${meta.label}</span>${hint ? `<span class="slot-pick-hint">${hint}</span>` : ''}`;
    btn.addEventListener('click', (e) => { e.stopPropagation(); onPick(type); _closePicker(); picker.remove(); });
    picker.appendChild(btn);
  });
  const close = (e) => { if (!picker.contains(e.target)) { picker.remove(); document.removeEventListener('click', close, true); _activePickerCleanup = null; } };
  const cleanup = () => { document.removeEventListener('click', close, true); picker.remove(); };
  _activePickerCleanup = cleanup;
  setTimeout(() => document.addEventListener('click', close, true), 0);
  return picker;
}

// Builds and returns an async asset-import picker populated from the DB assets library.
// onPick(asset) is called with the full DB asset row when user selects one.
// opts: { clientId, funnelId } — filter assets by template assignment context
async function buildAssetPicker(onPick, opts) {
  _closePicker();
  const picker = document.createElement('div');
  picker.className = 'slot-picker asset-import-picker';

  const allAssets = await window.api.db.getAssets();
  const clientId = opts && opts.clientId ? opts.clientId : null;
  const funnelId = opts && opts.funnelId ? opts.funnelId : null;

  let assets = allAssets;
  if (clientId || funnelId) {
    assets = allAssets.filter(a => {
      if (a.client_id == null && a.funnel_id == null) return true;
      if (clientId && a.client_id == clientId) return true;
      if (funnelId && a.funnel_id == funnelId) return true;
      return false;
    });
  }

  if (!assets.length) {
    const empty = document.createElement('div');
    empty.className = 'asset-pick-empty';
    empty.textContent = allAssets.length
      ? 'No assets match this template\'s client/funnel.'
      : 'No assets in library. Add files in the Assets section first.';
    picker.appendChild(empty);
  } else {
    assets.forEach(a => {
      const btn = document.createElement('button');
      btn.className = 'slot-picker-btn';
      const fileName = a.file_path.split(/[\\/]/).pop();
      btn.innerHTML = `<span class="asset-pick-name">${a.name}</span><span class="asset-pick-file">${fileName}</span>`;
      btn.addEventListener('click', (e) => { e.stopPropagation(); onPick(a); _closePicker(); picker.remove(); });
      picker.appendChild(btn);
    });
  }

  const close = (e) => { if (!picker.contains(e.target)) { picker.remove(); document.removeEventListener('click', close, true); _activePickerCleanup = null; } };
  const cleanup = () => { document.removeEventListener('click', close, true); picker.remove(); };
  _activePickerCleanup = cleanup;
  setTimeout(() => document.addEventListener('click', close, true), 0);
  return picker;
}

// ── Shared DOM Helpers ────────────────────────────────────────────────────────

function showErr(el, msg) { el.textContent = msg; el.style.display = 'block'; }
function escapeHtml(s)    { return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function escapeAttr(s)    { return escapeHtml(s).replace(/`/g, '&#96;'); }

function showStatusMessage(message, type) {
  saveStatus.textContent = message;
  saveStatus.className = `status-msg ${type}`;
  setTimeout(() => { saveStatus.className = 'status-msg'; }, 3000);
}

// Generic helper: populate a <select> with client rows as "Name (INITIALS)" options.
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
