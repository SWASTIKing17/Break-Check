/* ═══════════════════════════════════════════════
   Break Check Dashboard — app.js v2
   Views: Activity Flow | Proficiency | Hardware | Friction | Team
   ═══════════════════════════════════════════════ */

'use strict';


/* ── Chart.js global defaults ─────────────────── */
Chart.defaults.color = '#64748b';
Chart.defaults.borderColor = 'rgba(255,255,255,0.05)';
Chart.defaults.font.family = 'Inter, system-ui, sans-serif';

/* ── Chart instances ──────────────────────────── */
let activityChart = null, appChart = null, scrollAppChart = null;
let kpmChart = null, modifierGaugeChart = null;
let ramChart = null;
let scrollCatChart = null, switchChart = null;

/* ── Destroy all charts so a profile switch always renders fresh ── */
function destroyAllCharts() {
    [activityChart, appChart, scrollAppChart, kpmChart,
     modifierGaugeChart, ramChart, scrollCatChart, switchChart]
        .forEach(c => { if (c) c.destroy(); });
    activityChart = null; appChart = null; scrollAppChart = null;
    kpmChart = null; modifierGaugeChart = null;
    ramChart = null; scrollCatChart = null; switchChart = null;
}

/* ── Raw data cache ───────────────────────────── */
let _rawData = [];


/* ── View switcher ────────────────────────────── */
function switchView(viewId, el) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById('view-' + viewId).classList.add('active');
    el.classList.add('active');
    document.getElementById('sidebar').classList.remove('open'); // Auto-close on mobile
}

function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('open');
}

/* ── Helpers ──────────────────────────────────── */
function simplifyApp(raw) {
    if (!raw) return 'Other';
    if (/premiere/i.test(raw)) return 'Premiere Pro';
    if (/afterfx|after effects/i.test(raw)) return 'After Effects';
    if (/chrome|edge|firefox|safari/i.test(raw)) return 'Browser';
    if (/slack/i.test(raw)) return 'Slack';
    if (/explorer|finder/i.test(raw)) return 'File Explorer';
    if (/code|ide|cursor/i.test(raw)) return 'IDE';
    if (/powershell|terminal|cmd/i.test(raw)) return 'Terminal';
    return raw.split(/[-—|]/)[0].trim().substring(0, 22) || 'Other';
}

function isNLE(appName) {
    return appName === 'Premiere Pro' || appName === 'After Effects';
}

function fmtMins(mins) {
    if (mins < 60) return `${mins}m`;
    return `${Math.floor(mins/60)}h ${mins % 60}m`;
}

const APP_COLORS = {
    'Premiere Pro':  '#8b5cf6',
    'After Effects': '#a855f7',
    'Browser':       '#3b82f6',
    'Slack':         '#f59e0b',
    'File Explorer': '#ef4444',
    'IDE':           '#10b981',
    'Terminal':      '#64748b',
    'Other':         '#334155',
};

function appColor(name) { return APP_COLORS[name] || APP_COLORS.Other; }

function setEl(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }

/* ── Data fetching ────────────────────────────── */
async function fetchData(empId) {
    const url = empId ? `/api/data?employee_id=${encodeURIComponent(empId)}` : '/api/data';
    const res = await fetch(url);
    const result = await res.json();
    return (result.success && Array.isArray(result.data)) ? result.data : [];
}

async function fetchProfiles() {
    const select = document.getElementById('employeeSelect');
    try {
        const res = await fetch('/api/employees');
        const result = await res.json();
        const profiles = result.data || [];
        
        select.innerHTML = '';
        const all = document.createElement('option');
        all.value = ''; all.textContent = 'All Employees';
        select.appendChild(all);
        
        profiles.forEach(emp => {
            const opt = document.createElement('option');
            opt.value = emp; opt.textContent = emp;
            select.appendChild(opt);
        });
    } catch (e) {
        console.warn('Could not load profiles from Supabase:', e);
        select.innerHTML = '<option value="">All Employees</option>';
    }
}



/* ── Reset UI state when a profile has no data ── */
function resetDashboardUI() {
    destroyAllCharts();
    ['kpi-events-val','kpi-keys-val','kpi-active-val',
     'kpi-modifier-val','kpi-scroll-val','kpi-ram-val'].forEach(id => setEl(id, '—'));

    const projWrap = document.getElementById('projectListWrap');
    if (projWrap) projWrap.innerHTML = '<p class="muted" style="padding:1rem 0">No project data yet.</p>';

    setEl('modifierPct', '—');
    setEl('modifierInsight', 'No data collected for this profile.');

    const heatmapWrap = document.getElementById('heatmapWrap');
    if (heatmapWrap) {
        heatmapWrap.innerHTML = '';
        const oldLabels = heatmapWrap.nextSibling;
        if (oldLabels && oldLabels.className === 'heatmap-hours') {
            oldLabels.remove();
        }
    }

    const alertCard = document.getElementById('ramAlertCard');
    if (alertCard) alertCard.style.borderColor = 'var(--border)';
    setEl('ramAlertText', 'No RAM data collected yet.');
    const peakRam = document.getElementById('peakRam');
    if (peakRam) peakRam.innerHTML = '—<small>GB</small>';
    const ramByApp = document.getElementById('ramByApp');
    if (ramByApp) ramByApp.innerHTML = '<p class="muted">No data.</p>';

    const csRate = document.getElementById('contextSwitchRate');
    if (csRate) csRate.innerHTML = '—';
    setEl('contextSwitchInsight', 'No data collected for this profile.');
    const switchPairs = document.getElementById('switchPairsWrap');
    if (switchPairs) switchPairs.innerHTML = '<p class="muted">No data.</p>';
}

/* ── Main refresh ─────────────────────────────── */
async function refreshDashboard() {
    const btn = document.getElementById('refreshBtn');
    const icon = document.getElementById('refreshIcon');
    btn.disabled = true;
    icon.style.animation = 'spin 0.7s linear infinite';

    try {
        document.querySelectorAll('.card').forEach(c => c.classList.add('is-loading'));
        const empId = document.getElementById('employeeSelect').value;
        _rawData = await fetchData(empId);
        if (_rawData.length > 0) {
            renderKPIs(_rawData);
            renderActivityFlow(_rawData);
            renderProficiency(_rawData);
            renderHardware(_rawData);
            renderFriction(_rawData);
        } else {
            resetDashboardUI();
        }
        setEl('lastUpdated', 'Updated ' + new Date().toLocaleTimeString());
    } catch (e) {
        console.error('Dashboard refresh error:', e);
    } finally {
        document.querySelectorAll('.card').forEach(c => c.classList.remove('is-loading'));
        btn.disabled = false;
        icon.style.animation = '';
    }
}

/* ══════════════════════════════════════════════════
   KPI Strip
══════════════════════════════════════════════════ */
function renderKPIs(data) {
    const totalKeys = data.reduce((s, r) => s + (r.keystrokes || 0), 0);
    const totalScroll = data.reduce((s, r) => s + (r.scroll_distance || 0), 0);
    
    // RAM % calculation
    const ramValues = data.filter(r => r.ram_usage_gb > 0 && r.ram_total_gb > 0);
    const avgRamPct = ramValues.length 
        ? Math.round(ramValues.reduce((a,b)=>(a + (b.ram_usage_gb/b.ram_total_gb*100)),0) / ramValues.length) 
        : 0;

    const keyBursts = data.filter(r => r.event_type === 'keystrokes' && r.keystrokes > 0);
    const modBursts = data.filter(r => r.modifier_keys === 1);
    const modRatio = keyBursts.length ? Math.round((modBursts.length / keyBursts.length) * 100) : 0;

    // Active minutes: unique minute slots with keystrokes or cursor movement
    const minuteSet = new Set(data.map(r => r.timestamp ? r.timestamp.substring(0, 16) : null));
    minuteSet.delete(null);
    const activeMinutes = minuteSet.size;

    // Tracked Hours
    let trackedHours = 0;
    if (data.length > 1) {
        const sorted = [...data].sort((a,b)=>new Date(a.timestamp)-new Date(b.timestamp));
        const diffMs = new Date(sorted[sorted.length-1].timestamp) - new Date(sorted[0].timestamp);
        trackedHours = (diffMs / 3600000).toFixed(1);
    }
    
    const activePct = trackedHours > 0 ? Math.min(100, Math.round((activeMinutes / (trackedHours * 60)) * 100)) : 0;

    // Flow Score
    const flowScore = Math.round((modRatio * 0.5) + (activePct * 0.5));

    setEl('kpi-events-val', data.length.toLocaleString());
    setEl('kpi-active-idle-val', activePct + '%');
    setEl('kpi-active-val', activeMinutes.toLocaleString());
    setEl('kpi-modifier-val', modRatio + '%');
    setEl('kpi-flow-score-val', flowScore);

    // Overview Tab Setters
    setEl('overview-tracked-hours', trackedHours + 'h');
    setEl('overview-active-idle', activePct + '%');
    setEl('overview-modifier-ratio', modRatio + '%');
}

/* ══════════════════════════════════════════════════
   VIEW 1 — Activity Flow
══════════════════════════════════════════════════ */
function renderActivityFlow(data) {
    // ── Build per-minute buckets ──
    const buckets = {};
    data.forEach(ev => {
        if (!ev.timestamp) return;
        const d = new Date(ev.timestamp);
        const key = new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()).getTime();
        if (!buckets[key]) buckets[key] = { keys: 0, cursor: 0, scroll: 0, apps: {}, windows: [] };
        const app = simplifyApp(ev.active_window);
        buckets[key].apps[app] = (buckets[key].apps[app] || 0) + 1;
        buckets[key].windows.push(ev.active_window || '');
        if (ev.event_type === 'keystrokes') buckets[key].keys += (ev.keystrokes || 0);
        if (ev.event_type === 'cursor') buckets[key].cursor += 1;
        buckets[key].scroll += (ev.scroll_distance || 0);
    });

    const timeLabels = Object.keys(buckets).map(Number).sort((a,b)=>a-b);

    // Dominant app per minute
    timeLabels.forEach(t => {
        const b = buckets[t];
        b.dominant = Object.entries(b.apps).sort((a,b)=>b[1]-a[1])[0]?.[0] || 'Other';
        b.isIdle = (b.keys === 0 && b.cursor < 2);
    });

    // Project time tracking
    const projectTimes = {};
    let ctx = null;
    timeLabels.forEach(t => {
        const b = buckets[t];
        if (b.windows.some(w => w.includes('[ADOBE_CLOSED]'))) { ctx = null; return; }
        for (const w of b.windows) {
            const m = w.match(/([^\\\/]+\.(prproj|aep))/i);
            if (m) ctx = m[1].replace(/\.(prproj|aep)$/i, '');
        }
        if (ctx && !b.isIdle) projectTimes[ctx] = (projectTimes[ctx] || 0) + 1;
    });

    // ── Activity Mixed Chart ──
    const today = new Date();
    const defMin = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 8, 0).getTime();
    const defMax = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 22, 0).getTime();

    const keysDS = timeLabels.map(t => ({ x: t, y: buckets[t].keys }));
    const activeDS = timeLabels.map(t => ({ x: t, y: buckets[t].isIdle ? null : 1 }));
    const activeColors = timeLabels.map(t => buckets[t].isIdle ? 'transparent' : appColor(buckets[t].dominant));

    const ctxA = document.getElementById('activityChart').getContext('2d');

    if (activityChart) {
        activityChart.data.datasets[0].data = activeDS;
        activityChart.data.datasets[0].backgroundColor = activeColors;
        activityChart.data.datasets[1].data = keysDS;
        activityChart.update();
    } else {
        activityChart = new Chart(ctxA, {
            data: { datasets: [
                { type:'bar', label:'Active App', data:activeDS, backgroundColor:activeColors, barPercentage:1.0, categoryPercentage:1.0, yAxisID:'yBg', order:1, animation: { delay: (ctx) => ctx.type === 'data' ? ctx.dataIndex * 10 : 0 } },
                { type:'line', label:'KPM (Keystrokes/Min)', data:keysDS, borderColor:'#8b5cf6', backgroundColor:'transparent', tension:0.35, borderWidth:2, pointRadius:0, order:0 }
            ]},
            options: {
                responsive:true, maintainAspectRatio:false, animation:true,
                plugins: {
                    legend:{ position:'top' },
                    zoom:{ limits:{x:{min:defMin,max:defMax,minRange:60000}}, zoom:{wheel:{enabled:true},pinch:{enabled:true},mode:'x'}, pan:{enabled:true,mode:'x'} }
                },
                scales: {
                    x:{ type:'time', time:{unit:'hour'}, min:defMin, max:defMax, grid:{display:false} },
                    y:{ beginAtZero:true, title:{display:true,text:'KPM'} },
                    yBg:{ display:false, min:0, max:1 }
                }
            }
        });
    }

    // ── App Distribution Doughnut ──
    const appCounts = {};
    data.forEach(r => {
        const a = simplifyApp(r.active_window);
        appCounts[a] = (appCounts[a] || 0) + 1;
    });
    const sorted = Object.entries(appCounts).sort((a,b)=>b[1]-a[1]).slice(0,6);
    const ctxApp = document.getElementById('appChart').getContext('2d');
    if (appChart) {
        appChart.data.labels = sorted.map(s=>s[0]);
        appChart.data.datasets[0].data = sorted.map(s=>s[1]);
        appChart.data.datasets[0].backgroundColor = sorted.map(s=>appColor(s[0]));
        appChart.update();
    } else {
        appChart = new Chart(ctxApp, {
            type:'doughnut',
            data:{ labels:sorted.map(s=>s[0]), datasets:[{ data:sorted.map(s=>s[1]), backgroundColor:sorted.map(s=>appColor(s[0])), borderWidth:0, hoverOffset:6 }] },
            options:{ responsive:true, maintainAspectRatio:false, cutout:'68%', animation:true, plugins:{ legend:{ position:'bottom', labels:{ boxWidth:10, padding:10 } } } }
        });
    }

    // ── Scroll by App bar chart ──
    const scrollByApp = {};
    data.forEach(r => {
        if (!r.scroll_distance) return;
        const a = simplifyApp(r.active_window);
        scrollByApp[a] = (scrollByApp[a] || 0) + r.scroll_distance;
    });
    const sortedScroll = Object.entries(scrollByApp).sort((a,b)=>b[1]-a[1]).slice(0,6);
    const ctxScroll = document.getElementById('scrollAppChart').getContext('2d');
    if (scrollAppChart) {
        scrollAppChart.data.labels = sortedScroll.map(s=>s[0]);
        scrollAppChart.data.datasets[0].data = sortedScroll.map(s=>s[1]);
        scrollAppChart.data.datasets[0].backgroundColor = sortedScroll.map(s=>appColor(s[0]));
        scrollAppChart.update();
    } else {
        scrollAppChart = new Chart(ctxScroll, {
            type:'bar',
            data:{ labels:sortedScroll.map(s=>s[0]), datasets:[{ data:sortedScroll.map(s=>s[1]), backgroundColor:sortedScroll.map(s=>appColor(s[0])), borderRadius:6, borderSkipped:false }] },
            options:{ indexAxis:'y', responsive:true, maintainAspectRatio:false, animation:{ delay: (ctx) => ctx.type === 'data' ? ctx.dataIndex * 50 : 0 }, plugins:{legend:{display:false}}, scales:{ x:{beginAtZero:true,title:{display:true,text:'Scroll Ticks'}}, y:{grid:{display:false}} } }
        });
    }

    // ── Project Time list ──
    const wrap = document.getElementById('projectListWrap');
    wrap.innerHTML = '';
    if (Object.keys(projectTimes).length === 0) {
        wrap.innerHTML = '<p class="muted" style="padding:1rem 0">No project context found.</p>';
    } else {
        Object.entries(projectTimes).sort((a,b)=>b[1]-a[1]).forEach(([proj, mins]) => {
            const row = document.createElement('div');
            row.className = 'project-row';
            row.innerHTML = `<span class="project-name">${proj}</span><span class="project-time">${fmtMins(mins)}</span>`;
            wrap.appendChild(row);
        });
    }
}

/* ══════════════════════════════════════════════════
   VIEW 2 — Editor Proficiency
══════════════════════════════════════════════════ */
function renderProficiency(data) {
    const keyBursts = data.filter(r => r.event_type === 'keystrokes' && r.keystrokes > 0);
    const modBursts = keyBursts.filter(r => r.modifier_keys === 1);
    const modRatio  = keyBursts.length ? Math.round((modBursts.length / keyBursts.length) * 100) : 0;

    // ── Modifier Gauge (semi-circle arc) ──
    setEl('modifierPct', modRatio + '%');

    const ctxG = document.getElementById('modifierGauge').getContext('2d');
    const gaugeColor = modRatio >= 60 ? '#10b981' : modRatio >= 35 ? '#f59e0b' : '#ef4444';
    if (modifierGaugeChart) {
        modifierGaugeChart.data.datasets[0].data = [modRatio, 100 - modRatio];
        modifierGaugeChart.data.datasets[0].backgroundColor[0] = gaugeColor;
        modifierGaugeChart.update();
    } else {
        modifierGaugeChart = new Chart(ctxG, {
            type:'doughnut',
            data:{ datasets:[{ data:[modRatio, 100-modRatio], backgroundColor:[gaugeColor,'rgba(255,255,255,0.05)'], borderWidth:0, circumference:180, rotation:270 }] },
            options:{ responsive:false, cutout:'78%', animation:true, plugins:{legend:{display:false},tooltip:{enabled:false}} }
        });
    }

    const insight = modRatio >= 60
        ? '🔥 Power user — heavy shortcut dependency. Highly proficient workflow.'
        : modRatio >= 35
        ? '⚡ Solid shortcut usage. Some opportunities for additional training.'
        : '📋 Low modifier ratio. Consider a shortcuts training session.';
    setEl('modifierInsight', insight);

    // ── KPM Line Chart ──
    const kpmByMinute = {};
    keyBursts.forEach(r => {
        const d = new Date(r.timestamp);
        const key = new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()).getTime();
        kpmByMinute[key] = (kpmByMinute[key] || 0) + r.keystrokes;
    });
    const kpmLabels = Object.keys(kpmByMinute).map(Number).sort((a,b)=>a-b);
    const kpmValues = kpmLabels.map(t => ({ x:t, y:kpmByMinute[t] }));

    const ctxKPM = document.getElementById('kpmChart').getContext('2d');
    const kpmGrad = ctxKPM.createLinearGradient(0,0,0,240);
    kpmGrad.addColorStop(0,'rgba(139,92,246,0.4)');
    kpmGrad.addColorStop(1,'rgba(139,92,246,0)');

    if (kpmChart) {
        kpmChart.data.datasets[0].data = kpmValues;
        kpmChart.update();
    } else {
        kpmChart = new Chart(ctxKPM, {
            type:'line',
            data:{ datasets:[{ label:'KPM', data:kpmValues, borderColor:'#8b5cf6', backgroundColor:kpmGrad, fill:true, tension:0.4, borderWidth:2, pointRadius:0 }] },
            options:{ responsive:true, maintainAspectRatio:false, animation:true, plugins:{legend:{display:false}}, scales:{ x:{type:'time',time:{unit:'hour'}}, y:{beginAtZero:true} } }
        });
    }

    // ── Flow State Heatmap ──
    const heatByHour = Array(24).fill(0);
    keyBursts.forEach(r => {
        const h = new Date(r.timestamp).getHours();
        heatByHour[h] += r.keystrokes;
    });
    const maxH = Math.max(...heatByHour, 1);

    const grid = document.getElementById('heatmapWrap');
    grid.innerHTML = '';

    for (let h = 0; h < 24; h++) {
        const val = heatByHour[h];
        const intensity = val / maxH;
        const cell = document.createElement('div');
        cell.className = 'heatmap-cell';
        const alpha = 0.08 + intensity * 0.9;
        const hue = Math.round(220 + intensity * 60); // blue → purple
        cell.style.background = `hsla(${hue},80%,65%,${alpha})`;
        cell.innerHTML = `<span class="tip">${h}:00 — ${val} keys</span>`;
        grid.appendChild(cell);
    }

    // Hour labels row
    const oldLabels = grid.nextSibling;
    if (oldLabels && oldLabels.className === 'heatmap-hours') {
        oldLabels.remove();
    }
    const labelRow = document.createElement('div');
    labelRow.className = 'heatmap-hours';
    for (let h = 0; h < 24; h++) {
        const lbl = document.createElement('div');
        lbl.className = 'heatmap-hour-label';
        lbl.textContent = h % 3 === 0 ? h + 'h' : '';
        labelRow.appendChild(lbl);
    }
    grid.after(labelRow);
}

/* ══════════════════════════════════════════════════
   VIEW 3 — Hardware Health
══════════════════════════════════════════════════ */
function renderHardware(data) {
    const ramData = data.filter(r => r.ram_usage_gb > 0);

    if (ramData.length === 0) {
        setEl('ramAlertText', 'No RAM data collected yet. Ensure you are running usage_monitor v2+ with psutil.');
        setEl('peakRam', '—');
        document.getElementById('ramByApp').innerHTML = '<p class="muted">No data.</p>';
        return;
    }

    const peak = Math.max(...ramData.map(r=>r.ram_usage_gb));
    document.getElementById('peakRam').innerHTML = `${peak.toFixed(3)}<small>GB</small>`;

    // Spike detection: any reading > 0.5 GB (tracker process spiking = heavy system load)
    const spikes = ramData.filter(r => r.ram_usage_gb > 0.5);
    const alertText = spikes.length > 0
        ? `⚠️ ${spikes.length} RAM spike event(s) detected. Peak at ${peak.toFixed(3)} GB. Review logs for potential crash context.`
        : `✅ RAM levels healthy. Peak: ${peak.toFixed(3)} GB — no abnormal spikes detected.`;
    setEl('ramAlertText', alertText);
    const alertCard = document.getElementById('ramAlertCard');
    alertCard.style.borderColor = spikes.length > 0 ? 'rgba(239,68,68,0.4)' : 'rgba(16,185,129,0.4)';

    // RAM by app (average)
    const ramByApp = {};
    ramData.forEach(r => {
        const a = simplifyApp(r.active_window);
        if (!ramByApp[a]) ramByApp[a] = { sum:0, count:0 };
        ramByApp[a].sum += r.ram_usage_gb;
        ramByApp[a].count++;
    });
    const ramAvgs = Object.entries(ramByApp).map(([a,v])=>({ app:a, avg: v.sum/v.count })).sort((a,b)=>b.avg-a.avg).slice(0,5);
    const maxRam = ramAvgs[0]?.avg || 1;
    const barWrap = document.getElementById('ramByApp');
    barWrap.innerHTML = ramAvgs.map(r => `
        <div class="bar-item">
            <div class="bar-meta"><span class="label">${r.app}</span><span class="val">${r.avg.toFixed(3)} GB</span></div>
            <div class="bar-track"><div class="bar-fill" style="width:${(r.avg/maxRam*100).toFixed(1)}%;background:${appColor(r.app)}"></div></div>
        </div>`).join('');

    // RAM Timeline Chart
    const ramPoints = ramData
        .map(r => ({ x: new Date(r.timestamp).getTime(), y: r.ram_usage_gb }))
        .sort((a,b)=>a.x-b.x);

    const ctxR = document.getElementById('ramChart').getContext('2d');
    const ramGrad = ctxR.createLinearGradient(0,0,0,280);
    ramGrad.addColorStop(0,'rgba(239,68,68,0.35)');
    ramGrad.addColorStop(1,'rgba(239,68,68,0)');

    if (ramChart) {
        ramChart.data.datasets[0].data = ramPoints;
        ramChart.update();
    } else {
        ramChart = new Chart(ctxR, {
            type:'line',
            data:{ datasets:[{ label:'RAM (GB)', data:ramPoints, borderColor:'#ef4444', backgroundColor:ramGrad, fill:true, tension:0.3, borderWidth:2, pointRadius:0 }] },
            options:{ responsive:true, maintainAspectRatio:false, animation:true, plugins:{legend:{display:false}}, scales:{ x:{type:'time',time:{unit:'hour'},title:{display:true,text:'Time'}}, y:{beginAtZero:true,title:{display:true,text:'RAM (GB)'}} } }
        });
    }
}

/* ══════════════════════════════════════════════════
   VIEW 4 — Workflow Friction
══════════════════════════════════════════════════ */
function renderFriction(data) {
    if (data.length < 2) return;

    // ── Context switch rate ──
    const sorted = [...data].sort((a,b)=>new Date(a.timestamp)-new Date(b.timestamp));
    let switches = 0;
    for (let i = 1; i < sorted.length; i++) {
        if (simplifyApp(sorted[i].active_window) !== simplifyApp(sorted[i-1].active_window)) switches++;
    }
    const sessionMins = (new Date(sorted[sorted.length-1].timestamp) - new Date(sorted[0].timestamp)) / 60000 || 1;
    const switchRate = (switches / (sessionMins / 60)).toFixed(1);
    document.getElementById('contextSwitchRate').innerHTML = `${switchRate}<small>/hr</small>`;

    const csInsight = switchRate > 30
        ? '🔴 Very high context switching. Fragmented focus — consider blocking deep work time.'
        : switchRate > 15
        ? '🟡 Moderate context switching. Some distraction pattern present.'
        : '🟢 Low context switching. Good focus maintenance.';
    setEl('contextSwitchInsight', csInsight);
    setEl('frictionWarningText', csInsight);
    
    const warnBox = document.getElementById('frictionWarningBox');
    if (warnBox) {
        if (switchRate > 30) {
            warnBox.className = 'card span-full card-warn';
            warnBox.style.borderColor = 'rgba(239,68,68,0.5)';
            warnBox.style.background = 'rgba(239,68,68,0.08)';
        } else if (switchRate > 15) {
            warnBox.className = 'card span-full card-warn';
            warnBox.style.borderColor = '';
            warnBox.style.background = '';
        } else {
            warnBox.className = 'card span-full card-highlight';
            warnBox.style.borderColor = 'rgba(16,185,129,0.4)';
            warnBox.style.background = 'rgba(16,185,129,0.05)';
        }
    }

    // ── Switch pairs ──
    const switchPairs = {};
    for (let i = 1; i < sorted.length; i++) {
        const from = simplifyApp(sorted[i-1].active_window);
        const to   = simplifyApp(sorted[i].active_window);
        if (from !== to) {
            const key = `${from} → ${to}`;
            switchPairs[key] = (switchPairs[key] || 0) + 1;
        }
    }
    const topPairs = Object.entries(switchPairs).sort((a,b)=>b[1]-a[1]).slice(0,5);
    const maxPair = topPairs[0]?.[1] || 1;
    document.getElementById('switchPairsWrap').innerHTML = topPairs.map(([pair, cnt]) => `
        <div class="bar-item">
            <div class="bar-meta"><span class="label" style="font-size:0.75rem">${pair}</span><span class="val">${cnt}×</span></div>
            <div class="bar-track"><div class="bar-fill" style="width:${(cnt/maxPair*100).toFixed(1)}%;background:var(--amber)"></div></div>
        </div>`).join('');

    // ── Scroll by Category chart ──
    const scrollCat = { 'NLE (Creative)': 0, 'Browser/Research': 0, 'Asset Hunting': 0, 'Other': 0 };
    data.forEach(r => {
        if (!r.scroll_distance) return;
        const a = simplifyApp(r.active_window);
        if (isNLE(a)) scrollCat['NLE (Creative)'] += r.scroll_distance;
        else if (a === 'Browser') scrollCat['Browser/Research'] += r.scroll_distance;
        else if (a === 'File Explorer') scrollCat['Asset Hunting'] += r.scroll_distance;
        else scrollCat['Other'] += r.scroll_distance;
    });
    const catColors = ['#8b5cf6','#3b82f6','#ef4444','#64748b'];
    const ctxSC = document.getElementById('scrollCatChart').getContext('2d');
    if (scrollCatChart) {
        scrollCatChart.data.datasets[0].data = Object.values(scrollCat);
        scrollCatChart.update();
    } else {
        scrollCatChart = new Chart(ctxSC, {
            type:'doughnut',
            data:{ labels:Object.keys(scrollCat), datasets:[{ data:Object.values(scrollCat), backgroundColor:catColors, borderWidth:0, hoverOffset:4 }] },
            options:{ responsive:true, maintainAspectRatio:false, cutout:'62%', animation:true, plugins:{ legend:{ position:'bottom', labels:{ boxWidth:10, padding:8 } } } }
        });
    }

    // ── Window switch timeline (switches per hour) ──
    const switchByHour = {};
    for (let i = 1; i < sorted.length; i++) {
        const from = simplifyApp(sorted[i-1].active_window);
        const to   = simplifyApp(sorted[i].active_window);
        if (from !== to) {
            const h = new Date(sorted[i].timestamp).getHours();
            const key = new Date(new Date(sorted[i].timestamp).setMinutes(0,0,0)).getTime();
            switchByHour[key] = (switchByHour[key] || 0) + 1;
        }
    }
    const swLabels = Object.keys(switchByHour).map(Number).sort((a,b)=>a-b);
    const ctxSW = document.getElementById('switchChart').getContext('2d');
    const swGrad = ctxSW.createLinearGradient(0,0,0,260);
    swGrad.addColorStop(0,'rgba(245,158,11,0.35)');
    swGrad.addColorStop(1,'rgba(245,158,11,0)');
    if (switchChart) {
        switchChart.data.datasets[0].data = swLabels.map(t=>({x:t,y:switchByHour[t]}));
        switchChart.update();
    } else {
        switchChart = new Chart(ctxSW, {
            type:'bar',
            data:{ datasets:[{ label:'Switches/Hr', data:swLabels.map(t=>({x:t,y:switchByHour[t]})), backgroundColor:swGrad, borderColor:'#f59e0b', borderWidth:1, borderRadius:4 }] },
            options:{ responsive:true, maintainAspectRatio:false, animation:{ delay: (ctx) => ctx.type === 'data' ? ctx.dataIndex * 30 : 0 }, plugins:{legend:{display:false}}, scales:{ x:{type:'time',time:{unit:'hour'}}, y:{beginAtZero:true,title:{display:true,text:'Context Switches'}} } }
        });
    }
}

/* ── Gemini Chat ── */
let chatHistory = [];
function toggleChat() {
    document.getElementById('chat-widget').classList.toggle('closed');
}
async function sendChatMessage() {
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text) return;
    
    input.value = '';
    const body = document.getElementById('chat-body');
    
    // Add user message
    const msgDiv = document.createElement('div');
    msgDiv.className = 'chat-message user-message';
    msgDiv.textContent = text;
    body.appendChild(msgDiv);
    chatHistory.push({ role: 'user', content: text });
    
    // Add loading
    const loadDiv = document.createElement('div');
    loadDiv.className = 'chat-message ai-message';
    loadDiv.innerHTML = '<span class="spinner"></span> Thinking...';
    body.appendChild(loadDiv);
    body.scrollTop = body.scrollHeight;

    try {
        // Collect context (the KPIs and friction info)
        const contextData = {
            activeMinutes: document.getElementById('kpi-active-val').textContent,
            modifierRatio: document.getElementById('kpi-modifier-val').textContent,
            contextSwitchRate: document.getElementById('contextSwitchRate')?.textContent,
            peakRam: document.getElementById('peakRam')?.textContent,
            frictionWarning: document.getElementById('frictionWarningText')?.textContent
        };

        const res = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: chatHistory, contextData })
        });
        const data = await res.json();
        
        body.removeChild(loadDiv);
        
        if (data.reply) {
            const replyDiv = document.createElement('div');
            replyDiv.className = 'chat-message ai-message';
            replyDiv.textContent = data.reply;
            body.appendChild(replyDiv);
            chatHistory.push({ role: 'model', content: data.reply });
        } else {
            throw new Error(data.error || 'Unknown error');
        }
    } catch (err) {
        body.removeChild(loadDiv);
        const errDiv = document.createElement('div');
        errDiv.className = 'chat-message ai-message';
        errDiv.style.color = '#ef4444';
        errDiv.textContent = 'Error: ' + err.message;
        body.appendChild(errDiv);
    }
    body.scrollTop = body.scrollHeight;
}

function handleChatKeypress(e) {
    if (e.key === 'Enter') sendChatMessage();
}


/* ══════════════════════════════════════════════════
   Init
══════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
    fetchProfiles().then(() => refreshDashboard());

    // Auto-refresh every 60s
    setInterval(refreshDashboard, 60000);
});
