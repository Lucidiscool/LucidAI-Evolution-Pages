'use strict';
const games = {
  snake: {name:'Snake',icon:'⌁',description:'A growing snake learns to collect food without trapping itself.',task:'Collect food',method:'Double DQN',unit:'Food collected',caveat:'Two training seeds both improved over random and initial policies.'},
  pong: {name:'Pong',icon:'◫',description:'A paddle learns to return the ball against a tracking opponent.',task:'Win rallies',method:'Double DQN',unit:'Returns + win bonus',caveat:'The evaluation opponent is a simple tracking baseline.'},
  flappy: {name:'Skywing',icon:'⌃',description:'An agent learns when to flap through a field of obstacles.',task:'Pass obstacles',method:'DQN / neuroevolution',unit:'Obstacles passed',caveat:'Both learning methods improved in the measured runs.'},
  tetris: {name:'Tetris',icon:'▦',description:'A placement agent chooses rotation and column for each piece.',task:'Clear lines',method:'Afterstate value learning',unit:'Lines cleared',caveat:'The legacy TD run did not improve over its initial policy; the Monte Carlo run did.'},
  racing: {name:'Circuit',icon:'◎',description:'Steering, throttle and braking policies race a compact original track.',task:'Complete a lap',method:'Double DQN',unit:'Fraction of lap',caveat:'The short run failed; the longer run completed the simple track. Seed changes do not create new tracks.'},
  platformer: {name:'Checkpoint',icon:'▰',description:'A walking and jumping policy advances through gaps and obstacles.',task:'Reach the goal',method:'Double DQN + curriculum',unit:'Furthest distance',caveat:'The agent advanced farther than baselines at final difficulty, but did not master every level.'},
  chess: {name:'Chess',icon:'♞',description:'A small neural policy learns from self-play under complete chess rules.',task:'Outscore random play',method:'TD self-play',unit:'Mean result (−1 to +1)',caveat:'The first run did not improve over its initial network. The second beat a weak random opponent.'}
};
const files = ['snake-seed0','snake-seed1','pong-seed0','flappy-seed0','flappy-evolution','tetris-seed0','tetris-mc-seed2','racing-seed0','racing-seed1','platformer-seed0','chess-seed0','chess-seed1'];
const $ = id => document.getElementById(id);
let reports = [], selected = 'snake';
const num = value => Number(value).toFixed(2).replace(/\.00$/,'');
function render() {
  const info = games[selected], runs = reports.filter(r => r.config.game === selected), best = runs.reduce((a,b) => !a || b.trained.mean_score > a.trained.mean_score ? b : a,null);
  document.querySelectorAll('nav button').forEach(b => {b.classList.toggle('active',b.dataset.game === selected);b.setAttribute('aria-current',b.dataset.game === selected ? 'page' : 'false')});
  $('game-name').textContent = info.name; $('description').textContent = info.description; $('game-icon').textContent = info.icon;
  $('task').textContent = info.task; $('method').textContent = info.method; $('unit').textContent = info.unit; $('caveat').textContent = info.caveat;
  $('outcome').textContent = runs.length ? `${runs.filter(r => r.trained.mean_score > Math.max(r.baseline.mean_score,r.untrained.mean_score)).length} of ${runs.length} runs beat both baselines` : 'No data';
  $('run-count').textContent = runs.length; $('trained').textContent = best ? num(best.trained.mean_score) : '—';
  $('initial').textContent = best ? num(best.untrained.mean_score) : '—'; $('random').textContent = best ? num(best.baseline.mean_score) : '—';
  $('trained-note').textContent = best ? `Best measured run · ${best.file}` : '';
  $('chart').replaceChildren(); $('runs').replaceChildren();
  if (!best) return;
  const points = [['Trained',best.trained.mean_score,'#82e1c9'],['Initial',best.untrained.mean_score,'#748cb5'],['Random',best.baseline.mean_score,'#b59875']];
  const max = Math.max(...points.map(p => p[1]),.01);
  for(const [label,value,color] of points){
    const row=document.createElement('div');row.className='bar-row';
    const name=document.createElement('span');name.textContent=label;
    const track=document.createElement('div');track.className='bar-track';
    const fill=document.createElement('span');fill.className='bar-fill';fill.style.width=`${Math.max(0,value)/max*100}%`;fill.style.background=color;track.append(fill);
    const score=document.createElement('strong');score.textContent=num(value);row.append(name,track,score);$('chart').append(row);
  }
  $('chart').setAttribute('aria-label',`${info.name}: trained ${num(best.trained.mean_score)}, initial ${num(best.untrained.mean_score)}, random ${num(best.baseline.mean_score)}`);
  $('chart-note').textContent = `Best run shown: ${best.file}. Every mean is over 50 evaluation episodes beginning at seed 100000. The table keeps less successful runs visible.`;
  for(const r of runs){
    const tr=document.createElement('tr');
    const values=[r.file,num(r.baseline.mean_score),num(r.untrained.mean_score),num(r.trained.mean_score),r.trained.mean_score>Math.max(r.baseline.mean_score,r.untrained.mean_score)?'Improved':'Did not beat both baselines'];
    for(const value of values){const td=document.createElement('td');td.textContent=value;tr.append(td)}
    const td=document.createElement('td'),a=document.createElement('a');a.href=`./data/${r.file}.json`;a.textContent='JSON ↗';td.append(a);tr.append(td);$('runs').append(tr);
  }
}
for(const [id,info] of Object.entries(games)){
  const button=document.createElement('button');button.type='button';button.dataset.game=id;button.innerHTML=`<span aria-hidden="true">${info.icon}</span>${info.name}`;button.onclick=()=>{selected=id;history.replaceState(null,'',`#${id}`);render()};$('games').append(button);
}
Promise.all(files.map(async file=>{
  const response=await fetch(`./data/${file}.json`);
  if(!response.ok)throw Error(`Could not load ${file}`);
  return {...await response.json(),file};
})).then(data=>{reports=data;const hash=location.hash.slice(1);if(games[hash])selected=hash;render()}).catch(error=>{$('description').textContent=`Results could not load: ${error.message}`});
