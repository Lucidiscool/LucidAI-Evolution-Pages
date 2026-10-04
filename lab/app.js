'use strict';
const $ = id => document.getElementById(id);
const labels = {
  snake: 'Snake',
  pong: 'Pong',
  flappy: 'Skywing',
  tetris: 'Tetris',
  racing: 'Circuit',
  platformer: 'Checkpoint',
  chess: 'Chess'
};
const icons = {
  snake: '⌁',
  pong: '◫',
  flappy: '⌃',
  tetris: '▦',
  racing: '◎',
  platformer: '▰',
  chess: '♞'
};
let game = 'snake',
  session = null,
  state = null,
  mode = 'live',
  play = null,
  watch = false,
  replayFrames = [],
  replayIndex = 0,
  checkpoints = [],
  busy = false,
  job = null;
const canvas = $('game'),
  ctx = canvas.getContext('2d');
const n = (v, d = 1) => v === null || v === undefined ? '—' : Number(v).toFixed(d);
async function api(path, body) {
  return window.evolutionRemote.request(path, body);
}

function error(e) {
  $('error').textContent = e.message || e;
  $('error').hidden = false;
}

function safe(fn) {
  return async (...args) => {
    try {
      $('error').hidden = true;
      await fn(...args);
    } catch (e) {
      error(e);
    }
  };
}

function selected() {
  return [...document.querySelectorAll('.checkpoint input:checked')].map(x => x.value);
}

function config() {
  return {
    game,
    episodes: +$('episodes').value,
    seed: +$('seed').value,
    lr: +$('lr').value,
    batch: +$('batch').value,
    difficulty: +$('difficulty').value,
    algorithm: $('algorithm').value,
    mode
  };
}

function chooseGame(name) {
  game = name;
  session = null;
  state = null;
  play = null;
  watch = false;
  replayFrames = [];
  $('sessions').value = '';
  $('game-title').textContent = labels[name];
  document.querySelectorAll('[data-game]').forEach(b => b.classList.toggle('active', b.dataset.game === game));
  $('algorithm-label').textContent = game === 'chess' ? 'TD value learning · self-play · CPU' : game === 'tetris' ? 'Afterstate return learning · CPU' : 'Double DQN · CPU';
  $('algorithm').replaceChildren();
  for (const [v, t] of(game === 'flappy' ? [
      ['dqn', 'Double DQN'],
      ['evolution', 'Neuroevolution']
    ] : [
      ['dqn', game === 'chess' ? 'TD self-play' : game === 'tetris' ? 'Afterstate Monte Carlo' : 'Double DQN']
    ])) {
    const o = new Option(t, v);
    $('algorithm').add(o);
  }
  $('instructions').textContent = {
    snake: '↑ straight · → turn right · ← turn left. Each press takes one step.',
    pong: '↑ / ↓ move your paddle. Human plays the left paddle; the selected agent plays right.',
    flappy: 'Space to flap · ↓ to glide. Each press takes one step.',
    tetris: 'Select a rotation and column to hard-drop the current piece. This placement-action version does not use a falling-piece timer.',
    racing: '↑ accelerate · ↓ brake · ← / → steer. Use action buttons for combined steering and acceleration.',
    platformer: '← / → walk · Space jump · use Jump right to cross gaps.',
    chess: 'With a checkpoint, you play White and the agent replies as Black. Without one, control both sides. Choose a legal UCI move; promotions include q/r/b/n.'
  } [game];
  render(null);
  refreshLibrary();
}
async function refreshSessions() {
  const data = await api('sessions');
  const current = $('sessions').value;
  $('sessions').replaceChildren(new Option('New experiment', ''));
  for (const s of data) $('sessions').add(new Option(`${labels[s.game]} · ${s.id.slice(0,5)} · ${s.status}`, s.id));
  $('sessions').value = session || current;
}
async function refreshLibrary() {
  checkpoints = await api('checkpoints');
  const chosen = selected();
  $('checkpoints').replaceChildren();
  const list = checkpoints.filter(x => x.game === game);
  if (!list.length) {
    $('checkpoints').textContent = 'No saved agents for this environment yet.';
    return;
  }
  for (const c of list) {
    const row = document.createElement('label');
    row.className = 'checkpoint';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = c.id;
    input.checked = chosen.includes(c.id);
    const title = document.createElement('b');
    title.textContent = `Episode ${c.episode}`;
    const info = document.createElement('span');
    info.textContent = `${c.algorithm} · ${new Date(c.created*1000).toLocaleString()} · ${c.id.split('/')[0]}`;
    row.append(input, title, info);
    $('checkpoints').append(row);
  }
}
async function start(checkpoint = null) {
  const result = await api('sessions', {
    ...config(),
    checkpoint
  });
  session = result.id;
  play = null;
  watch = false;
  replayFrames = [];
  await refreshSessions();
  await refresh();
}
$('start').onclick = safe(async () => {
  $('start').disabled = true;
  try {
    await start();
  } finally {
    $('start').disabled = false;
  }
});
$('explain').onclick = safe(async () => {
  if (!session) throw Error('Start or select a session first.');
  const data = await api(`sessions/${session}/explanation`);
  $('explanation').hidden = false;
  $('explanation').textContent = data.explanation.join('\n\n');
});
$('resume').onclick = safe(() => {
  const c = selected();
  if (c.length !== 1) throw Error('Select exactly one checkpoint to resume.');
  return start(c[0]);
});
async function control(action, value) {
  if (!session) throw Error('Start or select a training session first.');
  const result = await api(`sessions/${session}/control`, {
    action,
    value
  });
  await refreshSessions();
  return result;
}
$('pause').onclick = safe(() => control(state?.status === 'paused' ? 'resume' : 'pause'));
$('stop').onclick = safe(() => control('stop'));
$('save').onclick = safe(async () => {
  await control('save');
  await refreshLibrary();
});
$('refresh').onclick = safe(refreshLibrary);
$('sessions').onchange = safe(async () => {
  session = $('sessions').value || null;
  play = null;
  watch = false;
  replayFrames = [];
  await refresh();
});
document.querySelectorAll('[data-mode]').forEach(b => b.onclick = safe(async () => {
  mode = b.dataset.mode;
  replayFrames = [];
  play = null;
  watch = false;
  if (session) await control(mode);
  document.querySelectorAll('[data-mode]').forEach(x => x.classList.toggle('active', x === b));
}));
$('fps').onchange = safe(() => session ? control('speed', +$('fps').value) : Promise.resolve());
$('replay').onclick = safe(async () => {
  if (!session) throw Error('Select a training session first.');
  const data = await api(`sessions/${session}/replay`);
  if (!data.frames.length) throw Error('No recorded episode yet. Complete an episode in Live mode to record a replay.');
  replayFrames = data.frames;
  replayIndex = 0;
  play = null;
  watch = false;
});
$('compare').onclick = safe(async () => {
  const cs = selected();
  if (!cs.length) throw Error('Select at least one checkpoint.');
  const result = await api('compare', {
    checkpoints: cs,
    episodes: +$('eval-episodes').value,
    seed: 100000
  });
  job = result.id;
  $('evaluation').hidden = false;
  $('evaluation').textContent = 'Evaluation running on held-out seeds…';
});
async function newPlay(auto) {
  const cs = selected();
  if (cs.length > 1 || auto && !cs.length) throw Error('Select one agent to watch or challenge.');
  const r = await api('play', {
    game,
    checkpoint: cs[0] || null,
    difficulty: +$('difficulty').value,
    seed: 200000
  });
  play = r.id;
  watch = auto;
  replayFrames = [];
  draw(r.frame);
  showHumanActions(r);
  $('play-status').textContent = auto ? 'Watching saved policy' : 'Human controls active';
}
$('human').onclick = safe(() => newPlay(false));
$('watch').onclick = safe(() => newPlay(true));
$('end-play').onclick = () => {
  play = null;
  watch = false;
  replayFrames = [];
  $('human-actions').replaceChildren();
  $('play-status').textContent = '';
};

function showHumanActions(data) {
  $('human-actions').replaceChildren();
  if (watch) return;
  for (let i = 0; i < data.legal.length; i++) {
    const b = document.createElement('button');
    b.textContent = data.actions[i];
    b.onclick = safe(() => playStep(data.legal[i]));
    $('human-actions').append(b);
  }
}
async function playStep(action = null) {
  if (!play || busy) return;
  busy = true;
  try {
    const data = await api(`play/${play}/step`, {
      action
    });
    draw(data.frame);
    showHumanActions(data);
    $('play-status').textContent = data.ended ? `Game over · score ${n(data.frame.score)}` : `Reward ${n(data.reward,2)} · score ${n(data.frame.score)}`;
    if (data.ended) {
      play = null;
      watch = false;
      $('human-actions').replaceChildren();
    }
  } finally {
    busy = false;
  }
}
document.addEventListener('keydown', safe(async e => {
  if (!play || watch || ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
  const maps = {
    snake: {
      ArrowUp: 0,
      ArrowRight: 1,
      ArrowLeft: 2
    },
    pong: {
      ArrowUp: 1,
      ArrowDown: 2
    },
    flappy: {
      ' ': 1,
      ArrowDown: 0
    },
    platformer: {
      ArrowLeft: 1,
      ArrowRight: 2,
      ' ': 3
    },
    racing: {
      ArrowUp: 1,
      ArrowDown: 2,
      ArrowLeft: 3,
      ArrowRight: 4
    }
  };
  const a = maps[game]?.[e.key];
  if (a !== undefined) {
    e.preventDefault();
    await playStep(a);
  }
}));

function render(s) {
  $('active-config').textContent = s ? JSON.stringify(s.config, null, 2) : 'No active session';
  $('episode').textContent = s ? s.episode : '—';
  $('reward').textContent = n(s?.reward);
  $('average').textContent = n(s?.average_reward);
  $('best').textContent = n(s?.best_score);
  $('status').textContent = s ? s.status + (s.generation !== null ? ' · generation ' + s.generation : '') : 'Ready for an experiment';
  $('speed').textContent = s?.steps_per_second ? `${n(s.steps_per_second,0)} training steps / sec` : 'No measured speed yet';
  $('loss').textContent = n(s?.loss, 4);
  $('epsilon').textContent = s ? `${n(s.epsilon*100)}%` : '—';
  $('success').textContent = s?.success_rate == null ? '—' : `${n(s.success_rate*100)}%`;
  $('pause').textContent = s?.status === 'paused' ? 'Resume' : 'Pause';
  $('save').disabled = !s;
  for (const id of ['pause', 'stop']) $(id).disabled = !s || !['running', 'paused'].includes(s.status);
  $('empty').hidden = !!s?.frame || !!play || replayFrames.length > 0;
  if (s?.error) error(s.error);
  if (!play && !replayFrames.length) draw(s?.frame);
  if (s?.decision && !replayFrames.length && !play) {
    const d = s.decision;
    $('actions').replaceChildren();
    const indices = d.values.map((v, i) => i).sort((a, b) => d.values[b] - d.values[a]).slice(0, 12);
    const max = Math.max(1, ...indices.map(i => Math.abs(d.values[i])));
    for (const i of indices) {
      const row = document.createElement('div');
      row.className = 'action-row' + (d.selected === i ? ' chosen' : '');
      const bar = document.createElement('canvas');
      bar.className = 'value-bar';
      bar.width = 240;
      bar.height = 38;
      bar.getContext('2d').fillRect(0, 0, 240 * Math.abs(d.values[i]) / max, 38);
      const name = document.createElement('span');
      name.textContent = d.actions[i];
      const val = document.createElement('span');
      val.textContent = n(d.values[i], 3);
      row.append(bar, name, val);
      $('actions').append(row);
    }
    $('observation').textContent = JSON.stringify(d.observation.map(x => +x.toFixed(3)));
  } else {
    $('actions').textContent = replayFrames.length ? 'Recorded frames only. Policy values were not recorded for this replay.' : 'Values appear during live training.';
    $('observation').textContent = '[]';
  }
  chart(s?.history || []);
}

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

function chart(history) {
  const c = $('chart'),
    g = c.getContext('2d');
  g.clearRect(0, 0, c.width, c.height);
  if (!history.length) {
    $('chart-note').textContent = 'No training data yet. Progress is never simulated.';
    return;
  }
  const ys = history.map(x => x.reward),
    min = Math.min(...ys),
    max = Math.max(...ys),
    range = max - min || 1;
  g.strokeStyle = '#273247';
  g.fillStyle = '#8293b0';
  g.font = '11px system-ui';
  for (let i = 0; i < 4; i++) {
    const y = 20 + i * 52;
    g.beginPath();
    g.moveTo(50, y);
    g.lineTo(880, y);
    g.stroke();
    g.fillText((max - i * range / 3).toFixed(0), 5, y + 4);
  }

  function line(values, color) {
    g.strokeStyle = color;
    g.lineWidth = 2;
    g.beginPath();
    values.forEach((v, i) => {
      let x = 50 + i / Math.max(1, values.length - 1) * 830,
        y = 20 + (max - v) / range * 156;
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    });
    g.stroke();
  }
  line(ys, '#42618b');
  line(ys.map((_, i) => {
    const s = ys.slice(Math.max(0, i - 19), i + 1);
    return s.reduce((a, b) => a + b, 0) / s.length;
  }), '#a491ff');
  $('chart-note').textContent = `Episodes ${history[0].episode}–${history.at(-1).episode} · Hover to inspect a measured episode.`;
  c.onmousemove = e => {
    const r = c.getBoundingClientRect(),
      i = Math.max(0, Math.min(history.length - 1, Math.round((e.clientX - r.left) / r.width * (history.length - 1))));
    const row = history[i];
    $('chart-note').textContent = `Episode ${row.episode} · reward ${n(row.reward,2)} · score ${n(row.score)} · loss ${n(row.loss,4)}`;
  };
}
async function refresh() {
  if (session) {
    const latest = await api('sessions/' + session);
    if (game !== latest.config.game) {
      const active = session;
      chooseGame(latest.config.game);
      session = active;
      $('sessions').value = active;
    }
    const statusChanged = state?.status !== latest.status;
    state = latest;
    if (statusChanged) { await refreshSessions(); await refreshLibrary(); }
    mode = state.mode;
    document.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
    render(state);
  } else if (!play && !replayFrames.length) render(null);
  if (job) {
    const j = await api('jobs/' + job);
    if (j.status !== 'running') {
      renderEvaluation(j);
      job = null;
      await refreshLibrary();
    }
  }
  $('connection').textContent = '● ENGINE ONLINE';
}
async function animate() {
    try {
      if (replayFrames.length) {
        draw(replayFrames[replayIndex++ % replayFrames.length]);
      } else if (play && watch) {
        await playStep();
      }
    } catch (e) {
      watch = false;
      error(e);
    }
    setTimeout(animate, 1000 / +$('fps').value);
  }
  (async () => {
    try {
      const games = await api('games');
      for (const item of games) {
        const b = document.createElement('button');
        b.dataset.game = item.id;
        b.textContent = `${icons[item.id]}  ${labels[item.id]}`;
        b.onclick = () => chooseGame(item.id);
        $('games').append(b);
      }
      chooseGame('snake');
      await refreshSessions();
      await refresh();
      setInterval(() => refresh().catch(e => {
        $('connection').textContent = 'ENGINE OFFLINE';
        error(e);
      }), 800);
      animate();
    } catch (e) {
      error(e);
    }
  })();

function renderEvaluation(result) {
  const box = $('evaluation');
  box.replaceChildren();
  if (result.status === 'error') {
    box.textContent = result.error;
    return;
  }
  const intro = document.createElement('p');
  intro.textContent = `${result.type} · ${result.baseline.episodes} evaluation episodes · random baseline score ${n(result.baseline.mean_score,2)}`;
  box.append(intro);
  const table = document.createElement('table');
  const header = document.createElement('tr');
  for (const title of ['Agent', 'Mean score', 'Standard error', 'Wins / losses / draws']) {
    const cell = document.createElement('th');
    cell.textContent = title;
    header.append(cell);
  }
  table.append(header);
  for (const entry of result.results) {
    const standing = result.standings.find(s => s.checkpoint === entry.checkpoint);
    const row = document.createElement('tr');
    for (const value of [entry.checkpoint, n(entry.mean_score, 2), n(entry.score_standard_error, 2), standing ? `${standing.wins} / ${standing.losses} / ${standing.draws}` : '—']) {
      const cell = document.createElement('td');
      cell.textContent = value;
      row.append(cell);
    }
    table.append(row);
  }
  box.append(table);
  const note = document.createElement('p');
  note.className = 'muted';
  note.textContent = result.matches.length ? 'Head-to-head matches alternate sides. Experimental time limits count as draws.' : 'Wins compare each agent’s score with its opponents on identical seeds. These are score comparisons, not direct multiplayer games.';
  box.append(note);
}
