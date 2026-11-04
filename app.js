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
const getCal = id => calById[id] || calById['uni'] || { id: 'uni', name: 'Universidad', color: '#1f2a44' };

// Paleta armónica por asignatura (personalizable por el usuario en Ajustes)
const DEFAULT_SUBJECT_COLORS = {
  'EDAFOLOGÍA Y CLIMATOLOGÍA': '#6b7040',                  // Verde oliva natural
  'MOTORES': '#1f2a44',                                    // Azul marino elegante
  'GENÉTICA Y APLICACIONES A LA INGENIERÍA': '#8c5e3c',    // Tostado / Cuero
  'FITOTECNIA GENERAL': '#3b5a45',                         // Verde bosque profundo
  'FITOTECNIA': '#3b5a45',
  'CÁLCULO DE ESTRUCTURAS Y ELECTRIFICACIÓN': '#4b5563',   // Pizarra oscuro
  'CÁLCULO DE ESTRUCTURAS': '#4b5563',
  'CIENCIA Y TECNOLOGÍA DEL MEDIO AMBIENTE': '#2c4c5e',    // Azul petróleo
  'FÍSICA I': '#2a3b5c',
  'FÍSICA II': '#2a3b5c',
  'QUÍMICA': '#634b66',
  'ÁLGEBRA': '#4a4036',
  'BIOLOGÍA I': '#4a6042',
  'BIOLOGÍA II': '#4a6042',
  'DEFAULT': '#1f2a44'
};

const SHORT_SUBJECT_NAMES = {
  'EDAFOLOGÍA Y CLIMATOLOGÍA': 'Edafología',
  'MOTORES': 'Motores',
  'GENÉTICA Y APLICACIONES A LA INGENIERÍA': 'Genética',
  'FITOTECNIA GENERAL': 'Fitotecnia',
  'FITOTECNIA': 'Fitotecnia',
  'CÁLCULO DE ESTRUCTURAS Y ELECTRIFICACIÓN': 'Estructuras',
  'CÁLCULO DE ESTRUCTURAS': 'Estructuras',
  'CIENCIA Y TECNOLOGÍA DEL MEDIO AMBIENTE': 'Medio Ambiente'
};

function getSubjectColor(subjName) {
  const norm = (subjName || '').toUpperCase().trim();
  const custom = (state && state.prefs && state.prefs.customColors) || {};
  for (const [k, c] of Object.entries(custom)) {
    if (norm.includes(k)) return c;
  }
  for (const [k, c] of Object.entries(DEFAULT_SUBJECT_COLORS)) {
    if (norm.includes(k)) return c;
  }
  return '#1f2a44';
}

function getEventColor(e) {
  if (e.cal === 'exam') return '#111111';
  if (e.cal === 'jmv') return '#6b7040';
  if (e.cal === 'cat') return '#a3a77a';
  if (e.cal === 'pers') return '#b3a47f';
  return getSubjectColor(e.subject || e.title || '');
}

function formatEventTitle(e, forceShort = false) {
  const raw = (e.title || '').trim();
  const useShort = forceShort || (state.prefs && state.prefs.shortNames !== 'full');
  if (!useShort) return raw;

  const isPrac = /^pr[aá]ctica:/i.test(raw) || e.cal === 'prac';
  const isExam = /^examen:/i.test(raw) || e.cal === 'exam';
  const grpMatch = raw.match(/\((G[123])\)/i);
  const grpStr = grpMatch ? ` (${grpMatch[1].toUpperCase()})` : '';

  const upper = raw.toUpperCase();
  for (const [full, short] of Object.entries(SHORT_SUBJECT_NAMES)) {
    if (upper.includes(full)) {
      if (isExam) return `📝 Examen ${short}`;
      if (isPrac) return `Prác. ${short}${grpStr}`;
      return short;
    }
  }
  return raw;
}

let H0 = 8, H1 = 21, HOUR = 54;
const PREFS = 'agenda.prefs.v2';
const LEGACY = 'agenda.v1';

const DEFAULT_SUBJECT_GROUPS = {
  'EDAFOLOGÍA Y CLIMATOLOGÍA': ['G2'],
  'MOTORES': ['G3'],
  'GENÉTICA Y APLICACIONES A LA INGENIERÍA': ['G3'],
  'FITOTECNIA GENERAL': ['G3'],
  'CÁLCULO DE ESTRUCTURAS Y ELECTRIFICACIÓN': ['G2', 'G3'],
  'CIENCIA Y TECNOLOGÍA DEL MEDIO AMBIENTE': ['G3']
};

const state = {
  view: 'agenda',
  date: new Date(),
  events: [],
  hidden: new Set(),
  prefs: {
    weekMode: '5days',
    shortNames: 'short',
    hourHeight: 54,
    startHour: 8,
    endHour: 21,
    showCountdown: 'yes',
    customColors: {},
    subjectGroups: JSON.parse(JSON.stringify(DEFAULT_SUBJECT_GROUPS)),
    subjectEnabled: {
      'EDAFOLOGÍA Y CLIMATOLOGÍA': true,
      'MOTORES': true,
      'GENÉTICA Y APLICACIONES A LA INGENIERÍA': true,
      'FITOTECNIA GENERAL': true,
      'CÁLCULO DE ESTRUCTURAS Y ELECTRIFICACIÓN': true,
      'CIENCIA Y TECNOLOGÍA DEL MEDIO AMBIENTE': true
    },
    subjectData: {},
    tasks: []
  }
};

function syncGridVars() {
  H0 = parseInt(state.prefs.startHour || 8, 10);
  H1 = parseInt(state.prefs.endHour || 21, 10);
  HOUR = parseInt(state.prefs.hourHeight || 54, 10);
  document.documentElement.style.setProperty('--hour', `${HOUR}px`);
}

/* ---------- Preferencias locales ---------- */
function load() {
  try {
    const d = JSON.parse(localStorage.getItem(PREFS) || localStorage.getItem('agenda.prefs') || '{}');
    state.hidden = new Set(d.hidden || []);
    if (d.view) state.view = d.view;
    if (d.prefs) {
      state.prefs = Object.assign({}, state.prefs, d.prefs);
      state.prefs.subjectGroups = Object.assign({}, DEFAULT_SUBJECT_GROUPS, d.prefs.subjectGroups || {});
      state.prefs.subjectEnabled = Object.assign({}, state.prefs.subjectEnabled, d.prefs.subjectEnabled || {});
    }
  } catch (e) { /* empezar limpio */ }
  syncGridVars();
}
function save() {
  syncGridVars();
  localStorage.setItem(PREFS, JSON.stringify({
    hidden: [...state.hidden],
    view: state.view,
    prefs: state.prefs
  }));
}

/* ---------- Nube (Supabase) ---------- */
const sb = window.supabase.createClient(window.AGENDA_CONFIG.SUPABASE_URL, window.AGENDA_CONFIG.SUPABASE_KEY);
let uid = null;
let queue = [];
let flushing = false;
let batchInProgress = false;

const cacheKey = () => `agenda.cache.${uid || 'local'}`;
const queueKey = () => `agenda.queue.${uid || 'local'}`;
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
  try {
    localStorage.setItem(cacheKey(), JSON.stringify(state.events));
    localStorage.setItem(queueKey(), JSON.stringify(queue));
  } catch (e) {}
}
function setStatus(t) {
  const el = document.getElementById('status');
  if (el) el.textContent = t;
}

async function flush() {
  if (flushing || batchInProgress || !uid) return;
  flushing = true;
  try {
    while (queue.length) {
      // Agrupar upserts consecutivos para subirlos de golpe en 1 petición
      if (queue[0].op === 'upsert') {
        const batchRows = [];
        while (queue.length && queue[0].op === 'upsert' && batchRows.length < 250) {
          batchRows.push(queue.shift().row);
        }
        const { error } = await sb.from('events').upsert(batchRows);
        if (error) throw error;
        persistLocal();
      } else {
        const delIds = [];
        while (queue.length && queue[0].op === 'delete' && delIds.length < 250) {
          delIds.push(queue.shift().id);
        }
        const { error } = await sb.from('events').delete().in('id', delIds);
        if (error) throw error;
        persistLocal();
      }
    }
    setStatus('Guardado en la nube ✓');
  } catch (e) {
    const offline = !navigator.onLine || /fetch|network/i.test(String(e && e.message));
    setStatus(offline
      ? 'Sin internet: guardado en tu iPhone'
      : 'Guardado local ✓');
  } finally { flushing = false; }
}

async function batchSyncEvents(deleteIds = [], newEvents = []) {
  batchInProgress = true;
  setStatus('Guardando horario completo…');
  try {
    if (deleteIds.length) {
      const delSet = new Set(deleteIds);
      state.events = state.events.filter(e => !delSet.has(e.id));
      queue = queue.filter(q => !(q.row && delSet.has(q.row.id)) && !(q.id && delSet.has(q.id)));
    }
    if (newEvents.length) {
      state.events.push(...newEvents);
    }
    persistLocal();
    render();

    if (uid && navigator.onLine) {
      for (let i = 0; i < deleteIds.length; i += 200) {
        const chunk = deleteIds.slice(i, i + 200);
        await sb.from('events').delete().in('id', chunk);
      }
      const rows = newEvents.map(toRow);
      for (let i = 0; i < rows.length; i += 200) {
        const chunk = rows.slice(i, i + 200);
        await sb.from('events').upsert(chunk);
      }
      setStatus('Horario guardado en la nube ✓');
    } else {
      deleteIds.forEach(id => queue.push({ op: 'delete', id }));
      newEvents.forEach(ev => queue.push({ op: 'upsert', row: toRow(ev) }));
      persistLocal();
      setStatus('Guardado en el dispositivo ✓');
    }
  } catch (err) {
    console.error(err);
    setStatus('Guardado en el dispositivo ✓');
  } finally {
    batchInProgress = false;
  }
}

async function pull() {
  if (!uid || batchInProgress || flushing) return;
  await flush();
  if (queue.length || batchInProgress) return;
  const { data, error } = await sb.from('events').select('*');
  if (error) { setStatus(navigator.onLine ? 'Modo local activo' : 'Sin internet'); return; }
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

function renderCountdownBar() {
  const bar = $('countdownBar');
  if (!bar) return;
  if (state.prefs && state.prefs.showCountdown === 'no') {
    bar.innerHTML = '';
    return;
  }
  const todayStr = todayISO();
  const todayDate = parse(todayStr);

  const upcomingExams = state.events
    .filter(e => e.date >= todayStr && (e.cal === 'exam' || /examen|prueba|evaluaci[oó]n/i.test(e.title)))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.start || '').localeCompare(b.start || ''));

  const pendingTasks = ((state.prefs && state.prefs.tasks) || [])
    .filter(t => !t.done && t.due && t.due >= todayStr)
    .map(t => ({ id: t.id, title: `📌 ${t.title}`, date: t.due, cal: t.cal || 'pers', isTask: true }));

  const combined = [...upcomingExams, ...pendingTasks]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 8);

  if (!combined.length) {
    bar.innerHTML = '';
    return;
  }

  bar.innerHTML = combined.map(item => {
    const dObj = parse(item.date);
    const diff = Math.round((dObj - todayDate) / (1000 * 60 * 60 * 24));
    const dayTxt = diff === 0 ? '¡HOY!' : (diff === 1 ? 'Mañana' : `En ${diff} días`);
    const urgent = diff <= 3 ? 'urgent' : '';
    const color = getEventColor(item);
    const shortTitle = formatEventTitle(item, true);
    return `
      <button type="button" class="cd-pill ${urgent}" data-cd-date="${item.date}" data-cd-task="${item.isTask ? '1' : ''}" style="--c:${color}">
        <b>${esc(shortTitle)}</b>
        <span class="cd-days">${dayTxt}</span>
      </button>
    `;
  }).join('');
}

function render() {
  syncGridVars();
  renderHeader();
  renderLegend();
  renderCountdownBar();
  const v = $('view');
  const dateNav = $('dateNav');
  if (dateNav) dateNav.style.display = (state.view === 'subjects' || state.view === 'tasks') ? 'none' : '';

  if (state.view === 'focus') v.innerHTML = focusView();
  else if (state.view === 'agenda') v.innerHTML = agendaView();
  else if (state.view === 'day') v.innerHTML = timeGrid([state.date], false);
  else if (state.view === 'week') {
    const mode = (state.prefs && state.prefs.weekMode) || '5days';
    const m = mondayOf(state.date);
    if (mode === 'cards') {
      v.innerHTML = weekControlsHtml('cards') + weekCardsView([...Array(7)].map((_, i) => addDays(m, i)));
    } else if (mode === '3days') {
      v.innerHTML = timeGrid([state.date, addDays(state.date, 1), addDays(state.date, 2)], true);
    } else if (mode === '7days') {
      v.innerHTML = timeGrid([...Array(7)].map((_, i) => addDays(m, i)), true);
    } else {
      v.innerHTML = timeGrid([...Array(5)].map((_, i) => addDays(m, i)), true);
    }
  } else if (state.view === 'subjects') v.innerHTML = subjectsView();
  else if (state.view === 'tasks') v.innerHTML = tasksView();
  else if (state.view === 'month') v.innerHTML = monthView();
  else v.innerHTML = yearView();

  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.view === state.view));
  if (state.view === 'day' || state.view === 'week') {
    const body = v.querySelector('.tg-body');
    if (body) body.scrollTop = Math.max(0, (9 - H0) * HOUR);
  }
}

function renderHeader() {
  const d = state.date;
  let title, sub = '';
  if (state.view === 'focus') {
    title = `Hoy en calma`;
    sub = fmt(new Date(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  } else if (state.view === 'agenda') {
    const m = mondayOf(d), e = addDays(m, 6);
    title = `Agenda semanal`;
    sub = `${m.getDate()} ${fmt(m, { month: 'short' })} – ${e.getDate()} ${fmt(e, { month: 'short', year: 'numeric' })}`;
  } else if (state.view === 'day') {
    title = fmt(d, { weekday: 'long', day: 'numeric', month: 'long' }); sub = String(d.getFullYear());
  } else if (state.view === 'week') {
    const mode = (state.prefs && state.prefs.weekMode) || '5days';
    if (mode === '3days') {
      const e = addDays(d, 2);
      title = `${d.getDate()} – ${e.getDate()} ${fmt(e, { month: 'short' })}`;
      sub = `Vista 3 días • ${e.getFullYear()}`;
    } else {
      const m = mondayOf(d), e = addDays(m, mode === '5days' ? 4 : 6);
      title = `${m.getDate()} – ${e.getDate()} ${fmt(e, { month: 'long' })}`;
      sub = String(e.getFullYear());
    }
  } else if (state.view === 'subjects') {
    title = `Mis Asignaturas`;
    sub = `Notas, Grupos de Prácticas y Asistencia`;
  } else if (state.view === 'tasks') {
    title = `Tareas y Entregas`;
    sub = `Cosas pendientes con check y prioridad`;
  } else if (state.view === 'month') {
    title = fmt(d, { month: 'long' }); sub = String(d.getFullYear());
  } else {
    title = String(d.getFullYear());
  }
  $('title').textContent = title;
  $('sub').textContent = sub || fmt(new Date(), { weekday: 'long', day: 'numeric', month: 'long' });
}

function renderLegend() {
  $('legend').innerHTML = CALENDARS.map(c =>
    `<button class="chip ${state.hidden.has(c.id) ? 'off' : ''}" data-cal="${c.id}" style="--c:${c.color}"><i></i>${c.name}</button>`
  ).join('');
}

function weekControlsHtml(activeMode) {
  return `
    <div class="week-controls-bar">
      <div class="week-mode-pills">
        <button type="button" class="wm-pill ${activeMode === '5days' ? 'active' : ''}" data-wmode="5days">L–V (5 días)</button>
        <button type="button" class="wm-pill ${activeMode === '3days' ? 'active' : ''}" data-wmode="3days">3 Días</button>
        <button type="button" class="wm-pill ${activeMode === 'cards' ? 'active' : ''}" data-wmode="cards">Tarjetas</button>
        <button type="button" class="wm-pill ${activeMode === '7days' ? 'active' : ''}" data-wmode="7days">L–D</button>
      </div>
      <button type="button" class="wm-pill" data-open-settings="1">⚙️ Ajustar vista / grupos</button>
    </div>
  `;
}

function weekCardsView(days) {
  let html = '<div class="week-cards-grid">';
  days.forEach(d => {
    const ds = iso(d);
    const evs = eventsOn(ds);
    const isToday = sameDay(d, new Date());
    html += `
      <div class="wc-day ${isToday ? 'today' : ''}">
        <div class="wc-head">
          <span>${fmt(d, { weekday: 'long', day: 'numeric', month: 'short' })}</span>
          ${isToday ? '<span class="agenda-cal-badge" style="--c:var(--navy)">HOY</span>' : ''}
        </div>
        <div class="wc-list">
          ${evs.length ? evs.map(e => `
            <button type="button" class="wc-ev" data-id="${e.id}" style="--c:${getEventColor(e)}">
              <div>
                <div style="font-weight:700;">${esc(formatEventTitle(e, false))}</div>
                <small style="color:var(--muted);">${e.start ? e.start + (e.end ? '–' + e.end : '') : 'Todo el día'}</small>
              </div>
              <span class="agenda-edit-pill">✏️</span>
            </button>
          `).join('') : '<div style="padding:8px;font-size:12px;color:var(--muted);">Sin clases ni eventos</div>'}
        </div>
      </div>
    `;
  });
  html += '</div>';
  return html;
}

function timeGrid(days, isWeekView = false) {
  const n = H1 - H0;
  const cols = days.length;
  const head = days.map(d =>
    `<div class="${sameDay(d, new Date()) ? 'today' : ''}">${fmt(d, { weekday: 'short' }).replace('.', '')}<b>${d.getDate()}</b></div>`).join('');
  const allday = days.map(d =>
    `<div>${eventsOn(iso(d)).filter(e => !e.start).map(e =>
      `<button class="ev chipev" data-id="${e.id}" style="--c:${getCal(e.cal).color}">${esc(formatEventTitle(e, true))}</button>`).join('')}</div>`).join('');
  const hours = [...Array(n)].map((_, i) => `<div>${pad(H0 + i)}:00</div>`).join('');

  function layoutDayEvents(evs) {
    if (!evs.length) return [];
    const timed = evs.filter(e => e.start).sort((a, b) => mins(a.start) - mins(b.start) || (b.end ? mins(b.end) : 0) - (a.end ? mins(a.end) : 0));
    if (!timed.length) return [];

    const clusters = [];
    let curCluster = [timed[0]];
    let maxEnd = timed[0].end ? mins(timed[0].end) : mins(timed[0].start) + 60;

    for (let i = 1; i < timed.length; i++) {
      const e = timed[i];
      const startMin = mins(e.start);
      const endMin = e.end ? mins(e.end) : startMin + 60;
      if (startMin < maxEnd) {
        curCluster.push(e);
        maxEnd = Math.max(maxEnd, endMin);
      } else {
        clusters.push(curCluster);
        curCluster = [e];
        maxEnd = endMin;
      }
    }
    clusters.push(curCluster);

    const layouted = [];
    clusters.forEach(cluster => {
      const columns = [];
      cluster.forEach(e => {
        const startMin = mins(e.start);
        const endMin = e.end ? mins(e.end) : startMin + 60;
        let placed = false;
        for (let colIdx = 0; colIdx < columns.length; colIdx++) {
          if (columns[colIdx] <= startMin) {
            columns[colIdx] = endMin;
            e._col = colIdx;
            placed = true;
            break;
          }
        }
        if (!placed) {
          e._col = columns.length;
          columns.push(endMin);
        }
      });
      const totalCols = columns.length;
      cluster.forEach(e => {
        e._totalCols = totalCols;
        layouted.push(e);
      });
    });

    return layouted;
  }

  const colsHtml = days.map(d => {
    const ds = iso(d);
    const dayEvs = eventsOn(ds);
    const layouted = layoutDayEvents(dayEvs);

    const evsHtml = layouted.map(e => {
      const s = Math.max(mins(e.start), H0 * 60);
      const end = Math.min(e.end ? mins(e.end) : mins(e.start) + 60, H1 * 60);
      const top = (s - H0 * 60) / 60 * HOUR;
      const h = Math.max((end - s) / 60 * HOUR, 26);

      const totalCols = e._totalCols || 1;
      const colIdx = e._col || 0;
      const widthPct = (100 / totalCols).toFixed(2);
      const leftPct = (colIdx * (100 / totalCols)).toFixed(2);
      const displayTitle = formatEventTitle(e, cols >= 3);

      return `<button class="ev" data-id="${e.id}" style="--c:${getEventColor(e)};top:${top}px;height:${h}px;left:calc(${leftPct}% + 1px);width:calc(${widthPct}% - 2px);">
        <span class="ev-name">${esc(displayTitle)}</span>
        <small>${e.start}${e.end ? '–' + e.end : ''}</small>
      </button>`;
    }).join('');

    let guidesHtml = '';
    const dayNum = d.getDay();
    if (dayNum >= 1 && dayNum <= 5) {
      const topDesc1 = ((10 * 60 + 30) - H0 * 60) / 60 * HOUR;
      const topDesc2 = ((12 * 60 + 15) - H0 * 60) / 60 * HOUR;
      const topFin = ((14 * 60) - H0 * 60) / 60 * HOUR;

      guidesHtml = `
        <div class="guide-line break" style="top:${topDesc1}px" title="Descanso 10:30"></div>
        <div class="guide-line break" style="top:${topDesc2}px" title="Descanso 12:15"></div>
        <div class="guide-line class-end" style="top:${topFin}px" title="Fin de clases 14:00"></div>
      `;
    }

    let now = '';
    if (ds === todayISO()) {
      const t = new Date(); const m = t.getHours() * 60 + t.getMinutes();
      if (m >= H0 * 60 && m <= H1 * 60) now = `<div class="now" style="top:${(m - H0 * 60) / 60 * HOUR}px"></div>`;
    }
    return `<div class="tg-col ${ds === todayISO() ? 'today' : ''}" data-date="${ds}">${guidesHtml}${evsHtml}${now}</div>`;
  }).join('');

  const activeMode = (state.prefs && state.prefs.weekMode) || '5days';
  return `
    ${isWeekView ? weekControlsHtml(activeMode) : '<div class="grid-help-banner">💡 <b>Toca cualquier clase</b> para cambiar el día, la hora o borrarla.</div>'}
    <div class="tg-wrap" style="--cols:${cols};--n:${n}">
      <div class="tg-head"><div></div>${head}</div>
      <div class="tg-allday"><div></div>${allday}</div>
      <div class="tg-body"><div class="tg-hours">${hours}</div>${colsHtml}</div>
    </div>`;
}

/* ---------- Temporizador Pomodoro de Estudio ---------- */
let pomoState = {
  secondsLeft: 25 * 60,
  totalSeconds: 25 * 60,
  running: false,
  modeLabel: '25 min Estudio',
  subject: 'EDAFOLOGÍA Y CLIMATOLOGÍA',
  completedToday: 0,
  timerId: null
};

function formatPomoTime(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${pad(m)}:${pad(s)}`;
}

function updatePomoDisplay() {
  const el = $('pomoTimerDisplay');
  if (el) el.textContent = formatPomoTime(pomoState.secondsLeft);
  const btn = $('pomoToggleBtn');
  if (btn) btn.textContent = pomoState.running ? '⏸ Pausar' : '▶ Empezar';
}

/* ---------- Vista Modo Enfoque Anti-Estrés ("Hoy en calma") ---------- */
function focusView() {
  const todayStr = todayISO();
  const dayEvs = eventsOn(todayStr);

  const classes = dayEvs.filter(e => e.cal === 'uni' || e.cal === 'prac');
  const tasksAndExams = dayEvs.filter(e => e.cal !== 'uni' && e.cal !== 'prac');
  const pendingChecklist = ((state.prefs && state.prefs.tasks) || []).filter(t => !t.done && (!t.due || t.due <= todayStr));

  let html = `
    <div class="focus-wrap">
      <div class="focus-hero">
        <h2>🎯 Hoy solo importa esto</h2>
        <p>Concéntrate únicamente en tus clases de hoy, tus tareas prioritarias y tu bloque de estudio.</p>
      </div>

      <!-- Reloj Pomodoro Integrado -->
      <div class="pomodoro-box">
        <div style="font-size:12px;font-weight:700;color:var(--olive);text-transform:uppercase;letter-spacing:0.04em;">
          ⏱️ Reloj de Estudio (${esc(pomoState.modeLabel)}) • Sesiones hoy: ${pomoState.completedToday}
        </div>
        <div class="pomo-timer" id="pomoTimerDisplay">${formatPomoTime(pomoState.secondsLeft)}</div>
        <div class="pomo-modes">
          <button type="button" class="wm-pill" data-pomo-mins="25" data-pomo-lbl="25m Estudio">🍅 25 min</button>
          <button type="button" class="wm-pill" data-pomo-mins="50" data-pomo-lbl="50m Estudio">📚 50 min</button>
          <button type="button" class="wm-pill" data-pomo-mins="5" data-pomo-lbl="5m Descanso">☕ 5m Descanso</button>
          <button type="button" class="wm-pill" data-pomo-mins="10" data-pomo-lbl="10m Descanso">🌿 10m Descanso</button>
        </div>
        <div class="pomo-actions">
          <button type="button" class="primary" id="pomoToggleBtn">${pomoState.running ? '⏸ Pausar' : '▶ Empezar'}</button>
          <button type="button" class="ghost" id="pomoResetBtn">↺ Reiniciar</button>
        </div>
      </div>

      <!-- 1. Clases de hoy -->
      <div class="focus-card">
        <div class="focus-card-header">
          <h3>🏛️ Clases y Prácticas hoy (${classes.length})</h3>
          <span class="muted-text">${fmt(new Date(), { weekday: 'short', day: 'numeric', month: 'short' })}</span>
        </div>
        <div class="focus-item-list">
          ${!classes.length
            ? `<div style="padding:12px;color:var(--muted);font-size:13px;">Hoy no tienes clases programadas. ¡Aprovecha para estudiar o descansar!</div>`
            : classes.map(e => {
                const color = getEventColor(e);
                return `
                  <button type="button" class="focus-item" data-id="${e.id}" style="--c:${color};border-top:0;border-right:0;border-bottom:0;width:100%;text-align:left;">
                    <div>
                      <b>${e.start || ''} ${e.end ? '– ' + e.end : ''}</b>
                      <div style="font-weight:600;margin-top:2px;">${esc(e.title)}</div>
                    </div>
                    <span class="agenda-edit-pill">✏️</span>
                  </button>
                `;
              }).join('')}
        </div>
      </div>

      <!-- 2. Tareas y prioridades de hoy -->
      <div class="focus-card">
        <div class="focus-card-header">
          <h3>✅ Tareas y Prioridades para hoy</h3>
          <button type="button" class="focus-btn-reprogram" id="focusReprogramBtn">🔄 Pasar pendientes a mañana</button>
        </div>
        <div class="focus-item-list">
          ${(!tasksAndExams.length && !pendingChecklist.length)
            ? `<div style="padding:12px;color:var(--muted);font-size:13px;">No tienes tareas pendientes para hoy. Pulsa en la pestaña <b>✅ Tareas</b> o en <b>+</b> para añadir una.</div>`
            : ''}
          ${pendingChecklist.map(t => `
            <div class="task-item" style="--c:${getCal(t.cal || 'pers').color}">
              <button type="button" class="task-chk" data-toggle-task="${t.id}" title="Marcar completada">${t.done ? '✓' : ''}</button>
              <div style="flex:1;">
                <div class="task-title" style="font-weight:600;font-size:14px;">${esc(t.title)}</div>
                <small style="color:var(--muted);">${t.due ? 'Fecha: ' + t.due + ' • ' : ''}${getCal(t.cal || 'pers').name}</small>
              </div>
              <span class="prio-badge prio-${t.prio || 'media'}">${(t.prio || 'media').toUpperCase()}</span>
            </div>
          `).join('')}
          ${tasksAndExams.map(e => {
            const cal = getCal(e.cal);
            return `
              <div class="focus-item" style="--c:${cal.color}">
                <div data-id="${e.id}" style="flex:1;cursor:pointer;">
                  <div style="font-weight:600;">${esc(e.title)}</div>
                  <small style="color:var(--muted);">${e.start ? e.start + ' • ' : ''}${cal.name}</small>
                </div>
                <button type="button" class="focus-btn-reprogram" data-delay-id="${e.id}">Pasar a mañana</button>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    </div>
  `;
  return html;
}

/* ---------- Vista Mis Asignaturas (Notas, Grupos de Prácticas y Asistencia) ---------- */
function subjectsView() {
  const subjects = [
    'EDAFOLOGÍA Y CLIMATOLOGÍA',
    'MOTORES',
    'GENÉTICA Y APLICACIONES A LA INGENIERÍA',
    'FITOTECNIA GENERAL',
    'CÁLCULO DE ESTRUCTURAS Y ELECTRIFICACIÓN',
    'CIENCIA Y TECNOLOGÍA DEL MEDIO AMBIENTE'
  ];

  let html = `
    <div class="subjects-wrap">
      <div class="config-box" style="background:#f0f4eb;border-color:var(--olive);">
        <h4 style="color:var(--olive);margin:0 0 4px;">🎓 Centro de Control de tus Asignaturas</h4>
        <p class="hint" style="margin:0;">Cambia aquí tu <b>grupo de prácticas (G1/G2/G3)</b> por asignatura, controla tus <b>faltas/asistencias a prácticas</b> y calcula tu <b>nota media</b> de cada asignatura.</p>
      </div>
  `;

  subjects.forEach(subj => {
    const color = getSubjectColor(subj);
    const shortName = SHORT_SUBJECT_NAMES[subj] || subj;
    const groups = (state.prefs.subjectGroups && state.prefs.subjectGroups[subj]) || ['G3'];
    const sData = (state.prefs.subjectData && state.prefs.subjectData[subj]) || { attended: 0, missed: 0, grades: [] };
    const grades = sData.grades || [];

    // Contar prácticas de esta asignatura en el calendario actual
    const totalPracsInCal = state.events.filter(e => e.cal === 'prac' && (e.subject === subj || (e.title && e.title.toUpperCase().includes(subj)))).length;

    // Calcular nota media ponderada
    let totalWeight = 0;
    let weightedSum = 0;
    grades.forEach(g => {
      const w = parseFloat(g.weight) || 0;
      const sc = parseFloat(g.score) || 0;
      totalWeight += w;
      weightedSum += (sc * w) / 100;
    });
    const currentAvg = totalWeight > 0 ? ((weightedSum / totalWeight) * 100).toFixed(2) : '—';
    const remWeight = Math.max(0, 100 - totalWeight);
    const neededForPass = remWeight > 0 ? Math.max(0, ((5.0 - weightedSum) / (remWeight / 100))).toFixed(2) : null;

    html += `
      <div class="subj-card" style="--c:${color}">
        <div class="subj-card-head">
          <div>
            <h3>${esc(shortName)}</h3>
            <small>${esc(subj)}</small>
          </div>
          <div class="sg-groups" data-subj-group-card="${esc(subj)}">
            <span style="font-size:11px;color:var(--muted);margin-right:4px;">Mi grupo:</span>
            ${['G1', 'G2', 'G3'].map(g => {
              const isAct = groups.includes(g);
              return `<button type="button" class="sg-btn ${isAct ? 'active' : ''}" data-live-subj="${esc(subj)}" data-live-grp="${g}">${isAct ? '✓ ' : ''}${g}</button>`;
            }).join('')}
          </div>
        </div>

        <div class="subj-stats-row">
          <div class="subj-stat-box">
            <span class="lbl">🧪 Asistencia a Prácticas (${totalPracsInCal} en agenda)</span>
            <div class="val">${sData.attended || 0} asistidas • <span style="color:${(sData.missed || 0) > 0 ? '#a33' : 'var(--muted)'}">${sData.missed || 0} faltas</span></div>
            <div class="att-controls">
              <button type="button" class="att-btn" data-att-subj="${esc(subj)}" data-att-op="att+">✅ +1 Asistida</button>
              <button type="button" class="att-btn" data-att-subj="${esc(subj)}" data-att-op="miss+">❌ +1 Falta</button>
              <button type="button" class="att-btn" data-att-subj="${esc(subj)}" data-att-op="reset">↺</button>
            </div>
          </div>

          <div class="subj-stat-box">
            <span class="lbl">📊 Nota Media Actual (${totalWeight}% evaluado)</span>
            <div class="val">${currentAvg} <small style="font-size:12px;font-weight:500;color:var(--muted);">/ 10 (${weightedSum.toFixed(2)} pts)</small></div>
            ${neededForPass !== null && totalWeight > 0 ? `<small style="font-size:11px;color:var(--olive);display:block;margin-top:4px;">Necesitas un <b>${neededForPass}</b> en el ${remWeight}% restante para el 5.0</small>` : ''}
          </div>
        </div>

        <div>
          <strong style="font-size:12px;color:var(--navy);">📝 Mis Notas (Parciales, Informes, Examen):</strong>
          <div class="grade-list">
            ${grades.length ? grades.map(g => `
              <div class="grade-item">
                <span><b>${esc(g.name)}</b> (${g.weight}%)</span>
                <div>
                  <b style="color:var(--navy);margin-right:8px;">${g.score} / 10</b>
                  <button type="button" class="link danger-link" data-del-grade="${g.id}" data-grade-subj="${esc(subj)}">✕</button>
                </div>
              </div>
            `).join('') : '<small style="color:var(--muted);">Aún no has apuntado notas en esta asignatura.</small>'}
          </div>
          <div class="grade-add-form">
            <input type="text" placeholder="Ej: Parcial 1 / Informe" id="gn_${esc(subj)}">
            <input type="number" step="0.1" min="0" max="10" placeholder="Nota (0-10)" id="gs_${esc(subj)}" style="max-width:95px;">
            <input type="number" step="1" min="1" max="100" placeholder="% Peso" id="gw_${esc(subj)}" style="max-width:85px;">
            <button type="button" class="primary" data-add-grade="${esc(subj)}" style="padding:6px 12px;font-size:12px;">+ Nota</button>
          </div>
        </div>
      </div>
    `;
  });

  html += '</div>';
  return html;
}

/* ---------- Vista Tareas y Entregas con Check (✓) ---------- */
function tasksView() {
  const tasks = (state.prefs && state.prefs.tasks) || [];
  const pending = tasks.filter(t => !t.done);
  const completed = tasks.filter(t => t.done);

  return `
    <div class="tasks-wrap">
      <div class="task-QuickAdd">
        <h4 style="margin:0;color:var(--navy);">➕ Nueva Tarea, Entrega de Prácticas o Recado</h4>
        <div class="row">
          <input type="text" id="newTaskTitle" placeholder="Ej: Entregar informe Edafología, preparar JMV..." style="flex:2;padding:8px 10px;border:1px solid var(--sand);border-radius:8px;background:var(--white);font-size:15px;">
        </div>
        <div class="row" style="flex-wrap:wrap;">
          <select id="newTaskCal" style="flex:1;padding:8px;border:1px solid var(--sand);border-radius:8px;background:var(--white);font-size:14px;">
            <option value="prac">🧪 Informe / Prácticas</option>
            <option value="uni">🏛️ Universidad</option>
            <option value="exam">📝 Estudio / Examen</option>
            <option value="jmv">🌿 JMV</option>
            <option value="cat">✨ Catequesis</option>
            <option value="pers">📌 Personal</option>
          </select>
          <select id="newTaskPrio" style="flex:1;padding:8px;border:1px solid var(--sand);border-radius:8px;background:var(--white);font-size:14px;">
            <option value="alta">🔴 Prioridad Alta</option>
            <option value="media" selected>🟡 Prioridad Media</option>
            <option value="baja">🟢 Prioridad Baja</option>
          </select>
          <input type="date" id="newTaskDue" value="${todayISO()}" style="flex:1;padding:8px;border:1px solid var(--sand);border-radius:8px;background:var(--white);font-size:14px;">
          <button type="button" class="primary" id="btnAddNewTask" style="font-weight:600;">+ Añadir tarea</button>
        </div>
      </div>

      <div>
        <h4 style="margin:0 0 8px;color:var(--navy);">Pendientes (${pending.length})</h4>
        <div style="display:flex;flex-direction:column;gap:8px;">
          ${pending.length ? pending.map(t => `
            <div class="task-item" style="--c:${getCal(t.cal || 'pers').color}">
              <button type="button" class="task-chk" data-toggle-task="${t.id}"></button>
              <div style="flex:1;">
                <div class="task-title" style="font-weight:600;font-size:14px;">${esc(t.title)}</div>
                <small style="color:var(--muted);">${t.due ? '📅 ' + t.due + ' • ' : ''}${getCal(t.cal || 'pers').name}</small>
              </div>
              <span class="prio-badge prio-${t.prio || 'media'}">${(t.prio || 'media').toUpperCase()}</span>
              <button type="button" class="link danger-link" data-del-task="${t.id}" style="font-size:15px;padding:0 4px;">✕</button>
            </div>
          `).join('') : '<div class="agenda-empty">¡Todo al día! No tienes tareas pendientes.</div>'}
        </div>
      </div>

      ${completed.length ? `
        <div>
          <h4 style="margin:8px 0;color:var(--muted);">Completadas (${completed.length})</h4>
          <div style="display:flex;flex-direction:column;gap:6px;">
            ${completed.map(t => `
              <div class="task-item completed" style="--c:${getCal(t.cal || 'pers').color}">
                <button type="button" class="task-chk" data-toggle-task="${t.id}">✓</button>
                <div style="flex:1;">
                  <div class="task-title" style="font-weight:600;font-size:13px;">${esc(t.title)}</div>
                </div>
                <button type="button" class="link danger-link" data-del-task="${t.id}">✕</button>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}
    </div>
  `;
}
function agendaView() {
  const m = mondayOf(state.date);
  const days = [...Array(7)].map((_, i) => addDays(m, i));
  let html = '<div class="agenda-list">';

  let totalEvents = 0;
  days.forEach(d => {
    const ds = iso(d);
    const dayEvs = eventsOn(ds);
    const isToday = sameDay(d, new Date());
    totalEvents += dayEvs.length;

    html += `
      <div class="agenda-day-group">
        <div class="agenda-day-header ${isToday ? 'today' : ''}">
          <h3>${fmt(d, { weekday: 'long', day: 'numeric', month: 'long' })}</h3>
          ${isToday ? '<span class="day-tag">HOY</span>' : ''}
        </div>
        <div class="agenda-day-items">
    `;

    if (!dayEvs.length) {
      html += `<div class="agenda-empty">Sin clases ni eventos previstos</div>`;
    } else {
      // Ordenar por hora
      dayEvs.forEach((e, idx) => {
        const cal = calById[e.cal] || calById['uni'];
        const evColor = getEventColor(e);
        const timeStr = e.start ? `${e.start} – ${e.end || ''}` : 'Todo el día';

        html += `
          <button type="button" class="agenda-item" data-id="${e.id}">
            <div class="agenda-time">${timeStr}</div>
            <div class="agenda-detail">
              <div class="agenda-title">${esc(e.title)}</div>
              <span class="agenda-cal-badge" style="--c:${evColor}">${cal.name}</span>
            </div>
            <div class="agenda-action-hint">
              <span class="agenda-edit-pill">✏️ Modificar</span>
            </div>
          </button>
        `;
      });
    }

    html += `</div></div>`;
  });

  html += '</div>';
  return html;
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
      `<span class="m-ev" style="--c:${getEventColor(e)}">${e.start ? e.start + ' ' : ''}${esc(e.title)}</span>`).join('');
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
      const c = evs.length ? getCal(evs[0].cal).color : '';
      cells += `<span data-day="${ds}" class="${ds === todayISO() ? 't' : ''} ${evs.length ? 'has' : ''}" style="--c:${c}">${day}</span>`;
    }
    return `<div class="y-month"><h3 data-month="${y}-${pad(m + 1)}-01">${fmt(first, { month: 'long' })}</h3><div class="y-days">${cells}</div></div>`;
  }).join('');
  return `<div class="y-grid">${months}</div>`;
}

/* ---------- Importador de Horario UCLM Adaptativo ---------- */
const importDlg = $('importDlg');
const importBtn = $('importBtn');
const dropZone = $('dropZone');
const pdfFileInput = $('pdfFileInput');
const browseBtn = $('browseBtn');
const uploadPrompt = $('uploadPrompt');
const parseProgress = $('parseProgress');
const parseStatusText = $('parseStatusText');
const filterOptions = $('filterOptions');
const subjectFilterList = $('subjectFilterList');
const includePracticasSelect = $('includePracticasSelect');
const groupPracticaSelect = $('groupPracticaSelect');
const groupSelectContainer = $('groupSelectContainer');
const courseLevelSelect = $('courseLevelSelect');
const examConvocatoriaSelect = $('examConvocatoriaSelect');
const previewArea = $('previewArea');
const previewList = $('previewList');
const detectedCount = $('detectedCount');
const importConfirm = $('importConfirm');
const importCancel = $('importCancel');

let parsedEventsRaw = [];
let detectedSubjects = new Set();
let activeSelectedSubjects = new Set();

// Asignaturas oficiales de la UCLM en la Escuela de Agrónomos (normalizadas)
const OFFICIAL_SUBJECTS = [
  'EDAFOLOGÍA Y CLIMATOLOGÍA',
  'GENÉTICA Y APLICACIONES A LA INGENIERÍA',
  'CIENCIA Y TECNOLOGÍA DEL MEDIO AMBIENTE',
  'MOTORES',
  'CÁLCULO DE ESTRUCTURAS Y ELECTRIFICACIÓN',
  'CÁLCULO DE ESTRUCTURAS',
  'FITOTECNIA GENERAL',
  'FITOTECNIA',
  'FÍSICA I',
  'FÍSICA II',
  'QUÍMICA',
  'QUÍMICA AGRÍCOLA',
  'EXPRESIÓN GRÁFICA',
  'ÁLGEBRA',
  'BIOLOGÍA I',
  'BIOLOGÍA II',
  'ESTADÍSTICA Y MÉTODOS COMPUTACIONALES',
  'CÁLCULO Y ECUACIONES DIFERENCIALES',
  'EMPRESA',
  'BASES DE LA PRODUCCIÓN ANIMAL',
  'HIDRAÚLICA',
  'TOPOGRAFÍA',
  'CULTIVOS HERBÁCEOS',
  'ARBORICULTURA GENERAL. VITICULTURA',
  'ARBORICULTURA',
  'PRODUCCIÓN ANIMAL I',
  'PRODUCCIÓN ANIMAL II',
  'PRODUCCIÓN ANIMAL III',
  'PRODUCCIÓN ANIMAL IV Y TRATAMIENTO DE RESIDUOS AGROPECUARIOS',
  'CONSTRUCCIONES AGROPECUARIAS',
  'PROTECCIÓN DE CULTIVOS',
  'ECONOMÍA Y COMERCIALIZACIÓN',
  'SISTEMAS Y TECNOLOGÍAS DEL RIEGO',
  'MAQUINARIA AGRÍCOLA',
  'PRODUCCIÓN ECOLÓGICA E INTEGRADA',
  'PLANIFICACIÓN DE INFRAESTRUCTURAS Y MECANIZACIÓN AGRARIA',
  'PROYECTOS',
  'HORTICULTURA',
  'INGENIERÍA MECÁNICA Y ENERGÉTICA EN LA AGRICULTURA',
  'PLANIFICACIÓN AGRONÓMICA DE CULTIVOS'
];

function cleanSubjectName(rawBlock) {
  const norm = rawBlock.toUpperCase();

  // 1. Coincidencia exacta con lista oficial
  for (const s of OFFICIAL_SUBJECTS) {
    if (norm.includes(s)) {
      if (s.includes('ESTRUCTURA')) return 'CÁLCULO DE ESTRUCTURAS Y ELECTRIFICACIÓN';
      if (s.includes('FITOTECNIA')) return 'FITOTECNIA GENERAL';
      return s;
    }
  }

  // 2. Coincidencias inteligentes por palabras clave (resuelve cortes de línea en PDFs de la UCLM)
  if (/GEN[EÉ]TICA/i.test(norm)) return 'GENÉTICA Y APLICACIONES A LA INGENIERÍA';
  if (/CIENCIA.*MEDIO|MEDIO\s*AMBIENTE|TECNOLOG[IÍ]A.*MEDIO|CIENCIA\s*Y\s*TECNOLOG/i.test(norm)) return 'CIENCIA Y TECNOLOGÍA DEL MEDIO AMBIENTE';
  if (/EDAFOLOG|CLIMATOLOG/i.test(norm)) return 'EDAFOLOGÍA Y CLIMATOLOGÍA';
  if (/MOTOR/i.test(norm)) return 'MOTORES';
  if (/ESTRUCTURA|ELECTRIFICA/i.test(norm)) return 'CÁLCULO DE ESTRUCTURAS Y ELECTRIFICACIÓN';
  if (/FITOTECNIA/i.test(norm)) return 'FITOTECNIA GENERAL';
  if (/F[IÍ]SICA\s*I\b/i.test(norm)) return 'FÍSICA I';
  if (/F[IÍ]SICA\s*II\b/i.test(norm)) return 'FÍSICA II';
  if (/QU[IÍ]MICA\s*AGR/i.test(norm)) return 'QUÍMICA AGRÍCOLA';
  if (/QU[IÍ]MICA/i.test(norm)) return 'QUÍMICA';
  if (/[AÁ]LGEBRA/i.test(norm)) return 'ÁLGEBRA';
  if (/BIOLOG[IÍ]A\s*I\b/i.test(norm)) return 'BIOLOGÍA I';
  if (/BIOLOG[IÍ]A\s*II\b/i.test(norm)) return 'BIOLOGÍA II';
  if (/EXPRESI[OÓ]N\s*GR[AÁ]FICA/i.test(norm)) return 'EXPRESIÓN GRÁFICA';
  if (/ESTAD[IÍ]STICA/i.test(norm)) return 'ESTADÍSTICA Y MÉTODOS COMPUTACIONALES';
  if (/ECUACIONES\s*DIFERENCIALES|C[AÁ]LCULO\s*Y\s*ECUACIONES/i.test(norm)) return 'CÁLCULO Y ECUACIONES DIFERENCIALES';
  if (/EMPRESA/i.test(norm)) return 'EMPRESA';
  if (/PRODUCCI[OÓ]N\s*ANIMAL/i.test(norm)) return 'PRODUCCIÓN ANIMAL';
  if (/CULTIVOS\s*HERB[AÁ]CEOS/i.test(norm)) return 'CULTIVOS HERBÁCEOS';
  if (/ARBORICULTURA/i.test(norm)) return 'ARBORICULTURA GENERAL. VITICULTURA';
  if (/PROTECCI[OÓ]N.*CULTIVOS/i.test(norm)) return 'PROTECCIÓN DE CULTIVOS';
  if (/RIEGO/i.test(norm)) return 'SISTEMAS Y TECNOLOGÍAS DEL RIEGO';
  if (/MAQUINARIA/i.test(norm)) return 'MAQUINARIA AGRÍCOLA';
  if (/PRODUCCI[OÓ]N\s*ECOL[OÓ]GICA/i.test(norm)) return 'PRODUCCIÓN ECOLÓGICA E INTEGRADA';
  if (/PROYECTOS/i.test(norm)) return 'PROYECTOS';
  if (/HORTICULTURA/i.test(norm)) return 'HORTICULTURA';
  if (/HIDR[AÁ]ULICA/i.test(norm)) return 'HIDRÁULICA';
  if (/TOPOGRAF[IÍ]A/i.test(norm)) return 'TOPOGRAFÍA';

  return '';
}

// Diccionario de asignaturas oficiales por curso en la Escuela de Agrónomos UCLM
const UCLM_COURSES = {
  1: [
    'física i', 'química', 'expresión gráfica', 'álgebra', 'biología i',
    'estadística y métodos computacionales', 'física ii', 'cálculo y ecuaciones diferenciales',
    'biología ii', 'empresa'
  ],
  2: [
    'motores', 'ciencia y tecnología del medio ambiente', 'edafología y climatología',
    'genética y aplicaciones a la ingeniería', 'fitotecnia general', 'fitotecnia',
    'cálculo de estructuras y electrificación', 'cálculo de estructuras', 'bases de la producción animal',
    'hidraúlica', 'hidráulica', 'topografía'
  ],
  3: [
    'cultivos herbáceos', 'arboricultura general. viticultura', 'arboricultura', 'viticultura',
    'producción animal iii', 'construcciones agropecuarias', 'producción animal i',
    'proteccion de cultivos', 'protección de cultivos', 'producción animal ii',
    'química agrícola', 'economía y comercialización', 'sistemas y tecnologías del riego',
    'maquinaria agrícola'
  ],
  4: [
    'producción ecológica e integrada', 'producción animal iv y tratamiento de residuos agropecuarios',
    'planificación de infraestructuras y mencanización agraria', 'mecanización agraria',
    'proyectos', 'horticultura', 'ingeniería mecánica y energética en la agricultura',
    'planificación agronómica de cultivos'
  ]
};

function detectCourseForSubject(subjName) {
  const s = subjName.toLowerCase();
  for (let c = 1; c <= 4; c++) {
    if (UCLM_COURSES[c].some(term => s.includes(term) || term.includes(s))) {
      return c;
    }
  }
  return 0; // Desconocido / otro
}

if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.4.120/legacy/build/pdf.worker.js';
}

importBtn.onclick = () => {
  parsedEventsRaw = [];
  detectedSubjects.clear();
  activeSelectedSubjects.clear();
  previewList.innerHTML = '';
  filterOptions.style.display = 'none';
  previewArea.style.display = 'none';
  importConfirm.style.display = 'none';
  uploadPrompt.style.display = 'block';
  parseProgress.style.display = 'none';
  pdfFileInput.value = '';
  renderQuickSubjectList();
  importDlg.showModal();
};

importCancel.onclick = () => importDlg.close();
browseBtn.onclick = (e) => { e.stopPropagation(); pdfFileInput.click(); };
dropZone.onclick = (e) => { if (e.target !== browseBtn) pdfFileInput.click(); };

dropZone.ondragover = (e) => { e.preventDefault(); dropZone.classList.add('dragover'); };
dropZone.ondragleave = () => dropZone.classList.remove('dragover');
dropZone.ondrop = (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  if (e.dataTransfer.files && e.dataTransfer.files[0]) handlePdfFile(e.dataTransfer.files[0]);
};
pdfFileInput.onchange = (e) => {
  if (e.target.files && e.target.files[0]) handlePdfFile(e.target.files[0]);
};

const MONTHS_MAP = {
  'ene': 0, 'feb': 1, 'mar': 2, 'abr': 3, 'may': 4, 'jun': 5,
  'jul': 6, 'ago': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dic': 11
};

// Parser espacial de tablas semanales y exámenes de la UCLM
async function parseUclmPdf(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const events = [];
  const subjects = new Set();

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const items = content.items;

    // Detectar si es calendario de exámenes o de clases semanales
    const allPageText = items.map(it => it.str).join(' ');
    const isExamDoc = /CONVOCATORIA\s*ORDINARIA|CONVOCATORIA\s*EXTRAORDINARIA|calendario\s*de\s*ex[aá]menes/i.test(allPageText);

    let academicYear = 2026;
    for (let it of items) {
      const ym = it.str.match(/CURSO\s*(\d{4})\/(\d{2,4})/i);
      if (ym) academicYear = parseInt(ym[1], 10);
    }

    // Buscar cabeceras de columnas con fechas: "04-ene", "08-sep", "11-ene", etc.
    const dateHeaders = [];
    items.forEach(it => {
      const str = (it.str || '').trim();
      if (!str) return;
      const matches = [...str.matchAll(/(\d{1,2})-(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)/gi)];
      if (matches.length === 1) {
        const day = parseInt(matches[0][1], 10);
        const month = MONTHS_MAP[matches[0][2].toLowerCase()];
        const year = month >= 8 ? academicYear : academicYear + 1;
        const isoDate = `${year}-${pad(month + 1)}-${pad(day)}`;
        dateHeaders.push({ x: it.transform[4], y: it.transform[5], date: isoDate, str: matches[0][0] });
      } else if (matches.length > 1) {
        // En PDFs donde las columnas de la semana vienen agrupadas en un solo bloque
        const standardXs = [169, 299, 427, 552, 668];
        matches.forEach((m, idx) => {
          const day = parseInt(m[1], 10);
          const month = MONTHS_MAP[m[2].toLowerCase()];
          const year = month >= 8 ? academicYear : academicYear + 1;
          const isoDate = `${year}-${pad(month + 1)}-${pad(day)}`;
          const xPos = idx < standardXs.length ? standardXs[idx] : it.transform[4] + idx * 125;
          dateHeaders.push({ x: xPos, y: it.transform[5], date: isoDate, str: m[0] });
        });
      }
    });

    dateHeaders.sort((a, b) => a.x - b.x);

    if (dateHeaders.length >= 2) {
      const colBounds = [];
      for (let i = 0; i < dateHeaders.length; i++) {
        const cur = dateHeaders[i];
        const next = dateHeaders[i + 1];
        const minX = i === 0 ? cur.x - 30 : (dateHeaders[i - 1].x + cur.x) / 2;
        const maxX = next ? (cur.x + next.x) / 2 : cur.x + 80;
        colBounds.push({ minX, maxX, date: cur.date });
      }

      if (isExamDoc) {
        // En los calendarios de exámenes, los horarios suelen ser MAÑANA (9:00) o TARDE (16:00)
        // Buscamos los textos "Ordinario" o "Extraordinario" o nombres de asignaturas
        items.forEach(it => {
          const str = it.str.trim();
          if (!str || str.length < 3) return;
          // Ignorar cabeceras y textos irrelevantes
          if (/^(CURSO|Hora|Lunes|Martes|Mi[eé]rcoles|Jueves|Viernes|MA[ÑN]ANA|TARDE|D[IÍ]A|Borrador|GRADO|CONVOCATORIA)/i.test(str)) return;

          // Ver si coincide con alguna asignatura conocida
          const detectedCourse = detectCourseForSubject(str);
          if (detectedCourse > 0 || /AULA\s*\d/i.test(str) === false && str.length > 5 && !/^\d+$/.test(str)) {
            // Encontrar columna de fecha
            const col = colBounds.find(c => it.transform[4] >= c.minX && it.transform[4] <= c.maxX);
            if (!col) return;

            // Determinar si es de mañana (9:00) o de tarde (16:00) según la coordenada Y
            // En esta plantilla, MAÑANA está en la mitad superior y TARDE en la mitad inferior
            const isMorning = it.transform[5] > 360;
            const startTime = isMorning ? '09:00' : '16:00';
            const endTime = isMorning ? '12:00' : '19:00';

            // Detectar si es Ordinario o Extraordinario buscando texto cercano
            const nearby = items.filter(other => Math.abs(other.transform[4] - it.transform[4]) < 50 && Math.abs(other.transform[5] - it.transform[5]) < 50);
            const isExtra = nearby.some(n => /Extraordinario/i.test(n.str));
            const aulaItem = nearby.find(n => /AULA\s*\d/i.test(n.str));
            const aulaStr = aulaItem ? aulaItem.str : '';

            // Limpiar título
            let cleanSubj = str.replace(/Ordinario|Extraordinario/ig, '').trim();
            if (cleanSubj.length > 3) {
              subjects.add(cleanSubj);
              events.push({
                id: crypto.randomUUID(),
                title: `Examen: ${cleanSubj}`,
                subject: cleanSubj,
                cal: 'exam',
                date: col.date,
                start: startTime,
                end: endTime,
                group: 'all',
                isPractice: false,
                isExam: true,
                course: detectedCourse,
                convocatoria: isExtra ? 'extraordinaria' : 'ordinaria',
                notes: `${isExtra ? 'Convocatoria Extraordinaria' : 'Convocatoria Ordinaria'} • ${aulaStr}`,
                rawText: cleanSubj
              });
            }
          }
        });
      } else {
        // Horario semanal de clases habitual UCLM
        // 1. Descomponer items que contienen saltos horizontales grandes (kerning múltiple en misma línea)
        const atomicItems = [];
        items.forEach(it => {
          const str = (it.str || '').trim();
          if (!str) return;

          // Buscar si hay horas múltiples o bloques concatenados por el motor PDF
          const timeInstances = [...str.matchAll(/\b(\d{1,2}[:.]\d{2})\s*[-–]\s*(\d{1,2}[:.]\d{2})\b/g)];
          if (timeInstances.length > 1) {
            // Múltiples horas en un solo texto (ej: "10:45-12:1510:45-12:1510:45-12:15")
            // Distribuir proporcionalmente en las columnas de la semana correspondientes
            timeInstances.forEach((m, idx) => {
              const startT = m[1].replace('.', ':');
              const endT = m[2].replace('.', ':');
              // Si coincide con columnas de fechas
              const targetCol = dateHeaders[idx % dateHeaders.length];
              if (targetCol) {
                atomicItems.push({
                  str: `${startT}-${endT}`,
                  x: targetCol.x,
                  y: it.transform[5],
                  isTime: true,
                  start: startT,
                  end: endT
                });
              }
            });
          } else {
            const tm = str.match(/\b(\d{1,2}[:.]\d{2})\s*[-–]\s*(\d{1,2}[:.]\d{2})\b/);
            atomicItems.push({
              str: str,
              x: it.transform[4],
              y: it.transform[5],
              isTime: !!tm,
              start: tm ? tm[1].replace('.', ':') : '',
              end: tm ? tm[2].replace('.', ':') : ''
            });
          }
        });

        // 2. Extraer horas individuales válidas
        const timeEntries = atomicItems.filter(it => it.isTime);

        // Agrupar filas de fechas semanales por coordenada Y
        const weekRows = {};
        dateHeaders.forEach(dh => {
          const yKey = Math.round(dh.y / 15) * 15;
          if (!weekRows[yKey]) weekRows[yKey] = [];
          weekRows[yKey].push(dh);
        });

        Object.values(weekRows).forEach(wDates => {
          wDates.sort((a, b) => a.x - b.x);

          wDates.forEach((colDh, colIdx) => {
            const minX = colIdx === 0 ? colDh.x - 45 : (wDates[colIdx - 1].x + colDh.x) / 2;
            const maxX = colIdx === wDates.length - 1 ? colDh.x + 55 : (colDh.x + wDates[colIdx + 1].x) / 2;

            // Horas que caen en esta columna específica y dentro del rango Y de la semana
            const colTimes = timeEntries.filter(t => t.x >= minX && t.x <= maxX && t.y > colDh.y && t.y < colDh.y + 320);

            colTimes.forEach(tEntry => {
              // Buscar textos que estén en la misma columna y correspondan a este bloque horario
              const aboveChunks = atomicItems.filter(it => {
                const dx = it.x >= minX && it.x <= maxX;
                const dy = tEntry.y - it.y;
                return dx && dy > -15 && dy < 130 && !it.isTime;
              });

              aboveChunks.sort((a, b) => a.y - b.y);
              const fullBlock = aboveChunks.map(c => c.str).join(' ').trim();
              if (!fullBlock || fullBlock.length < 3) return;

              const subjectName = cleanSubjectName(fullBlock);
              if (!subjectName) return;

              const isExam = /prueba|evaluaci[oó]n|examen|parcial/i.test(fullBlock);
              const isPrac = /pr[aá]ctica|lab|laboratorio|s\d+\s*pr[aá]cticas|campo|visita/i.test(fullBlock);
              const cal = isExam ? 'exam' : (isPrac ? 'prac' : 'uni');

              let groupTag = 'all';
              const gm = fullBlock.match(/\b(G1|G2|G3|G4)\b/i);
              if (gm) groupTag = gm[1].toUpperCase();

              const course = detectCourseForSubject(subjectName);

              let cleanTitle = subjectName;
              if (isExam) cleanTitle = `Examen: ${subjectName}`;
              else if (isPrac) cleanTitle = `Práctica: ${subjectName}${groupTag !== 'all' ? ' (' + groupTag + ')' : ''}`;

              subjects.add(subjectName);
              events.push({
                id: crypto.randomUUID(),
                title: cleanTitle,
                subject: subjectName,
                cal,
                date: colDh.date,
                start: tEntry.start,
                end: tEntry.end,
                group: groupTag,
                isPractice: isPrac,
                isExam: isExam,
                course: course,
                convocatoria: 'ordinaria',
                notes: fullBlock,
                rawText: fullBlock
              });
            });
          });
        });
      }
    }
  }

  // Eliminar posibles duplicados
  const uniqueEvents = [];
  const seen = new Set();
  events.forEach(e => {
    const k = `${e.title}|${e.date}|${e.start}`;
    if (!seen.has(k)) {
      seen.add(k);
      uniqueEvents.push(e);
    }
  });

  return { events: uniqueEvents, subjects: Array.from(subjects) };
}

async function handlePdfFile(file) {
  if (!file || file.type !== 'application/pdf') {
    alert('Por favor selecciona un archivo PDF válido.');
    return;
  }
  uploadPrompt.style.display = 'none';
  parseProgress.style.display = 'block';
  parseStatusText.textContent = `Analizando calendario "${file.name}"...`;

  try {
    const { events, subjects } = await parseUclmPdf(file);

    if (events.length === 0) {
      parseStatusText.textContent = 'No pudimos extraer las citas con el formato automático. Prueba a revisar que sea el PDF original.';
      setTimeout(() => {
        uploadPrompt.style.display = 'block';
        parseProgress.style.display = 'none';
      }, 3500);
      return;
    }

    parsedEventsRaw = events;
    detectedSubjects = new Set(subjects);
    activeSelectedSubjects = new Set(subjects); // Todas seleccionadas por defecto

    // Rellenar checkboxes de asignaturas limpias
    subjectFilterList.innerHTML = subjects.map(s => `
      <label class="sub-pill checked" data-subj="${esc(s)}">
        <input type="checkbox" checked value="${esc(s)}">
        <span>${esc(s)}</span>
      </label>
    `).join('');

    renderUclmPreview();

    uploadPrompt.style.display = 'none';
    parseProgress.style.display = 'none';
    filterOptions.style.display = 'block';
    previewArea.style.display = 'block';
    importConfirm.style.display = 'inline-block';
  } catch (err) {
    console.error(err);
    parseStatusText.textContent = 'Error al procesar: ' + err.message;
  }
}

function getFilteredEvents() {
  const includePrac = includePracticasSelect.value === 'yes';
  const myGroup = groupPracticaSelect.value;
  const courseLevel = courseLevelSelect.value; // 'all', '1', '2', '3', '4'
  const convo = examConvocatoriaSelect ? examConvocatoriaSelect.value : 'all';

  return parsedEventsRaw.filter(e => {
    // 1. Filtrar por curso si se ha seleccionado uno específico (1º, 2º, 3º, 4º)
    if (courseLevel !== 'all' && e.course && e.course > 0) {
      if (String(e.course) !== String(courseLevel)) return false;
    }

    // 2. Filtrar convocatoria en exámenes
    if (e.isExam && convo !== 'all' && e.convocatoria) {
      if (e.convocatoria !== convo) return false;
    }

    // 3. Filtrar si la asignatura está desmarcada por el usuario
    if (!activeSelectedSubjects.has(e.subject)) return false;

    // 4. Filtrar prácticas
    if (e.isPractice && !includePrac) return false;

    // 5. Filtrar subgrupo de prácticas
    if (e.isPractice && myGroup !== 'all' && e.group !== 'all') {
      if (e.group !== myGroup) return false;
    }

    return true;
  });
}

// Asignaturas oficiales de 2º curso (1º Cuatrimestre)
const UCLM_2ND_YEAR_SUBJECTS = [
  'EDAFOLOGÍA Y CLIMATOLOGÍA',
  'MOTORES',
  'GENÉTICA Y APLICACIONES A LA INGENIERÍA',
  'FITOTECNIA GENERAL',
  'CÁLCULO DE ESTRUCTURAS Y ELECTRIFICACIÓN',
  'CIENCIA Y TECNOLOGÍA DEL MEDIO AMBIENTE'
];

function renderSubjectGroupRows(container, subjs, showCheckbox = true) {
  if (!container) return;
  container.innerHTML = subjs.map(s => {
    const enabled = state.prefs.subjectEnabled[s] !== false;
    const activeGroups = state.prefs.subjectGroups[s] || ['G3'];
    const shortName = SHORT_SUBJECT_NAMES[s] || s;
    const color = getSubjectColor(s, 'uni');
    return `
      <div class="sg-row ${enabled ? '' : 'off'}" data-subj-row="${esc(s)}">
        <label class="sg-left">
          ${showCheckbox ? `<input type="checkbox" class="subj-chk" value="${esc(s)}" ${enabled ? 'checked' : ''}>` : ''}
          <span class="sg-dot" style="background:${color};"></span>
          <span>${esc(shortName)}</span>
        </label>
        <div class="sg-groups">
          ${['G1', 'G2', 'G3'].map(g => {
            const isAct = activeGroups.includes(g);
            return `<button type="button" class="sg-btn ${isAct ? 'active' : ''}" data-subj-g="${esc(s)}" data-g="${g}">${isAct ? '✓ ' : ''}${g}</button>`;
          }).join('')}
        </div>
      </div>
    `;
  }).join('');

  container.onclick = (e) => {
    const gBtn = e.target.closest('[data-subj-g]');
    if (gBtn) {
      e.preventDefault();
      e.stopPropagation();
      const subj = gBtn.dataset.subjG;
      const g = gBtn.dataset.g;
      let cur = Array.isArray(state.prefs.subjectGroups[subj]) ? [...state.prefs.subjectGroups[subj]] : ['G3'];
      if (cur.includes(g)) {
        cur = cur.filter(x => x !== g);
      } else {
        cur = [...cur, g];
      }
      state.prefs.subjectGroups[subj] = cur;
      if ($('quickGroupSelect')) $('quickGroupSelect').value = 'custom';
      save();
      renderSubjectGroupRows(container, subjs, showCheckbox);
      return;
    }
  };

  container.onchange = (e) => {
    const chk = e.target.closest('.subj-chk');
    if (chk) {
      state.prefs.subjectEnabled[chk.value] = chk.checked;
      save();
      renderSubjectGroupRows(container, subjs, showCheckbox);
    }
  };
}

function renderQuickSubjectList() {
  const container = $('quickSubjectList');
  if (!container) return;
  const courseType = $('quickCourseSelect') ? $('quickCourseSelect').value : '2_cuat1';

  if (courseType === 'exams_1') {
    const subjs1 = [
      'FÍSICA I', 'QUÍMICA', 'EXPRESIÓN GRÁFICA', 'ÁLGEBRA', 'BIOLOGÍA I',
      'ESTADÍSTICA Y MÉTODOS COMPUTACIONALES', 'FÍSICA II', 'CÁLCULO Y ECUACIONES DIFERENCIALES',
      'BIOLOGÍA II', 'EMPRESA'
    ];
    container.innerHTML = subjs1.map(s => `
      <label class="sub-pill checked" data-subj="${esc(s)}">
        <input type="checkbox" class="subj-chk" checked value="${esc(s)}">
        <span>${esc(s)}</span>
      </label>
    `).join('');
    return;
  }

  renderSubjectGroupRows(container, UCLM_2ND_YEAR_SUBJECTS, true);
}

const quickCourseSelect = $('quickCourseSelect');
if (quickCourseSelect) {
  quickCourseSelect.onchange = () => renderQuickSubjectList();
}

const quickGroupSelect = $('quickGroupSelect');
if (quickGroupSelect) {
  quickGroupSelect.onchange = () => {
    const val = quickGroupSelect.value;
    UCLM_2ND_YEAR_SUBJECTS.forEach(s => {
      if (val === 'custom') {
        state.prefs.subjectGroups[s] = DEFAULT_SUBJECT_GROUPS[s] ? [...DEFAULT_SUBJECT_GROUPS[s]] : ['G3'];
      } else if (val === 'all') {
        state.prefs.subjectGroups[s] = ['G1', 'G2', 'G3'];
      } else if (val === 'none') {
        state.prefs.subjectGroups[s] = [];
      } else {
        state.prefs.subjectGroups[s] = [val];
      }
    });
    save();
    renderQuickSubjectList();
  };
}

// Construye la lista verificada de clases y prácticas según los grupos por asignatura
function buildOfficialScheduleEvents(courseType, checkedSubjs) {
  const data = window.UCLM_OFFICIAL_DATA;
  if (!data) return [];

  if (courseType === '2_cuat1') {
    return data.classes.filter(c => {
      if (!checkedSubjs.has(c.subject)) return false;
      if (c.is_prac) {
        const subjGroups = state.prefs.subjectGroups[c.subject] || ['G3'];
        if (subjGroups.length === 0) return false;
        if (c.group !== 'all' && !subjGroups.includes(c.group)) return false;
      }
      return true;
    }).map(c => {
      const cal = c.is_exam ? 'exam' : (c.is_prac ? 'prac' : 'uni');
      let title = c.subject;
      if (c.is_exam) title = `Examen: ${c.subject}`;
      else if (c.is_prac) title = `Práctica: ${c.subject}${c.group !== 'all' ? ' (' + c.group + ')' : ''}`;
      return {
        id: crypto.randomUUID(),
        title: title,
        subject: c.subject,
        cal: cal,
        date: c.date,
        start: c.start,
        end: c.end,
        notes: 'Horario oficial UCLM'
      };
    });
  } else if (courseType === 'exams_2' || courseType === 'exams_1') {
    const targetCourse = courseType === 'exams_2' ? 2 : 1;
    return data.exams.filter(e => {
      if (e.course !== targetCourse) return false;
      return checkedSubjs.has(e.subject);
    }).map(e => {
      const [st, et] = e.time.split('-');
      return {
        id: crypto.randomUUID(),
        title: `Examen: ${e.subject}`,
        subject: e.subject,
        cal: 'exam',
        date: e.date,
        start: st,
        end: et,
        notes: 'Convocatoria oficial UCLM'
      };
    });
  }
  return [];
}

// Re-sincroniza en 1 toque las prácticas y clases según los grupos actuales por asignatura
async function syncOfficialClassesWithCurrentGroups(silent = false) {
  const enabledSubjs = new Set(
    UCLM_2ND_YEAR_SUBJECTS.filter(s => state.prefs.subjectEnabled[s] !== false)
  );
  if (enabledSubjs.size === 0) {
    UCLM_2ND_YEAR_SUBJECTS.forEach(s => {
      state.prefs.subjectEnabled[s] = true;
      enabledSubjs.add(s);
    });
  }
  const itemsToAdd = buildOfficialScheduleEvents('2_cuat1', enabledSubjs);
  if (!itemsToAdd.length) return;

  // Eliminamos las clases/prácticas anteriores del horario oficial para no duplicar
  const existingOfficial = state.events.filter(e =>
    e.cal === 'uni' || e.cal === 'prac' || (e.cal === 'exam' && e.notes === 'Horario oficial UCLM')
  );
  const deleteIds = existingOfficial.map(e => e.id);

  await batchSyncEvents(deleteIds, itemsToAdd);
  if (!silent) {
    alert(`¡Horario actualizado al instante! Se han sincronizado ${itemsToAdd.length} clases y prácticas (incluidas todas las de mañana y tarde de tus grupos).`);
  }
}

// Carga instantánea verificada de la base de datos oficial (1 solo toque en lote)
const btnApplyOfficial = $('btnApplyOfficial');
if (btnApplyOfficial) {
  btnApplyOfficial.onclick = async () => {
    const courseType = $('quickCourseSelect') ? $('quickCourseSelect').value : '2_cuat1';
    const data = window.UCLM_OFFICIAL_DATA;
    if (!data) {
      alert('Datos oficiales no disponibles.');
      return;
    }

    const chkEls = Array.from(document.querySelectorAll('#quickSubjectList input.subj-chk:checked, #quickSubjectList input[type="checkbox"]:checked'));
    const checkedSubjs = new Set(chkEls.map(c => c.value));

    if (checkedSubjs.size === 0) {
      alert('Por favor marca al menos una asignatura para añadir a tu horario.');
      return;
    }

    const itemsToAdd = buildOfficialScheduleEvents(courseType, checkedSubjs);
    if (!itemsToAdd.length) {
      alert('No se encontraron citas para la selección.');
      return;
    }

    const oldBtnText = btnApplyOfficial.textContent;
    btnApplyOfficial.disabled = true;
    btnApplyOfficial.textContent = '⏳ Sincronizando en 1 toque...';

    try {
      let deleteIds = [];
      if (courseType === '2_cuat1') {
        const existingUni = state.events.filter(e => e.cal === 'uni' || e.cal === 'prac' || (e.cal === 'exam' && e.notes === 'Horario oficial UCLM'));
        if (existingUni.length > 0) {
          deleteIds = existingUni.map(e => e.id);
        }
      } else {
        const existingExams = state.events.filter(e => e.cal === 'exam' && e.notes === 'Convocatoria oficial UCLM');
        if (existingExams.length > 0) {
          deleteIds = existingExams.map(e => e.id);
        }
      }

      importDlg.close();
      await batchSyncEvents(deleteIds, itemsToAdd);
      alert(`¡Horario oficial cargado en 1 toque! Se han sincronizado ${itemsToAdd.length} clases y prácticas verificadas.`);
    } finally {
      btnApplyOfficial.disabled = false;
      btnApplyOfficial.textContent = oldBtnText;
    }
  };
}

function renderUclmPreview() {
  const list = getFilteredEvents();
  detectedCount.textContent = list.length;
  previewList.innerHTML = list.slice(0, 50).map(e => {
    const cal = getCal(e.cal);
    return `
      <div class="preview-item" style="--c:${cal.color}">
        <div>
          <div class="p-title">${esc(e.title)} ${e.group !== 'all' ? `[${e.group}]` : ''}</div>
          <div class="p-meta">${e.date} • ${e.start}–${e.end} • [${cal.name}]</div>
        </div>
        <button type="button" class="p-del" data-id="${e.id}" title="Descartar">✕</button>
      </div>
    `;
  }).join('') + (list.length > 50 ? `<div style="padding:6px;font-size:12px;color:var(--muted);text-align:center;">...y ${list.length - 50} clases más</div>` : '');
}

// Eventos de controles de filtro PDF manual
if (subjectFilterList) {
  subjectFilterList.onchange = (e) => {
    const chk = e.target;
    if (!chk) return;
    const pill = chk.closest('.sub-pill');
    if (chk.checked) {
      activeSelectedSubjects.add(chk.value);
      if (pill) pill.classList.add('checked');
    } else {
      activeSelectedSubjects.delete(chk.value);
      if (pill) pill.classList.remove('checked');
    }
    renderUclmPreview();
  };
}

if (includePracticasSelect) {
  includePracticasSelect.onchange = () => {
    groupSelectContainer.style.opacity = includePracticasSelect.value === 'yes' ? '1' : '0.4';
    groupSelectContainer.style.pointerEvents = includePracticasSelect.value === 'yes' ? 'auto' : 'none';
    renderUclmPreview();
  };
}

if (groupPracticaSelect) groupPracticaSelect.onchange = () => renderUclmPreview();
if (courseLevelSelect) courseLevelSelect.onchange = () => renderUclmPreview();
if (examConvocatoriaSelect) examConvocatoriaSelect.onchange = () => renderUclmPreview();

if (previewList) {
  previewList.onclick = (e) => {
    const delBtn = e.target.closest('.p-del');
    if (delBtn) {
      const id = delBtn.dataset.id;
      parsedEventsRaw = parsedEventsRaw.filter(x => x.id !== id);
      renderUclmPreview();
    }
  };
}

if (importConfirm) {
  importConfirm.onclick = async () => {
    const toAdd = getFilteredEvents();
    if (!toAdd.length) {
      alert('No hay clases ni eventos seleccionados con los filtros actuales.');
      return;
    }

    importDlg.close();
    await batchSyncEvents([], toAdd);
    alert(`¡Listo! Se han añadido ${toAdd.length} clases y prácticas a tu agenda.`);
  };
}

/* ---------- Panel de Ajustes y Personalización (⚙️ Ajustes) ---------- */
const settingsDlg = $('settingsDlg');
const settingsBtn = $('settingsBtn');
const openSettingsToolbarBtn = $('openSettingsToolbarBtn');
const settingsClose = $('settingsClose');
const settingsSaveBtn = $('settingsSaveBtn');
const btnSyncGroupsNow = $('btnSyncGroupsNow');
const btnResetColors = $('btnResetColors');

function openSettingsModal() {
  if (!settingsDlg) return;
  renderSubjectGroupRows($('settingsSubjectGroups'), UCLM_2ND_YEAR_SUBJECTS, true);

  if ($('prefWeekMode')) $('prefWeekMode').value = state.prefs.weekMode || '5days';
  if ($('prefShortNames')) $('prefShortNames').value = state.prefs.shortNames === 'full' ? 'full' : 'short';
  if ($('prefHourHeight')) $('prefHourHeight').value = String(state.prefs.hourHeight || 54);
  if ($('prefStartHour')) $('prefStartHour').value = String(state.prefs.startHour ?? 8);
  if ($('prefEndHour')) $('prefEndHour').value = String(state.prefs.endHour ?? 21);
  if ($('prefShowCountdown')) $('prefShowCountdown').value = state.prefs.showCountdown === 'no' ? 'no' : 'yes';

  const colorList = $('settingsColorList');
  if (colorList) {
    colorList.innerHTML = UCLM_2ND_YEAR_SUBJECTS.map(s => {
      const shortName = SHORT_SUBJECT_NAMES[s] || s;
      const c = getSubjectColor(s);
      return `
        <div class="color-picker-item">
          <input type="color" data-color-subj="${esc(s)}" value="${c}">
          <span>${esc(shortName)}</span>
        </div>
      `;
    }).join('');
  }

  settingsDlg.showModal();
}

function readSettingsModalValues() {
  if ($('prefWeekMode')) state.prefs.weekMode = $('prefWeekMode').value;
  if ($('prefShortNames')) state.prefs.shortNames = $('prefShortNames').value;
  if ($('prefHourHeight')) state.prefs.hourHeight = parseInt($('prefHourHeight').value, 10) || 54;
  if ($('prefStartHour')) state.prefs.startHour = parseInt($('prefStartHour').value, 10) || 8;
  if ($('prefEndHour')) state.prefs.endHour = parseInt($('prefEndHour').value, 10) || 21;
  if ($('prefShowCountdown')) state.prefs.showCountdown = $('prefShowCountdown').value;

  document.querySelectorAll('#settingsColorList input[data-color-subj]').forEach(inp => {
    const subj = inp.dataset.colorSubj;
    state.prefs.customColors[subj] = inp.value;
  });
  save();
}

if (settingsBtn) settingsBtn.onclick = () => openSettingsModal();
if (openSettingsToolbarBtn) openSettingsToolbarBtn.onclick = () => openSettingsModal();
if (settingsClose) settingsClose.onclick = () => settingsDlg.close();

if (settingsSaveBtn) {
  settingsSaveBtn.onclick = () => {
    readSettingsModalValues();
    settingsDlg.close();
    render();
  };
}

if (btnSyncGroupsNow) {
  btnSyncGroupsNow.onclick = async () => {
    readSettingsModalValues();
    btnSyncGroupsNow.disabled = true;
    const orig = btnSyncGroupsNow.textContent;
    btnSyncGroupsNow.textContent = '⏳ Actualizando horario...';
    try {
      await syncOfficialClassesWithCurrentGroups(false);
      settingsDlg.close();
    } finally {
      btnSyncGroupsNow.disabled = false;
      btnSyncGroupsNow.textContent = orig;
    }
  };
}

if (btnResetColors) {
  btnResetColors.onclick = () => {
    state.prefs.customColors = {};
    save();
    openSettingsModal();
    render();
  };
}

/* ---------- Apple Calendar Feed Dialog con Selección de Categorías ---------- */
const feedDlg = $('feedDlg');
const feedUrlInput = $('feedUrl');
const feedSubLink = $('feedSub');
const feedCalsToggles = $('feedCalsToggles');
const feedSaveState = $('feedSaveState');

let activeFeedCals = new Set(['exam', 'prac', 'jmv', 'cat', 'pers']);

async function loadFeedTokenData() {
  if (!uid) return { token: null, allowed: null };
  const { data } = await sb.from('feed_tokens').select('token, allowed_cals').single();
  if (data) {
    if (data.allowed_cals) {
      activeFeedCals = new Set(data.allowed_cals.split(',').filter(Boolean));
    }
    return { token: data.token, allowed: data.allowed_cals };
  }
  return { token: null, allowed: null };
}

async function getOrCreateFeedToken(forceNew = false) {
  if (!uid) return null;
  const existing = await loadFeedTokenData();
  if (existing.token && !forceNew) return existing.token;

  const newToken = Array.from(crypto.getRandomValues(new Uint8Array(24)))
    .map(b => b.toString(16).padStart(2, '0')).join('');
  const allowedStr = Array.from(activeFeedCals).join(',');
  const { error } = await sb.from('feed_tokens').upsert({
    user_id: uid,
    token: newToken,
    allowed_cals: allowedStr
  });
  if (error) {
    alert('Error al generar enlace de Apple Calendar: ' + error.message);
    return null;
  }
  return newToken;
}

function renderFeedCheckboxes() {
  feedCalsToggles.innerHTML = CALENDARS.map(c => {
    const isChecked = activeFeedCals.has(c.id);
    return `
      <label class="sub-pill ${isChecked ? 'checked' : ''}" style="--c:${c.color}">
        <input type="checkbox" value="${c.id}" ${isChecked ? 'checked' : ''}>
        <i style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${c.color};margin-right:4px;"></i>
        <span>${c.name}</span>
      </label>
    `;
  }).join('');
}

if (feedCalsToggles) {
  feedCalsToggles.onchange = async (e) => {
    const chk = e.target;
    if (!chk) return;
    const pill = chk.closest('.sub-pill');
    if (chk.checked) {
      activeFeedCals.add(chk.value);
      if (pill) pill.classList.add('checked');
    } else {
      activeFeedCals.delete(chk.value);
      if (pill) pill.classList.remove('checked');
    }

    feedSaveState.textContent = 'Actualizando filtros en la nube...';
    const allowedStr = Array.from(activeFeedCals).join(',');
    const { error } = await sb.from('feed_tokens').update({ allowed_cals: allowedStr }).eq('user_id', uid);
    if (!error) {
      feedSaveState.textContent = '¡Filtros actualizados! Apple Calendar se adaptará automáticamente.';
    } else {
      feedSaveState.textContent = 'Error al guardar filtro: ' + error.message;
    }
  };
}

async function openFeedDialog() {
  feedUrlInput.value = 'Cargando enlace...';
  feedSaveState.textContent = 'Sincronización personalizada activa';
  feedDlg.showModal();
  await loadFeedTokenData();
  renderFeedCheckboxes();
  const token = await getOrCreateFeedToken(false);
  if (!token) return;
  const httpUrl = `${window.location.origin}/calendar/${token}.ics`;
  const webcalUrl = httpUrl.replace(/^https?:\/\//i, 'webcal://');
  feedUrlInput.value = httpUrl;
  feedSubLink.href = webcalUrl;
}

if ($('feedBtn')) $('feedBtn').onclick = () => openFeedDialog();
if ($('feedClose')) $('feedClose').onclick = () => feedDlg.close();
if ($('feedCopy')) {
  $('feedCopy').onclick = async () => {
    if (!feedUrlInput.value || feedUrlInput.value.startsWith('Cargando')) return;
    await navigator.clipboard.writeText(feedUrlInput.value);
    const old = $('feedCopy').textContent;
    $('feedCopy').textContent = '¡Copiado!';
    setTimeout(() => $('feedCopy').textContent = old, 2000);
  };
}
if ($('feedReset')) {
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
}

function shift(dir) {
  const d = new Date(state.date);
  if (state.view === 'agenda') d.setDate(d.getDate() + 7 * dir);
  else if (state.view === 'day') d.setDate(d.getDate() + dir);
  else if (state.view === 'week') {
    const step = state.prefs.weekMode === '3days' ? 3 : 7;
    d.setDate(d.getDate() + step * dir);
  }
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
  $('dlgTitle').textContent = ev ? '✏️ Modificar clase o evento' : '+ Nuevo evento';
  $('del').style.display = ev ? '' : 'none';
  dlg.showModal();
  if (!ev) form.title.focus();
}

const dlgDayPrev = $('dlgDayPrev');
if (dlgDayPrev) {
  dlgDayPrev.onclick = () => {
    if (!form.date.value) form.date.value = todayISO();
    const cur = parse(form.date.value);
    cur.setDate(cur.getDate() - 1);
    form.date.value = iso(cur);
  };
}
const dlgDayToday = $('dlgDayToday');
if (dlgDayToday) {
  dlgDayToday.onclick = () => {
    form.date.value = todayISO();
  };
}
const dlgDayNext = $('dlgDayNext');
if (dlgDayNext) {
  dlgDayNext.onclick = () => {
    if (!form.date.value) form.date.value = todayISO();
    const cur = parse(form.date.value);
    cur.setDate(cur.getDate() + 1);
    form.date.value = iso(cur);
  };
}
document.querySelectorAll('.dlg-quick-slots .slot-pill').forEach(btn => {
  btn.onclick = () => {
    form.start.value = btn.dataset.s;
    form.end.value = btn.dataset.e;
  };
});

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

/* ---------- Control del Temporizador Pomodoro ---------- */
function togglePomodoro() {
  if (pomoState.running) {
    clearInterval(pomoState.timerId);
    pomoState.timerId = null;
    pomoState.running = false;
    updatePomoDisplay();
  } else {
    pomoState.running = true;
    updatePomoDisplay();
    pomoState.timerId = setInterval(() => {
      if (pomoState.secondsLeft > 0) {
        pomoState.secondsLeft--;
        updatePomoDisplay();
      } else {
        clearInterval(pomoState.timerId);
        pomoState.timerId = null;
        pomoState.running = false;
        pomoState.completedToday++;
        render();
        alert('🔔 ¡Sesión completada! Tómate un descanso merecido.');
      }
    }, 1000);
  }
}

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

const countdownBarEl = $('countdownBar');
if (countdownBarEl) {
  countdownBarEl.onclick = e => {
    const pill = e.target.closest('[data-cd-date]');
    if (!pill) return;
    const d = pill.dataset.cdDate;
    const isTask = pill.dataset.cdTask === '1';
    if (isTask) {
      state.view = 'tasks';
      save();
      render();
    } else if (d) {
      go('day', d);
    }
  };
}

$('view').onclick = async e => {
  // 1. Selector de modo semanal en 1 toque
  const wmBtn = e.target.closest('[data-wmode]');
  if (wmBtn) {
    state.prefs.weekMode = wmBtn.dataset.wmode;
    save();
    render();
    return;
  }

  // 2. Abrir ajustes desde la vista
  const openSetBtn = e.target.closest('[data-open-settings]');
  if (openSetBtn) {
    openSettingsModal();
    return;
  }

  // 3. Controles de Pomodoro
  const pomoModeBtn = e.target.closest('[data-pomo-mins]');
  if (pomoModeBtn) {
    if (pomoState.timerId) clearInterval(pomoState.timerId);
    pomoState.running = false;
    const minsVal = parseInt(pomoModeBtn.dataset.pomoMins, 10) || 25;
    pomoState.totalSeconds = minsVal * 60;
    pomoState.secondsLeft = minsVal * 60;
    pomoState.modeLabel = pomoModeBtn.dataset.pomoLbl || `${minsVal}m`;
    render();
    return;
  }
  if (e.target.closest('#pomoToggleBtn')) {
    togglePomodoro();
    return;
  }
  if (e.target.closest('#pomoResetBtn')) {
    if (pomoState.timerId) clearInterval(pomoState.timerId);
    pomoState.running = false;
    pomoState.secondsLeft = pomoState.totalSeconds || (25 * 60);
    render();
    return;
  }

  // 4. Pestaña Asignaturas: Cambio de grupo en vivo (G1 / G2 / G3)
  const liveGroupBtn = e.target.closest('[data-live-subj]');
  if (liveGroupBtn) {
    const subj = liveGroupBtn.dataset.liveSubj;
    const g = liveGroupBtn.dataset.liveGrp;
    let cur = Array.isArray(state.prefs.subjectGroups[subj]) ? [...state.prefs.subjectGroups[subj]] : ['G3'];
    if (cur.includes(g)) {
      cur = cur.filter(x => x !== g);
    } else {
      cur = [...cur, g];
    }
    state.prefs.subjectGroups[subj] = cur;
    save();
    render();
    // Si ya tiene clases cargadas en la agenda, actualizamos las prácticas de ese grupo automáticamente
    const hasUniEvents = state.events.some(ev => ev.cal === 'uni' || ev.cal === 'prac');
    if (hasUniEvents) {
      await syncOfficialClassesWithCurrentGroups(true);
    }
    return;
  }

  // 5. Pestaña Asignaturas: Contador de Asistencia y Faltas
  const attBtn = e.target.closest('[data-att-subj]');
  if (attBtn) {
    const subj = attBtn.dataset.attSubj;
    const op = attBtn.dataset.attOp;
    if (!state.prefs.subjectData) state.prefs.subjectData = {};
    if (!state.prefs.subjectData[subj]) {
      state.prefs.subjectData[subj] = { attended: 0, missed: 0, grades: [] };
    }
    if (op === 'att+') state.prefs.subjectData[subj].attended = (state.prefs.subjectData[subj].attended || 0) + 1;
    else if (op === 'miss+') state.prefs.subjectData[subj].missed = (state.prefs.subjectData[subj].missed || 0) + 1;
    else if (op === 'reset') {
      state.prefs.subjectData[subj].attended = 0;
      state.prefs.subjectData[subj].missed = 0;
    }
    save();
    render();
    return;
  }

  // 6. Pestaña Asignaturas: Calculadora de Notas Ponderadas
  const addGradeBtn = e.target.closest('[data-add-grade]');
  if (addGradeBtn) {
    const subj = addGradeBtn.dataset.addGrade;
    const nameInp = document.getElementById(`gn_${subj}`);
    const scoreInp = document.getElementById(`gs_${subj}`);
    const weightInp = document.getElementById(`gw_${subj}`);
    const name = nameInp ? nameInp.value.trim() : '';
    const score = scoreInp ? parseFloat(scoreInp.value) : NaN;
    const weight = weightInp ? parseFloat(weightInp.value) : NaN;
    if (!name || isNaN(weight) || weight <= 0 || isNaN(score) || score < 0 || score > 10) {
      alert('Introduce un concepto (ej: Parcial 1), tu nota de 0 a 10 y su peso en % (ej: 40).');
      return;
    }
    if (!state.prefs.subjectData) state.prefs.subjectData = {};
    if (!state.prefs.subjectData[subj]) {
      state.prefs.subjectData[subj] = { attended: 0, missed: 0, grades: [] };
    }
    if (!state.prefs.subjectData[subj].grades) state.prefs.subjectData[subj].grades = [];
    state.prefs.subjectData[subj].grades.push({
      id: crypto.randomUUID(),
      name,
      weight,
      score
    });
    save();
    render();
    return;
  }

  const delGradeBtn = e.target.closest('[data-del-grade]');
  if (delGradeBtn) {
    const gid = delGradeBtn.dataset.delGrade;
    const subj = delGradeBtn.dataset.gradeSubj;
    if (state.prefs.subjectData && state.prefs.subjectData[subj] && state.prefs.subjectData[subj].grades) {
      state.prefs.subjectData[subj].grades = state.prefs.subjectData[subj].grades.filter(x => x.id !== gid);
      save();
      render();
    }
    return;
  }

  // 7. Pestaña Tareas y Entregas
  if (e.target.closest('#btnAddNewTask')) {
    const titleInp = $('newTaskTitle');
    const calInp = $('newTaskCal');
    const dueInp = $('newTaskDue');
    const prioInp = $('newTaskPrio');
    const title = titleInp ? titleInp.value.trim() : '';
    if (!title) {
      alert('Escribe el título de la tarea o memoria a entregar.');
      return;
    }
    if (!state.prefs.tasks) state.prefs.tasks = [];
    state.prefs.tasks.unshift({
      id: crypto.randomUUID(),
      title,
      cal: calInp ? calInp.value : 'prac',
      due: dueInp ? dueInp.value : todayISO(),
      prio: prioInp ? prioInp.value : 'media',
      done: false
    });
    save();
    render();
    return;
  }

  const toggleTaskBtn = e.target.closest('[data-toggle-task]');
  if (toggleTaskBtn) {
    const tid = toggleTaskBtn.dataset.toggleTask;
    const t = (state.prefs.tasks || []).find(x => x.id === tid);
    if (t) {
      t.done = !t.done;
      save();
      render();
    }
    return;
  }

  const delTaskBtn = e.target.closest('[data-del-task]');
  if (delTaskBtn) {
    const tid = delTaskBtn.dataset.delTask;
    state.prefs.tasks = (state.prefs.tasks || []).filter(x => x.id !== tid);
    save();
    render();
    return;
  }

  // 8. Aplazar o reprogramar desde Hoy (Enfoque)
  const delayBtn = e.target.closest('[data-delay-id]');
  if (delayBtn) {
    const ev = state.events.find(x => x.id === delayBtn.dataset.delayId);
    if (ev) {
      const tomorrow = addDays(new Date(), 1);
      ev.date = iso(tomorrow);
      pushOp({ op: 'upsert', row: toRow(ev) });
      render();
      alert(`"${ev.title}" movido a mañana sin agobios.`);
    }
    return;
  }

  const reprogramBtn = e.target.closest('#focusReprogramBtn');
  if (reprogramBtn) {
    const todayStr = todayISO();
    const pending = state.events.filter(x => x.date === todayStr && x.cal !== 'uni' && x.cal !== 'prac');
    if (!pending.length) {
      alert('No tienes tareas pendientes para reprogramar hoy.');
      return;
    }
    const tomorrow = addDays(new Date(), 1);
    pending.forEach(ev => {
      ev.date = iso(tomorrow);
      pushOp({ op: 'upsert', row: toRow(ev) });
    });
    render();
    alert(`Listo: ${pending.length} tareas se han aplazado a mañana.`);
    return;
  }

  // 9. Eventos normales del calendario
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
  if (cell) go('day', cell.dataset.day);
};

/* ---------- Vaciado Mental (Brain Dump) & Planificador de Estudio ---------- */
const brainDumpBtn = $('brainDumpBtn');
const brainDumpDlg = $('brainDumpDlg');
const brainDumpForm = $('brainDumpForm');
const dumpClose = $('dumpClose');
const dumpList = $('dumpList');
const dumpCount = $('dumpCount');

const studyPlanBtn = $('studyPlanBtn');
const studyPlanDlg = $('studyPlanDlg');
const studyPlanForm = $('studyPlanForm');
const planClose = $('planClose');
const planExamSelect = $('planExamSelect');

let brainDumpItems = [];
const dumpStorageKey = () => `agenda.dump.${uid || 'anon'}`;

function loadBrainDumps() {
  try {
    brainDumpItems = JSON.parse(localStorage.getItem(dumpStorageKey()) || '[]');
  } catch (e) { brainDumpItems = []; }
  renderDumpList();
}

function saveBrainDumps() {
  localStorage.setItem(dumpStorageKey(), JSON.stringify(brainDumpItems));
  renderDumpList();
}

function renderDumpList() {
  if (!dumpCount || !dumpList) return;
  dumpCount.textContent = brainDumpItems.length;
  if (!brainDumpItems.length) {
    dumpList.innerHTML = `<div style="padding:12px;text-align:center;color:var(--muted);font-size:12px;">Tu mente está despejada ✨</div>`;
    return;
  }
  dumpList.innerHTML = brainDumpItems.map(item => {
    const cal = getCal(item.cal);
    return `
      <div class="dump-entry" style="--c:${cal.color}">
        <span class="agenda-cal-badge" style="--c:${cal.color}">${cal.name}</span>
        <span class="dump-entry-text">${esc(item.text)} (${item.mins} min)</span>
        <div style="display:flex;gap:4px;">
          <button type="button" class="dump-entry-btn" data-schedule-id="${item.id}" title="Agendar para hoy">Hoy</button>
          <button type="button" class="dump-entry-btn" data-del-dump="${item.id}" title="Descartar">✕</button>
        </div>
      </div>
    `;
  }).join('');
}

if (brainDumpBtn) {
  brainDumpBtn.onclick = () => {
    loadBrainDumps();
    brainDumpDlg.showModal();
  };
}
if (dumpClose) dumpClose.onclick = () => brainDumpDlg.close();

if (brainDumpForm) {
  brainDumpForm.onsubmit = (e) => {
    e.preventDefault();
    const text = $('dumpText').value.trim();
    const cal = $('dumpCal').value;
    const minsVal = parseInt($('dumpMins').value, 10);
    if (!text) return;

    brainDumpItems.unshift({
      id: crypto.randomUUID(),
      text,
      cal,
      mins: minsVal,
      date: new Date().toISOString()
    });
    $('dumpText').value = '';
    saveBrainDumps();
  };
}

if (dumpList) {
  dumpList.onclick = (e) => {
    const delBtn = e.target.closest('[data-del-dump]');
    if (delBtn) {
      brainDumpItems = brainDumpItems.filter(x => x.id !== delBtn.dataset.delDump);
      saveBrainDumps();
      return;
    }
    const schedBtn = e.target.closest('[data-schedule-id]');
    if (schedBtn) {
      const item = brainDumpItems.find(x => x.id === schedBtn.dataset.scheduleId);
      if (!item) return;

      const newEv = {
        id: crypto.randomUUID(),
        title: item.text,
        cal: item.cal,
        date: todayISO(),
        start: '17:00',
        end: '18:00',
        notes: 'Generado desde Vaciado Mental'
      };
      state.events.push(newEv);
      pushOp({ op: 'upsert', row: toRow(newEv) });
      render();

      brainDumpItems = brainDumpItems.filter(x => x.id !== item.id);
      saveBrainDumps();
      alert(`"${item.text}" se ha colocado en tu agenda de hoy a las 17:00.`);
    }
  };
}

/* ---------- Planificador Inteligente de Exámenes (Hacia Atrás) ---------- */
if (studyPlanBtn) {
  studyPlanBtn.onclick = () => {
    const exams = state.events.filter(e => e.cal === 'exam' || /examen|prueba/i.test(e.title));
    if (!exams.length) {
      alert('Primero añade o sube algún examen en la agenda (o importa tu calendario de exámenes).');
      return;
    }
    planExamSelect.innerHTML = exams.map(e => `
      <option value="${e.id}">${e.title} (${e.date})</option>
    `).join('');
    studyPlanDlg.showModal();
  };
}
if (planClose) planClose.onclick = () => studyPlanDlg.close();

if (studyPlanForm) {
  studyPlanForm.onsubmit = async (e) => {
    e.preventDefault();
    const examId = planExamSelect.value;
    const exam = state.events.find(x => x.id === examId);
    if (!exam) return;

    const numTopics = parseInt($('planTopics').value, 10);
    const diff = $('planDifficulty').value;
    const hours = parseFloat($('planDailyHours').value);
    const startTime = $('planStartTime').value;

    const [sh, sm] = startTime.split(':').map(Number);
    const endMinutes = sh * 60 + sm + Math.round(hours * 60);
    const endTime = `${pad(Math.floor(endMinutes / 60))}:${pad(endMinutes % 60)}`;

    const examDate = parse(exam.date);
    const today = new Date();
    today.setHours(0,0,0,0);
    const diffDays = Math.floor((examDate - today) / (1000 * 60 * 60 * 24));

    if (diffDays <= 0) {
      alert('La fecha de este examen ya ha pasado o es hoy.');
      return;
    }

    let sessionsPerTopic = 1;
    if (diff === 'dificil') sessionsPerTopic = 2;

    const availableDays = Math.max(1, diffDays - 1);
    const generatedEvents = [];
    let currentTopic = 1;
    let sessionCount = 0;

    for (let d = 1; d <= availableDays; d++) {
      const targetDate = addDays(today, d);
      if (sameDay(targetDate, examDate)) continue;

      let title = '';
      if (currentTopic <= numTopics) {
        title = `Estudio: ${exam.title.replace(/^Examen:\s*/i, '')} (Tema ${currentTopic})`;
        sessionCount++;
        if (sessionCount >= sessionsPerTopic) {
          currentTopic++;
          sessionCount = 0;
        }
      } else {
        title = `Repaso General: ${exam.title.replace(/^Examen:\s*/i, '')}`;
      }

      const ev = {
        id: crypto.randomUUID(),
        title,
        cal: 'exam',
        date: iso(targetDate),
        start: startTime,
        end: endTime,
        notes: `Sesión de estudio planificada automáticamente para ${exam.title}`
      };
      generatedEvents.push(ev);
    }

    studyPlanDlg.close();
    await batchSyncEvents([], generatedEvents);
    alert(`¡Plan creado! Se han repartido ${generatedEvents.length} sesiones de estudio hasta el día del examen.`);
  };
}

/* ---------- Botón de Borrado de Horario (Limpiar Clases/Exámenes de golpe) ---------- */
const clearCalBtn = $('clearCalBtn');
if (clearCalBtn) {
  clearCalBtn.onclick = async () => {
    const uniEvents = state.events.filter(e => e.cal === 'uni' || e.cal === 'prac' || e.cal === 'exam');
    if (!uniEvents.length) {
      alert('No hay clases ni exámenes que limpiar en tu agenda.');
      return;
    }

    const confirmMsg = `¿Seguro que quieres borrar todas las clases, prácticas y exámenes importados (${uniEvents.length} eventos)?\n\n(Tus notas personales, JMV y Catequesis NO se borrarán).`;
    if (!confirm(confirmMsg)) return;

    const deleteIds = uniEvents.map(e => e.id);
    await batchSyncEvents(deleteIds, []);
    alert('¡Horario universitario limpiado por completo en 1 toque!');
  };
}

/* ---------- Bloqueo extra anti-zoom para iOS Safari ---------- */
document.addEventListener('gesturestart', e => e.preventDefault());
document.addEventListener('gesturechange', e => e.preventDefault());
document.addEventListener('gestureend', e => e.preventDefault());

/* ---------- Inicialización segura ---------- */
load();
loadBrainDumps();
render();
renderQuickSubjectList();
setInterval(() => { if (state.view === 'day' || state.view === 'week') render(); }, 5 * 60 * 1000);
