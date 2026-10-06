/* Athanor — your own events (Rites & Altar → Events): their rules, their coming times, and the ring queue.
 *
 * The page works out when an event rings (the astronomy lives here, in JavaScript); the app only rings what it is
 * handed. In the app the definitions are kept by Android.getCustomEvents() / setCustomEvents(defs, queue); in a
 * browser in localStorage 'l777events', where nothing rings.
 *
 * An event (a "definition"):
 *   {id, title, notes, on, lead (minutes before; 0 = at the time), when, tap}
 *   when.kind
 *     'once'    date 'YYYY-MM-DD', time 'HH:MM'
 *     'repeat'  every 'day' | 'week' | 'month', time 'HH:MM', days [getDay numbers] (week), mday 1–31 (month; a
 *               shorter month rings on its last day)
 *     'sky'     sky 'hour'    planet (planets id), days [getDay] (none = every day): the start of each hour of that
 *                             planet; a planetary day runs from sunrise to sunrise
 *               sky 'moon'    phases [moon_phases ids]: the moment the Moon reaches that phase
 *               sky 'ingress' to 'sign' | 'sign:<signs id>' | 'decan' | 'decan:<0–35>': the Sun entering it
 *               sky 'sun'     point 'rise' | 'noon' | 'set' | 'midnight' (solar noon / midnight), offset (minutes,
 *                             + after, − before)
 *     'spirit'  n 1–72, anyDay: the start of each of its rank's hours on the rank planet's weekday (any day when
 *               anyDay) when the Moon is 2, 4 … 14 days old: the windows Rites & Altar shows under Best times
 *     'timer'   first {n, unit 'min'|'h'}, every {n, unit} or null, times (rings in all; 0 = until switched off),
 *               start (epoch ms of the first ring, set when it is saved or switched on)
 *   tap  {open 'page' | 'none', spirit n | null, compass a choice as Rites & Altar's reminder compass keeps | null}
 * Local times are built from the local date and clock time (never by adding 24 h), so they hold across DST.
 *
 *   Events.load()                   the definitions
 *   Events.save(defs, ctx)          keeps them and sets their reminders; the app's answer ({ok, queued, next, …})
 *   Events.sync(ctx)                sets the reminders again from the kept definitions, exactly as they were saved
 *   Events.refresh()                Promise: the same, at the app's start (index.html), loading what it needs first
 *   Events.occurrences(def, ctx, from, to, max)   [{t, what}]: its times from <= t < to (before the lead)
 *   Events.next(def, ctx, now)      the first after now, looking LOOK_DAYS ahead, or null
 *   Events.summary(def, ctx)        one line saying what it follows
 *   Events.item(def, occ, ctx)      one ring for the app: {id, at, title, text, open}
 * ctx = {loc: {lat, lon} | null, G: data/goetia.json (for a spirit's hours)}. Facts come from the content tables
 * (lib/db.js); the words from tool_texts (DB.text). Where the page has no DB yet (index.html), refresh() loads it.
 */
(function () {
  'use strict';
  const me = document.currentScript && document.currentScript.src;
  const WWW = me ? new URL('../', me).href : '../';
  const DATA = me ? new URL('../../data/', me).href : '../../data/';
  const DAY = 864e5, MIN = 6e4, HOUR = 36e5;
  const HORIZON_DAYS = 60, MAX_PER = 60, LOOK_DAYS = 400, KEY = 'l777events';
  const fmtT = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });
  const fmtD = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const fmtDY = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

  /* ---------- the sky: lifted from rites.html (its browser mirror of Astro.kt) and moon.html (the Moon) ---------- */
  const n360 = d => ((d % 360) + 360) % 360, w180 = d => n360(d + 180) - 180, rad = d => d * Math.PI / 180, deg = r => r * 180 / Math.PI;
  const jd = ms => ms / DAY + 2440587.5;
  function sun(ms) {
    const t = (jd(ms) + 69 / 86400 - 2451545) / 36525, l0 = n360(280.46646 + 36000.76983 * t + .0003032 * t * t), m = rad(357.52911 + 35999.05029 * t - .0001537 * t * t),
      c = (1.914602 - .004817 * t - .000014 * t * t) * Math.sin(m) + (.019993 - .000101 * t) * Math.sin(2 * m) + .000289 * Math.sin(3 * m), om = rad(125.04 - 1934.136 * t),
      lam = n360(l0 + c - .00569 - .00478 * Math.sin(om)), e0 = 23 + (26 + (21.448 - t * (46.815 + t * (.00059 - t * .001813))) / 60) / 60, e = rad(e0 + .00256 * Math.cos(om)), lr = rad(lam);
    return { lon: lam, dec: deg(Math.asin(Math.sin(e) * Math.sin(lr))), ra: n360(deg(Math.atan2(Math.cos(e) * Math.sin(lr), Math.cos(lr)))) };
  }
  const ha = (ms, lon) => w180(n360(280.46061837 + 360.98564736629 * (jd(ms) - 2451545)) + lon - sun(ms).ra);
  function solve(g, lon, tg) { let t = g; for (let i = 0; i < 6; i++) { const h0 = tg(t); if (h0 == null) return null; t -= w180(ha(t, lon) - h0) / 360 * DAY; } return Math.round(t); }
  function ssha(ms, lat) { const d = rad(sun(ms).dec), l = rad(lat), c = (Math.sin(rad(-.833)) - Math.sin(l) * Math.sin(d)) / (Math.cos(l) * Math.cos(d)); return c < -1 || c > 1 ? null : deg(Math.acos(c)); }
  const SD = new Map();
  // a local date's sunrise, solar noon, sunset (null in polar day or night) and the solar midnight after it
  function sunDay(date, lat, lon) {
    const k = date.getFullYear() + '-' + date.getMonth() + '-' + date.getDate() + '@' + lat + ',' + lon;
    let v = SD.get(k); if (v) return v;
    const ln = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12).getTime(), noon = solve(ln, lon, () => 0);
    v = { rise: solve(noon - DAY / 4, lon, t => { const h = ssha(t, lat); return h == null ? null : -h; }), noon,
      set: solve(noon + DAY / 4, lon, t => ssha(t, lat)), midnight: solve(noon + DAY / 2, lon, () => 180) };
    if (SD.size > 3000) SD.clear();
    SD.set(k, v); return v;
  }
  // the Moon's age as Rites & Altar's Best times reckons it (Meeus ch. 47, main terms)
  function moonLon(ms) {
    const T = (jd(ms) + 69 / 86400 - 2451545) / 36525, L = 218.3164477 + 481267.88123421 * T, D = rad(297.8501921 + 445267.1114034 * T),
      M = rad(357.5291092 + 35999.0502909 * T), Mp = rad(134.9633964 + 477198.8675055 * T), F = rad(93.272095 + 483202.0175233 * T), s = Math.sin;
    return n360(L + 6.288774 * s(Mp) + 1.274027 * s(2 * D - Mp) + .658314 * s(2 * D) + .213618 * s(2 * Mp) - .185116 * s(M) - .114332 * s(2 * F)
      + .058793 * s(2 * D - 2 * Mp) + .057066 * s(2 * D - M - Mp) + .053322 * s(2 * D + Mp) + .045758 * s(2 * D - M) - .040923 * s(M - Mp) - .03472 * s(D) - .030383 * s(M + Mp));
  }
  const moonAge = ms => n360(moonLon(ms) - sun(ms).lon) / 360 * 29.530589;
  // the Moon's longitude for the moments of its phases: moon.html's 24 terms, with Meeus's additive terms
  const MT = [[6288774, 0, 0, 1, 0], [1274027, 2, 0, -1, 0], [658314, 2, 0, 0, 0], [213618, 0, 0, 2, 0], [-185116, 0, 1, 0, 0], [-114332, 0, 0, 0, 2],
    [58793, 2, 0, -2, 0], [57066, 2, -1, -1, 0], [53322, 2, 0, 1, 0], [45758, 2, -1, 0, 0], [-40923, 0, 1, -1, 0], [-34720, 1, 0, 0, 0],
    [-30383, 0, 1, 1, 0], [15327, 2, 0, 0, -2], [-12528, 0, 0, 1, 2], [10980, 0, 0, 1, -2], [10675, 4, 0, -1, 0], [10034, 0, 0, 3, 0],
    [8548, 4, 0, -2, 0], [-7888, 2, 1, -1, 0], [-6766, 2, 1, 0, 0], [-5163, 1, 0, -1, 0], [4987, 1, 1, 0, 0], [4036, 2, -1, 1, 0]];
  function moonLonFine(ms) {
    const T = (jd(ms) + 69 / 86400 - 2451545) / 36525,
      Lp = 218.3164477 + 481267.88123421 * T - 0.0015786 * T * T, D = 297.8501921 + 445267.1114034 * T - 0.0018819 * T * T,
      M = 357.5291092 + 35999.0502909 * T - 0.0001536 * T * T, Mp = 134.9633964 + 477198.8675055 * T + 0.0087414 * T * T,
      F = 93.2720950 + 483202.0175233 * T - 0.0036539 * T * T, E = 1 - 0.002516 * T - 0.0000074 * T * T;
    let s = 0;
    for (const [c, d1, m1, mp1, f1] of MT) s += c * (m1 ? E ** Math.abs(m1) : 1) * Math.sin(rad(d1 * D + m1 * M + mp1 * Mp + f1 * F));
    s += 3958 * Math.sin(rad(119.75 + 131.849 * T)) + 1962 * Math.sin(rad(Lp - F)) + 318 * Math.sin(rad(53.09 + 479264.29 * T));
    return n360(Lp + s / 1e6);
  }
  const elong = ms => n360(moonLonFine(ms) - sun(ms).lon);   // 0 new, 90 first quarter, 180 full, 270 last quarter
  // the Sun's next crossing of a multiple of step degrees (10: a decan, 30: a sign): {t, i: the decan or sign entered}
  function nextIngress(a, step) {
    const tg = (Math.floor(sun(a).lon / step) + 1) * step, df = ms => w180(sun(ms).lon - tg);
    let lo = a, hi = a + 12 * DAY; while (df(hi) < 0) hi += DAY;
    for (let i = 0; i < 50; i++) { const mid = (lo + hi) / 2; if (df(mid) < 0) lo = mid; else hi = mid; }
    return { t: Math.round(hi), i: Math.round(n360(tg) / step) % (360 / step) };
  }
  function root(f, a, b) { for (let i = 0; i < 32; i++) { const m = (a + b) / 2; if (f(m) < 0) a = m; else b = m; } return b; }

  /* ---------- small helpers ---------- */
  const midnightOf = ms => { const d = new Date(ms); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };
  const addDays = (d, k) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + k);
  const parseDate = s => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
  const atHM = (d, hm) => { const m = /^(\d{1,2}):(\d{2})/.exec(hm || ''); return d && m ? new Date(d.getFullYear(), d.getMonth(), d.getDate(), +m[1], +m[2]).getTime() : null; };
  const toMinute = t => Math.round(t / MIN) * MIN;
  const unitMs = x => x && +x.n > 0 ? +x.n * (x.unit === 'h' ? HOUR : MIN) : 0;
  const leadOf = def => def && def.when && def.when.kind !== 'timer' ? Math.max(0, Math.min(1440, Math.round(+def.lead || 0))) : 0;
  const PROFITABLE = [2, 4, 6, 8, 10, 12, 14], goodAge = a => PROFITABLE.includes(Math.floor(a));
  const hasDB = () => !!(window.DB && DB.has('planets') && DB.has('weekdays') && DB.has('tool_texts'));
  const planet = id => DB.get('planets', id);
  const glyph = p => p.glyph + '︎';   // drawn as a text glyph, not an emoji
  const chaldean = () => DB.where('planets', p => p.chaldean).sort((a, b) => a.chaldean - b.chaldean).map(p => p.id);
  const weekdays = () => DB.rows('weekdays');                // getDay 0 = Sunday
  const dayNames = days => days.slice().sort((a, b) => a - b).map(i => (weekdays()[i] || {}).name || '').map(n => n.slice(0, 3)).join(', ');
  const hmLabel = hm => { const t = atHM(new Date(2000, 0, 1), hm); return t == null ? '—' : fmtT.format(t); };
  const POINT = { rise: 'Sunrise', noon: 'Solar noon', set: 'Sunset', midnight: 'Solar midnight' };
  function pointLabel(w) { const o = Math.round(+w.offset || 0); return (POINT[w.point] || POINT.set) + (o ? (o > 0 ? ' + ' : ' − ') + Math.abs(o) + ' min' : ''); }
  const signIndex = id => DB.rows('signs').findIndex(s => s.id === id);
  function decanLabel(i) {
    const s = DB.rows('signs')[Math.floor(i / 3)]; if (!s) return '';
    const d = DB.where('decans', { sign: s.id, n: i % 3 + 1 })[0];
    return s.name + ' ' + ['I', 'II', 'III'][(d ? d.n : i % 3 + 1) - 1];
  }
  function enters(kind, i) {
    const where = i == null ? (kind === 'decan' ? DB.text('rites.ev-new-decan') : DB.text('rites.ev-new-sign'))
      : kind === 'decan' ? decanLabel(i) : (DB.rows('signs')[i] || {}).name || '';
    return DB.text('rites.ev-enters', { where });
  }
  const hourLabel = p => DB.text('rites.ev-hour', { glyph: glyph(p), planet: p.name });
  // a rank's hours on a date: [{a, b}] (null where it needs the place and there is none)
  function windows(k, date, loc) {
    const sd = loc ? sunDay(date, loc.lat, loc.lon) : null;
    const at = v => { if (v === 'sunrise') return sd && sd.rise; if (v === 'sunset') return sd && sd.set;
      if (v === 'dawn') return sd && sd.rise != null ? sd.rise - 36 * MIN : null;   // civil dawn ≈ 36 min before sunrise
      return atHM(date, v); };
    return (k.hoursWindows || []).map(w => { const a = at(w.start); let b = at(w.end); if (a != null && b != null && b <= a) b += DAY; return { a, b }; });
  }
  const spiritRanks = (G, n) => { const s = G && G.spirits && G.spirits[n - 1], OG = G && G.offeringsGeneral;
    return s && OG && OG.ranks ? { s, ranks: s.rank.split('/').map(r => r.trim()).filter(r => OG.ranks[r]).map(r => [r, OG.ranks[r]]) } : null; };

  /* ---------- an event's times ---------- */
  function occurrences(def, ctx, from, to, max) {
    const w = (def && def.when) || {}, out = [], loc = (ctx && ctx.loc) || null;
    max = max || MAX_PER;
    if (!(to > from)) return out;
    const push = (t, what, timed) => { if (t != null && isFinite(t) && t >= from && t < to) out.push({ t, what: what || '', timed: !!timed }); return out.length >= max; };
    const d0 = addDays(midnightOf(from), -1), dEnd = to + DAY;
    const eachDay = fn => { for (let k = 0; ; k++) { const d = addDays(d0, k); if (d.getTime() > dEnd || fn(d)) return; } };
    switch (w.kind) {
      case 'once': push(atHM(parseDate(w.date), w.time)); break;
      case 'repeat':
        if (w.every === 'month') {
          const md = Math.max(1, Math.min(31, Math.round(+w.mday || 1)));
          for (let k = 0; ; k++) {
            const y = d0.getFullYear(), m = d0.getMonth() + k;
            if (new Date(y, m, 1).getTime() > dEnd) break;
            if (push(atHM(new Date(y, m, Math.min(md, new Date(y, m + 1, 0).getDate())), w.time))) break;
          }
        } else {
          const days = w.every === 'week' ? (w.days || []) : [];
          eachDay(d => (!days.length || days.includes(d.getDay())) && push(atHM(d, w.time)));
        }
        break;
      case 'sky': sky(w, loc, from, to, push, eachDay); break;
      case 'spirit': {
        const sr = spiritRanks(ctx && ctx.G, +w.n); if (!sr || !sr.ranks.length) break;
        const WD = weekdays().map(x => x.name);
        eachDay(d => {
          const hits = []; let age = null;
          for (const [r, k] of sr.ranks) {
            if (!w.anyDay && d.getDay() !== WD.indexOf(k.day)) continue;
            if (age == null) age = moonAge(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12).getTime());
            if (!goodAge(age)) break;
            for (const x of windows(k, d, loc)) if (x.a != null)
              hits.push({ t: x.a, what: `${w.n} ${sr.s.name} · ${r} · ${fmtT.format(x.a)}${x.b != null ? '–' + fmtT.format(x.b) : ''}` });
          }
          hits.sort((a, b) => a.t - b.t);
          let last = null;
          for (const h of hits) { if (h.t === last) continue; last = h.t; if (push(h.t, h.what, true)) return true; }
          return false;
        });
        break;
      }
      case 'timer': {
        const st = +w.start, every = unitMs(w.every), n = Math.max(0, Math.round(+w.times || 0));
        if (!(st > 0)) break;
        if (!every) { push(st); break; }
        for (let k = Math.max(0, Math.ceil((from - st) / every)); !n || k < n; k++) { const t = st + k * every; if (t >= to || push(t)) break; }
        break;
      }
    }
    return out.sort((a, b) => a.t - b.t).slice(0, max);
  }
  function sky(w, loc, from, to, push, eachDay) {
    if (w.sky === 'moon') {
      const ph = (w.phases || []).map(id => DB.get('moon_phases', id)).filter(Boolean).map(r => ({ e: +r.elongation || 0, name: r.name }));
      if (!ph.length) return;
      let a = from - DAY, ea = elong(a);
      while (a < to) {
        const b = a + DAY / 2, eb = elong(b), hits = [];
        for (const p of ph) { const fa = w180(ea - p.e), fb = w180(eb - p.e);
          if (fa < 0 && fb >= 0 && fb - fa < 90) hits.push({ t: root(t => w180(elong(t) - p.e), a, b), name: p.name }); }
        hits.sort((x, y) => x.t - y.t);
        for (const h of hits) if (push(toMinute(h.t), h.name)) return;
        a = b; ea = eb;
      }
      return;
    }
    if (w.sky === 'ingress') {
      const [kind, which] = String(w.to || 'sign').split(':'), step = kind === 'decan' ? 10 : 30;
      const want = which == null || which === '' ? null : kind === 'decan' ? +which : signIndex(which);
      let t = from - 1;
      for (let n = 0; n < 500; n++) {
        const x = nextIngress(t, step); if (x.t >= to) return;
        if ((want == null || x.i === want) && push(toMinute(x.t), enters(kind, x.i))) return;
        t = x.t + MIN;
      }
      return;
    }
    if (!loc) return;   // the planetary hours and the Sun's daily points need the place
    if (w.sky === 'hour') {
      const p = planet(w.planet), CH = chaldean(), RUL = weekdays().map(x => x.planet), days = w.days || [];
      if (!p) return;
      eachDay(d => {
        if (days.length && !days.includes(d.getDay())) return false;
        const a = sunDay(d, loc.lat, loc.lon), b = sunDay(addDays(d, 1), loc.lat, loc.lon);
        if (a.rise == null || a.set == null || b.rise == null) return false;
        const st = CH.indexOf(RUL[d.getDay()]), dl = (a.set - a.rise) / 12, nl = (b.rise - a.set) / 12;
        for (let i = 0; i < 24; i++)
          if (CH[(st + i) % 7] === p.id && push(toMinute(i < 12 ? a.rise + i * dl : a.set + (i - 12) * nl), hourLabel(p))) return true;
        return false;
      });
      return;
    }
    if (w.sky === 'sun') {
      const off = Math.round(+w.offset || 0) * MIN, key = POINT[w.point] ? w.point : 'set', label = pointLabel(w);
      eachDay(d => { const p = sunDay(d, loc.lat, loc.lon)[key]; return p != null && push(toMinute(p + off), label); });
    }
  }
  const next = (def, ctx, now) => occurrences(def, ctx, (now || Date.now()) + 1, (now || Date.now()) + LOOK_DAYS * DAY, 1)[0] || null;
  // the next n times of all the events that are on: [{def, t, what}]
  function upcoming(defs, ctx, now, n) {
    now = now || Date.now();
    return defs.filter(d => d && d.on !== false).flatMap(d => occurrences(d, ctx, now + 1, now + LOOK_DAYS * DAY, n).map(o => ({ def: d, t: o.t, what: o.what })))
      .sort((a, b) => a.t - b.t).slice(0, n);
  }
  // does it need the place (and so say so when there is none)?
  function needsLocation(def, ctx) {
    const w = (def && def.when) || {};
    if (w.kind === 'sky') return w.sky === 'hour' || w.sky === 'sun';
    if (w.kind === 'spirit') { const sr = spiritRanks(ctx && ctx.G, +w.n);
      return !!sr && sr.ranks.some(([, k]) => (k.hoursWindows || []).some(x => ['sunrise', 'sunset', 'dawn'].includes(x.start))); }
    return false;
  }

  /* ---------- the words ---------- */
  function summary(def, ctx) {
    const w = (def && def.when) || {}; let s = '';
    switch (w.kind) {
      case 'once': { const t = atHM(parseDate(w.date), w.time);
        s = t == null ? 'Once' : 'Once · ' + (new Date(t).getFullYear() === new Date().getFullYear() ? fmtD : fmtDY).format(t) + ' · ' + fmtT.format(t); break; }
      case 'repeat':
        s = w.every === 'month' ? 'Monthly · day ' + Math.max(1, Math.min(31, Math.round(+w.mday || 1))) + ' · ' + hmLabel(w.time)
          : w.every === 'week' && (w.days || []).length && w.days.length < 7 ? dayNames(w.days) + ' · ' + hmLabel(w.time)
          : 'Every day · ' + hmLabel(w.time);
        break;
      case 'sky':
        if (w.sky === 'moon') s = (w.phases || []).map(id => (DB.get('moon_phases', id) || {}).name).filter(Boolean).join(', ') || 'Moon';
        else if (w.sky === 'ingress') { const [kind, which] = String(w.to || 'sign').split(':');
          s = enters(kind, which == null || which === '' ? null : kind === 'decan' ? +which : signIndex(which)); }
        else if (w.sky === 'hour') { const p = planet(w.planet), days = w.days || [];
          s = (p ? hourLabel(p) : '') + (days.length && days.length < 7 ? ' · ' + dayNames(days) : ''); }
        else if (w.sky === 'sun') s = pointLabel(w);
        break;
      case 'spirit': {
        const sr = spiritRanks(ctx && ctx.G, +w.n);
        if (!sr) { s = 'Spirit ' + (w.n || ''); break; }
        const v = { spirit: w.n + ' ' + sr.s.name, rank: sr.s.rank, day: sr.ranks.map(([, k]) => k.day).join(' / ') };
        s = w.anyDay ? DB.text('rites.ev-spirit-any', v) : DB.text('rites.ev-spirit-sum', v);
        break;
      }
      case 'timer': {
        const e = w.every && +w.every.n > 0 ? w.every.n + (w.every.unit === 'h' ? ' h' : ' min') : '';
        s = 'Timer · ' + (e ? 'every ' + e + (+w.times ? ' · ' + w.times + ' times' : '') : 'rings once');
        break;
      }
    }
    const lead = leadOf(def);
    return s + (lead ? ' · ' + DB.text('rites.ev-lead', { min: lead }) : '');
  }
  // the notification's one line: what this time is (or the notes' first line), and how soon when it rings early
  function ringText(def, occ) {
    const lead = leadOf(def), first = String(def.notes || '').split('\n').map(x => x.trim()).find(Boolean) || '';
    const s = lead ? DB.text('rites.ev-soon', { min: lead, what: occ.timed ? occ.what : (occ.what ? occ.what + ' · ' : '') + fmtT.format(occ.t) })
      : occ.what || first;
    return s.length > 120 ? s.slice(0, 119) + '…' : s;
  }
  const item = (def, occ, ctx) => ({ id: String(def.id), at: occ.t - leadOf(def) * MIN, title: String(def.title || '').trim() || summary(def, ctx),
    text: ringText(def, occ), open: def.tap && def.tap.open === 'none' ? 'none' : 'page' });
  // every ring of the coming HORIZON_DAYS (at most MAX_PER an event), earliest first
  function queue(defs, ctx, now) {
    now = now || Date.now();
    const out = [];
    for (const d of defs) {
      if (!d || d.on === false) continue;
      const lead = leadOf(d) * MIN;
      for (const o of occurrences(d, ctx, now + lead + 1, now + HORIZON_DAYS * DAY, MAX_PER)) out.push(item(d, o, ctx));
    }
    return out.sort((a, b) => a.at - b.at);
  }

  /* ---------- keeping them, and handing the rings to the app ---------- */
  function bridge() { try { return (window.parent && window.parent !== window && window.parent.Android) || window.Android || null; } catch (e) { return window.Android || null; } }
  function canRing() { const A = bridge(); return !!(A && typeof A.setCustomEvents === 'function' && typeof A.getCustomEvents === 'function'); }
  function parse(s) { try { const a = JSON.parse(s || '[]'); return Array.isArray(a) ? a.filter(x => x && typeof x === 'object' && x.id != null) : []; } catch (e) { return []; } }
  function raw() {
    if (canRing()) { try { return bridge().getCustomEvents() || '[]'; } catch (e) { return '[]'; } }
    try { return localStorage.getItem(KEY) || '[]'; } catch (e) { return '[]'; }
  }
  const load = () => parse(raw());
  function location() {
    const A = bridge();
    if (A && typeof A.getRitesState === 'function') { try { const s = JSON.parse(A.getRitesState()); return (s && s.location) || null; } catch (e) { return null; } }
    try { const p = JSON.parse(localStorage.getItem('l777rites')); return (p && p.loc) || null; } catch (e) { return null; }
  }
  const answer = s => { try { const r = JSON.parse(s); return r && typeof r === 'object' ? r : { ok: false, error: 'no answer' }; } catch (e) { return { ok: false, error: String(s || e) }; } };
  function save(defs, ctx) {
    const json = JSON.stringify(defs);
    if (canRing()) {
      try { return answer(bridge().setCustomEvents(json, JSON.stringify(queue(defs, ctx)))); }
      catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
    }
    try { localStorage.setItem(KEY, json); return { ok: true, native: false }; } catch (e) { return { ok: false, native: false, error: String((e && e.message) || e) }; }
  }
  function sync(ctx) {
    if (!canRing()) return { ok: false, native: false };
    try { const s = raw(); return answer(bridge().setCustomEvents(s, JSON.stringify(queue(parse(s), ctx || { loc: location(), G: GOETIA })))); }
    catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
  }
  // what the page needs before it can work the times out (index.html has none of it)
  let GOETIA = null, dbP = null, gP = null;
  const addScript = src => new Promise((ok, fail) => { const s = document.createElement('script'); s.src = src; s.onload = ok;
    s.onerror = () => fail(new Error('could not load ' + src)); document.head.appendChild(s); });
  function ensureDB() {
    if (hasDB()) return Promise.resolve();
    return dbP || (dbP = (async () => {
      const B = () => window.ATHANOR_DB || {};
      if (!B().planets) await addScript(DATA + 'db/core.js');
      if (!B().tool_texts) await addScript(DATA + 'db/texts.js');
      if (!window.DB) await addScript(WWW + 'lib/db.js');
    })().catch(e => { dbP = null; throw e; }));
  }
  function ensureGoetia() {
    if (GOETIA) return Promise.resolve(GOETIA);
    return gP || (gP = fetch(DATA + 'goetia.json').then(r => r.json()).then(g => (GOETIA = g)).catch(e => { gP = null; throw e; }));
  }
  const needs = defs => { const on = defs.filter(d => d.on !== false);
    return { db: on.length > 0, goetia: on.some(d => d.when && d.when.kind === 'spirit') }; };
  async function refresh() {
    if (!canRing()) return { ok: false, native: false };
    try {
      for (let i = 0; i < 3; i++) {
        const n = needs(load());
        if (n.db) await ensureDB();
        if (n.goetia) await ensureGoetia();
        const m = needs(load());   // the page may have saved meanwhile
        if ((!m.db || hasDB()) && (!m.goetia || GOETIA)) break;
      }
      return sync({ loc: location(), G: GOETIA });
    } catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
  }
  const newId = () => 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  window.Events = {
    KEY, HORIZON_DAYS, MAX_PER, LOOK_DAYS,
    load, save, sync, refresh, canRing, bridge, location, newId,
    occurrences, next, upcoming, needsLocation, summary, ringText, item, queue, leadOf,
    decanLabel, useGoetia(g) { if (g) GOETIA = g; },
    astro: { sun, sunDay, moonAge, elong, nextIngress },
  };
})();
