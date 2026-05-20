/* ── Users: list + create/disable/reset-password modals ───── */

let usersData = [];
let usersCurrentPage = 1;
const USERS_PAGE_SIZE = 20;

const $ = id => document.getElementById(id);
const val = id => $(id).value.trim();
const checked = id => $(id).checked;
const csvList = id => val(id).split(',').map(s => s.trim()).filter(Boolean);

async function loadUsers(page = 1) {
  usersCurrentPage = page;
  const data = await apiFetch(`/api/users?page=${page}&size=${USERS_PAGE_SIZE}`);
  if (!data) return;
  usersData = data?.rl?.users || data?.rl?.user_list || [];
  renderUsersTable(usersData);
  const total = data?.rl?.page?.total_records ?? data?.rl?.total_count ?? usersData.length;
  $('users-page-info').textContent = `Page ${page} · ${total} total`;
  $('users-prev').disabled = page <= 1;
  $('users-next').disabled = usersData.length < USERS_PAGE_SIZE;
}

function renderUsersTable(rows) {
  const tbody = document.querySelector('#users-table tbody');
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-muted" style="padding:20px;text-align:center">No users found</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map(u => {
    const name = u.username || u.user_name || '';
    const enabled = u.enabled !== false;
    const safeName = name.replace(/'/g, "\\'");
    const toggleBtn = enabled
      ? `<button class="btn btn-danger btn-sm" onclick="openDisableUserModal('${safeName}')">Disable</button>`
      : `<button class="btn btn-ghost btn-sm" onclick="enableUser('${safeName}')">Enable</button>`;
    return `
    <tr>
      <td class="mono">${name || '—'}</td>
      <td>${(u.email_addresses || [u.email]).filter(Boolean).join(', ') || '—'}</td>
      <td class="text-muted" style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${u.description || ''}</td>
      <td><span class="badge ${enabled ? 'badge-gradient' : 'badge-red'}">${enabled ? 'Active' : 'Disabled'}</span></td>
      <td class="text-right">
        <div class="gap-8" style="justify-content:flex-end">
          <button class="btn btn-ghost btn-sm" onclick="openEditUserModal('${safeName}')">Edit</button>
          <button class="btn btn-ghost btn-sm" onclick="openLimitsModal('${safeName}')">Limits</button>
          <button class="btn btn-ghost btn-sm" onclick="openResetPwModal('${safeName}')">Reset Password</button>
          ${toggleBtn}
        </div>
      </td>
    </tr>`;
  }).join('');
}

function filterUsers() {
  const q = $('user-search').value.toLowerCase();
  renderUsersTable(usersData.filter(u => (u.username || '').toLowerCase().includes(q)));
}

function usersPage(dir) { loadUsers(usersCurrentPage + dir); }

function refreshUsers() { loadUsers(usersCurrentPage); }

/* ── Create ────────────────────────────────────────────────── */

function openCreateUserModal() {
  $('cu-username').value = '';
  $('cu-emails').value = '';
  $('cu-description').value = '';
  $('cu-enabled').checked = true;
  $('cu-add-limit').checked = false;
  $('cu-limit-section').style.display = 'none';
  $('cu-modal').style.maxWidth = '';
  $('cu-modal').style.width = '';
  $('cul-unlimited').checked = false;
  $('cul-limit').value = '';
  $('cul-limit').disabled = false;
  $('cul-license').innerHTML = '';
  openModal('create-user-modal');
}

async function toggleCreateUserLimit() {
  const on = checked('cu-add-limit');
  $('cu-limit-section').style.display = on ? '' : 'none';
  // Grow the modal to two-column width when the limit panel is open.
  const modal = $('cu-modal');
  modal.style.maxWidth = on ? '900px' : '';
  modal.style.width = on ? '95vw' : '';
  if (!on) return;

  const sel = $('cul-license');
  if (sel.options.length) return; // already loaded
  sel.innerHTML = '<option value="">Loading licenses…</option>';

  const data = await apiFetch('/api/licenses');
  if (!data) {
    sel.innerHTML = '<option value="">Failed to load</option>';
    return;
  }
  _licensesCache = data?.rl?.licenses || data?.rl?.license_list || [];
  if (!_licensesCache.length) {
    sel.innerHTML = '<option value="">No licenses available</option>';
    return;
  }
  sel.innerHTML = _licensesCache.map(lic => {
    const id = lic.id ?? lic.license_id;
    const strain = lic.strain;
    const product = lic.product || lic.name || lic.product_name || '';
    if (!strain) {
      const label = `#${id} · (no strain)${product ? ' · ' + product : ''}`;
      return `<option value="" disabled>${label}</option>`;
    }
    let avail = '';
    if (lic.is_unlimited) {
      avail = ' · ∞ available';
    } else if (typeof lic.available_limit === 'number') {
      avail = ` · ${fmtNum(lic.available_limit)} available`;
    }
    const label = `#${id} · ${strain}${product ? ' · ' + product : ''}${avail}`;
    return `<option value="${id}|${strain}">${label}</option>`;
  }).join('');
}

function licenseApis(licenseId) {
  const lic = _licensesCache.find(l => (l.id ?? l.license_id) === licenseId);
  return lic?.products || lic?.apis || [];
}

async function submitCreateUser() {
  const body = {
    username: val('cu-username'),
    email_addresses: csvList('cu-emails'),
    description: val('cu-description'),
    enabled: checked('cu-enabled'),
  };
  if (!body.username || !body.email_addresses.length || !body.description) {
    toast('Username, email addresses, and description are required.', 'error');
    return;
  }

  // Validate the limit fields up-front so we don't create the user and then
  // discover the limit form is bad.
  let limitBody = null;
  if (checked('cu-add-limit')) {
    const sel = $('cul-license').value;
    if (!sel) { toast('Select a license for the limit, or uncheck "Assign a limit".', 'error'); return; }

    const unlimited = checked('cul-unlimited');
    const limitVal = val('cul-limit');
    if (!unlimited && !limitVal)             { toast('Enter a numeric limit or check Unlimited.', 'error'); return; }
    if (!unlimited && Number(limitVal) <= 0) { toast('Limit must be greater than 0 — use Unlimited for no cap.', 'error'); return; }

    const [licenseIdStr, strain] = sel.split('|');
    limitBody = {
      is_unlimited: unlimited,
      usernames: [body.username],
      license_id: Number(licenseIdStr),
      strain,
      products: licenseApis(Number(licenseIdStr)),
    };
    if (!unlimited) limitBody.limit = Number(limitVal);
  }

  const data = await postJSON('/api/users', body);
  if (!data) return;

  const rl = data.rl || {};
  const createdUsername = rl.username || body.username;

  if (limitBody) {
    // Use the username the server actually returned (it may normalize prefixes).
    limitBody.usernames = [createdUsername];
    const limitData = await postJSON('/api/limits', limitBody);
    if (!limitData) {
      toast('User created, but limit creation failed — assign it manually.', 'error');
    } else {
      toast('User and limit created.', 'success');
    }
  } else {
    toast('User created.', 'success');
  }

  closeModal('create-user-modal');
  showCredentialModal('User Created', createdUsername, rl.password || '(no password returned)');
  loadUsers(usersCurrentPage);
}

/* ── Edit ──────────────────────────────────────────────────── */

let _editTarget = null;

async function openEditUserModal(username) {
  _editTarget = username;
  $('eu-username').value = username;
  $('eu-emails').value = '';
  $('eu-description').value = '';
  $('eu-enabled').checked = true;
  openModal('edit-user-modal');

  const data = await apiFetch(`/api/users/detail?username=${encodeURIComponent(username)}`);
  if (!data) return;
  const u = data?.rl?.user || data?.rl || {};
  const emails = u.email_addresses || (u.email ? [u.email] : []);
  $('eu-emails').value = emails.join(', ');
  $('eu-description').value = u.description || '';
  $('eu-enabled').checked = u.enabled !== false;
}

async function submitEditUser() {
  if (!_editTarget) return;
  const body = {
    username: _editTarget,
    email_addresses: csvList('eu-emails'),
    description: val('eu-description'),
    enabled: checked('eu-enabled'),
  };
  if (!body.email_addresses.length || !body.description) {
    toast('Email addresses and description are required.', 'error');
    return;
  }
  const data = await postJSON('/api/users/update', body);
  if (!data) return;
  closeModal('edit-user-modal');
  toast('User updated.', 'success');
  _editTarget = null;
  loadUsers(usersCurrentPage);
}

/* ── Enable ────────────────────────────────────────────────── */

async function enableUser(username) {
  const data = await postJSON('/api/users/update', { username, enabled: true });
  if (!data) return;
  toast('User enabled.', 'success');
  loadUsers(usersCurrentPage);
}

/* ── Reset password ────────────────────────────────────────── */

let _resetTarget = null;

function openResetPwModal(username) {
  _resetTarget = username;
  $('rp-username').textContent = username;
  $('rp-expiration').value = '';
  openModal('reset-pw-modal');
}

async function submitResetPassword() {
  if (!_resetTarget) return;
  const exp = $('rp-expiration').value;
  if (!exp) {
    toast('Old password expiration is required.', 'error');
    return;
  }
  const data = await postJSON('/api/users/password-reset', {
    username: _resetTarget,
    old_password_expiration_date: new Date(exp).toISOString(),
  });
  if (!data) return;
  closeModal('reset-pw-modal');
  toast('Password reset.', 'success');
  const pw = data?.rl?.password || '(no password returned)';
  showCredentialModal('Password Reset', _resetTarget, pw);
  _resetTarget = null;
}

/* ── Disable ───────────────────────────────────────────────── */

let _disableTarget = null;

function openDisableUserModal(username) {
  _disableTarget = username;
  $('du-username-disp').textContent = username;
  openModal('disable-user-modal');
}

async function submitDisableUser() {
  if (!_disableTarget) return;
  const data = await postJSON('/api/users/update', { username: _disableTarget, enabled: false });
  if (!data) return;
  closeModal('disable-user-modal');
  toast('User disabled.', 'success');
  _disableTarget = null;
  loadUsers(usersCurrentPage);
}

/* ── Limits ────────────────────────────────────────────────── */

let _limitsUser = null;
let _limitsCache = [];
let _licensesCache = [];
let _editLimitId = null;
let _deleteLimitId = null;

async function openLimitsModal(username) {
  _limitsUser = username;
  $('lm-username').textContent = username;
  document.querySelector('#limits-table tbody').innerHTML =
    '<tr><td colspan="6"><div class="loader"><div class="spinner"></div> Loading...</div></td></tr>';
  openModal('limits-modal');
  await loadUserLimits();
}

async function loadUserLimits() {
  const data = await apiFetch(`/api/limits/user?username=${encodeURIComponent(_limitsUser)}`);
  if (!data) return;
  _limitsCache = data?.rl?.limits || [];
  renderLimitsTable(_limitsCache);
}

function renderLimitsTable(rows) {
  const tbody = document.querySelector('#limits-table tbody');
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-muted" style="padding:20px;text-align:center">No limits found</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map(l => {
    const quota = l.is_unlimited ? '<span class="badge badge-green">Unlimited</span>' : fmtNum(l.limit);
    const users = (l.usernames || []).join(', ') || '—';
    return `
    <tr>
      <td class="mono">${l.id}</td>
      <td class="mono">${l.license_id ?? '—'}</td>
      <td>${l.strain || '—'}</td>
      <td>${quota}</td>
      <td class="text-muted" style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${users}</td>
      <td class="text-right">
        <div class="gap-8" style="justify-content:flex-end">
          <button class="btn btn-ghost btn-sm" onclick="openEditLimitModal(${l.id})">Edit</button>
          <button class="btn btn-danger btn-sm" onclick="openDeleteLimitModal(${l.id})">Delete</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

function toggleLimitInput(prefix) {
  const limitEl = $(`${prefix}-limit`);
  limitEl.disabled = checked(`${prefix}-unlimited`);
  if (limitEl.disabled) limitEl.value = '';
}

async function openCreateLimitModal() {
  $('cl-unlimited').checked = false;
  $('cl-limit').value = '';
  $('cl-limit').disabled = false;
  $('cl-usernames').value = _limitsUser || '';

  const sel = $('cl-license');
  sel.innerHTML = '<option value="">Loading licenses…</option>';
  openModal('create-limit-modal');

  const data = await apiFetch('/api/licenses');
  if (!data) {
    sel.innerHTML = '<option value="">Failed to load</option>';
    return;
  }
  _licensesCache = data?.rl?.licenses || data?.rl?.license_list || [];
  if (!_licensesCache.length) {
    sel.innerHTML = '<option value="">No licenses available</option>';
    return;
  }
  sel.innerHTML = _licensesCache.map(lic => {
    const id = lic.id ?? lic.license_id;
    const strain = lic.strain;
    const product = lic.product || lic.name || lic.product_name || '';
    if (!strain) {
      console.warn('License has no strain field — cannot create a limit:', lic);
      const label = `#${id} · (no strain)${product ? ' · ' + product : ''}`;
      return `<option value="" disabled>${label}</option>`;
    }
    // Show remaining quota so users don't try to allocate more than is available.
    let avail = '';
    if (lic.is_unlimited) {
      avail = ' · ∞ available';
    } else if (typeof lic.available_limit === 'number') {
      avail = ` · ${fmtNum(lic.available_limit)} available`;
    }
    const label = `#${id} · ${strain}${product ? ' · ' + product : ''}${avail}`;
    return `<option value="${id}|${strain}">${label}</option>`;
  }).join('');
}

function readLimitForm(prefix) {
  const unlimited = checked(`${prefix}-unlimited`);
  const limitVal = val(`${prefix}-limit`);
  const usernames = csvList(`${prefix}-usernames`);

  if (!unlimited && !limitVal)              { toast('Enter a numeric limit or check Unlimited.', 'error'); return null; }
  if (!unlimited && Number(limitVal) <= 0)  { toast('Limit must be greater than 0 — use Unlimited for no cap.', 'error'); return null; }
  if (!usernames.length)                    { toast('At least one username is required.', 'error');         return null; }

  const body = { is_unlimited: unlimited, usernames };
  if (!unlimited) body.limit = Number(limitVal);
  return body;
}

async function submitCreateLimit() {
  const sel = $('cl-license').value;
  if (!sel) { toast('Select a license.', 'error'); return; }

  const base = readLimitForm('cl');
  if (!base) return;

  const [licenseIdStr, strain] = sel.split('|');
  const data = await postJSON('/api/limits', {
    ...base,
    license_id: Number(licenseIdStr),
    strain,
    products: licenseApis(Number(licenseIdStr)),
  });
  if (!data) return;
  closeModal('create-limit-modal');
  toast('Limit created.', 'success');
  loadUserLimits();
}

function openEditLimitModal(id) {
  const lim = _limitsCache.find(l => l.id === id);
  if (!lim) return;
  _editLimitId = id;
  $('el-id-disp').textContent = `#${id}`;
  $('el-unlimited').checked = !!lim.is_unlimited;
  $('el-limit').value = lim.is_unlimited ? '' : (lim.limit ?? '');
  $('el-limit').disabled = !!lim.is_unlimited;
  $('el-usernames').value = (lim.usernames || []).join(', ');
  openModal('edit-limit-modal');
}

async function submitEditLimit() {
  if (!_editLimitId) return;
  const body = readLimitForm('el');
  if (!body) return;

  const original = _limitsCache.find(l => l.id === _editLimitId);

  // Upstream PUT rejects any edit to an Unlimited limit ("Invalid request"),
  // including a no-op save. If nothing meaningful changed, surface a friendly
  // message instead of forwarding a doomed request.
  if (original?.is_unlimited && body.is_unlimited) {
    const sameUsers = (original.usernames || []).slice().sort().join(',')
                   === body.usernames.slice().sort().join(',');
    if (sameUsers) {
      closeModal('edit-limit-modal');
      toast('Already set to Unlimited — no changes to save.', 'info');
      _editLimitId = null;
      return;
    }
  }

  // Upstream PUT rejects any edit involving Unlimited — both toggling the flag
  // AND editing other fields (e.g. usernames) on an already-Unlimited limit.
  // Route any such edit through DELETE + POST, since both of those work.
  if (original?.is_unlimited || body.is_unlimited) {
    await recreateLimitWithUnlimitedToggle(original, body);
    return;
  }

  const data = await putJSON(`/api/limits/${_editLimitId}`, body);
  if (!data) return;
  closeModal('edit-limit-modal');
  toast('Limit updated.', 'success');
  _editLimitId = null;
  loadUserLimits();
}

async function recreateLimitWithUnlimitedToggle(original, formBody) {
  // The /api/limits/user response doesn't echo `products`, so fall back to
  // the parent license's product set. The user has already been warned about
  // this in the edit-modal notice (updateEditLimitNotice).
  let products = original.products || [];
  if (!products.length) {
    if (!_licensesCache.length) {
      const licsResp = await apiFetch('/api/licenses');
      _licensesCache = licsResp?.rl?.licenses || licsResp?.rl?.license_list || [];
    }
    const lic = _licensesCache.find(l => (l.id ?? l.license_id) === original.license_id);
    products = lic?.products || lic?.apis || [];
    if (!products.length) {
      toast('Cannot save — could not determine product list. Delete and recreate manually.', 'error');
      return;
    }
  }

  const newBody = {
    ...formBody,
    license_id: original.license_id,
    strain: original.strain,
    products,
  };

  const deleted = await apiFetch(`/api/limits/${original.id}`, { method: 'DELETE' });
  if (!deleted) { toast('Delete failed; original limit unchanged.', 'error'); return; }

  const created = await postJSON('/api/limits', newBody);
  if (!created) {
    const rollback = {
      is_unlimited: !!original.is_unlimited,
      usernames: original.usernames || [],
      license_id: original.license_id,
      strain: original.strain,
      products,
    };
    if (!original.is_unlimited && typeof original.limit === 'number') rollback.limit = original.limit;
    const restored = await postJSON('/api/limits', rollback);
    toast(restored
      ? 'Create failed — original limit was restored.'
      : 'Create failed AND restore failed — limit is gone, recreate manually.', 'error');
    _editLimitId = null;
    loadUserLimits();
    return;
  }

  closeModal('edit-limit-modal');
  toast('Limit updated (recreated with new ID).', 'success');
  _editLimitId = null;
  loadUserLimits();
}

function openDeleteLimitModal(id) {
  _deleteLimitId = id;
  $('dl-id-disp').textContent = `#${id}`;
  openModal('delete-limit-modal');
}

async function submitDeleteLimit() {
  if (!_deleteLimitId) return;
  const data = await apiFetch(`/api/limits/${_deleteLimitId}`, { method: 'DELETE' });
  if (!data) return;
  closeModal('delete-limit-modal');
  toast('Limit deleted.', 'success');
  _deleteLimitId = null;
  loadUserLimits();
}

/* ── Credential display ────────────────────────────────────── */

function showCredentialModal(title, username, password) {
  $('cred-title').textContent = title;
  $('cred-user').value = username;
  $('cred-pass').value = password;
  openModal('credential-modal');
}

function copyCredPassword() {
  const el = $('cred-pass');
  el.select();
  navigator.clipboard.writeText(el.value).then(
    () => toast('Password copied.', 'success'),
    () => toast('Copy failed — select manually.', 'error'),
  );
}

document.addEventListener('DOMContentLoaded', () => loadUsers(1));
