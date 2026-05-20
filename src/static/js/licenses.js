/* ── Licenses ──────────────────────────────────────────────── */

async function loadLicenses() {
  const data = await apiFetch('/api/licenses');
  if (!data) return;
  const lics = data?.rl?.licenses || data?.rl?.license_list || [];
  const tbody = document.querySelector('#licenses-table tbody');
  if (!lics.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-muted" style="padding:20px;text-align:center">No licenses found</td></tr>';
    return;
  }
  const today = new Date().toISOString().slice(0, 10);
  tbody.innerHTML = lics.map(l => {
    const id = l.license_id || l.id || '';
    const strain = l.strain || '';
    const apis = l.products || l.apis || (l.product ? [l.product] : (l.name ? [l.name] : []));
    const apiCells = apis.length
      ? `<span class="mono">${apis.join(', ')}</span>`
      : '<span class="text-muted">—</span>';
    const start = l.start_date || l.valid_from || '';
    const end = l.end_date || l.valid_to || '';
    let statusLabel;
    if (l.status) {
      statusLabel = l.status;
    } else if (typeof l.active === 'boolean') {
      statusLabel = l.active ? 'ACTIVE' : 'INACTIVE';
    } else if (start && end) {
      if (today < start)      statusLabel = 'PENDING';
      else if (today > end)   statusLabel = 'EXPIRED';
      else                    statusLabel = 'ACTIVE';
    } else {
      statusLabel = '—';
    }
    const statusStyle = statusLabel === 'ACTIVE'
      ? 'background:linear-gradient(180deg, rgba(74,74,74,0.85) 0%, rgba(43,43,43,0.85) 100%);border:1px solid rgba(43,43,43,0.85);color:#fff'
      : 'background:linear-gradient(180deg, rgba(232,84,58,0.95) 0%, rgba(170,45,25,0.95) 100%);border:1px solid rgba(170,45,25,0.95);color:#fff';
    const usersCellId = `lic-users-${id}-${strain}`.replace(/[^a-zA-Z0-9_-]/g, '_');
    return `
    <tr data-status="${statusLabel}">
      <td class="mono">${id || '—'}</td>
      <td><span class="badge" style="background:linear-gradient(180deg, rgba(74,74,74,0.85) 0%, rgba(43,43,43,0.85) 100%);border:1px solid rgba(43,43,43,0.85);color:#fff;font-weight:normal">${strain || '—'}</span></td>
      <td style="font-size:11px;max-width:240px;line-height:1.6">${apiCells}</td>
      <td id="${usersCellId}" style="font-size:12px"><span class="text-muted">…</span></td>
      <td><span class="badge" style="${statusStyle}">${statusLabel}</span></td>
      <td class="text-muted mono" style="font-size:12px">${start || '—'}</td>
      <td class="text-muted mono" style="font-size:12px">${end || '—'}</td>
    </tr>`;
  }).join('');

  // Sequential to avoid hammering the upstream rate limiter.
  (async () => {
    for (const l of lics) {
      const id = l.license_id || l.id || '';
      const strain = l.strain || '';
      const cellId = `lic-users-${id}-${strain}`.replace(/[^a-zA-Z0-9_-]/g, '_');
      await loadLicenseUsers(id, strain, cellId);
    }
  })();

  applyStatusFilter();
}

function applyStatusFilter() {
  const sel = document.getElementById('status-filter');
  const want = sel ? sel.value : '';
  document.querySelectorAll('#licenses-table tbody tr[data-status]').forEach(tr => {
    tr.style.display = (!want || tr.dataset.status === want) ? '' : 'none';
  });
}

async function loadLicenseUsers(licenseId, strain, cellId) {
  const cell = document.getElementById(cellId);
  if (!cell) return;
  if (!licenseId || !strain) { cell.innerHTML = '<span class="text-muted">—</span>'; return; }
  const resp = await fetch(`/api/limits/license?strain=${encodeURIComponent(strain)}&license_id=${encodeURIComponent(licenseId)}`);
  if (!resp.ok) { cell.innerHTML = '<span class="text-muted" title="Failed to load">err</span>'; return; }
  const data = await resp.json();
  const rl = data?.rl || {};
  const limits = rl.limits || rl.limit_list || rl.user_limits || [];
  const users = [...new Set(limits.flatMap(l => l.usernames || l.user_names || (l.username ? [l.username] : [])))].sort();
  if (!users.length) { cell.innerHTML = '<span class="text-muted">—</span>'; return; }
  cell.innerHTML = `<span class="mono">${users.join(', ')}</span>`;
}

document.addEventListener('DOMContentLoaded', loadLicenses);
