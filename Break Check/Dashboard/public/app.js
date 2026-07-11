/* ═══════════════════════════════════════════════
   Break Check Dashboard — app.js v2
   Views: Activity Flow | Proficiency | Hardware | Friction | Team
   ═══════════════════════════════════════════════ */

'use strict';

const SUPABASE_URL = "https://toidowlqmqbmtrfjvzgt.supabase.co";
const SUPABASE_KEY = "sb_publishable_KSuDUKzHr8kzRV2YlnpP_g_osCedHm8";

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
        const res = await fetch(`${SUPABASE_URL}/rest/v1/team_profiles?order=full_name.asc`, {
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
        });
        const profiles = await res.json();
        select.innerHTML = '';
        const all = document.createElement('option');
        all.value = ''; all.textContent = 'All Employees';
        select.appendChild(all);
        (profiles || []).forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.full_name; opt.textContent = p.full_name;
            select.appendChild(opt);
        });
    } catch (e) {
        console.warn('Could not load profiles from Supabase:', e);
        select.innerHTML = '<option value="">All Employees</option>';
    }
}


/* ── Main refresh ─────────────────────────────── */
async function refreshDashboard() {
    const btn = document.getElementById('refreshBtn');
    const icon = document.getElementById('refreshIcon');
    btn.disabled = true;
    icon.style.animation = 'spin 0.7s linear infinite';

    try {
        destroyAllCharts();           // clear previous profile's charts first
        const empId = document.getElementById('employeeSelect').value;
        _rawData = await fetchData(empId);
        if (_rawData.length > 0) {
            renderKPIs(_rawData);
            renderActivityFlow(_rawData);
            renderProficiency(_rawData);
            renderHardware(_rawData);
            renderFriction(_rawData);
        } else {
            // No data for this profile — clear the KPI strip
            ['kpi-events-val','kpi-keys-val','kpi-active-val',
             'kpi-modifier-val','kpi-scroll-val','kpi-ram-val'].forEach(id => setEl(id, '—'));
        }
        setEl('lastUpdated', 'Updated ' + new Date().toLocaleTimeString());
    } catch (e) {
        console.error('Dashboard refresh error:', e);
    } finally {
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
    const ramValues = data.filter(r => r.ram_usage_gb > 0).map(r => r.ram_usage_gb);
    const avgRam = ramValues.length ? (ramValues.reduce((a,b)=>a+b,0)/ramValues.length).toFixed(3) : '—';

    const keyBursts = data.filter(r => r.event_type === 'keystrokes' && r.keystrokes > 0);
    const modBursts = data.filter(r => r.modifier_keys === 1);
    const modRatio = keyBursts.length ? Math.round((modBursts.length / keyBursts.length) * 100) : 0;

    // Active minutes: unique minute slots with keystrokes or cursor movement
    const minuteSet = new Set(data.map(r => r.timestamp ? r.timestamp.substring(0, 16) : null));
    minuteSet.delete(null);

    setEl('kpi-events-val', data.length.toLocaleString());
    setEl('kpi-keys-val', totalKeys.toLocaleString());
    setEl('kpi-active-val', minuteSet.size.toLocaleString());
    setEl('kpi-modifier-val', modRatio + '%');
    setEl('kpi-scroll-val', totalScroll.toLocaleString());
    setEl('kpi-ram-val', avgRam !== '—' ? avgRam + ' GB' : '—');
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

    // ── Activity Line Chart ──
    const today = new Date();
    const defMin = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 8, 0).getTime();
    const defMax = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 22, 0).getTime();

    const keysDS = timeLabels.map(t => ({ x: t, y: buckets[t].keys }));
    const curDS  = timeLabels.map(t => ({ x: t, y: buckets[t].cursor }));
    const idleDS = timeLabels.map(t => ({ x: t, y: buckets[t].isIdle ? 1 : null }));

    const ctxA = document.getElementById('activityChart').getContext('2d');
    const grad = ctxA.createLinearGradient(0, 0, 0, 320);
    grad.addColorStop(0, 'rgba(59,130,246,0.4)');
    grad.addColorStop(1, 'rgba(59,130,246,0)');

    if (activityChart) {
        activityChart.data.datasets[0].data = idleDS;
        activityChart.data.datasets[1].data = keysDS;
        activityChart.data.datasets[2].data = curDS;
        activityChart.update('none');
    } else {
        activityChart = new Chart(ctxA, {
            data: { datasets: [
                { type:'line', label:'Idle', data:idleDS, borderColor:'#ef444488', borderWidth:6, pointRadius:0, spanGaps:false, stepped:'middle', yAxisID:'yBg', order:0 },
                { type:'line', label:'Keystrokes', data:keysDS, borderColor:'#8b5cf6', backgroundColor:'transparent', tension:0.35, borderWidth:2, order:1 },
                { type:'line', label:'Cursor Events', data:curDS, borderColor:'#3b82f6', backgroundColor:grad, fill:true, tension:0.35, borderWidth:2, order:2 },
            ]},
            options: {
                responsive:true, maintainAspectRatio:false, animation:false,
                plugins: {
                    legend:{ position:'top' },
                    zoom:{ limits:{x:{min:defMin,max:defMax,minRange:60000}}, zoom:{wheel:{enabled:true},pinch:{enabled:true},mode:'x'}, pan:{enabled:true,mode:'x'} }
                },
                scales: {
                    x:{ type:'time', time:{unit:'hour'}, min:defMin, max:defMax },
                    y:{ beginAtZero:true, title:{display:true,text:'Count'} },
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
        appChart.update('none');
    } else {
        appChart = new Chart(ctxApp, {
            type:'doughnut',
            data:{ labels:sorted.map(s=>s[0]), datasets:[{ data:sorted.map(s=>s[1]), backgroundColor:sorted.map(s=>appColor(s[0])), borderWidth:0, hoverOffset:6 }] },
            options:{ responsive:true, maintainAspectRatio:false, cutout:'68%', animation:false, plugins:{ legend:{ position:'bottom', labels:{ boxWidth:10, padding:10 } } } }
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
        scrollAppChart.update('none');
    } else {
        scrollAppChart = new Chart(ctxScroll, {
            type:'bar',
            data:{ labels:sortedScroll.map(s=>s[0]), datasets:[{ data:sortedScroll.map(s=>s[1]), backgroundColor:sortedScroll.map(s=>appColor(s[0])), borderRadius:6, borderSkipped:false }] },
            options:{ indexAxis:'y', responsive:true, maintainAspectRatio:false, animation:false, plugins:{legend:{display:false}}, scales:{ x:{beginAtZero:true,title:{display:true,text:'Scroll Ticks'}}, y:{grid:{display:false}} } }
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
        modifierGaugeChart.update('none');
    } else {
        modifierGaugeChart = new Chart(ctxG, {
            type:'doughnut',
            data:{ datasets:[{ data:[modRatio, 100-modRatio], backgroundColor:[gaugeColor,'rgba(255,255,255,0.05)'], borderWidth:0, circumference:180, rotation:270 }] },
            options:{ responsive:false, cutout:'78%', animation:false, plugins:{legend:{display:false},tooltip:{enabled:false}} }
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
        kpmChart.update('none');
    } else {
        kpmChart = new Chart(ctxKPM, {
            type:'line',
            data:{ datasets:[{ label:'KPM', data:kpmValues, borderColor:'#8b5cf6', backgroundColor:kpmGrad, fill:true, tension:0.4, borderWidth:2, pointRadius:0 }] },
            options:{ responsive:true, maintainAspectRatio:false, animation:false, plugins:{legend:{display:false}}, scales:{ x:{type:'time',time:{unit:'hour'}}, y:{beginAtZero:true} } }
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
        ramChart.update('none');
    } else {
        ramChart = new Chart(ctxR, {
            type:'line',
            data:{ datasets:[{ label:'RAM (GB)', data:ramPoints, borderColor:'#ef4444', backgroundColor:ramGrad, fill:true, tension:0.3, borderWidth:2, pointRadius:0 }] },
            options:{ responsive:true, maintainAspectRatio:false, animation:false, plugins:{legend:{display:false}}, scales:{ x:{type:'time',time:{unit:'hour'},title:{display:true,text:'Time'}}, y:{beginAtZero:true,title:{display:true,text:'RAM (GB)'}} } }
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
        scrollCatChart.update('none');
    } else {
        scrollCatChart = new Chart(ctxSC, {
            type:'doughnut',
            data:{ labels:Object.keys(scrollCat), datasets:[{ data:Object.values(scrollCat), backgroundColor:catColors, borderWidth:0, hoverOffset:4 }] },
            options:{ responsive:true, maintainAspectRatio:false, cutout:'62%', animation:false, plugins:{ legend:{ position:'bottom', labels:{ boxWidth:10, padding:8 } } } }
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
        switchChart.update('none');
    } else {
        switchChart = new Chart(ctxSW, {
            type:'bar',
            data:{ datasets:[{ label:'Switches/Hr', data:swLabels.map(t=>({x:t,y:switchByHour[t]})), backgroundColor:swGrad, borderColor:'#f59e0b', borderWidth:1, borderRadius:4 }] },
            options:{ responsive:true, maintainAspectRatio:false, animation:false, plugins:{legend:{display:false}}, scales:{ x:{type:'time',time:{unit:'hour'}}, y:{beginAtZero:true,title:{display:true,text:'Context Switches'}} } }
        });
    }
}

/* ══════════════════════════════════════════════════
   VIEW 5 — Team Profiles (Supabase)
══════════════════════════════════════════════════ */
async function loadTeamProfiles() {
    const tbody = document.getElementById('team-profiles-body');
    if (!tbody) return;
    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/team_profiles?order=created_at.desc`, {
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
        });
        const profiles = await res.json();
        tbody.innerHTML = '';
        if (!profiles.length) {
            tbody.innerHTML = '<tr><td colspan="4" class="muted center">No profiles found.</td></tr>';
            return;
        }
        profiles.forEach(p => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="font-weight:600;color:#f1f5f9">${p.full_name}</td>
                <td><span class="badge badge-purple">${p.initials}</span></td>
                <td><span style="display:inline-flex;align-items:center;gap:6px"><span style="width:12px;height:12px;border-radius:50%;background:${p.hex_color};display:inline-block"></span>${p.hex_color}</span></td>
                <td style="text-align:right">
                    <button class="action-btn btn-amber btn-edit-profile" data-id="${p.id}" data-name="${p.full_name}" data-initials="${p.initials}" data-color="${p.hex_color}">Edit</button>
                    <button class="action-btn btn-red btn-delete-profile" data-id="${p.id}" data-name="${p.full_name}" style="margin-left:6px">Delete</button>
                </td>`;
            tbody.appendChild(tr);
        });
        document.querySelectorAll('.btn-edit-profile').forEach(btn => {
            btn.addEventListener('click', async () => {
                const newName = prompt('Full Name:', btn.dataset.name); if (!newName?.trim()) return;
                const newInit = prompt('Initials (2 letters):', btn.dataset.initials); if (!newInit?.trim()) return;
                const newColor= prompt('Hex Color:', btn.dataset.color); if (!newColor?.trim()) return;
                await editTeamProfile(btn.dataset.id, newName.trim(), newInit.trim().toUpperCase(), newColor.trim());
            });
        });
        document.querySelectorAll('.btn-delete-profile').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (confirm(`Delete "${btn.dataset.name}"?`)) await deleteTeamProfile(btn.dataset.id);
            });
        });
    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="4" style="color:#ef4444;text-align:center">Failed to load profiles.</td></tr>';
    }
}

async function addTeamProfile(fullName) {
    const parts = fullName.trim().split(/\s+/);
    const initials = (parts.length >= 2) ? (parts[0][0] + parts[parts.length-1][0]).toUpperCase() : fullName.substring(0,2).toUpperCase();
    const colors = ['#f43f5e','#8b5cf6','#3b82f6','#10b981','#f59e0b','#06b6d4','#a855f7','#ec4899'];
    const hex = colors[Math.floor(Math.random()*colors.length)];
    const btn = document.getElementById('btn-add-profile');
    btn.disabled = true; btn.textContent = 'Adding…';
    try {
        await fetch(`${SUPABASE_URL}/rest/v1/team_profiles`, {
            method:'POST',
            headers:{'apikey':SUPABASE_KEY,'Authorization':`Bearer ${SUPABASE_KEY}`,'Content-Type':'application/json','Prefer':'return=minimal'},
            body: JSON.stringify({ full_name:fullName, initials, hex_color:hex })
        });
        document.getElementById('new-profile-name').value = '';
        await loadTeamProfiles();
        await fetchProfiles();
    } catch (e) { alert('Error: ' + e.message); }
    finally { btn.disabled=false; btn.textContent='+ Add Employee'; }
}

async function deleteTeamProfile(id) {
    try {
        const res = await fetch('/api/delete-profile', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id}) });
        if (!res.ok) throw new Error((await res.json()).error);
        await loadTeamProfiles();
        await fetchProfiles();
    } catch (e) { alert('Error: ' + e.message); }
}

async function editTeamProfile(id, name, initials, color) {
    try {
        const res = await fetch('/api/update-profile', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id,full_name:name,initials,hex_color:color}) });
        if (!res.ok) throw new Error((await res.json()).error);
        await loadTeamProfiles();
        await fetchProfiles();
    } catch (e) { alert('Error: ' + e.message); }
}

/* ══════════════════════════════════════════════════
   Init
══════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
    fetchProfiles().then(() => refreshDashboard());
    loadTeamProfiles();

    document.getElementById('btn-add-profile')?.addEventListener('click', () => {
        const name = document.getElementById('new-profile-name').value;
        if (name.trim()) addTeamProfile(name);
    });

    // Auto-refresh every 60s
    setInterval(refreshDashboard, 60000);
});
