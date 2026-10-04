'use strict';
const $ = id => document.getElementById(id);
const labels = {snake:'Snake',pong:'Pong',flappy:'Skywing',tetris:'Tetris',racing:'Circuit',platformer:'Checkpoint',chess:'Chess'};
let base = '', token = '';
async function connect() {
  const response = await fetch('https://lucidiscool.github.io/Lucid-AI-Public/backend.json?ts=' + Date.now(), {cache:'no-store'});
  if (!response.ok) throw Error('The laptop address is unavailable.');
  const config = await response.json();
  const url = new URL(config.url || '');
  if (config.provider !== 'local' || url.protocol !== 'https:' || !url.hostname.endsWith('.trycloudflare.com') || url.username || url.password) throw Error('Invalid laptop address.');
  base = url.origin;
  const health = await fetch(base + '/api/health', {signal:AbortSignal.timeout(12000)});
  if (!health.ok || (await health.json()).app !== 'lucid-v5-public') throw Error('The Fedora laptop is offline.');
  $('connection').textContent = '● LAPTOP ONLINE';
}
async function request(path, options={}) {
  const response = await fetch(base + '/api/evolution/' + path, {cache:'no-store',signal:AbortSignal.timeout(20000),...options});
  const result = await response.json();
  if (!response.ok) throw Error(result.error || `Request failed (${response.status})`);
  return result;
}
async function refresh() {
  const games = await request('portfolio');
  const grid = $('games'); grid.replaceChildren();
  for (const game of games) {
    const card = document.createElement('article'); card.className='panel admin-card';
    const title = document.createElement('h3'); title.textContent=labels[game.game] || game.game;
    const detail = document.createElement('p'); detail.textContent=`${game.status} · Episode ${game.episode ?? 0} · Best score ${game.best_score == null ? '—' : Number(game.best_score).toFixed(1)}`;
    const backup = document.createElement('p'); backup.textContent=`Private backup: ${game.backup || 'pending'}`;
    const save = document.createElement('small'); save.textContent=`Save ${game.save_id}`;
    const button = document.createElement('button'); button.type='button'; button.textContent='Create new save';
    button.onclick = async () => {
      button.disabled=true; $('action-message').textContent=`Starting a fresh ${labels[game.game]} save…`;
      try {
        await request('admin/new-save', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({game:game.game,token})});
        $('action-message').textContent=`New ${labels[game.game]} save created. Training will start at episode zero. Earlier saves remain available in the private repository.`;
        await refresh();
      } catch(error) { $('action-message').textContent=error.message; button.disabled=false; }
    };
    card.append(title,detail,backup,save,document.createElement('br'),button); grid.append(card);
  }
}
$('login-form').onsubmit = async event => {
  event.preventDefault(); $('login-message').textContent='Checking code…';
  try {
    if (!base) await connect();
    const response = await request('admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:$('code').value})});
    token=response.token; $('code').value=''; $('login-panel').hidden=true; $('controls').hidden=false; $('login-message').textContent=''; await refresh();
  } catch(error) { $('login-message').textContent=error.message; }
};
connect().catch(error=>{$('connection').textContent='● LAPTOP OFFLINE';$('login-message').textContent=error.message});
setInterval(()=>{if(token)refresh().catch(error=>{$('action-message').textContent=error.message})},8000);
