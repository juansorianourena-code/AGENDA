// Cloudflare Pages Function: /calendar/<token>.ics
// Genera un feed iCalendar con los eventos del usuario para suscribirse desde Apple Calendar.
const SUPABASE_URL = 'https://cuyaibqwxlaxaigjjinc.supabase.co';
const SUPABASE_KEY = 'sb_publishable_iF-bvLWJsjpsK6nvwGSYlA_8UxZhzgv';

const CAL_NAMES = {
  uni: 'Universidad', exam: 'Exámenes', prac: 'Prácticas',
  jmv: 'JMV', cat: 'Catequesis', pers: 'Personal',
};

const TIMEZONE = [
  'BEGIN:VTIMEZONE', 'TZID:Europe/Madrid',
  'BEGIN:DAYLIGHT', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0200', 'TZNAME:CEST',
  'DTSTART:19700329T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU', 'END:DAYLIGHT',
  'BEGIN:STANDARD', 'TZOFFSETFROM:+0200', 'TZOFFSETTO:+0100', 'TZNAME:CET',
  'DTSTART:19701025T030000', 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU', 'END:STANDARD',
  'END:VTIMEZONE',
];

const esc = s => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

function fold(line) {
  const out = [];
  let rest = line;
  while (rest.length > 70) { out.push(rest.slice(0, 70)); rest = ' ' + rest.slice(70); }
  out.push(rest);
  return out.join('\r\n');
}

const ymd = d => d.replace(/-/g, '');
const hms = t => t.slice(0, 5).replace(':', '') + '00';
function addDay(d) {
  const [y, m, dd] = d.split('-').map(Number);
  const x = new Date(Date.UTC(y, m - 1, dd + 1));
  return `${x.getUTCFullYear()}${String(x.getUTCMonth() + 1).padStart(2, '0')}${String(x.getUTCDate()).padStart(2, '0')}`;
}
function plusHour(d, t) {
  const [h, m] = t.split(':').map(Number);
  const total = h * 60 + m + 60;
  if (total >= 24 * 60) return { date: addDay(d), time: '235900' };
  return { date: ymd(d), time: String(Math.floor(total / 60)).padStart(2, '0') + String(total % 60).padStart(2, '0') + '00' };
}

function alarm(trigger, text) {
  return ['BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(text)}`, `TRIGGER:${trigger}`, 'END:VALARM'];
}

function buildEvent(e, stamp) {
  const timed = !!e.start_time;
  const L = ['BEGIN:VEVENT', `UID:${e.id}@agenda`, `DTSTAMP:${stamp}`, `SUMMARY:${esc(e.title)}`];
  if (timed) {
    L.push(`DTSTART;TZID=Europe/Madrid:${ymd(e.date)}T${hms(e.start_time)}`);
    if (e.end_time) L.push(`DTEND;TZID=Europe/Madrid:${ymd(e.date)}T${hms(e.end_time)}`);
    else { const p = plusHour(e.date, e.start_time.slice(0, 5)); L.push(`DTEND;TZID=Europe/Madrid:${p.date}T${p.time}`); }
  } else {
    L.push(`DTSTART;VALUE=DATE:${ymd(e.date)}`, `DTEND;VALUE=DATE:${addDay(e.date)}`);
  }
  L.push(`CATEGORIES:${esc(CAL_NAMES[e.cal] || e.cal)}`);
  if (e.notes) L.push(`DESCRIPTION:${esc(e.notes)}`);

  // Avisos: los gestiona el propio Apple Calendar
  if (e.cal === 'exam') {
    if (timed) { L.push(...alarm('-P1D', `Mañana: ${e.title}`), ...alarm('-PT2H', `En 2 horas: ${e.title}`)); }
    else { L.push(...alarm('-PT4H', `Mañana: ${e.title}`), ...alarm('PT8H', `Hoy: ${e.title}`)); }
  } else if (timed) {
    L.push(...alarm('-PT30M', `En 30 min: ${e.title}`));
  } else {
    L.push(...alarm('PT8H', `Hoy: ${e.title}`));
  }
  L.push('END:VEVENT');
  return L;
}

export async function onRequestGet({ params }) {
  const token = String(params.token || '').replace(/\.ics$/i, '');
  if (!/^[a-f0-9]{32,64}$/.test(token)) return new Response('No encontrado', { status: 404 });

  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/feed_events`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_token: token }),
  });
  if (!r.ok) return new Response('Error al leer la agenda', { status: 502 });
  const events = await r.json();

  const now = new Date();
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Agenda//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'X-WR-CALNAME:Agenda', 'X-WR-TIMEZONE:Europe/Madrid',
    'REFRESH-INTERVAL;VALUE=DURATION:PT15M', 'X-PUBLISHED-TTL:PT15M',
    ...TIMEZONE,
    ...events.flatMap(e => buildEvent(e, stamp)),
    'END:VCALENDAR',
  ];
  return new Response(lines.map(fold).join('\r\n') + '\r\n', {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  });
}
