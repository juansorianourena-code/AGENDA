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

// Paleta armónica por asignatura (respetando blanco, beige, verde oliva, marino, tostado, gris pizarra)
const SUBJECT_COLORS = {
  'MOTORES': '#1f2a44',                                    // Azul marino elegante
  'EDAFOLOGÍA Y CLIMATOLOGÍA': '#6b7040',                  // Verde oliva natural
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

function getEventColor(e) {
  if (e.cal === 'exam') return '#111111'; // Exámenes siempre en negro destacado
  if (e.cal === 'jmv') return '#6b7040';  // JMV verde oliva
  if (e.cal === 'cat') return '#a3a77a';  // Catequesis salvia claro
  if (e.cal === 'pers') return '#b3a47f'; // Personal arena tostado

  // Si es clase o práctica de la universidad, asignar color propio por asignatura
  const subj = (e.subject || e.title || '').toUpperCase().trim();
  for (const [key, color] of Object.entries(SUBJECT_COLORS)) {
    if (subj.includes(key)) return color;
  }
  return getCal(e.cal).color;
}

const H0 = 6, H1 = 24, HOUR = 48; // horas visibles y alto por hora (px)
const PREFS = 'agenda.prefs';
const LEGACY = 'agenda.v1';

const state = {
  view: 'agenda',
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
  if (state.view === 'focus') v.innerHTML = focusView();
  else if (state.view === 'agenda') v.innerHTML = agendaView();
  else if (state.view === 'day') v.innerHTML = timeGrid([state.date]);
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
    const m = mondayOf(d), e = addDays(m, 6);
    title = `${m.getDate()} – ${e.getDate()} ${fmt(e, { month: 'long' })}`; sub = String(e.getFullYear());
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

function timeGrid(days) {
  const n = H1 - H0;
  const cols = days.length;
  const head = days.map(d =>
    `<div class="${sameDay(d, new Date()) ? 'today' : ''}">${fmt(d, { weekday: 'short' })}<b>${d.getDate()}</b></div>`).join('');
  const allday = days.map(d =>
    `<div>${eventsOn(iso(d)).filter(e => !e.start).map(e =>
      `<button class="ev chipev" data-id="${e.id}" style="--c:${getCal(e.cal).color}">${esc(e.title)}</button>`).join('')}</div>`).join('');
  const hours = [...Array(n)].map((_, i) => `<div>${pad(H0 + i)}:00</div>`).join('');

  // Algoritmo para evitar solapamientos horizontales entre eventos coincidentes
  function layoutDayEvents(evs) {
    if (!evs.length) return [];
    const timed = evs.filter(e => e.start).sort((a, b) => mins(a.start) - mins(b.start) || (b.end ? mins(b.end) : 0) - (a.end ? mins(a.end) : 0));
    if (!timed.length) return [];

    // Agrupar en clusters continuos de solapamiento
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

    // Asignar columnas dentro de cada cluster
    const layouted = [];
    clusters.forEach(cluster => {
      const columns = []; // columnas con el tiempo de fin del último evento
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
      const h = Math.max((end - s) / 60 * HOUR, 22);

      const totalCols = e._totalCols || 1;
      const colIdx = e._col || 0;
      const widthPct = (100 / totalCols).toFixed(2);
      const leftPct = (colIdx * (100 / totalCols)).toFixed(2);

      return `<button class="ev" data-id="${e.id}" style="--c:${getEventColor(e)};top:${top}px;height:${h}px;left:calc(${leftPct}% + 1px);width:calc(${widthPct}% - 2px);">
        ${esc(e.title)}
        <small>${e.start}${e.end ? '–' + e.end : ''}</small>
      </button>`;
    }).join('');

  // Líneas guía de descanso (10:30 y 12:15) y fin de clases de mañana (14:00) de lunes a viernes
    let guidesHtml = '';
    const dayNum = d.getDay();
    if (dayNum >= 1 && dayNum <= 5) {
      const topDesc1 = ((10 * 60 + 30) - H0 * 60) / 60 * HOUR;
      const topDesc2 = ((12 * 60 + 15) - H0 * 60) / 60 * HOUR;
      const topFin = ((14 * 60) - H0 * 60) / 60 * HOUR;

      // Líneas puramente visuales sin texto para no solaparse nunca con los títulos de los eventos
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

  const isWeek = cols === 7;
  return `<div class="tg-wrap" style="--cols:${cols};--n:${n}">
    <div class="tg-head ${isWeek ? 'week-grid' : ''}"><div></div>${head}</div>
    <div class="tg-allday ${isWeek ? 'week-grid' : ''}"><div></div>${allday}</div>
    <div class="tg-body ${isWeek ? 'week-grid' : ''}"><div class="tg-hours">${hours}</div>${colsHtml}</div>
  </div>`;
}

/* ---------- Vista Modo Enfoque Anti-Estrés ("Hoy en calma") ---------- */
function focusView() {
  const todayStr = todayISO();
  const dayEvs = eventsOn(todayStr);

  const classes = dayEvs.filter(e => e.cal === 'uni' || e.cal === 'prac');
  const tasksAndExams = dayEvs.filter(e => e.cal !== 'uni' && e.cal !== 'prac');

  let html = `
    <div class="focus-wrap">
      <div class="focus-hero">
        <h2>Hoy solo importa esto</h2>
        <p>No pienses en toda la semana ni en el cuatrimestre entero. Concéntrate en cumplir lo de hoy paso a paso y tu mente descansará.</p>
      </div>
  `;

  // 1. Clases de hoy (si las hay)
  html += `
    <div class="focus-card">
      <div class="focus-card-header">
        <h3>🏛️ Clases y Universidad hoy (${classes.length})</h3>
        <span class="muted-text">${fmt(new Date(), { weekday: 'short', day: 'numeric', month: 'short' })}</span>
      </div>
      <div class="focus-item-list">
  `;
  if (!classes.length) {
    html += `<div style="padding:12px;color:var(--muted);font-size:13px;">Hoy no tienes clases programadas. ¡Aprovecha para descansar o adelantar!</div>`;
  } else {
    classes.forEach(e => {
      const cal = getCal(e.cal);
      html += `
        <div class="focus-item" style="--c:${cal.color}">
          <div>
            <b>${e.start || 'Hora sin definir'} ${e.end ? '– ' + e.end : ''}</b>
            <div style="font-weight:600;margin-top:2px;">${esc(e.title)}</div>
          </div>
          <span class="agenda-cal-badge" style="--c:${cal.color}">${cal.name}</span>
        </div>
      `;
    });
  }
  html += `</div></div>`;

  // 2. Objetivos de estudio y tareas de la tarde (máximo 3 prioridades)
  html += `
    <div class="focus-card">
      <div class="focus-card-header">
        <h3>🎯 Mis 3 prioridades para la tarde</h3>
        <button type="button" class="focus-btn-reprogram" id="focusReprogramBtn" title="Mover lo no hecho a mañana">🔄 Reajustar a mañana</button>
      </div>
      <div class="focus-item-list">
  `;
  if (!tasksAndExams.length) {
    html += `
      <div style="padding:12px;color:var(--muted);font-size:13px;">
        No tienes tareas pendientes para hoy. Puedes pulsar <b>+</b> para añadir una tarea de estudio o soltar una idea con <b>🧠 Apuntar idea</b>.
      </div>
    `;
  } else {
    tasksAndExams.forEach(e => {
      const cal = getCal(e.cal);
      html += `
        <div class="focus-item" style="--c:${cal.color}">
          <div>
            <div style="font-weight:600;">${esc(e.title)}</div>
            <small style="color:var(--muted);">${e.start ? e.start + ' • ' : ''}${cal.name}</small>
          </div>
          <button type="button" class="focus-btn-reprogram" data-delay-id="${e.id}" title="Pasar para mañana">Pasar a mañana</button>
        </div>
      `;
    });
  }
  html += `</div></div></div>`;

  return html;
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
  for (const s of OFFICIAL_SUBJECTS) {
    if (norm.includes(s)) return s;
  }
  // Si no coincide con la lista oficial, ignorar fragmentos de pie de página o texto residual
  if (/VISITA|TARANC[OÓ]N|AULA|EDIFICIO|BORRADOR|CURSO/i.test(rawBlock)) return '';
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
      const dm = it.str.trim().match(/^(\d{1,2})-(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)$/i);
      if (dm) {
        const day = parseInt(dm[1], 10);
        const month = MONTHS_MAP[dm[2].toLowerCase()];
        // Los meses de enero a julio en convocatorias ordinarias pertenecen al año siguiente (ej: 2027)
        const year = month >= 8 ? academicYear : academicYear + 1;
        const isoDate = `${year}-${pad(month + 1)}-${pad(day)}`;
        dateHeaders.push({ x: it.transform[4], y: it.transform[5], date: isoDate, str: it.str.trim() });
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
              // Buscar textos que estén en la misma columna y justo arriba de la hora
              const aboveChunks = atomicItems.filter(it => {
                const dx = it.x >= minX && it.x <= maxX;
                const dy = tEntry.y - it.y;
                return dx && dy > 0 && dy < 75 && !it.isTime;
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

// Carga instantánea verificada de la base de datos oficial
const btnApplyOfficial = $('btnApplyOfficial');
if (btnApplyOfficial) {
  btnApplyOfficial.onclick = () => {
    const courseType = $('quickCourseSelect').value;
    const group = $('quickGroupSelect').value; // G1, G2, G3, none
    const data = window.UCLM_OFFICIAL_DATA;
    if (!data) {
      alert('Datos oficiales no disponibles.');
      return;
    }

    let itemsToAdd = [];
    if (courseType === '2_cuat1') {
      itemsToAdd = data.classes.filter(c => {
        if (c.is_prac) {
          if (group === 'none') return false;
          if (group !== 'all' && c.group !== 'all' && c.group !== group) return false;
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
      itemsToAdd = data.exams.filter(e => e.course === targetCourse).map(e => {
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

    if (!itemsToAdd.length) {
      alert('No se encontraron citas para la selección.');
      return;
    }

    // Volcar a la agenda y a la nube
    for (const ev of itemsToAdd) {
      state.events.push(ev);
      pushOp({ op: 'upsert', row: toRow(ev) });
    }

    render();
    importDlg.close();
    alert(`¡Horario oficial cargado a la perfección! Se han añadido ${itemsToAdd.length} clases y prácticas verificadas.`);
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

// Eventos de controles de filtro
subjectFilterList.onchange = (e) => {
  const chk = e.target;
  if (!chk) return;
  const pill = chk.closest('.sub-pill');
  if (chk.checked) {
    activeSelectedSubjects.add(chk.value);
    pill.classList.add('checked');
  } else {
    activeSelectedSubjects.delete(chk.value);
    pill.classList.remove('checked');
  }
  renderUclmPreview();
};

includePracticasSelect.onchange = () => {
  groupSelectContainer.style.opacity = includePracticasSelect.value === 'yes' ? '1' : '0.4';
  groupSelectContainer.style.pointerEvents = includePracticasSelect.value === 'yes' ? 'auto' : 'none';
  renderUclmPreview();
};

groupPracticaSelect.onchange = () => renderUclmPreview();
courseLevelSelect.onchange = () => renderUclmPreview();
if (examConvocatoriaSelect) examConvocatoriaSelect.onchange = () => renderUclmPreview();

previewList.onclick = (e) => {
  const delBtn = e.target.closest('.p-del');
  if (delBtn) {
    const id = delBtn.dataset.id;
    parsedEventsRaw = parsedEventsRaw.filter(x => x.id !== id);
    renderUclmPreview();
  }
};

importConfirm.onclick = async () => {
  const toAdd = getFilteredEvents();
  if (!toAdd.length) {
    alert('No hay clases ni eventos seleccionados con los filtros actuales.');
    return;
  }

  for (let ev of toAdd) {
    state.events.push(ev);
    pushOp({ op: 'upsert', row: toRow(ev) });
  }

  render();
  importDlg.close();
  alert(`¡Listo! Se han añadido ${toAdd.length} clases y prácticas a tu agenda y sincronizado en todos tus dispositivos.`);
};

/* ---------- Apple Calendar Feed Dialog con Selección de Categorías ---------- */
const feedDlg = $('feedDlg');
const feedUrlInput = $('feedUrl');
const feedSubLink = $('feedSub');
const feedCalsToggles = $('feedCalsToggles');
const feedSaveState = $('feedSaveState');

let activeFeedCals = new Set(['exam', 'prac', 'jmv', 'cat', 'pers']); // uni desmarcado por defecto para no saturar

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

feedCalsToggles.onchange = async (e) => {
  const chk = e.target;
  if (!chk) return;
  const pill = chk.closest('.sub-pill');
  if (chk.checked) {
    activeFeedCals.add(chk.value);
    pill.classList.add('checked');
  } else {
    activeFeedCals.delete(chk.value);
    pill.classList.remove('checked');
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
  if (state.view === 'agenda') d.setDate(d.getDate() + 7 * dir);
  else if (state.view === 'day') d.setDate(d.getDate() + dir);
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
  studyPlanForm.onsubmit = (e) => {
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
    let reviewDays = 2;
    if (diff === 'dificil') { sessionsPerTopic = 2; reviewDays = 3; }
    else if (diff === 'facil') { reviewDays = 1; }

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
      state.events.push(ev);
      pushOp({ op: 'upsert', row: toRow(ev) });
    }

    render();
    studyPlanDlg.close();
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

    const confirmMsg = `¿Seguro que quieres borrar todas las clases, prácticas y exámenes importados (${uniEvents.length} eventos)?\n\n(Tus notas personales, JMV y Catequesis NO se borrarán). Así podrás volver a subir tu PDF limpio desde cero.`;
    if (!confirm(confirmMsg)) return;

    for (const ev of uniEvents) {
      pushOp({ op: 'delete', id: ev.id });
    }
    state.events = state.events.filter(e => e.cal !== 'uni' && e.cal !== 'prac' && e.cal !== 'exam');
    render();
    alert('¡Horario universitario limpiado por completo! Ya puedes subir el PDF con los ajustes afinados.');
  };
}
$('view').addEventListener('click', (e) => {
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
});

/* ---------- Inicialización segura ---------- */
load();
loadBrainDumps();
render();
setInterval(() => { if (state.view === 'day' || state.view === 'week') render(); }, 5 * 60 * 1000);
