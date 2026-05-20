/* ── Shared utilities & chart helpers ──────────────────────── */

const CHART_COLORS = [
  '#e8543a','#4493f8','#3fb950','#d29922','#a371f7',
  '#79c0ff','#56d364','#f0a050','#ff7b72','#63e6be'
];
const CHART_COLORS_ALPHA = [
  'rgba(232,84,58,0.65)','rgba(68,147,248,0.65)','rgba(63,185,80,0.65)','rgba(210,153,34,0.65)','rgba(163,113,247,0.65)',
  'rgba(121,192,255,0.65)','rgba(86,211,100,0.65)','rgba(240,160,80,0.65)','rgba(255,123,114,0.65)','rgba(99,230,190,0.65)'
];

function toast(msg, type = 'info') {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.className = `show ${type}`;
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 4000);
}

async function apiFetch(url, opts = {}) {
  try {
    const r = await fetch(url, opts);
    const text = await r.text();
    const data = text ? JSON.parse(text) : {};
    if (!r.ok) {
      const msg = data.error || data.message || JSON.stringify(data);
      toast('Error: ' + msg, 'error');
      return null;
    }
    return data;
  } catch (e) {
    toast('Network error: ' + e.message, 'error');
    return null;
  }
}

function sendJSON(url, method, body) {
  return apiFetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
const postJSON = (url, body) => sendJSON(url, 'POST', body);
const putJSON  = (url, body) => sendJSON(url, 'PUT',  body);

function fmtNum(n) {
  if (n === undefined || n === null) return '—';
  return Number(n).toLocaleString();
}

function openModal(id)  { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.modal-overlay').forEach(o => {
    o.addEventListener('click', e => { if (e.target === o) o.classList.remove('open'); });
  });
});

/* ── Chart helpers ─────────────────────────────────────────── */

const _charts = {};

function renderBarChart(id, labels, datasets) {
  if (_charts[id]) _charts[id].destroy();
  const ctx = document.getElementById(id).getContext('2d');
  _charts[id] = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#495057', font: { size: 12 } } } },
      scales: {
        x: { ticks: { color: '#495057', font: { size: 12 } }, grid: { color: '#dee2e6' } },
        y: { ticks: { color: '#495057', font: { size: 12 },
            callback: v => v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : v >= 1e3 ? (v / 1e3).toFixed(0) + 'K' : v },
          grid: { color: '#dee2e6' } }
      }
    }
  });
}

function renderHorizBar(id, labels, values, title = '') {
  if (_charts[id]) _charts[id].destroy();
  const ctx = document.getElementById(id).getContext('2d');
  _charts[id] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{ label: title, data: values,
        backgroundColor: CHART_COLORS_ALPHA.slice(0, labels.length),
        borderColor: CHART_COLORS.slice(0, labels.length),
        borderWidth: 1,
        borderRadius: 4 }]
    },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#495057', font: { size: 12 },
            callback: v => v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : v >= 1e3 ? (v / 1e3).toFixed(0) + 'K' : v },
          grid: { color: '#dee2e6' } },
        y: { ticks: { color: '#212529', font: { size: 12 } }, grid: { color: '#dee2e6' } }
      }
    }
  });
}

function renderDoughnut(id, labels, values) {
  if (_charts[id]) _charts[id].destroy();
  const ctx = document.getElementById(id).getContext('2d');
  _charts[id] = new Chart(ctx, {
    type: 'doughnut',
    data: { labels, datasets: [{ data: values,
      backgroundColor: CHART_COLORS_ALPHA.slice(0, labels.length),
      borderColor: '#ffffff',
      borderWidth: 2 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'right', labels: { color: '#212529', font: { size: 12 }, padding: 12 } } }
    }
  });
}
