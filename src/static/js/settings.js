/* ── Settings ──────────────────────────────────────────────── */

async function loadSettings() {
  const data = await apiFetch('/api/settings');
  if (!data) return;
  document.getElementById('cfg-username').value = data.username || '';
  document.getElementById('cfg-password').value = data.password || '';
  document.getElementById('cfg-base-url').value = data.base_url || '';
}

async function saveSettings() {
  const username = document.getElementById('cfg-username').value.trim();
  const password = document.getElementById('cfg-password').value.trim();
  const base_url = document.getElementById('cfg-base-url').value.trim();
  if (!username || !password || !base_url) { toast('All fields are required', 'error'); return; }
  const data = await apiFetch('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, base_url })
  });
  if (data) toast('Settings saved to config.ini', 'success');
}

document.addEventListener('DOMContentLoaded', loadSettings);
