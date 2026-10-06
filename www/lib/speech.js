/* Athanor — read-aloud: the voice, and how it says the names.
 *
 * THE VOICE. Android's WebView has no working speechSynthesis, so inside the app this file builds
 * window.speechSynthesis and window.SpeechSynthesisUtterance on Android's own text-to-speech (MainActivity's bridge
 * calls speechVoices / speechSpeak / speechStop; Speech.kt). It covers what the tools use:
 *   speechSynthesis.getVoices()   [{voiceURI, name, lang, default, localService}]: empty while the engine starts, then
 *                                 'voiceschanged' fires (onvoiceschanged or addEventListener)
 *   speechSynthesis.speak(u), cancel(), speaking, pending, paused; pause() and resume() do nothing (Android's voices
 *                                 cannot pause)
 *   new SpeechSynthesisUtterance(text): text, lang, voice, rate, pitch, volume, and the events start, end and error
 *                                 (onstart … or addEventListener). cancel() ends each utterance with an error event:
 *                                 'interrupted' if it was being spoken, 'canceled' if it was still waiting.
 * speaking is true from speak() until the last utterance is over, also while the engine is still preparing the first
 * one, so a page's "has it started?" check waits for the end instead of giving up on a slow start.
 * The app hands each event to window.onSpeech of index.html, which passes it on to the tool's frame (as it does compass
 * readings). An event names its utterance, so only the page that asked takes it up.
 * In a browser there is no bridge and this part does nothing: the browser's own speechSynthesis stays in charge.
 * Load this file before the page's own script looks at window.speechSynthesis.
 *
 * THE NAMES. Speech.pronounce(text) gives the text the voice should be handed: each name in the table Pronunciations
 * (data/db/pronunciations.json, tab Pronunciations of the content workbook) replaced by its spelling for the voice,
 * whole words only and capitals counting ("Elohim" -> "Eh-loh-heem"; "Yod He Vau He" is taken before "Yod"). Use it on
 * the spoken text only: the page goes on showing the names as written. It works in the app and in a browser alike.
 * The table is fetched as this file loads (load lib/db.js first); until it is there the text comes back unchanged.
 */
(function () {
  'use strict';

  /* ---------- the names (app and browser) ---------- */
  let names = null, spelled = null;
  function ready() {
    if (names) return true;
    let rows = null;
    try { if (window.DB && DB.has('pronunciations')) rows = DB.rows('pronunciations'); } catch (e) { rows = null; }
    if (!rows) return false;
    spelled = new Map();
    for (const r of rows) if (r.written && r.spoken) spelled.set(String(r.written), String(r.spoken));
    // longest first, so that a name of several words wins over its first word
    const alts = [...spelled.keys()].sort((a, b) => b.length - a.length).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    names = alts.length ? new RegExp('(?<![\\p{L}\\p{N}_])(?:' + alts.join('|') + ')(?![\\p{L}\\p{N}_])', 'gu') : /$^/g;
    return true;
  }
  const Speech = window.Speech = {
    native: false,                 // true inside the app, where this file supplies the voice
    pronounce(text) {
      const t = text == null ? '' : String(text);
      return ready() ? t.replace(names, w => spelled.get(w)) : t;
    },
    ready: Promise.resolve()       // settles once the table is loaded (or could not be)
  };
  try { if (window.DB && DB.load) Speech.ready = DB.load('pronunciations').then(() => { ready(); }, () => {}); } catch (e) {}

  /* ---------- the voice (inside the app only) ---------- */
  const bridge = w => { try { return w && w.Android && w.Android.speechSpeak ? w.Android : null; } catch (e) { return null; } };
  const A = bridge(window.parent) || bridge(window);
  if (!A) return;
  Speech.native = true;

  const tag = 's' + Math.random().toString(36).slice(2, 8) + '-';   // this page's utterances: s<random>-<n>
  let seq = 0, list = null;
  const live = new Map();   // utterance id -> {u, started, t0}, from speak() until its end or error
  const soon = typeof queueMicrotask === 'function' ? queueMicrotask : f => Promise.resolve().then(f);

  // a small EventTarget: the on<type> property first, then the listeners
  const target = {
    addEventListener(type, fn) {
      if (typeof fn !== 'function') return;
      if (!this._ls) Object.defineProperty(this, '_ls', { value: {} });
      const a = this._ls[type] || (this._ls[type] = []);
      if (!a.includes(fn)) a.push(fn);
    },
    removeEventListener(type, fn) {
      const a = this._ls && this._ls[type], i = a ? a.indexOf(fn) : -1;
      if (i >= 0) a.splice(i, 1);
    },
    dispatchEvent(ev) { fire(this, ev && ev.type, ev); return true; }
  };
  function fire(on, type, extra) {
    const ev = Object.assign({ type, target: on, currentTarget: on, timeStamp: performance.now(),
      preventDefault() {}, stopPropagation() {} }, extra);
    const fns = [on['on' + type]].concat((on._ls && on._ls[type]) || []);
    for (const f of fns) if (typeof f === 'function') { try { f.call(on, ev); } catch (e) { console.error(e); } }
  }
  const info = (u, t0) => ({ utterance: u, charIndex: 0, charLength: 0, name: '', elapsedTime: t0 ? performance.now() - t0 : 0 });

  function readVoices() {
    let a;
    try { a = JSON.parse(A.speechVoices() || '[]'); } catch (e) { a = []; }
    const old = new Map((list || []).map(v => [v.voiceURI, v]));
    list = (Array.isArray(a) ? a : []).filter(v => v && v.name).map(v => {
      const n = { voiceURI: String(v.name), name: String(v.label || v.name), lang: String(v.lang || ''),
        localService: !v.network, default: !!v.default };
      const o = old.get(n.voiceURI);   // the same object again while nothing about it changed
      return o && o.name === n.name && o.lang === n.lang && o.localService === n.localService && o.default === n.default
        ? o : Object.freeze(n);
    });
    return list;
  }

  // An utterance is over: it leaves the queue at once, and its handlers hear of it now (an event from the app) or
  // straight after the current script (cancel, a request that could not be made), as in a browser.
  function finish(id, type, error, later) {
    const r = live.get(id);
    if (!r) return;
    live.delete(id);
    const ev = info(r.u, r.t0);
    if (type === 'error') ev.error = error || 'synthesis-failed';
    const tell = () => {
      if (type === 'end' && !r.started) fire(r.u, 'start', info(r.u, 0));
      fire(r.u, type, ev);
    };
    if (later) soon(tell); else tell();
  }

  const synth = {
    onvoiceschanged: null,
    get speaking() { return live.size > 0; },
    get pending() { for (const r of live.values()) if (!r.started) return true; return false; },
    get paused() { return false; },
    getVoices() {
      if (!list || !list.length) readVoices();   // the first call starts the engine
      return list.slice();
    },
    speak(u) {
      if (!u || typeof u !== 'object') {
        throw new TypeError("Failed to execute 'speak' on 'SpeechSynthesis': parameter 1 is not of type 'SpeechSynthesisUtterance'.");
      }
      const id = tag + (++seq);
      const num = (v, def, lo, hi) => { v = +v; return isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def; };
      live.set(id, { u, started: false, t0: 0 });
      try {
        A.speechSpeak(id, u.text == null ? '' : String(u.text), (u.voice && u.voice.voiceURI) || '', String(u.lang || ''),
          num(u.rate, 1, 0.1, 10), num(u.pitch, 1, 0, 2), num(u.volume, 1, 0, 1));
      } catch (e) { finish(id, 'error', 'synthesis-failed', true); }
    },
    cancel() {
      if (!live.size) return;
      const was = [...live.entries()];
      try { A.speechStop(); } catch (e) {}
      for (const [id, r] of was) finish(id, 'error', r.started ? 'interrupted' : 'canceled', true);
    },
    pause() {},
    resume() {},
    addEventListener: target.addEventListener,
    removeEventListener: target.removeEventListener,
    dispatchEvent: target.dispatchEvent
  };

  class SpeechSynthesisUtterance {
    constructor(text) {
      this.text = text == null ? '' : String(text);
      this.lang = ''; this.voice = null; this.volume = 1; this.rate = 1; this.pitch = 1;
      this.onstart = null; this.onend = null; this.onerror = null;
      this.onpause = null; this.onresume = null; this.onmark = null; this.onboundary = null;
    }
  }
  Object.assign(SpeechSynthesisUtterance.prototype, target);

  // From the app, through index.html: {type:'voices'} | {type:'start'|'end', id} | {type:'error', id, error}
  window.onSpeech = function (e) {
    if (typeof e === 'string') { try { e = JSON.parse(e); } catch (x) { return; } }
    if (!e || typeof e !== 'object') return;
    if (e.type === 'voices') { readVoices(); fire(synth, 'voiceschanged', {}); return; }
    const id = String(e.id), r = live.get(id);
    if (!r) return;   // another page's utterance, or one already over (cancelled)
    if (e.type === 'start') {
      if (!r.started) { r.started = true; r.t0 = performance.now(); fire(r.u, 'start', info(r.u, 0)); }
    } else if (e.type === 'end') finish(id, 'end');
    else if (e.type === 'error') finish(id, 'error', e.error);
  };

  const put = (k, v) => {
    try { Object.defineProperty(window, k, { value: v, configurable: true, writable: true }); }
    catch (e) { try { window[k] = v; } catch (x) {} }
  };
  put('speechSynthesis', synth);
  put('SpeechSynthesisUtterance', SpeechSynthesisUtterance);
  // speech never outlives its page (another tool opened, the app closing)
  addEventListener('pagehide', () => synth.cancel());
})();
