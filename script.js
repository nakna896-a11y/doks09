'use strict';
const $ = id => document.getElementById(id);
const sc = $('scene'), g = sc.getContext('2d');
let W = 0, H = 0;
function resize() { W = sc.width = sc.clientWidth; H = sc.height = sc.clientHeight; }
addEventListener('resize', resize);

const SEG = 3, NS = 200, KC = 0.15;
const S = { mode: 'manual', on: false, run: false, paused: false, dist: 0, speed: 0, x: .5, steer: 0, rpm: 0,
  gear: 0, clutch: 0, hb: true, belt: false, sL: false, sR: false, haz: false, lights: false, wipers: false,
  horn: false, score: 100, limit: 50, time: 0, blink: 0, nextI: 0, minSp: 999, tSp: 0, tLane: 0 };
const keys = {}, cars = [], cd = {};
const SEQ = ['limit50', 'cross', 'light', 'stop', 'yield', 'nopark', 'limit90', 'parking', 'light', 'cross', 'limit50', 'yield'];
const K = { 1: 130, 2: 75, 3: 52, 4: 39, 5: 31, R: 110 }, A = { 1: 14, 2: 9, 3: 6, 4: 4.5, 5: 3.5, R: 6 };
const objAt = i => ({ i, z: 300 + i * 220, t: SEQ[((i % SEQ.length) + SEQ.length) % SEQ.length] });

/* ---------- Питання ПДД ---------- */
const QZ = {
  limit50: { q: 'Що означає знак «Обмеження максимальної швидкості 50»?', o: ['Рекомендована швидкість 50 км/год', 'Заборонено рух зі швидкістю понад 50 км/год', 'Мінімальна швидкість 50 км/год'], a: 1, e: 'У населених пунктах максимальна швидкість — 50 км/год.' },
  limit90: { q: 'Яка максимальна швидкість легкового авто поза населеним пунктом (не автомагістраль)?', o: ['70 км/год', '90 км/год', '110 км/год'], a: 1, e: 'Поза населеними пунктами — 90 км/год, на автомагістралях — 130 км/год.' },
  stop: { q: 'Що вимагає знак «Стоп»?', o: ['Зменшити швидкість і їхати далі', 'Зупинитись перед стоп-лінією та дати дорогу', 'Дати дорогу лише якщо є транспорт'], a: 1, e: 'Зупинка обов\'язкова перед стоп-лінією, навіть якщо дорога вільна.' },
  yield: { q: 'Що означає знак «Дати дорогу»?', o: ['Дати дорогу транспорту на головній дорозі', 'Обов\'язково зупинитись', 'Увімкнути аварійну сигналізацію'], a: 0, e: 'Знак зобов\'язує поступитися дорогою транспорту, що рухається по головній дорозі.' },
  cross: { q: 'Наближаючись до нерегульованого пішохідного переходу, водій повинен:', o: ['Просигналити пішоходам', 'Прискоритись, щоб проїхати першим', 'Знизити швидкість і дати дорогу пішоходам'], a: 2, e: 'Пішоходи на переході мають перевагу.' },
  nopark: { q: 'Що означає синє коло з червоним хрестом?', o: ['Стоянку заборонено', 'Зупинку заборонено', 'В\'їзд заборонено'], a: 1, e: 'Знак «Зупинку заборонено» — не можна ні зупинятись, ні паркуватись.' },
  parking: { q: 'Що означає синій квадрат з літерою P?', o: ['Місце стоянки', 'Паркування заборонено', 'Автостанція'], a: 0, e: 'Знак «Місце стоянки» — тут дозволено паркування.' }
};

/* ---------- Допоміжні ---------- */
function can(k, t) { if ((cd[k] || 0) > S.time) return false; cd[k] = S.time + t; return true; }
let tt; function toast(m, c) { const T = $('toast'); T.textContent = m; T.className = c || ''; clearTimeout(tt); tt = setTimeout(() => T.textContent = '', 3500); }
function fine(n, msg, key, t) {
  if (key && !can(key, t)) return;
  S.score -= n; toast('−' + n + ' ' + msg, 'bad'); $('score').textContent = 'Бали: ' + S.score;
  if (S.score <= 0 && S.run) { S.run = false; $('end').hidden = false; }
}
const night = () => Math.max(0, Math.min(1, -Math.sin(S.time * Math.PI * 2 / 240) * 2));
const raining = () => Math.sin(S.time / 31 + 1) > 0.75;
function dir() { const v = S.gear; if (S.mode === 'manual') return v === -1 ? -1 : v > 0 ? 1 : 0; return v === 'D' ? 1 : v === 'R' ? -1 : 0; }
function gnum() {
  if (S.mode === 'manual') return S.gear === -1 ? 'R' : S.gear;
  if (S.gear === 'R') return 'R';
  const v = Math.abs(S.speed); return v < 22 ? 1 : v < 42 ? 2 : v < 65 ? 3 : v < 95 ? 4 : 5;
}
function curveAt(z) {
  const ramp = Math.min(1, Math.max(0, (z - 200) / 300));
  return Math.max(0, Math.sin(z / 700) - .1) * 1.3 * Math.sin(z / 260) * .5 * ramp;
}
const lightState = () => { const t = S.time % 20; return t < 9 ? 'g' : t < 11 ? 'y' : 'r'; };

/* ---------- Керування ---------- */
function setGear(v) {
  if (S.mode === 'manual') {
    if (v === -1 && Math.abs(S.speed) > 3) { toast('Задню передачу вмикай лише на зупинці', 'bad'); return; }
    if (S.on && S.clutch < .7 && v !== S.gear) { fine(1, 'Скрегіт коробки! Стисни зчеплення (Shift)', 'gr', 2); return; }
    S.gear = v;
  } else {
    if (v === 'P' && Math.abs(S.speed) > 2) { toast('P лише на повній зупинці', 'bad'); return; }
    if ((v === 'R' && S.speed > 3) || (v === 'D' && S.speed < -3)) { toast('Спочатку зупинись', 'bad'); return; }
    S.gear = v;
  }
  markGears();
}
function engine() {
  if (S.on) { S.on = false; toast('Двигун вимкнено'); return; }
  if (S.mode === 'manual' && S.gear !== 0 && S.clutch < .7) { toast('Вибери N або стисни зчеплення (Shift)', 'bad'); return; }
  if (S.mode === 'auto' && S.gear !== 'P' && S.gear !== 'N') { toast('Запуск лише на P або N', 'bad'); return; }
  S.on = true; S.rpm = 900; toast('Двигун запущено', 'ok');
}
function act(a) {
  switch (a) {
    case 'engine': engine(); break;
    case 'sL': S.sL = !S.sL; if (S.sL) S.sR = false; break;
    case 'sR': S.sR = !S.sR; if (S.sR) S.sL = false; break;
    case 'haz': S.haz = !S.haz; break;
    case 'lights': S.lights = !S.lights; break;
    case 'wipers': S.wipers = !S.wipers; break;
    case 'belt': S.belt = !S.belt; toast(S.belt ? 'Ремінь пристебнуто' : 'Ремінь відстебнуто'); break;
    case 'hb': S.hb = !S.hb; toast(S.hb ? 'Ручник піднято' : 'Ручник опущено'); break;
  }
}
const stateOf = a => a === 'horn' ? S.horn : S[a];
function markGears() { document.querySelectorAll('#gears button').forEach(b => b.classList.toggle('on', String(b.dataset.g) === String(S.gear))); }
function buildGears() {
  const box = $('gears'); box.innerHTML = '';
  const list = S.mode === 'manual' ? [['N', 0], ['1', 1], ['2', 2], ['3', 3], ['4', 4], ['5', 5], ['R', -1]] : [['P', 'P'], ['R', 'R'], ['N', 'N'], ['D', 'D']];
  list.forEach(([t, v]) => { const b = document.createElement('button'); b.textContent = t; b.dataset.g = v; b.style.minWidth = '38px'; b.onclick = () => setGear(v); box.appendChild(b); });
  $('clutchBtn').style.display = S.mode === 'manual' ? '' : 'none';
  markGears();
}
document.querySelectorAll('[data-a]').forEach(b => {
  if (b.dataset.a === 'horn') {
    b.onpointerdown = () => S.horn = true; b.onpointerup = b.onpointerleave = () => S.horn = false;
  } else b.onclick = () => act(b.dataset.a);
});
document.querySelectorAll('[data-k]').forEach(b => {
  const k = b.dataset.k;
  b.onpointerdown = e => { keys[k] = true; e.preventDefault(); };
  b.onpointerup = b.onpointerleave = b.onpointercancel = () => keys[k] = false;
});
addEventListener('keydown', e => {
  keys.Shift = e.shiftKey;
  if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
  if (e.repeat) return;
  if (e.code.startsWith('Arrow')) keys[e.code] = true;
  const man = S.mode === 'manual', c = e.code;
  if (c === 'Space') act('hb');
  else if (c === 'KeyI' || c === 'Enter') act('engine');
  else if (c === 'KeyQ') act('sL'); else if (c === 'KeyE') act('sR');
  else if (c === 'KeyH') act('haz'); else if (c === 'KeyL') act('lights');
  else if (c === 'KeyV') act('wipers'); else if (c === 'KeyB') act('belt');
  else if (c === 'KeyC') S.horn = true;
  else if (man && /^Digit[0-5]$/.test(c)) setGear(+c[5]);
  else if (c === 'KeyR') setGear(man ? -1 : 'R');
  else if (c === 'KeyN') setGear(man ? 0 : 'N');
  else if (!man && c === 'KeyD') setGear('D');
  else if (!man && c === 'KeyP') setGear('P');
});
addEventListener('keyup', e => {
  keys.Shift = e.shiftKey;
  if (e.code.startsWith('Arrow')) keys[e.code] = false;
  if (e.code === 'KeyC') S.horn = false;
});

/* ---------- Звук ---------- */
let AC, osc, gn, hosc, hgn;
function audioInit() {
  try {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    osc = AC.createOscillator(); osc.type = 'sawtooth'; gn = AC.createGain(); gn.gain.value = 0; osc.connect(gn); gn.connect(AC.destination); osc.start();
    hosc = AC.createOscillator(); hosc.type = 'square'; hosc.frequency.value = 420; hgn = AC.createGain(); hgn.gain.value = 0; hosc.connect(hgn); hgn.connect(AC.destination); hosc.start();
  } catch (e) { }
}

/* ---------- Фізика та правила ---------- */
function spawn() {
  const opp = Math.random() < .4;
  cars.push({ z: S.dist + 250 + Math.random() * 350, lane: opp ? -.5 : .5, sp: opp ? -50 : 20 + Math.random() * 25, col: ['#c0392b', '#2980b9', '#f1c40f', '#ecf0f1', '#27ae60'][Math.random() * 5 | 0] });
}
function update(dt) {
  S.time += dt; S.blink = (S.blink + dt) % .9;
  const thr = keys.ArrowUp ? 1 : 0, br = keys.ArrowDown ? 1 : 0, sp = Math.abs(S.speed), d = dir(), man = S.mode === 'manual';
  if (man) { const t = keys.Shift ? 1 : 0; S.clutch += (t - S.clutch) * Math.min(1, dt * (t > S.clutch ? 12 : 2.5)); } else S.clutch = 0;
  const eng = 1 - S.clutch, gnm = gnum(), wr = d ? sp * K[gnm] : 0;
  let drive = 0;
  if (S.on) {
    const free = 900 + thr * 5600;
    const tgt = d ? (man ? free + (wr - free) * Math.max(0, (eng - .3) / .7) : Math.max(900 + thr * 900, wr)) : free;
    S.rpm += (tgt - S.rpm) * Math.min(1, dt * 7);
    if (man && d && eng > .92 && wr < 550) { S.on = false; toast('Двигун заглох! Стисни зчеплення й запусти (I)', 'bad'); }
    const f = man ? Math.min(1, Math.max(0, (eng - .25) / .35)) : 1;
    if (d && S.rpm < 6600 && !S.hb) drive = thr * A[gnm] * f * (.55 + .45 * Math.min(1, S.rpm / 2500));
    if (S.hb && thr && d && eng > .5) toast('Знято з ручника? Ти рушаєш з піднятим ручником!', 'bad');
  } else S.rpm += (0 - S.rpm) * Math.min(1, dt * 4);
  let a = d * drive;
  if (!man && S.on && d && !thr && !br && !S.hb && sp < 7) a += d * 4;
  let dec = 1.5 + sp * .03 + br * 38 + (S.hb ? 30 : 0) + (S.gear === 'P' ? 40 : 0);
  if (d && eng > .5 && !thr) dec += S.on ? (man ? 3 : 1) : 20;
  if (Math.abs(S.x) > 1.12) dec += 10;
  S.speed += a * dt;
  const dd = dec * dt; S.speed -= Math.sign(S.speed) * Math.min(dd, Math.abs(S.speed));
  if (S.speed < -15) S.speed = -15;
  if (d >= 0 && S.speed < 0 && S.gear !== 'R') S.speed = 0;

  const v = S.speed / 3.6; S.dist += v * dt;
  const ts = (keys.ArrowRight ? 1 : 0) - (keys.ArrowLeft ? 1 : 0);
  S.steer += (ts - S.steer) * Math.min(1, dt * (ts ? 3 : 5));
  S.x += S.steer * v * .05 * dt - curveAt(S.dist) * v * .03 * dt;

  // Правила
  if (sp > 5 && !S.belt) fine(2, 'Пристебни ремінь!', 'belt', 10);
  if (sp > S.limit + 5) { S.tSp += dt; if (S.tSp > 3) fine(5, 'Перевищення швидкості! Ліміт ' + S.limit, 'sp', 5); } else S.tSp = 0;
  if (S.x < .05 && sp > 5) { if (!S.sL && !S.haz) { S.tLane += dt; if (S.tLane > 1.5) fine(5, 'Виїзд на зустрічну смугу без поворотника!', 'ln', 6); } } else S.tLane = 0;
  if (Math.abs(S.x) > 1.1 && sp > 5) fine(5, 'З\'їзд з проїзної частини!', 'of', 4);
  if (night() > .5 && !S.lights && sp > 10) fine(3, 'Увімкни ближнє світло (L)!', 'lt', 10);
  if (raining() && !S.wipers && sp > 10 && can('wp', 15)) toast('Дощ! Увімкни двірники (V)');

  // Об'єкти (знаки/світлофори)
  const o = objAt(S.nextI), dz = o.z - S.dist;
  if (dz < 25) S.minSp = Math.min(S.minSp, sp);
  if (dz <= 0) { passObj(o); S.nextI++; S.minSp = 999; }

  // Трафік
  while (cars.length < 6) spawn();
  for (let i = cars.length - 1; i >= 0; i--) {
    const c = cars[i]; c.z += c.sp / 3.6 * dt;
    if (c.z < S.dist - 120 || c.z > S.dist + 800) { cars.splice(i, 1); continue; }
    if (Math.abs(c.z - S.dist) < 4 && Math.abs(c.lane - S.x) < .32) {
      cars.splice(i, 1); S.speed *= .1; fine(15, 'Аварія! ДТП', null);
    }
  }
}
function passObj(o) {
  if (o.t === 'limit50') S.limit = 50;
  if (o.t === 'limit90') S.limit = 90;
  if (o.t === 'stop' && S.minSp > 3) fine(10, 'Не зупинився перед знаком «Стоп»!');
  if (o.t === 'light' && lightState() === 'r' && Math.abs(S.speed) > 5) fine(10, 'Проїзд на червоне світло!');
  if (o.t === 'yield' && S.minSp > 45) fine(3, 'Занадто швидко перед «Дати дорогу»', 'yd', 3);
  document.getElementById('limitSign').textContent = S.limit;
  if (QZ[o.t] && can('quiz', 18)) setTimeout(() => showQuiz(o.t), 1200);
}
function showQuiz(t) {
  const q = QZ[t]; if (!q || !S.run) return;
  S.paused = true; $('qq').textContent = q.q; $('qe').textContent = ''; $('qc').hidden = true;
  const box = $('qo'); box.innerHTML = '';
  q.o.forEach((txt, i) => {
    const b = document.createElement('button'); b.textContent = txt;
    b.onclick = () => {
      [...box.children].forEach((x, j) => { x.disabled = true; if (j === q.a) x.classList.add('right'); });
      if (i === q.a) { S.score += 5; $('qe').textContent = '✅ Правильно! +5 балів. ' + q.e; }
      else { S.score -= 5; b.classList.add('wrong'); $('qe').textContent = '❌ Неправильно, −5 балів. ' + q.e; }
      $('score').textContent = 'Бали: ' + S.score; $('qc').hidden = false;
    };
    box.appendChild(b);
  });
  $('qc').onclick = () => { $('quiz').hidden = true; S.paused = false; if (S.score <= 0) { S.run = false; $('end').hidden = false; } };
  $('quiz').hidden = false;
}

/* ---------- Малювання ---------- */
const P = [];
function band(n, a, b, col) {
  const p = P[n], q = P[n + 1]; g.fillStyle = col; g.beginPath();
  g.moveTo(p.c + a * p.hw, p.y + 1); g.lineTo(p.c + b * p.hw, p.y + 1); g.lineTo(q.c + b * q.hw, q.y); g.lineTo(q.c + a * q.hw, q.y); g.fill();
}
function at(n) { const i = Math.floor(n), f = n - i, a = P[i], b = P[Math.min(NS, i + 1)]; return { c: a.c + (b.c - a.c) * f, hw: a.hw + (b.hw - a.hw) * f, y: a.y + (b.y - a.y) * f, s: a.s + (b.s - a.s) * f }; }
function circ(x, y, r, col) { g.fillStyle = col; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
function txt(t, x, y, sz, col) { g.fillStyle = col; g.font = 'bold ' + sz + 'px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t, x, y); }
function sprSign(t, x, y, s) {
  const h = s * H * .42, r = s * H * .06; if (r < 1.5) return;
  g.fillStyle = '#888'; g.fillRect(x - r * .07, y - h, r * .14, h);
  const cy = y - h - r * .2;
  if (t === 'limit50' || t === 'limit90') { circ(x, cy, r, '#d00'); circ(x, cy, r * .72, '#fff'); txt(t.slice(5), x, cy, r * .85, '#000'); }
  else if (t === 'stop') { g.fillStyle = '#d00'; g.beginPath(); for (let k = 0; k < 8; k++) { const a = Math.PI / 8 + k * Math.PI / 4; g.lineTo(x + Math.cos(a) * r * 1.08, cy + Math.sin(a) * r * 1.08); } g.fill(); txt('STOP', x, cy, r * .6, '#fff'); }
  else if (t === 'yield') { g.fillStyle = '#d00'; g.beginPath(); g.moveTo(x - r * 1.1, cy - r * .85); g.lineTo(x + r * 1.1, cy - r * .85); g.lineTo(x, cy + r); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.moveTo(x - r * .6, cy - r * .5); g.lineTo(x + r * .6, cy - r * .5); g.lineTo(x, cy + r * .5); g.fill(); }
  else if (t === 'cross') { g.fillStyle = '#1b5fd0'; g.fillRect(x - r, cy - r, r * 2, r * 2); g.fillStyle = '#fff'; g.beginPath(); g.moveTo(x - r * .75, cy + r * .75); g.lineTo(x + r * .75, cy + r * .75); g.lineTo(x, cy - r * .75); g.fill(); txt('🚶', x, cy + r * .2, r * .8, '#000'); }
  else if (t === 'nopark') { circ(x, cy, r, '#1b5fd0'); circ(x, cy, r * .85, '#d00'); circ(x, cy, r * .75, '#1b5fd0'); g.strokeStyle = '#d00'; g.lineWidth = r * .18; g.beginPath(); g.moveTo(x - r * .6, cy - r * .6); g.lineTo(x + r * .6, cy + r * .6); g.moveTo(x + r * .6, cy - r * .6); g.lineTo(x - r * .6, cy + r * .6); g.stroke(); }
  else if (t === 'parking') { g.fillStyle = '#1b5fd0'; g.fillRect(x - r, cy - r, r * 2, r * 2); txt('P', x, cy, r * 1.4, '#fff'); }
}
function sprLight(x, y, s) {
  const h = s * H * .5, w = s * H * .05; if (w < 1.5) return;
  g.fillStyle = '#555'; g.fillRect(x - w * .1, y - h, w * .2, h);
  g.fillStyle = '#111'; g.fillRect(x - w * .5, y - h - w * 2.2, w, w * 3);
  const st = lightState();
  circ(x, y - h - w * 1.7, w * .36, st === 'r' ? '#f22' : '#400');
  circ(x, y - h - w * .7, w * .36, st === 'y' ? '#fd0' : '#440');
  circ(x, y - h + w * .3, w * .36, st === 'g' ? '#2f4' : '#040');
}
function sprCar(x, y, w, col, front) {
  const h = w * .7; if (w < 2) return;
  g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(x - w / 2, y - h * .08, w, h * .1);
  g.fillStyle = col; g.fillRect(x - w / 2, y - h * .75, w, h * .55);
  g.fillStyle = '#223'; g.fillRect(x - w * .38, y - h, w * .76, h * .32);
  g.fillStyle = '#111'; g.fillRect(x - w * .5, y - h * .22, w * .18, h * .22); g.fillRect(x + w * .32, y - h * .22, w * .18, h * .22);
  g.fillStyle = front ? '#fff8c0' : '#f22';
  g.fillRect(x - w * .46, y - h * .6, w * .18, h * .12); g.fillRect(x + w * .28, y - h * .6, w * .18, h * .12);
}
function sprTree(x, y, s) { const h = s * H * .5; if (h < 3) return; g.fillStyle = '#5a3a1a'; g.fillRect(x - h * .03, y - h * .35, h * .06, h * .35); circ(x, y - h * .5, h * .22, '#1f6b2a'); circ(x - h * .1, y - h * .42, h * .15, '#2a8a36'); }
function sprHouse(x, y, s, k) { const h = s * H * .6; if (h < 3) return; g.fillStyle = ['#d9c9a3', '#c98f7a', '#b9c7d6'][k % 3]; g.fillRect(x - h * .35, y - h * .45, h * .7, h * .45); g.fillStyle = '#7a3b2e'; g.beginPath(); g.moveTo(x - h * .42, y - h * .45); g.lineTo(x + h * .42, y - h * .45); g.lineTo(x, y - h * .8); g.fill(); g.fillStyle = '#9cd'; g.fillRect(x - h * .2, y - h * .33, h * .14, h * .14); g.fillRect(x + h * .06, y - h * .33, h * .14, h * .14); }

function drawScene() {
  g.clearRect(0, 0, W, H);
  const hor = H * .4, nf = night();
  const sky = g.createLinearGradient(0, 0, 0, hor); sky.addColorStop(0, '#5aa9ee'); sky.addColorStop(1, '#bfe3ff');
  g.fillStyle = sky; g.fillRect(0, 0, W, hor);
  g.fillStyle = '#6b8f6b'; for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(W * (i / 5), hor, W * .12, Math.PI, 0); g.fill(); }
  g.fillStyle = '#3a8c3c'; g.fillRect(0, hor, W, H - hor);
  P.length = 0; let cx = 0, dx = 0;
  for (let n = 0; n <= NS; n++) {
    const s = 1 / (1 + n * .05), hw = s * W * .55;
    P.push({ c: W / 2 - S.x * hw + cx * KC * s, hw, y: hor + (H - hor) * s, s });
    dx += curveAt(S.dist + n * SEG); cx += dx;
  }
  const i0 = Math.max(0, Math.floor((S.dist - 300) / 220));
  const objs = []; for (let i = i0; i < i0 + 4; i++) objs.push(objAt(i));
  const zeb = objs.filter(o => o.t === 'cross' || o.t === 'light' || o.t === 'stop');
  for (let n = NS - 1; n >= 0; n--) {
    const z = S.dist + n * SEG, st = Math.floor(z / 9) % 2;
    band(n, -40, 40, st ? '#3a8c3c' : '#358536');
    band(n, -1.2, 1.2, '#a8a8a8');
    band(n, -1, 1, st ? '#4a4a4e' : '#505054');
    band(n, .93, .97, '#eee'); band(n, -.97, -.93, '#eee');
    if (Math.floor(z / 6) % 2) band(n, -.02, .02, '#fff');
    for (const o of zeb) {
      if (o.t !== 'stop' && Math.abs(z - o.z) < 4.5) for (let k = -5; k < 5; k++) band(n, k * .2 + .03, k * .2 + .15, '#eee');
      if (o.t !== 'cross' && Math.abs(z - (o.z - 7)) < 1.5) band(n, .02, .96, '#fff');
    }
  }
  // Спрайти
  const spr = [];
  objs.forEach(o => { const n = (o.z - S.dist) / SEG; if (n > .5 && n < NS) { const p = at(n); spr.push({ n, f: () => { if (o.t === 'light') sprLight(p.c + 1.3 * p.hw, p.y, p.s); else sprSign(o.t, p.c + 1.35 * p.hw, p.y, p.s); } }); } });
  for (let k = Math.ceil(S.dist / 30); k < Math.ceil(S.dist / 30) + NS * SEG / 30; k++) {
    const n = (k * 30 - S.dist) / SEG; if (n < .5 || n > NS) continue;
    const p = at(n), side = (k % 2 ? 1 : -1) * (2 + (k * 7 % 5) * .6);
    spr.push({ n, f: () => k % 5 === 0 ? sprHouse(p.c + side * 1.4 * p.hw, p.y, p.s, k) : sprTree(p.c + side * p.hw, p.y, p.s) });
  }
  cars.forEach(c => { const n = (c.z - S.dist) / SEG; if (n > .5 && n < NS) { const p = at(n); spr.push({ n, f: () => sprCar(p.c + c.lane * p.hw, p.y, p.hw * .5, c.col, c.sp < 0) }); } });
  spr.sort((a, b) => b.n - a.n).forEach(s => s.f());

  // Ніч
  if (nf > 0) { g.fillStyle = 'rgba(4,8,30,' + (.7 * nf) + ')'; g.fillRect(0, 0, W, H); }
  if (S.lights) {
    g.globalCompositeOperation = 'lighter';
    const gr = g.createLinearGradient(0, H, 0, hor); gr.addColorStop(0, 'rgba(255,240,170,' + (.12 + .35 * nf) + ')'); gr.addColorStop(1, 'rgba(255,240,170,0)');
    g.fillStyle = gr; g.beginPath(); g.moveTo(W * .15, H); g.lineTo(W * .85, H); g.lineTo(W * .58, hor); g.lineTo(W * .42, hor); g.fill();
    g.globalCompositeOperation = 'source-over';
  }
  // Дощ і двірники
  if (raining()) {
    g.fillStyle = 'rgba(190,200,215,.18)'; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(200,215,255,.5)'; g.lineWidth = 1; g.beginPath();
    const cnt = S.wipers ? 30 : 110; for (let i = 0; i < cnt; i++) { const x = Math.random() * W, y = Math.random() * H; g.moveTo(x, y); g.lineTo(x - 4, y + 14); } g.stroke();
    if (!S.wipers) { g.fillStyle = 'rgba(255,255,255,.07)'; g.fillRect(0, 0, W, H); }
  }
  if (S.wipers) {
    const ang = Math.PI * (.15 + .7 * (.5 + .5 * Math.sin(S.time * 5)));
    g.strokeStyle = '#000'; g.lineWidth = 5; g.beginPath(); g.moveTo(W * .5, H); g.lineTo(W * .5 + Math.cos(Math.PI + ang) * H * .8, H + Math.sin(Math.PI + ang) * H * .8); g.stroke();
  }
}

function gauge(c, cx, cy, r, max, val, step, lab, red, unit) {
  c.fillStyle = '#0b0f14'; c.strokeStyle = '#666'; c.lineWidth = 3; c.beginPath(); c.arc(cx, cy, r, 0, 7); c.fill(); c.stroke();
  const a0 = .75 * Math.PI, a1 = 2.25 * Math.PI;
  for (let v = 0; v <= max; v += step) {
    const a = a0 + (a1 - a0) * v / max; c.strokeStyle = red && v >= red ? '#e33' : '#ddd'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(cx + Math.cos(a) * r * .82, cy + Math.sin(a) * r * .82); c.lineTo(cx + Math.cos(a) * r * .95, cy + Math.sin(a) * r * .95); c.stroke();
    c.fillStyle = '#ddd'; c.font = '11px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(lab ? v / 1000 : v, cx + Math.cos(a) * r * .68, cy + Math.sin(a) * r * .68);
  }
  c.fillStyle = '#9ab'; c.fillText(unit, cx, cy + r * .5);
  const a = a0 + (a1 - a0) * Math.min(val, max) / max;
  c.strokeStyle = '#f33'; c.lineWidth = 3; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(a) * r * .85, cy + Math.sin(a) * r * .85); c.stroke();
  c.fillStyle = '#ccc'; c.beginPath(); c.arc(cx, cy, 5, 0, 7); c.fill();
}
const gc = $('gauges').getContext('2d');
function drawDash() {
  gc.clearRect(0, 0, 420, 190);
  gauge(gc, 105, 105, 82, 200, Math.abs(S.speed), 20, false, 0, 'км/год');
  gauge(gc, 315, 105, 72, 8000, S.rpm, 1000, true, 6500, '×1000 об/хв');
  gc.font = '18px sans-serif'; gc.textAlign = 'center'; gc.textBaseline = 'middle';
  const bl = S.blink < .45;
  gc.fillStyle = (S.sL || S.haz) && bl ? '#3f3' : '#232'; gc.fillText('◀', 150, 18);
  gc.fillStyle = (S.sR || S.haz) && bl ? '#3f3' : '#232'; gc.fillText('▶', 270, 18);
  gc.fillStyle = S.lights ? '#3cf' : '#223'; gc.fillText('💡', 190, 18);
  gc.fillStyle = S.belt ? '#232' : '#f33'; gc.fillText('🔒', 230, 18);
  gc.fillStyle = S.hb ? '#f33' : '#322'; gc.fillText('(P)', 210, 175);
  gc.fillStyle = S.on ? '#232' : '#fa0'; gc.fillText('ENG', 150, 175);
  gc.fillStyle = '#fff'; gc.font = 'bold 34px sans-serif';
  const gt = S.mode === 'manual' ? (S.gear === -1 ? 'R' : S.gear === 0 ? 'N' : S.gear) : (S.gear === 'D' ? 'D' + (S.on && dir() ? gnum() : '') : S.gear);
  gc.fillText(gt, 210, 120);
  $('wheel').style.transform = 'rotate(' + (S.steer * 140) + 'deg)';
}
function mirror(id, off) {
  const c = $(id), x = c.getContext('2d'), w = c.width, h = c.height, hz = h * .45;
  x.fillStyle = '#9fd0f5'; x.fillRect(0, 0, w, hz); x.fillStyle = '#3a8c3c'; x.fillRect(0, hz, w, h - hz);
  x.fillStyle = '#4a4a4e'; x.beginPath(); x.moveTo(w / 2 + off - 4, hz); x.lineTo(w / 2 + off + 4, hz); x.lineTo(w * 1.1, h); x.lineTo(-w * .1, h); x.fill();
  x.strokeStyle = '#fff'; x.lineWidth = 2; const ph = (S.dist * 2) % 20;
  for (let i = 0; i < 6; i++) { const t0 = (i * 20 + ph) / 120, t1 = t0 + .08; if (t1 > 1) continue; x.beginPath(); x.moveTo(w / 2 + off + (t0 * (S.x * 0 + 0)), hz + (h - hz) * t0); x.lineTo(w / 2 + off, hz + (h - hz) * t1); x.stroke(); }
  cars.forEach(cr => {
    const dz = S.dist - cr.z; if (dz > 3 && dz < 90) {
      const s2 = Math.min(1, 8 / dz), px = w / 2 + off - (cr.lane - S.x) * s2 * w * .5, py = hz + (h - hz) * s2, cw = w * .28 * s2;
      x.fillStyle = cr.col; x.fillRect(px - cw / 2, py - cw * .6, cw, cw * .5);
      x.fillStyle = '#fff8c0'; x.fillRect(px - cw * .45, py - cw * .35, cw * .2, cw * .12); x.fillRect(px + cw * .25, py - cw * .35, cw * .2, cw * .12);
    }
  });
  const nf = night(); if (nf > 0) { x.fillStyle = 'rgba(4,8,30,' + .7 * nf + ')'; x.fillRect(0, 0, w, h); }
}

/* ---------- Цикл ---------- */
let last = 0;
function loop(t) {
  const dt = Math.min(.05, (t - last) / 1000 || 0); last = t;
  if (S.run && !S.paused) update(dt);
  if (W) {
    drawScene(); drawDash(); mirror('mC', 0); mirror('mL', -10); mirror('mR', 10);
    document.querySelectorAll('[data-a]').forEach(b => b.classList.toggle('on', !!stateOf(b.dataset.a)));
    markGears();
    if (AC) {
      const thr = keys.ArrowUp ? 1 : 0;
      osc.frequency.value = 30 + S.rpm / 22; gn.gain.value = S.on ? .02 + thr * .03 : 0; hgn.gain.value = S.horn ? .05 : 0;
    }
  }
  requestAnimationFrame(loop);
}
function start(mode) {
  S.mode = mode; S.gear = mode === 'manual' ? 0 : 'P'; S.run = true;
  $('menu').hidden = true; resize(); buildGears(); audioInit();
  toast(mode === 'manual' ? 'Пристебни ремінь (B), стисни Shift, натисни I для запуску' : 'Пристебни ремінь (B), натисни I, потім D, зніми ручник (Пробіл)');
}
$('startM').onclick = () => start('manual');
$('startA').onclick = () => start('auto');
resize(); requestAnimationFrame(loop);
