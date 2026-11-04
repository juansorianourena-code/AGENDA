'use strict';

const CALENDARS = [
  { id: 'uni',   name: 'Universidad', color: '#1f2a44' },
  { id: 'exam',  name: 'Exámenes',    color: '#111111' },
  { id: 'prac',  name: 'Prácticas',   color: '#5b6785' },
  { id: 'jmv',   name: 'JMV',         color: '#6b7040' },
  { id: 'cat',   name: 'Catequesis',  color: '#a3a77a' },
  { id: 'pers',  name: 'Personal',    color: '#b3a47f' },
];
const calById = Object.fromEntries(CALENDARS.map(c => [c.id, c]));

const H0 = 6, H1 = 24, HOUR = 48; // horas visibles y alto por hora (px)
const PREFS = 'agenda.prefs';
const LEGACY = 'agenda.v1';

const state = {
  view: 'week',
  date: new Date(),
  events: [],
  hidden: new Set(),
};

/* ---------- Preferencias locales (vista y calendarios ocultos) ---------- */
function load() {
  try {
    const d = JSON.parse(localStorage.getItem(PREFS) || '{}');
    state.hidden = new Set(d.hidden || []);
    if (d.view) state.view = d.view;
  } catch (e) { /* datos corruptos: empezar de cero */ }
}
function save() {
  localStorage.setItem(PREFS, JSON.stringify({ hidden: [...state.hidden], view: state.view }));
}

/* ---------- Nube (Supabase) ---------- */
const sb = window.supabase.createClient(window.AGENDA_CONFIG.SUPABASE_URL, window.AGENDA_CONFIG.SUPABASE_KEY);
let uid = null;
let queue = [];       // cambios pendientes de subir
let flushing = false;

const cacheKey = () => `agenda.cache.${uid}`;
const queueKey = () => `agenda.queue.${uid}`;
const toRow = e => ({
  id: e.id, title: e.title, cal: e.cal, date: e.date,
  start_time: e.start || null, end_time: e.end || null, notes: e.notes || '',
  updated_at: new Date().toISOString(),
});
const fromRow = r => ({
  id: r.id, title: r.title, cal: r.cal, date: r.date,
  start: (r.start_time || '').slice(0, 5), end: (r.end_time || '').slice(0, 5), notes: r.notes || '',
});
function persistLocal() {
  if (!uid) return;
  localStorage.setItem(cacheKey(), JSON.stringify(state.events));
  localStorage.setItem(queueKey(), JSON.stringify(queue));
}
function setStatus(t) { document.getElementById('status').textContent = t; }

async function flush() {
  if (flushing || !uid) return;
  flushing = true;
  try {
    while (queue.length) {
      const op = queue[0];
      const { error } = op.op === 'upsert'
        ? await sb.from('events').upsert(op.row)
        : await sb.from('events').delete().eq('id', op.id);
      if (error) throw error;
      queue.shift(); persistLocal();
    }
    setStatus('Guardado en la nube ✓');
  } catch (e) {
    const offline = !navigator.onLine || /fetch|network/i.test(String(e && e.message));
    setStatus(offline
      ? 'Sin internet: se subirá solo al volver la conexión'
      : 'No se pudo guardar en la nube: ' + (e && e.message ? e.message : 'error desconocido'));
  } finally { flushing = false; }
}

async function pull() {
  if (!uid) return;
  await flush();
  if (queue.length) return; // no pisar cambios sin subir
  const { data, error } = await sb.from('events').select('*');
  if (error) { setStatus(navigator.onLine ? 'No se pudo leer de la nube: ' + error.message : 'Sin internet'); return; }
  state.events = data.map(fromRow);
  persistLocal(); render();
  setStatus('Actualizado ✓');
}

function pushOp(op) { queue.push(op); persistLocal(); flush(); }

/* ---------- Acceso ---------- */
const authEl = document.getElementById('auth');
const authMsg = document.getElementById('authMsg');
const authForm = document.getElementById('authForm');

async function startSession(session) {
  uid = session.user.id;
  document.getElementById('who').textContent = session.user.email;
  authEl.hidden = true;
  try { state.events = JSON.parse(localStorage.getItem(cacheKey()) || '[]'); } catch (e) { state.events = []; }
  try { queue = JSON.parse(localStorage.getItem(queueKey()) || '[]'); } catch (e) { queue = []; }
  render();
  // Migrar eventos guardados solo en el dispositivo (versión anterior)
  try {
    const old = JSON.parse(localStorage.getItem(LEGACY) || 'null');
    if (old && old.events && old.events.length) {
      old.events.forEach(e => { state.events.push(e); queue.push({ op: 'upsert', row: toRow(e) }); });
      persistLocal();
    }
    localStorage.removeItem(LEGACY);
  } catch (e) { /* ignorar */ }
  await pull();
  sb.channel('events-sync')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, () => pull())
    .subscribe();
}

function endSession() {
  uid = null; state.events = []; queue = [];
  sb.removeAllChannels();
  document.getElementById('who').textContent = '';
  setStatus('');
  render();
  authEl.hidden = false;
}

authForm.addEventListener('submit', async ev => {
  ev.preventDefault();
  authMsg.textContent = 'Entrando…';
  const { error } = await sb.auth.signInWithPassword({ email: authForm.email.value.trim(), password: authForm.password.value });
  authMsg.textContent = error ? 'Correo o contraseña incorrectos.' : '';
});
document.getElementById('signupBtn').onclick = async () => {
  if (!authForm.reportValidity()) return;
  authMsg.textContent = 'Creando cuenta…';
  const { data, error } = await sb.auth.signUp({ email: authForm.email.value.trim(), password: authForm.password.value });
  if (error) authMsg.textContent = error.message;
  else if (!data.session) authMsg.textContent = 'Cuenta creada. Revisa tu correo y confirma el enlace; luego pulsa Entrar.';
};
document.getElementById('signout').onclick = async () => {
  await flush();
  if (queue.length && !confirm('Hay cambios sin subir a la nube. Si sales ahora se perderán. ¿Salir igualmente?')) return;
  const id = uid;
  await sb.auth.signOut();
  localStorage.removeItem(`agenda.cache.${id}`);
  localStorage.removeItem(`agenda.queue.${id}`);
};

sb.auth.onAuthStateChange((event, session) => {
  if (session && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session.user.id !== uid) {
    setTimeout(() => startSession(session), 0);
  } else if (event === 'SIGNED_OUT') endSession();
  else if (event === 'INITIAL_SESSION' && !session) authEl.hidden = false;
});
document.addEventListener('visibilitychange', () => { if (!document.hidden) pull(); });
window.addEventListener('online', () => pull());
setInterval(() => pull(), 60 * 1000);

/* ---------- Utilidades de fecha ---------- */
const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const mondayOf = d => addDays(d, -((d.getDay() + 6) % 7));
const sameDay = (a, b) => iso(a) === iso(b);
const mins = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (d, o) => d.toLocaleDateString('es-ES', o);
const todayISO = () => iso(new Date());

function eventsOn(dateISO) {
  return state.events
    .filter(e => e.date === dateISO && !state.hidden.has(e.cal))
    .sort((a, b) => (a.start || '').localeCompare(b.start || ''));
}

/* ---------- Render ---------- */
const $ = id => document.getElementById(id);

function render() {
  renderHeader();
  renderLegend();
  const v = $('view');
  if (state.view === 'day') v.innerHTML = timeGrid([state.date]);
  else if (state.view === 'week') {
    const m = mondayOf(state.date);
    v.innerHTML = timeGrid([...Array(7)].map((_, i) => addDays(m, i)));
  } else if (state.view === 'month') v.innerHTML = monthView();
  else v.innerHTML = yearView();
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.view === state.view));
  if (state.view === 'day' || state.view === 'week') {
    const body = v.querySelector('.tg-body');
    if (body) body.scrollTop = Math.max(0, (new Date().getHours() - 1 - H0) * HOUR);
  }
}

function renderHeader() {
  const d = state.date;
  let title, sub = '';
  if (state.view === 'day') { title = fmt(d, { weekday: 'long', day: 'numeric', month: 'long' }); sub = String(d.getFullYear()); }
  else if (state.view === 'week') {
    const m = mondayOf(d), e = addDays(m, 6);
    title = `${m.getDate()} – ${e.getDate()} ${fmt(e, { month: 'long' })}`; sub = String(e.getFullYear());
  } else if (state.view === 'month') { title = fmt(d, { month: 'long' }); sub = String(d.getFullYear()); }
  else title = String(d.getFullYear());
  $('title').textContent = title;
  $('sub').textContent = sub || fmt(new Date(), { weekday: 'long', day: 'numeric', month: 'long' });
}

function renderLegend() {
  $('legend').innerHTML = CALENDARS.map(c =>
    `<button class="chip ${state.hidden.has(c.id) ? 'off' : ''}" data-cal="${c.id}" style="--c:${c.color}"><i></i>${c.name}</button>`
  ).join('');
}

function timeGrid(days) {
  const n = H1 - H0;
  const cols = days.length;
  const head = days.map(d =>
    `<div class="${sameDay(d, new Date()) ? 'today' : ''}">${fmt(d, { weekday: 'short' })}<b>${d.getDate()}</b></div>`).join('');
  const allday = days.map(d =>
    `<div>${eventsOn(iso(d)).filter(e => !e.start).map(e =>
      `<button class="ev chipev" data-id="${e.id}" style="--c:${calById[e.cal].color}">${esc(e.title)}</button>`).join('')}</div>`).join('');
  const hours = [...Array(n)].map((_, i) => `<div>${pad(H0 + i)}:00</div>`).join('');
  const colsHtml = days.map(d => {
    const ds = iso(d);
    const evs = eventsOn(ds).filter(e => e.start).map(e => {
      const s = Math.max(mins(e.start), H0 * 60);
      const end = Math.min(e.end ? mins(e.end) : mins(e.start) + 60, H1 * 60);
      const top = (s - H0 * 60) / 60 * HOUR;
      const h = Math.max((end - s) / 60 * HOUR, 22);
      return `<button class="ev" data-id="${e.id}" style="--c:${calById[e.cal].color};top:${top}px;height:${h}px">${esc(e.title)}<small>${e.start}${e.end ? '–' + e.end : ''}</small></button>`;
    }).join('');
    let now = '';
    if (ds === todayISO()) {
      const t = new Date(); const m = t.getHours() * 60 + t.getMinutes();
      if (m >= H0 * 60 && m <= H1 * 60) now = `<div class="now" style="top:${(m - H0 * 60) / 60 * HOUR}px"></div>`;
    }
    return `<div class="tg-col ${ds === todayISO() ? 'today' : ''}" data-date="${ds}">${evs}${now}</div>`;
  }).join('');
  return `<div style="--cols:${cols};--n:${n}">
    <div class="tg-head"><div></div>${head}</div>
    <div class="tg-allday"><div></div>${allday}</div>
    <div class="tg-body"><div class="tg-hours">${hours}</div>${colsHtml}</div>
  </div>`;
}

function monthView() {
  const d = state.date;
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  const start = mondayOf(first);
  const names = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
  let cells = '';
  for (let i = 0; i < 42; i++) {
    const day = addDays(start, i);
    if (i >= 35 && day.getMonth() !== d.getMonth()) break;
    const evs = eventsOn(iso(day));
    const shown = evs.slice(0, 3).map(e =>
      `<span class="m-ev" style="--c:${calById[e.cal].color}">${e.start ? e.start + ' ' : ''}${esc(e.title)}</span>`).join('');
    const more = evs.length > 3 ? `<div class="m-more">+${evs.length - 3} más</div>` : '';
    cells += `<button class="m-cell ${day.getMonth() !== d.getMonth() ? 'out' : ''} ${sameDay(day, new Date()) ? 'today' : ''}" data-day="${iso(day)}"><span class="n">${day.getDate()}</span>${shown}${more}</button>`;
  }
  return `<div class="m-head">${names.map(n => `<div>${n}</div>`).join('')}</div><div class="m-grid">${cells}</div>`;
}

function yearView() {
  const y = state.date.getFullYear();
  const months = [...Array(12)].map((_, m) => {
    const first = new Date(y, m, 1);
    const lead = (first.getDay() + 6) % 7;
    const count = new Date(y, m + 1, 0).getDate();
    let cells = ['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(n => `<span class="h">${n}</span>`).join('');
    cells += '<span></span>'.repeat(lead);
    for (let day = 1; day <= count; day++) {
      const ds = `${y}-${pad(m + 1)}-${pad(day)}`;
      const evs = eventsOn(ds);
      const c = evs.length ? calById[evs[0].cal].color : '';
      cells += `<span data-day="${ds}" class="${ds === todayISO() ? 't' : ''} ${evs.length ? 'has' : ''}" style="--c:${c}">${day}</span>`;
    }
    return `<div class="y-month"><h3 data-month="${y}-${pad(m + 1)}-01">${fmt(first, { month: 'long' })}</h3><div class="y-days">${cells}</div></div>`;
  }).join('');
  return `<div class="y-grid">${months}</div>`;
}

/* ---------- Apple Calendar Feed Dialog ---------- */
const feedDlg = $('feedDlg');
const feedUrlInput = $('feedUrl');
const feedSubLink = $('feedSub');

async function getOrCreateFeedToken(forceNew = false) {
  if (!uid) return null;
  if (!forceNew) {
    const { data } = await sb.from('feed_tokens').select('token').single();
    if (data && data.token) return data.token;
  }
  // Generar nuevo token
  const newToken = Array.from(crypto.getRandomValues(new Uint8Array(24)))
    .map(b => b.toString(16).padStart(2, '0')).join('');
  const { error } = await sb.from('feed_tokens').upsert({ user_id: uid, token: newToken });
  if (error) {
    alert('Error al generar enlace de Apple Calendar: ' + error.message);
    return null;
  }
  return newToken;
}

async function openFeedDialog() {
  feedUrlInput.value = 'Cargando enlace...';
  feedDlg.showModal();
  const token = await getOrCreateFeedToken(false);
  if (!token) return;
  const httpUrl = `${window.location.origin}/calendar/${token}.ics`;
  const webcalUrl = httpUrl.replace(/^https?:\/\//i, 'webcal://');
  feedUrlInput.value = httpUrl;
  feedSubLink.href = webcalUrl;
}

$('feedBtn').onclick = () => openFeedDialog();
$('feedClose').onclick = () => feedDlg.close();
$('feedCopy').onclick = async () => {
  if (!feedUrlInput.value || feedUrlInput.value.startsWith('Cargando')) return;
  await navigator.clipboard.writeText(feedUrlInput.value);
  const old = $('feedCopy').textContent;
  $('feedCopy').textContent = '¡Copiado!';
  setTimeout(() => $('feedCopy').textContent = old, 2000);
};
$('feedReset').onclick = async () => {
  if (!confirm('Si generas un enlace nuevo, el calendario que ya tenías sincronizado en Apple dejará de recibir cambios hasta que pongas el nuevo. ¿Continuar?')) return;
  feedUrlInput.value = 'Generando nuevo enlace...';
  const token = await getOrCreateFeedToken(true);
  if (!token) return;
  const httpUrl = `${window.location.origin}/calendar/${token}.ics`;
  const webcalUrl = httpUrl.replace(/^https?:\/\//i, 'webcal://');
  feedUrlInput.value = httpUrl;
  feedSubLink.href = webcalUrl;
};
function shift(dir) {
  const d = new Date(state.date);
  if (state.view === 'day') d.setDate(d.getDate() + dir);
  else if (state.view === 'week') d.setDate(d.getDate() + 7 * dir);
  else if (state.view === 'month') { d.setDate(1); d.setMonth(d.getMonth() + dir); }
  else d.setFullYear(d.getFullYear() + dir);
  state.date = d; render();
}
function go(view, dateISO) { state.view = view; state.date = parse(dateISO); save(); render(); }

/* ---------- Diálogo de evento ---------- */
const dlg = $('dlg'), form = $('form');
let editingId = null;

function openDialog(ev, defaults = {}) {
  editingId = ev ? ev.id : null;
  form.cal.innerHTML = CALENDARS.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  const v = ev || { title: '', cal: 'uni', date: iso(state.date), start: '', end: '', notes: '', ...defaults };
  form.title.value = v.title; form.cal.value = v.cal; form.date.value = v.date;
  form.start.value = v.start || ''; form.end.value = v.end || ''; form.notes.value = v.notes || '';
  $('dlgTitle').textContent = ev ? 'Editar evento' : 'Nuevo evento';
  $('del').style.display = ev ? '' : 'none';
  dlg.showModal();
  if (!ev) form.title.focus();
}

form.addEventListener('submit', () => {
  const data = {
    title: form.title.value.trim(), cal: form.cal.value, date: form.date.value,
    start: form.start.value, end: form.end.value, notes: form.notes.value.trim(),
  };
  if (!data.title || !data.date) return;
  if (data.start && data.end && mins(data.end) <= mins(data.start)) data.end = '';
  let saved;
  if (editingId) { saved = state.events.find(e => e.id === editingId); Object.assign(saved, data); }
  else { saved = { id: crypto.randomUUID(), ...data }; state.events.push(saved); }
  pushOp({ op: 'upsert', row: toRow(saved) });
  render();
});
$('cancel').onclick = () => dlg.close();
$('del').onclick = () => {
  const id = editingId;
  state.events = state.events.filter(e => e.id !== id);
  pushOp({ op: 'delete', id });
  dlg.close(); render();
};

/* ---------- Eventos de la interfaz ---------- */
$('addBtn').onclick = () => openDialog(null);
$('prev').onclick = () => shift(-1);
$('next').onclick = () => shift(1);
$('today').onclick = () => { state.date = new Date(); render(); };
$('tabs').onclick = e => {
  const b = e.target.closest('button'); if (!b) return;
  state.view = b.dataset.view; save(); render();
};
$('legend').onclick = e => {
  const b = e.target.closest('.chip'); if (!b) return;
  const id = b.dataset.cal;
  state.hidden.has(id) ? state.hidden.delete(id) : state.hidden.add(id);
  save(); render();
};
$('view').onclick = e => {
  const evBtn = e.target.closest('[data-id]');
  if (evBtn) { openDialog(state.events.find(x => x.id === evBtn.dataset.id)); return; }
  const col = e.target.closest('.tg-col');
  if (col) {
    const y = e.clientY - col.getBoundingClientRect().top;
    const h = Math.min(H1 - 1, H0 + Math.floor(y / HOUR));
    openDialog(null, { date: col.dataset.date, start: `${pad(h)}:00`, end: `${pad(h + 1)}:00` });
    return;
  }
  const month = e.target.closest('[data-month]');
  if (month) { go('month', month.dataset.month); return; }
  const cell = e.target.closest('[data-day]');
  if (cell) go(state.view === 'year' ? 'day' : 'day', cell.dataset.day);
};

load();
render();
setInterval(() => { if (state.view === 'day' || state.view === 'week') render(); }, 5 * 60 * 1000);
