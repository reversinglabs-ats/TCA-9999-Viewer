/* ── Dashboard: Overview / Usage Reports ────────────────────────────────── */

const DASH_TABS = ['overview', 'usage'];
const USAGE_TABS = ['daily-company', 'monthly-company', 'daily-user', 'monthly-user'];

function switchDashTab(name) {
  document.querySelectorAll('#dash-tabs .tab').forEach((t, i) => {
    t.classList.toggle('active', DASH_TABS[i] === name);
  });
  document.querySelectorAll('#panel-dashboard > .panel').forEach(p => p.classList.remove('active'));
  document.getElementById('dash-' + name).classList.add('active');
  if (name === 'overview') loadDashboard();
}

/* ── Overview ──────────────────────────────────────────────── */

function parseUsageReport(data) {
  const rl = data?.rl || {};
  return rl.usage_report || rl.query_report || [];
}

function lastNMonths(n) {
  const months = [];
  const d = new Date();
  for (let i = n - 1; i >= 0; i--) {
    months.push(new Date(d.getFullYear(), d.getMonth() - i, 1).toISOString().slice(0, 7));
  }
  return months;
}

function renderTodayUsage(rows) {
  const el = document.getElementById('dash-usage-today');
  if (!rows.length) {
    el.innerHTML = '<div class="text-muted" style="text-align:center;padding:20px">No data for today</div>';
    return;
  }
  const body = rows.slice(0, 8).map(r =>
    `<tr><td style="font-size:12px">${r.product || '—'}</td><td class="text-right mono">${fmtNum(r.number_of_queries)}</td></tr>`
  ).join('');
  el.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Product</th><th class="text-right">Queries</th></tr></thead><tbody>${body}</tbody></table></div>`;
}

async function loadDashboard() {
  const today = new Date().toISOString().slice(0, 10);

  const [comp, lics, todayUsage] = await Promise.all([
    apiFetch('/api/company'),
    apiFetch('/api/licenses'),
    apiFetch(`/api/usage/company/daily?date=${today}`),
  ]);

  if (comp) {
    const c = comp?.rl?.company || comp?.rl || {};
    document.getElementById('stat-company').textContent = c.name || '—';
    document.getElementById('stat-users').textContent = fmtNum(c.number_of_users ?? c.user_count ?? '—');
  }
  if (lics) {
    const arr = lics?.rl?.licenses || lics?.rl?.license_list || [];
    document.getElementById('stat-licenses').textContent = arr.length;
  }

  renderTodayUsage(parseUsageReport(todayUsage));

  // Sequential, not Promise.all: 6 parallel calls to the same usage endpoint
  // tripped upstream rate limits and the whole dashboard failed to load.
  const months = lastNMonths(6);
  const monthData = [];
  for (const m of months) {
    monthData.push(await apiFetch(`/api/usage/company/monthly?month=${m}`));
  }
  const totals = monthData.map(d => parseUsageReport(d).reduce((s, r) => s + (r.number_of_queries || 0), 0));

  renderBarChart('dashChart', months, [{
    label: 'Total Queries', data: totals,
    backgroundColor: 'rgba(232,84,58,0.65)', borderColor: '#e8543a',
    borderWidth: 1, borderRadius: 4,
  }]);
}

/* ── Usage Reports ─────────────────────────────────────────── */

function switchUsageTab(name) {
  document.querySelectorAll('#dash-usage .tabs .tab').forEach((t, i) => {
    t.classList.toggle('active', USAGE_TABS[i] === name);
  });
  document.querySelectorAll('#dash-usage > .panel').forEach(p => p.classList.remove('active'));
  document.getElementById('usage-' + name).classList.add('active');
}

function renderUsageTable(tableId, rows) {
  const tbody = document.querySelector(`#${tableId} tbody`);
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="2" class="text-muted" style="padding:20px;text-align:center">No data</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map(r =>
    `<tr><td>${r.product || r.name || '—'}</td><td class="text-right mono">${fmtNum(r.number_of_queries ?? r.queries)}</td></tr>`
  ).join('');
}

function renderUsageChart(chartId, rows, label = 'Queries') {
  const labels = rows.map(r => (r.product || r.name || '').replace(/^TCA-\d+ /, ''));
  const values = rows.map(r => r.number_of_queries ?? r.queries ?? 0);
  renderHorizBar(chartId, labels, values, label);
  const doughnutId = chartId.replace(/Chart$/, 'Doughnut');
  if (document.getElementById(doughnutId)) renderDoughnut(doughnutId, labels, values);
}

let _userListPromise = null;
function ensureUserSelectsPopulated() {
  if (_userListPromise) return _userListPromise;
  _userListPromise = (async () => {
    const data = await apiFetch('/api/users?page=1&size=1000');
    const users = data?.rl?.users || data?.rl?.user_list || [];
    const names = users.map(u => u.username || u.user_name).filter(Boolean).sort();
    for (const selId of ['du-user', 'mu-user']) {
      const sel = document.getElementById(selId);
      if (!sel || sel.options.length) continue;
      sel.innerHTML = names.map(n => `<option value="${n}">${n}</option>`).join('');
    }
  })();
  return _userListPromise;
}

const USAGE_REPORTS = {
  'daily-company':   { prefix: 'dc', param: 'date',  inputId: 'dc-date',  endpoint: '/api/usage/company/daily',  defaultValue: () => new Date().toISOString().slice(0, 10) },
  'daily-user':      { prefix: 'du', param: 'date',  inputId: 'du-date',  endpoint: '/api/usage/daily',          userSelectId: 'du-user', defaultValue: () => new Date().toISOString().slice(0, 10) },
  'monthly-company': { prefix: 'mc', param: 'month', inputId: 'mc-month', endpoint: '/api/usage/company/monthly', defaultValue: () => new Date().toISOString().slice(0, 7) },
  'monthly-user':    { prefix: 'mu', param: 'month', inputId: 'mu-month', endpoint: '/api/usage/monthly',         userSelectId: 'mu-user', defaultValue: () => new Date().toISOString().slice(0, 7) },
};

async function loadUsageReport(reportKey) {
  const cfg = USAGE_REPORTS[reportKey];
  const value = document.getElementById(cfg.inputId).value || cfg.defaultValue();
  const params = new URLSearchParams({ [cfg.param]: value });

  let userLabel = '';
  if (cfg.userSelectId) {
    const user = document.getElementById(cfg.userSelectId).value;
    if (!user) { toast('Select a user', 'error'); return; }
    params.set('user', user);
    userLabel = ` · ${user}`;
  }

  const data = await apiFetch(`${cfg.endpoint}?${params}`);
  if (!data) return;

  const rows = parseUsageReport(data);
  document.getElementById(`${cfg.prefix}-label`).textContent = value + userLabel;
  renderUsageTable(`${cfg.prefix}-table`, rows);
  renderUsageChart(`${cfg.prefix}Chart`, rows);
}

const loadUsageDaily   = company => loadUsageReport(company ? 'daily-company'   : 'daily-user');
const loadUsageMonthly = company => loadUsageReport(company ? 'monthly-company' : 'monthly-user');

/* ── Init ──────────────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', () => {
  const today = new Date().toISOString().slice(0, 10);
  const thisMonth = today.slice(0, 7);
  document.getElementById('du-date').value = today;
  document.getElementById('dc-date').value = today;
  document.getElementById('mu-month').value = thisMonth;
  document.getElementById('mc-month').value = thisMonth;

  loadDashboard();
  ensureUserSelectsPopulated();
});
