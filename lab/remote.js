'use strict';
(() => {
  const auth = document.getElementById('remote-auth');
  const status = document.getElementById('remote-status');
  const form = document.getElementById('remote-login');
  const submit = document.getElementById('remote-submit');
  const passcode = document.getElementById('remote-passcode');
  let base = '', token = '', firstLogin, everSignedIn = false;
  const ready = new Promise(resolve => { firstLogin = resolve; });

  async function findHost() {
    const response = await fetch('https://lucidiscool.github.io/Lucid-AI-Public/backend.json?ts=' + Date.now(), {cache:'no-store'});
    if (!response.ok) throw Error('The laptop address is unavailable. Check that Fedora and Lucid host are running.');
    const config = await response.json();
    const url = new URL(config.url || '');
    if (config.provider !== 'local' || url.protocol !== 'https:' || !url.hostname.endsWith('.trycloudflare.com') || url.username || url.password)
      throw Error('The published laptop address is invalid.');
    base = url.origin;
    const health = await fetch(base + '/api/health', {signal:AbortSignal.timeout(12000)});
    if (!health.ok || (await health.json()).app !== 'lucid-v5-public') throw Error('The Fedora host is offline. Check that the laptop is on.');
    status.textContent = 'Laptop connected. Enter your LucidAI admin passcode to play.';
    submit.disabled = false;
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    submit.disabled = true;
    status.textContent = 'Signing in…';
    try {
      if (!base) await findHost();
      const response = await fetch(base + '/api/admin/login', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({password:passcode.value}), signal:AbortSignal.timeout(15000)
      });
      const result = await response.json();
      passcode.value = '';
      if (!response.ok) throw Error(result.error || 'Could not sign in.');
      token = result.token;
      everSignedIn = true;
      auth.hidden = true;
      firstLogin();
      status.textContent = 'Connected';
    } catch (error) {
      status.textContent = error.message || String(error);
      submit.disabled = false;
    }
  });

  window.evolutionRemote = {
    async request(path, body) {
      if (!token) {
        if (everSignedIn) throw Error('Sign in again to use the lab.');
        await ready;
      }
      const response = await fetch(base + '/api/evolution/' + path, {
        method:body === undefined ? 'GET' : 'POST',
        headers:{'Content-Type':'application/json','X-Lucid-Admin':token},
        body:body === undefined ? undefined : JSON.stringify(body),
        signal:AbortSignal.timeout(20000)
      });
      const result = await response.json();
      if (response.status === 401) {
        token = '';
        auth.hidden = false;
        status.textContent = 'Your session expired. Sign in again.';
        submit.disabled = false;
      }
      if (!response.ok) throw Error(result.error || result.detail || 'The laptop did not respond.');
      return result;
    }
  };

  findHost().catch(error => {
    status.textContent = error.message || String(error);
    submit.disabled = false;
  });
})();
