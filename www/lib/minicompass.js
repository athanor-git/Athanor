/* Athanor — a small floating compass laid over a page (Rites' reading view: the prayer or seals of a tapped reminder).
 *
 *   MiniCompass.show({label, az, note})  shows it, or updates what it points to, and starts the phone's compass
 *       label  what it points to, e.g. "Ra · face East"
 *       az     the bearing to face: degrees from true north, clockwise; null for none (e.g. the Sun with no location)
 *       note   an optional short line under the hint
 *   MiniCompass.hide()                   takes it away and stops the sensor
 *
 * The sensor is used as tools/compass.html uses it: in the app Android.compassStart() starts the native CompassSensor
 * and each reading comes to window.onHeading({heading, magnetic, declination, trueAvailable, accuracy, upright, …}),
 * which index.html passes on (into the reminder layer while that is open). heading is already true north when the app
 * has a location (the declination there is applied natively), otherwise magnetic north. In a browser:
 * deviceorientation(absolute), magnetic. With no reading after a few seconds the dial stays north-up with the target
 * marked, and says there is no compass. The sensor stops while the page is hidden and when it goes away (index.html
 * also stops it when the reminder closes).
 * Drag it anywhere; tap it to shrink it to an icon and back (its corner and size are remembered).
 */
(function () {
  'use strict';
  let A = null;
  try { A = (window.parent && window.parent.Android) || window.Android || null; } catch (e) { try { A = window.Android || null; } catch (_) { A = null; } }
  const D2R = Math.PI / 180;
  const an = a => ((a % 360) + 360) % 360, w180 = a => an(a + 180) - 180;
  const N16 = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const n16 = a => N16[Math.round(an(a) / 22.5) % 16];
  const ENTER = 10, LEAVE = 13;    // "on target" from ±10°, kept until ±13° so it doesn't flicker at the edge
  const KEY = 'l777miniCompass';   // {min, right, bottom, dx, dy}: shrunk or not, and the corner it was left nearest
  const ui = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
  const keep = o => { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {} };

  const CSS = `
#mc{position:fixed;left:-999px;top:-999px;z-index:60;touch-action:none;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent;cursor:grab;
  font:12px/1.3 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--ink,#1a1712);outline:none}
#mc:focus-visible .mc-full,#mc:focus-visible .mc-icon{outline:2px solid var(--acc,#7a5c2e);outline-offset:2px}
#mc.mc-drag{cursor:grabbing;opacity:.9}
#mc .mc-full{width:120px;padding:8px 8px 7px;background:var(--card,#fff);border:1px solid var(--line,#e3ddd0);border-radius:16px;
  box-shadow:0 6px 18px rgba(0,0,0,.22);text-align:center}
#mc svg{display:block;overflow:visible}
#mc .mc-dial{width:100px;height:100px;margin:0 auto}
#mc .mc-face{fill:var(--bg,#faf7f0);stroke:var(--line,#e3ddd0);stroke-width:2.5}
#mc .mc-ticks{stroke:var(--sub,#6b6357);stroke-width:1.5;stroke-linecap:round;fill:none}
#mc .mc-let{font:700 11px system-ui,sans-serif;fill:var(--sub,#6b6357);text-anchor:middle;dominant-baseline:central;
  stroke:var(--bg,#faf7f0);stroke-width:3px;paint-order:stroke;stroke-linejoin:round}   /* a halo: legible over the target's ray */
#mc .mc-let.n{fill:var(--warn,#a5542c)}
#mc .mc-ray{stroke:var(--acc,#7a5c2e);stroke-width:1.8;stroke-dasharray:3 3}
#mc .mc-dot{fill:var(--acc,#7a5c2e);stroke:var(--card,#fff);stroke-width:1.5}
#mc .mc-idx{stroke:var(--ink,#1a1712);stroke-width:2.6;stroke-linecap:round}
#mc .mc-hub{fill:var(--ink,#1a1712)}
#mc .mc-lbl{margin-top:4px;font-weight:700;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow-wrap:anywhere}
#mc .mc-hint{margin-top:2px;font-variant-numeric:tabular-nums}
#mc .mc-hint:empty,#mc .mc-note:empty{display:none}
#mc .mc-note{margin-top:2px;font-size:10.5px;line-height:1.25;color:var(--sub,#6b6357)}
#mc.mc-on .mc-full{border-color:var(--ok,#3d7a4a);box-shadow:0 0 0 2px var(--ok,#3d7a4a),0 6px 18px rgba(0,0,0,.22)}
#mc.mc-on .mc-face{stroke:var(--ok,#3d7a4a);stroke-width:4}
#mc.mc-on .mc-dot{fill:var(--ok,#3d7a4a)}
#mc.mc-on .mc-ray{stroke:var(--ok,#3d7a4a)}
#mc.mc-on .mc-hint{color:var(--ok,#3d7a4a);font-weight:700}
#mc .mc-icon{display:none;width:52px;height:52px;border-radius:50%;background:var(--card,#fff);border:1px solid var(--line,#e3ddd0);
  box-shadow:0 4px 14px rgba(0,0,0,.25);align-items:center;justify-content:center;font-size:24px}
#mc .mc-icon svg{width:40px;height:40px}
#mc .mc-arr{fill:var(--acc,#7a5c2e)}
#mc.mc-on .mc-icon{background:var(--ok,#3d7a4a);border-color:var(--ok,#3d7a4a)}
#mc.mc-on .mc-arr{fill:#fff}
#mc.mc-min .mc-full{display:none}
#mc.mc-min .mc-icon{display:flex}
`;

  let root = null, el = null, T = { label: '', az: null, note: '' }, wanted = false, MIN = false;
  let SENSOR = 'none', STATE = 'wait', LAST = null, lastAt = 0, noTimer = 0;   // STATE: wait | live | none (no compass)
  let disp = 0, tgt = 0, raf = 0, lastT = 0, ONT = false, drag = null, lastH = 0;
  const said = {};
  // a browser on an iPhone/iPad (no Android bridge) gives compass readings only once the user allows it, from a tap
  let ASK = !A && typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function';

  /* ---------- the widget ---------- */
  const LETTERS = [['N', 0, -25], ['E', 25, 0], ['S', 0, 25], ['W', -25, 0]];
  function ticks() {
    let d = '';
    for (let a = 0; a < 360; a += 30) {
      const r0 = a % 90 ? 36 : 32, s = Math.sin(a * D2R), c = -Math.cos(a * D2R);
      d += 'M' + (r0 * s).toFixed(1) + ',' + (r0 * c).toFixed(1) + 'L' + (41 * s).toFixed(1) + ',' + (41 * c).toFixed(1);
    }
    return d;
  }
  function build() {
    if (!document.getElementById('mc-css')) {
      const st = document.createElement('style'); st.id = 'mc-css'; st.textContent = CSS; document.head.appendChild(st);
    }
    root = document.createElement('div');
    root.id = 'mc'; root.setAttribute('role', 'button'); root.tabIndex = 0;
    root.innerHTML =
      '<div class="mc-full"><svg class="mc-dial" viewBox="-50 -50 100 100" aria-hidden="true">' +
        '<circle class="mc-face" r="41"/>' +
        '<g class="mc-rose"><path class="mc-ticks" d="' + ticks() + '"/>' +
          '<g class="mc-tgt"><line class="mc-ray" x1="0" y1="-7" x2="0" y2="-38"/><circle class="mc-dot" cx="0" cy="-45" r="4.5"/></g>' +
          LETTERS.map(([t, x, y]) => '<text class="mc-let' + (t === 'N' ? ' n' : '') + '" x="' + x + '" y="' + y + '">' + t + '</text>').join('') +
        '</g>' +
        '<line class="mc-idx" x1="0" y1="-49" x2="0" y2="-35"/><circle class="mc-hub" r="2.6"/>' +
      '</svg><div class="mc-lbl"></div><div class="mc-hint"></div><div class="mc-note"></div></div>' +
      '<div class="mc-icon"><svg viewBox="-50 -50 100 100" aria-hidden="true"><path class="mc-arr" d="M0,-40L17,14L0,4L-17,14Z"/></svg>' +
        '<span class="mc-glyph" aria-hidden="true">🧭</span></div>';
    const q = s => root.querySelector(s);
    el = { rose: q('.mc-rose'), tgt: q('.mc-tgt'), lbl: q('.mc-lbl'), hint: q('.mc-hint'), note: q('.mc-note'),
      arr: q('.mc-icon svg'), arrPath: q('.mc-arr'), glyph: q('.mc-glyph'),
      lets: [...root.querySelectorAll('.mc-let')].map((e, i) => ({ e, x: LETTERS[i][1], y: LETTERS[i][2] })) };
    for (const k in said) delete said[k];
    lastH = 0; MIN = !!ui().min;
    root.classList.toggle('mc-min', MIN);
    document.body.appendChild(root);
    root.addEventListener('pointerdown', down);
    root.addEventListener('pointermove', move);
    root.addEventListener('pointerup', up);
    root.addEventListener('pointercancel', up);
    root.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setMin(!MIN); } });
    paint();
    restore();
  }
  const say = (k, v, f) => { if (said[k] !== v) { said[k] = v; f(v); } };
  function paint() {
    if (!root) return;
    const live = STATE === 'live', h = live ? disp : 0, has = T.az != null;
    el.rose.setAttribute('transform', 'rotate(' + (-h).toFixed(1) + ')');
    for (const L of el.lets) L.e.setAttribute('transform', 'rotate(' + h.toFixed(1) + ' ' + L.x + ' ' + L.y + ')');   // letters stay upright
    say('tgt', has ? T.az.toFixed(1) : '', v => { el.tgt.style.display = v ? '' : 'none'; if (v) el.tgt.setAttribute('transform', 'rotate(' + v + ')'); });
    let hint = '', on = false;
    if (has && live) {
      const d = w180(T.az - disp), ad = Math.abs(d);
      on = ONT ? ad <= LEAVE : ad <= ENTER;
      hint = on ? '◆ On target' : d > 0 ? 'Turn ' + Math.round(ad) + '° right →' : '← Turn ' + Math.round(ad) + '° left';
      el.arrPath.setAttribute('transform', 'rotate(' + d.toFixed(1) + ')');   // the shrunk icon: an arrow to the target
    } else if (has) hint = 'Face ' + Math.round(T.az) % 360 + '° ' + n16(T.az);
    if (on && !ONT) buzz();
    ONT = on;
    say('icon', has && live ? 'arrow' : 'glyph', v => { el.arr.style.display = v === 'arrow' ? '' : 'none'; el.glyph.style.display = v === 'arrow' ? 'none' : ''; });
    const note = [T.note, sourceNote()].filter(Boolean).join(' · ');
    let txt = false;
    say('lbl', T.label, v => { el.lbl.textContent = v; txt = true; });
    say('hint', hint, v => { el.hint.textContent = v; txt = true; });
    say('note', note, v => { el.note.textContent = v; txt = true; });
    root.classList.toggle('mc-on', on);
    // a line more or less: keep the corner it sits in (it is placed by its top left)
    if (txt && !drag) { const hh = root.offsetHeight; if (hh !== lastH) { lastH = hh; restore(); } }
    say('aria', ['Compass: ' + T.label, hint, note, 'Tap to ' + (MIN ? 'open' : 'shrink') + ', drag to move'].filter(Boolean)
      .map(s => s.replace(/[.…]+$/, '')).join('. ') + '.', v => root.setAttribute('aria-label', v));
  }
  function sourceNote() {
    if (STATE === 'wait') return 'Waiting for the compass…';
    if (STATE === 'none' && ASK) return 'Tap to turn on the compass';
    if (STATE === 'none') return 'No compass on this device';
    const h = LAST || {};
    if (typeof h.accuracy === 'number' && h.accuracy < 2) return 'Calibrate: move the phone in a figure-8';
    if (h.web) return 'Magnetic north (browser)';
    if (!h.trueAvailable) return 'Magnetic north: no location saved';
    return '';
  }
  // one short buzz on reaching the target (the app's own bridge method, as in compass.html)
  function buzz() {
    try {
      if (A && typeof A.vibrate === 'function') A.vibrate(70);
      else if (navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) navigator.vibrate(70);
    } catch (e) {}
  }

  /* ---------- turning: ease the dial toward the latest heading ---------- */
  function step(t) {
    const dt = Math.min(0.1, Math.max(0, (t - lastT) / 1000)); lastT = t;
    const diff = w180(tgt - disp);
    if (Math.abs(diff) < 0.05) { disp = tgt; raf = 0; paint(); return; }
    disp = an(disp + diff * (1 - Math.exp(-dt / 0.085)));
    paint();
    raf = requestAnimationFrame(step);
  }
  function reading(h) {
    if (!wanted || !h || typeof h.heading !== 'number' || !isFinite(h.heading)) return;
    lastAt = Date.now(); LAST = h; tgt = an(h.heading);
    if (STATE !== 'live') { STATE = 'live'; disp = tgt; paint(); return; }   // the first reading: no spin from north
    if (!raf) { lastT = performance.now(); raf = requestAnimationFrame(step); }
  }

  /* ---------- the sensor (compass.html's protocol) ---------- */
  window.onHeading = function (h) {
    if (typeof h === 'string') { try { h = JSON.parse(h); } catch (e) { return; } }
    if (SENSOR !== 'native') return;
    reading(h);
  };
  function onDO(e) {
    let h = null;
    if (typeof e.webkitCompassHeading === 'number' && e.webkitCompassHeading >= 0) h = e.webkitCompassHeading;
    else if (e.alpha != null && (e.absolute || e.type === 'deviceorientationabsolute')) h = 360 - e.alpha;
    if (h == null) return;
    const so = (screen.orientation && typeof screen.orientation.angle === 'number') ? screen.orientation.angle : (+window.orientation || 0);
    reading({ heading: an(h + so), magnetic: an(h + so), declination: 0, trueAvailable: false, accuracy: null, web: true });
  }
  function stopSensor() {
    if (SENSOR === 'native') { try { A.compassStop(); } catch (e) {} }
    window.removeEventListener('deviceorientationabsolute', onDO); window.removeEventListener('deviceorientation', onDO);
    SENSOR = 'none'; clearTimeout(noTimer);
  }
  function noSensor() { if (!wanted || lastAt) return; STATE = 'none'; paint(); }
  function startSensor() {
    stopSensor();
    if (!wanted || document.hidden) return;
    lastAt = 0;
    if (A && typeof A.compassStart === 'function') {
      let info = null; try { info = JSON.parse(A.compassInfo()); } catch (e) {}
      if (!info || info.available !== false) { try { A.compassStart(); SENSOR = 'native'; } catch (e) { SENSOR = 'none'; } }
    }
    if (SENSOR === 'none') {
      if ('ondeviceorientationabsolute' in window) { window.addEventListener('deviceorientationabsolute', onDO); SENSOR = 'web'; }
      else if ('DeviceOrientationEvent' in window) { window.addEventListener('deviceorientation', onDO); SENSOR = 'web'; }
    }
    if (SENSOR === 'none') { noSensor(); return; }
    noTimer = setTimeout(noSensor, SENSOR === 'native' ? 4000 : 2500);
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopSensor(); else if (wanted) startSensor(); });
  window.addEventListener('pagehide', stopSensor);

  /* ---------- moving it, and shrinking it to an icon ---------- */
  const vw = () => document.documentElement.clientWidth || innerWidth, vh = () => document.documentElement.clientHeight || innerHeight;
  function place(x, y) {
    const w = root.offsetWidth, h = root.offsetHeight;
    root.style.left = Math.round(Math.max(4, Math.min(vw() - w - 4, x))) + 'px';
    root.style.top = Math.round(Math.max(4, Math.min(vh() - h - 4, y))) + 'px';
  }
  // where it sits is kept as a distance from the nearest corner, so it stays there when it is shrunk or the screen turns
  function remember() {
    const r = root.getBoundingClientRect(), W = vw(), H = vh(), right = r.left + r.width / 2 > W / 2, bottom = r.top + r.height / 2 > H / 2;
    keep({ min: MIN, right, bottom, dx: Math.round(right ? W - r.right : r.left), dy: Math.round(bottom ? H - r.bottom : r.top) });
  }
  function restore() {
    if (!root) return;
    const s = ui(), right = s.right !== false, bottom = s.bottom !== false;
    const dx = isFinite(s.dx) ? +s.dx : 12, dy = isFinite(s.dy) ? +s.dy : 12;
    place(right ? vw() - root.offsetWidth - dx : dx, bottom ? vh() - root.offsetHeight - dy : dy);
  }
  function setMin(m) {
    remember(); MIN = m; root.classList.toggle('mc-min', m);
    const s = ui(); s.min = m; keep(s);
    restore(); paint();
  }
  function down(e) {
    if (e.button > 0) return;
    const r = root.getBoundingClientRect();
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, l: r.left, t: r.top, moved: false };
    try { root.setPointerCapture(e.pointerId); } catch (_) {}
  }
  function move(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.moved && dx * dx + dy * dy < 64) return;   // under 8 px it is still a tap
    drag.moved = true; root.classList.add('mc-drag');
    place(drag.l + dx, drag.t + dy);
  }
  function up(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const moved = drag.moved; drag = null; root.classList.remove('mc-drag');
    if (moved) remember();
    else if (e.type === 'pointerup' && ASK && STATE !== 'live') {
      ASK = false;   // asked once per page; the answer stands
      DeviceOrientationEvent.requestPermission().then(s => { if (s === 'granted' && wanted) startSensor(); paint(); }, () => paint());
    } else if (e.type === 'pointerup') setMin(!MIN);
  }
  window.addEventListener('resize', restore);

  /* ---------- API ---------- */
  function show(o) {
    o = o || {};
    T = { label: String(o.label || ''), az: (typeof o.az === 'number' && isFinite(o.az)) ? an(o.az) : null, note: String(o.note || '') };
    if (!root) build();
    if (!wanted) { wanted = true; STATE = 'wait'; LAST = null; startSensor(); }
    paint();
  }
  function hide() {
    wanted = false; stopSensor();
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    if (root) { root.remove(); root = null; el = null; }
    STATE = 'wait'; LAST = null; ONT = false;
  }
  window.MiniCompass = { show, hide, get shown() { return !!root; } };
})();
