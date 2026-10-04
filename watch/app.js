'use strict';
const $ = id => document.getElementById(id);
const labels = {snake:'Snake',pong:'Pong',flappy:'Skywing',tetris:'Tetris',racing:'Circuit',platformer:'Checkpoint',chess:'Chess'};
const canvas = $('game'), ctx = canvas.getContext('2d');
const n = (value,digits=1) => value == null ? '—' : Number(value).toFixed(digits);
let base = '', session = 'snake', mode = 'live', replayFrames = [], replayIndex = 0, replayLoaded = '';

async function connect() {
  const response = await fetch('https://lucidiscool.github.io/Lucid-AI-Public/backend.json?ts=' + Date.now(), {cache:'no-store'});
  if (!response.ok) throw Error('The laptop address is unavailable.');
  const config = await response.json();
  const url = new URL(config.url || '');
  if (config.provider !== 'local' || url.protocol !== 'https:' || !url.hostname.endsWith('.trycloudflare.com') || url.username || url.password)
    throw Error('The published laptop address is invalid.');
  base = url.origin;
  const health = await fetch(base + '/api/health', {signal:AbortSignal.timeout(12000)});
  if (!health.ok || (await health.json()).app !== 'lucid-v5-public') throw Error('The Fedora laptop is offline.');
}

async function watch(path='') {
  const response = await fetch(base + '/api/evolution/portfolio' + path, {cache:'no-store',signal:AbortSignal.timeout(15000)});
  const result = await response.json();
  if (!response.ok) throw Error(result.error || 'The game feed is unavailable.');
  return result;
}

function status(message, online) {
  $('connection').textContent = online ? '● LAPTOP ONLINE' : '● LAPTOP OFFLINE';
  $('feed-status').textContent = message;
}

async function loadSessions() {
  const games = await watch();
  const grid = $('game-grid');
  grid.replaceChildren();
  for (const item of games) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'game-card' + (item.game === session ? ' selected' : '');
    const title = document.createElement('strong');
    title.textContent = labels[item.game] || item.game;
    const state = document.createElement('span');
    state.textContent = `${item.status} · episode ${item.episode ?? 0}`;
    const backup = document.createElement('small');
    backup.textContent = `Private backup: ${item.backup || 'pending'}`;
    button.append(title, state, backup);
    button.onclick = () => {session=item.game;replayFrames=[];replayLoaded='';loadSessions();loadState().catch(error=>status(error.message,false))};
    grid.append(button);
  }
}

function curve(history) {
  const c = $('chart'), g = c.getContext('2d');
  g.clearRect(0,0,c.width,c.height);
  if (!history.length) { $('chart-note').textContent='Waiting for completed episodes'; return; }
  const values=history.map(row=>row.reward), min=Math.min(...values), max=Math.max(...values), range=max-min||1;
  g.strokeStyle='#304451';g.lineWidth=1;
  for(let i=0;i<4;i++){const y=15+i*60;g.beginPath();g.moveTo(48,y);g.lineTo(c.width-15,y);g.stroke()}
  const line=(arr,color)=>{g.strokeStyle=color;g.lineWidth=2;g.beginPath();arr.forEach((v,i)=>{const x=48+i/Math.max(1,arr.length-1)*(c.width-65),y=18+(max-v)/range*178;i?g.lineTo(x,y):g.moveTo(x,y)});g.stroke()};
  line(values,'#527a91');
  line(values.map((_,i)=>{const slice=values.slice(Math.max(0,i-19),i+1);return slice.reduce((a,b)=>a+b,0)/slice.length}),'#81e0ca');
  $('chart-note').textContent=`Episodes ${history[0].episode}–${history.at(-1).episode} · actual reward and 20-episode mean`;
}

async function loadState() {
  if (!session) return;
  const state = await watch('/' + session);
  mode = state.mode;
  $('game-title').textContent = labels[state.game] || state.game || 'Game';
  $('episode').textContent = state.episode ?? '—';
  $('reward').textContent = n(state.reward);
  $('average').textContent = n(state.average_reward);
  $('best').textContent = n(state.best_score);
  $('mode').textContent = `${state.status} · backup ${state.backup || 'pending'}`;
  $('view-title').textContent = state.status === 'running' ? 'Live environment' : 'Recorded game';
  curve(state.history || []);
  if (state.status === 'running' && state.frame) {
    replayFrames=[];replayLoaded='';draw(state.frame);
    status(`Watching ${labels[state.game]} as the agent trains on Fedora.`,true);
  } else if (state.status === 'running') {
    replayFrames=[];draw(null);
    status('Training is running. Waiting for a game frame.',true);
  } else {
    if (replayLoaded !== state.save_id) {
      const replay = await watch('/' + session + '/replay');
      replayFrames = replay.frames || [];
      replayIndex = 0;
      replayLoaded = state.save_id;
    }
    if (!replayFrames.length) draw(state.frame);
    status(replayFrames.length ? `Replaying a real ${labels[state.game]} episode. Training rotates through all seven games.` : `${labels[state.game]} is queued for its next training turn.`,true);
  }
}

// The renderer below is shared with the local laboratory dashboard.
function draw(f) {
  ctx.clearRect(0, 0, 720, 460);
  if (!f) {
    $('empty').hidden = false;
    $('frame-caption').textContent = mode === 'fast' && session ? 'Fast mode · rendering disabled' : 'Waiting for real experience';
    return;
  }
  $('empty').hidden = true;
  $('frame-caption').textContent = `${labels[f.game]} · score ${n(f.score)}${replayFrames.length?' · recorded replay':''}`;
  ctx.save();
  const rect = (x, y, w, h, c) => {
    ctx.fillStyle = c;
    ctx.fillRect(x, y, w, h);
  };
  const circle = (x, y, r, c) => {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  };
  const text = (s, x, y, size = 16, c = '#c7d7ff') => {
    ctx.fillStyle = c;
    ctx.font = `${size}px system-ui`;
    ctx.fillText(s, x, y);
  };
  if (f.game === 'snake') {
    const cell = 36,
      ox = 180,
      oy = 45;
    for (let x = 0; x < f.size; x++)
      for (let y = 0; y < f.size; y++) rect(ox + x * cell, oy + y * cell, cell - 1, cell - 1, '#19243a');
    f.body.forEach(([x, y], i) => rect(ox + x * cell + 2, oy + y * cell + 2, cell - 5, cell - 5, i ? '#5a89c9' : '#9af7d4'));
    if (f.food) circle(ox + (f.food[0] + .5) * cell, oy + (f.food[1] + .5) * cell, 9, '#be94ff');
  }
  if (f.game === 'pong') {
    for (let y = 20; y < 440; y += 24) rect(358, y, 3, 12, '#2e3c55');
    rect(30, f.left * 400 + 30 - 40, 10, 80, '#78acff');
    rect(680, f.right * 400 + 30 - 40, 10, 80, '#ba93ff');
    circle(30 + f.ball[0] * 660, 30 + f.ball[1] * 400, 8, '#dcf4ff');
    text('LEFT', 35, 25, 11);
    text('RIGHT', 640, 25, 11);
  }
  if (f.game === 'flappy') {
    for (let i = 0; i < 14; i++) circle((i * 137) % 720, (i * 79) % 430, 2, '#425579');
    let x = f.pipe * 650 + 30,
      g = f.gap * 400 + 30,
      gap = f.gap_size * 400;
    rect(x - 25, 0, 50, g - gap / 2, '#5c79b5');
    rect(x - 25, g + gap / 2, 50, 460, '#5c79b5');
    circle(160, f.y * 400 + 30, 13, '#c7a4ff');
    ctx.beginPath();
    ctx.moveTo(142, f.y * 400 + 27);
    ctx.lineTo(165, f.y * 400 + 15);
    ctx.lineTo(162, f.y * 400 + 38);
    ctx.fill();
  }
  if (f.game === 'tetris') {
    const colors = ['#172238', '#79baff', '#f4d983', '#bd96ff', '#8de4b5', '#fb91a7', '#8294ee', '#efa668'];
    for (let y = 0; y < 20; y++)
      for (let x = 0; x < 10; x++) rect(240 + x * 20, 25 + y * 20, 19, 19, colors[f.board[y][x]]);
    text('CURRENT PIECE', 495, 90, 11);
    if (f.planned) f.planned.forEach(([x, y]) => {
      ctx.strokeStyle = '#c6a6ff';
      ctx.lineWidth = 2;
      ctx.strokeRect(240 + x * 20 + 2, 25 + y * 20 + 2, 16, 16);
    });
    f.shape.forEach(([x, y]) => rect(500 + x * 22, 110 + y * 22, 20, 20, colors[f.piece + 1]));
    text('Choose rotation + column', 470, 220, 12);
    text('Each action hard-drops', 470, 243, 12);
  }
  if (f.game === 'platformer') {
    const scale = 52,
      base = 330;
    for (let x = 0; x < 14; x += .1)
      if (!f.gaps.some(([a, b]) => x > a && x < b)) rect(20 + x * scale, base, 6, 80, '#293e58');
    f.obstacles.forEach(([x, h]) => rect(20 + x * scale, base - h * 80, 22, h * 80, '#9a83d4'));
    rect(20 + f.x * scale - 8, base - f.y * 80 - 23, 17, 23, '#86d4ff');
    rect(20 + f.goal * scale, base - 70, 3, 70, '#69e6b3');
    text('GOAL', 20 + f.goal * scale - 15, base - 80, 10);
    if (f.checkpoint) text('CHECKPOINT', 20 + f.checkpoint * scale - 35, base - 50, 10, '#69e6b3');
  }
  if (f.game === 'racing') {
    ctx.translate(130, 0);
    const path = (offset) => {
      ctx.beginPath();
      for (let i = 0; i <= 200; i++) {
        const a = i / 200 * Math.PI * 2,
          r = .32 + .025 * f.difficulty * Math.sin((2 + f.difficulty) * a) + offset;
        const x = (.5 + Math.cos(a) * r) * 460,
          y = (.5 + Math.sin(a) * r) * 460;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.closePath();
    };
    path(.07);
    ctx.fillStyle = '#35425b';
    ctx.fill();
    path(-.07);
    ctx.fillStyle = '#101a2b';
    ctx.fill();
    for (let i = 0; i < 5; i++) {
      const a = f.heading + [-1.2, -.6, 0, .6, 1.2][i];
      ctx.strokeStyle = '#65caba77';
      ctx.beginPath();
      ctx.moveTo(f.x * 460, f.y * 460);
      ctx.lineTo((f.x + Math.cos(a) * f.sensors[i] * .3) * 460, (f.y + Math.sin(a) * f.sensors[i] * .3) * 460);
      ctx.stroke();
    }
    ctx.translate(f.x * 460, f.y * 460);
    ctx.rotate(f.heading);
    rect(-9, -5, 18, 10, '#b299ff');
  }
  if (f.game === 'chess') {
    const symbols = {
      K: '♔',
      Q: '♕',
      R: '♖',
      B: '♗',
      N: '♘',
      P: '♙',
      k: '♚',
      q: '♛',
      r: '♜',
      b: '♝',
      n: '♞',
      p: '♟'
    };
    for (let r = 0; r < 8; r++)
      for (let c = 0; c < 8; c++) {
        const x = 164 + c * 48,
          y = 35 + r * 48;
        rect(x, y, 48, 48, (r + c) % 2 ? '#435674' : '#a3b1ca');
        const p = f.pieces[(7 - r) * 8 + c];
        if (p) text(symbols[p], x + 6, y + 37, 37, p === p.toUpperCase() ? '#fff' : '#111b2a');
      }
    text(`${f.turn} to move${f.check?' · CHECK':''}`, 164, 440, 14);
  }
  ctx.restore();
}


setInterval(()=>{if(replayFrames.length)draw(replayFrames[replayIndex++%replayFrames.length])},120);
setInterval(()=>loadState().catch(error=>status(error.message,false)),1200);
setInterval(()=>loadSessions().catch(error=>status(error.message,false)),6000);
(async()=>{try{await connect();await loadSessions();await loadState()}catch(error){status(error.message,false)}})();
