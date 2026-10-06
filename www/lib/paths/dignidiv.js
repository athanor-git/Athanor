/* Athanor — Study & Quiz: "Using dignities in a reading" (the dignities in divination path).
 * Loaded by tools/quiz.html after its own script; the API (registerPath, addRelations, onReady, guards, lesson helpers…)
 * is documented in quiz.html under "Learning paths: a registry".
 *
 * Two methods, taught side by side and never mixed in one answer:
 *   essential dignity — the user's sheet "Thoth Tarot – Planetary Dignities & Properties" (Q.data.dignities = dignities.json):
 *     a planet in a sign, read with its reading key; its cross-reference rule (a planetary Atu beside a zodiacal Atu); its
 *     4-step method in a spread; and "the same key reads the Minor Arcana decans" (the sheet's method, not Book T's);
 *   elemental dignity — Book T, "Of the Dignities" (The Equinox I:8, 1912, p. 206; public domain), transcribed with its source
 *     in ../../data/elemental_dignities.json: a card is strong or weak by the suits of the two cards next to it.
 *   Card meanings: Q.data.divination (Div): Book T's meaning and its "if ill dignified" text (divination.json, orig).
 *
 * Conventions (stated in the lessons and in elemental_dignities.json): the elemental drills use the 56 suit cards only (the
 * rule names suits; Book T gives the Keys no place in it); only the three cases the text rules on are ever generated — both
 * neighbours of the card's suit (strengthened greatly), both of the suit inimical to it (weakened greatly), the neighbours
 * inimical to each other (not much affected by either); Aces are never the card judged ("Aces are always strong cards");
 * strong = well dignified (the card's Book T meaning holds), weak = ill dignified (its "if ill dignified" reading).
 *
 * Generated spreads: an item fixes the answer (the case, and for the reading drills the middle card); pre() draws fresh
 * neighbours for every asking, checked against judge() before use, so every question has exactly one right option.
 * New relations (prefix did.): deck 'dignities' — did.what, did.whatm, did.decsw, did.xstr, did.step, did.m2r,
 * did.m2e, did.m2p, did.m2q; deck 'divination' — did.kind, did.wi, did.suit, did.pair, did.enemy, did.friends, did.rule,
 * did.aces, did.tri, did.trim, did.line5, did.read3. Reused: dg.key, dg.patu, dg.satu, dg.eatu.el, dg.decan, dg.xref, ta.planet,
 * ta.ace.el, ta.court.el.
 * Leak rules kept: facts (fx) shared with the relations that ask the same fact from another side; no closed set asked in full in
 * one quiz (some(): its last answer would go by elimination); stage clashes for answers that follow by elimination from another
 * question's explanation (a suit's element; how a suit stands to the suits offered); no photos of the cards in
 * questions about planets and signs (a Thoth card prints its own glyphs); photos only in lessons and in the spread drills,
 * where the cards are named anyway; Learn-safe explanations (noteL) that state only the fact just asked.
 */
(function () {
  'use strict';
  if (!window.QuizPaths) return;   // loaded outside quiz.html
  QuizPaths.onReady(function (Q) {
    // the path's data: the dignities sheet, the divination meanings, the 78 cards — and Book T's rule (loaded here: start-up waits);
    // the content tables Dignity kinds, Dignity methods and Dignity method examples (window.DB; quiz.html loads the last two)
    if (!Q.data.dignities || !Q.data.divination || !Q.tarot.order.length) return;
    if (!window.DB || !DB.has('dignity_methods') || !DB.has('dignity_method_examples')) return;
    // (without the file the path is simply not offered, as quiz.html does with its own optional data; an error in setup is an error)
    return Q.getJSON('../../data/elemental_dignities.json')
      .then(ED => setup(Q, ED), e => console.warn('dignidiv: elemental_dignities.json could not be read, so the path is hidden:', e))
      .catch(e => console.error('dignidiv:', e));
  });

  function setup(Q, ED) {
    const {esc, side, pick, shuffle, uniq, listAnd, brief, namesAny} = Q;
    const L = Q.lesson, X = Q.dig, DG = Q.data.dignities, DIV = Q.data.divination, SIGNS = Q.SIGNS;
    const TC = Q.tarot.cards, ORDER = Q.tarot.order, DECANS = Q.tarot.decans;
    const g = t => t ? esc(t) + '︎' : '';   // a glyph in text (not emoji) presentation

    /* ---------- Book T's table, checked before anything is built ---------- */
    const SU = {}, BT = {};   // suit key → {k, bt: Book T's name, n: Thoth name, el}; Book T name → key
    (Array.isArray(ED && ED.suits) ? ED.suits : []).forEach(s => {
      if (s && s.key && s.bookT && s.element) { SU[s.key] = {k: s.key, bt: s.bookT, n: s.thoth || s.bookT, el: s.element}; BT[s.bookT] = s.key; }
    });
    const SK = Q.tarot.suits.map(s => s.k).filter(k => SU[k]);   // wands, cups, swords, disks
    const pk = (a, b) => [a, b].sort().join('|');
    const REL = {};
    [['inimical', ED.inimical], ['friendly', ED.friendly], ['unstated', ED.unstated]].forEach(([v, list]) =>
      (Array.isArray(list) ? list : []).forEach(p => { if (Array.isArray(p) && BT[p[0]] && BT[p[1]]) REL[pk(BT[p[0]], BT[p[1]])] = v; }));
    const ENEMY = {};
    SK.forEach(a => { const e = SK.filter(b => b !== a && REL[pk(a, b)] === 'inimical'); if (e.length === 1) ENEMY[a] = e[0]; });
    const RULE = {};
    (Array.isArray(ED.rules) ? ED.rules : []).forEach(r => { if (r && r.id && r.text && r.when && r.effect) RULE[r.id] = r; });
    const TEXT = Array.isArray(ED.text) ? ED.text.map(String) : [];
    if (SK.length !== 4 || SK.some(k => !ENEMY[k] || ENEMY[ENEMY[k]] !== k) || !RULE.same || !RULE.opposite || !RULE.between || TEXT.length < 8) {
      console.error('dignidiv: elemental_dignities.json is not the Book T table this path was written for'); return;
    }
    const relOf = (a, b) => a === b ? 'same' : REL[pk(a, b)] || 'unstated';
    // Book T's ruling on a card of suit m between suits l and r: S strengthened greatly, W weakened greatly, N not much
    // affected by either — or null where the text gives no ruling (such spreads are never generated)
    const judge = (m, l, r) => l === m && r === m ? 'S' : l === ENEMY[m] && r === ENEMY[m] ? 'W' : ENEMY[l] === r ? 'N' : null;
    const BT_CITE = `Book T, “Of the Dignities” — The Equinox I:8 (1912), p. ${esc(ED.page || 206)}`;
    // Book T's sentences that name both suits ("Swords are friendly with Cups and Wands.")
    const sayOf = (a, b) => TEXT.filter(t => [a, b].every(k => new RegExp('\\b' + SU[k].bt + '\\b').test(t)));

    /* ---------- the cards ---------- */
    const SUITC = ORDER.filter(k => TC[k] && TC[k].suit && SU[TC[k].suit.k]);   // the 56 suit cards
    const BYS = {}, MIDS = {};   // by suit: every card (neighbours), and the cards that may be judged (not the Aces)
    SK.forEach(s => { BYS[s] = SUITC.filter(k => TC[k].suit.k === s); MIDS[s] = BYS[s].filter(k => TC[k].kind !== 'ace'); });
    const suitOf = k => TC[k].suit.k;
    const nm = k => { const c = TC[k]; return !c ? k : c.kind === 'major' ? `${c.num} ${c.title}` : Q.tarot.short(k); };
    const NUMW = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];

    // A line of cards: mid = a card key (the reading drills) or a suit key (a card of it is drawn); cs = the case; n = 3 or 5.
    // Every card differs; the two next to the judged card are drawn for the case, and judge() confirms it before use
    function spread(mid, cs, n) {
      for (let t = 0; t < 40; t++) {
        const m = TC[mid] ? mid : pick(MIDS[mid]), ms = suitOf(m), used = new Set([m]);
        const take = s => { const k = pick(BYS[s].filter(x => !used.has(x))); used.add(k); return k; };
        let pr;
        if (cs === 'S') pr = [ms, ms]; else if (cs === 'W') pr = [ENEMY[ms], ENEMY[ms]]; else { const x = pick(SK); pr = shuffle([x, ENEMY[x]]); }
        const l = take(pr[0]), r = take(pr[1]);
        const keys = n === 5 ? [take(pick(SK)), l, m, r, take(pick(SK))] : [l, m, r];
        if (keys.every(Boolean) && judge(ms, suitOf(l), suitOf(r)) === cs) return {keys, c: n === 5 ? 2 : 1};
      }
      return null;
    }
    // a fixed line for a lesson (checked like a drawn one: a lesson never shows a spread the text does not rule on)
    const fixed = (keys, c) => keys.every(k => TC[k]) && (c < 0 || judge(suitOf(keys[c]), suitOf(keys[c - 1]), suitOf(keys[c + 1]))) ? {keys, c} : null;

    // one card: the learner's photo when there is one (Q.scanOf), else a plain face in the suit's colour
    function tile(k, mid, sub) {
      const c = TC[k]; if (!c) return '';
      const img = Q.scanOf(k), su = c.suit ? c.suit.k : 'major';
      const big = c.kind === 'major' ? c.num : c.kind === 'ace' ? 'Ace' : c.kind === 'court' ? c.rank.n : String(c.n);
      const face = img ? `<img src="${esc(img)}" alt="">`
        : `<b${big.length > 4 ? ' class="w"' : ''}>${esc(big)}</b><small>${esc(c.kind === 'major' ? c.title.replace(/^The /, '') : c.suit.n)}</small>`;
      return `<figure class="ddt su-${su}${mid ? ' mid' : ''}"><div class="im">${face}</div><figcaption>${esc(nm(k))}${sub ? `<small>${sub}</small>` : ''}</figcaption></figure>`;
    }
    function line(sp, subs) {
      if (!sp) return '';
      const K = sp.keys, names = K.map(nm);
      const lab = `${K.length} card${K.length > 1 ? 's' : ''}${K.length > 1 ? ' in a line' : ''}: ${names.join(', ')}${sp.c >= 0 ? `; the card to judge is the ${names[sp.c]}` : ''}`;
      return `<div class="ddline n${K.length}" role="img" aria-label="${esc(lab)}">${K.map((k, i) => tile(k, i === sp.c, subs && subs[i])).join('')}</div>`;
    }

    /* ---------- Book T's readings (divination.json, orig): the meaning, and the "if ill dignified" text ---------- */
    const first = t => String(t || '').split(/\n/)[0].replace(/\s+/g, ' ').trim();   // without the "Malkuth of ו (…)" line
    const cap = t => t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
    const dropS = (t, re) => t.replace(/([.!?])\s+(?=[A-Z“"(])/g, '$1\u0001').split('\u0001').filter(s => !re.test(s)).join(' ').trim();
    const illT = o => cap(dropS(first(o.illDignified).replace(/^\s*(?:but\s+)?(?:if\s+|when\s+)?(?:very\s+)?ill[\s-]+dignified[\s,:;—–-]*/i, '')
      .replace(/[,;]?\s*(?:if|when)\s+(?:very\s+)?ill\s+dignified\.?\s*$/i, '.'), /^in either case\b/i));
    const wellT = o => cap(first(o.wellDignified).replace(/^\s*also\s+/i, '').replace(/[,;]?\s*(?:if|when)\s+(?:very\s+)?well\s+dignified\.?\s*$/i, '.'));
    // the meaning without its ill-dignified clause ("…subtlety: but if ill dignified—folly…") and without sentences about dignity
    // ("Also to overvalue small things, unless well dignified.")
    function mainT(o) {
      let s = first(o.meaning); const ill = first(o.illDignified), i = ill ? s.toLowerCase().indexOf(ill.toLowerCase()) : -1;
      if (i >= 0) {
        let a = s.slice(0, i).trimEnd();
        if (!/[.!?]$/.test(a)) a = a.replace(/(?:[\s:;,—–-]|\bbut\b)+$/i, '') + '.';
        s = (a + ' ' + s.slice(i + ill.length)).trim();
      }
      return dropS(s, /dignif/i);
    }
    // the judged cards that have both readings in Book T (19: every court but the Queen of Cups; the 10 of Wands, 2 of Cups,
    // 8 of Swords, 6 of Disks). exp: Book T says "when well dignified" itself (the 10 of Wands)
    const MEAN = [];
    SUITC.forEach(k => {
      if (TC[k].kind === 'ace') return;
      const o = ((DIV.card && DIV.card(k)) || {}).orig || {};
      if (!String(o.illDignified || '').trim()) return;
      const exp = !!String(o.wellDignified || '').trim(), well = exp ? wellT(o) : mainT(o), ill = illT(o);
      if (well && ill && !/dignif|dignity/i.test(well + ' ' + ill)) MEAN.push({k, well, ill, exp});
    });
    const MEANK = {}; MEAN.forEach(m => { MEANK[m.k] = m; });

    /* ---------- the sheet ---------- */
    const FXK = Object.fromEntries(DB.rows('dignity_kinds').map(k => [k.name, {domicile: 'rul:', exaltation: 'exa:', detriment: 'det:', fall: 'fal:'}[k.id]]));
    const pisFx = (pn, s, d) => ['pis:' + pn + ':' + s, ...d.map(x => FXK[x] + s)];   // the facts of quiz.html's dg.* items
    const CR = DG.crossRef && Array.isArray(DG.crossRef.sentences) ? DG.crossRef.sentences.map(String) : [];
    const CRL = CR.map(t => t.replace(/\s*\([^()]*\)/g, '').trim());   // without the example pairs (in a quiz they answer questions)
    const STEPS = DG.spreadMethod && Array.isArray(DG.spreadMethod.steps) ? DG.spreadMethod.steps.map(String) : [];
    const cnD = d => `${NUMW[d.n]} of ${d.suit.n}`;
    const digW = d => X.digStrong(d) ? 'S' : X.digWeak(d) ? 'W' : 'N';
    const XS = [];   // planetary Atu + a zodiacal Atu it rules or is exalted in (never both strong and weak)
    X.classical.forEach(p => { if (p.card) SIGNS.forEach(s => { const o = X.bySign[s], d = X.digIn(p.planet, s);
      if (o && o.card && X.digStrong(d) && !X.digWeak(d)) XS.push({p, o, s, d}); }); });

    /* ---------- the reasoning shown after a spread question (and in the lessons) ---------- */
    const nbW = (k, m) => { const s = suitOf(k), r = relOf(s, m), S = esc(SU[s].n), M = esc(SU[m].n);
      return `${esc(nm(k))} — ${r === 'same' ? 'its own suit' : r === 'inimical' ? `${S}, inimical to ${M}` : r === 'friendly' ? `${S}, friendly with ${M}` : `${S}: Book T gives no relation to ${M}`}`; };
    function reason(sp, m) {
      if (!sp) return '';
      const K = sp.keys, c = sp.c, mk = K[c], ms = suitOf(mk), l = K[c - 1], r = K[c + 1], ls = suitOf(l), rs = suitOf(r), v = judge(ms, ls, rs);
      if (!v) return '';
      const st = [`The card to judge: <b>${esc(nm(mk))}</b> (${esc(SU[ms].n)}).`,
        `Next to it: ${nbW(l, ms)}; ${nbW(r, ms)}.` + (K.length > 3 ? ` <span class="sub">The ${esc(nm(K[0]))} and the ${esc(nm(K[K.length - 1]))} are not next to it, so they do not count.</span>` : ''),
        v === 'S' ? `Both are of its own suit. Book T: “${esc(RULE.same.text)}”`
          : v === 'W' ? `Both are of the suit inimical to it. Book T: “${esc(RULE.opposite.text)}”`
            : `${esc(SU[ls].n)} and ${esc(SU[rs].n)} are inimical to each other. Book T: “${esc(RULE.between.text)}”`,
        `So it is <b>${v === 'S' ? 'strengthened greatly' : v === 'W' ? 'weakened greatly' : 'not much affected by either'}</b>${v === 'S' ? ': strong, well dignified' : v === 'W' ? ': weak, ill dignified' : ''}.`];
      // (the 10 of Wands: Book T's "when well dignified" text is added to its meaning — "Also generosity…" —, not the meaning itself)
      if (m) st.push(v === 'S' ? (m.exp ? `Book T's reading “when well dignified” applies: “${esc(m.well)}”` : `Its Book T meaning holds: “${esc(m.well)}”`)
        : v === 'W' ? `Book T's reading “if ill dignified” applies: “${esc(m.ill)}”` : 'Read it much as it stands: neither at full strength nor by its ill-dignified reading.');
      return `<ol class="lol ddr">${st.map(x => `<li>${x}</li>`).join('')}</ol>`;
    }

    /* ---------- the relations ---------- */
    Q.addRelations(function (ctx) {
      const {rel} = ctx;
      const sd = (t, o) => side(t, Object.assign({typ: false}, o || {}));
      const note = (it, f) => { const fn = () => f(it); it.note = fn; it.noteL = fn; return it; };
      const suitH = k => `<b>${esc(SU[k].n)}</b>`;
      const suitS = k => sd(SU[k].n, {typ: true, cat: 'ddsuit',
        h: `<b>${esc(SU[k].n)}</b>${SU[k].bt !== SU[k].n ? ` <span class="sub">(Book T: ${esc(SU[k].bt)})</span>` : ''}`,
        alt: uniq([SU[k].bt, ...((Q.tarot.suits.find(s => s.k === k) || {}).alt || [])]).filter(a => a !== SU[k].n)});

      /* stage 1 · two kinds of dignity */
      // the two methods (tab Dignity methods) and the things a reading weighs by each (tab Dignity method examples; e, l: the method)
      const KM = Object.fromEntries(DB.rows('dignity_methods').map(m => [m.id, esc(m.name)]));
      const KV = {e: sd(DB.get('dignity_methods', 'essential').name, {cat: 'ddk', ck: 'kind:e', h: `<b>${KM.essential}</b>`, hl: `<b>${KM.essential}</b> — a planet in a sign, read with your sheet`}),
        l: sd(DB.get('dignity_methods', 'elemental').name, {cat: 'ddk', ck: 'kind:l', h: `<b>${KM.elemental}</b>`, hl: `<b>${KM.elemental}</b> — the cards next to it, by Book T`})};
      const KN = {e: 'Essential dignity: a planet\'s standing in a sign (domicile, exaltation, detriment or fall), read with your sheet.',
        l: `Elemental dignity: Book T's rule, “${esc(TEXT[0])}”`};
      const KINDS = DB.rows('dignity_method_examples').map(r => [r.id, r.text, {essential: 'e', elemental: 'l'}[r.method]]);
      // (one fact per kind: the explanation of one item is the principle behind every other item of its kind)
      rel({id: 'did.kind', deck: 'divination', name: 'Essential or elemental dignity?', dirs: ['f'], nomatch: true,
        fq: it => `Which kind of dignity is this about?<br><b>${esc(it.s.t)}</b>`,
        items: KINDS.map(([key, t, v]) => note({key, fx: ['kind:' + v], s: sd(t, {cat: 'ddks'}), v: KV[v]}, () => KN[v]))});
      const WV = {well: sd('Well dignified', {cat: 'ddwi', ck: 'wi:well', h: '<b>Well dignified</b>'}),
        ill: sd('Ill dignified', {cat: 'ddwi', ck: 'wi:ill', h: '<b>Ill dignified</b>'})};
      rel({id: 'did.wi', deck: 'divination', name: 'Book T reading → well or ill dignified', dirs: ['f'], nomatch: true,
        // (the prompt never names the two answers: the leak guard would then keep every other question of this kind out of the quiz)
        fq: it => `Book T on the <b>${esc(nm(it.k))}</b>:<br>“${esc(it.txt)}”<br>How must the card be dignified for this reading?`,
        items: MEAN.flatMap(m => ['well', 'ill'].map(w => note({key: m.k + ':' + w, k: m.k, row: 't' + m.k, fx: ['wi:' + m.k], txt: brief(m[w], 240),
          s: sd(`${nm(m.k)}: ${m[w]}`, {cat: 'ddwis'}), v: WV[w]},
        () => w === 'ill' ? `Book T gives this for the ${esc(nm(m.k))} <b>if ill dignified</b>.`
          : m.exp ? `Book T gives this for the ${esc(nm(m.k))} <b>when well dignified</b>.`
            : `This is Book T's meaning of the ${esc(nm(m.k))}: it holds while the card is well dignified. For the card ill dignified Book T gives another reading.`)))});

      /* stage 2 · what each card carries */
      const WH = {pl: 'A planet', sg: 'A sign of the zodiac', el: 'An element', dec: 'A planet in a sign',
        root: 'The root of its element — no planet or sign', ee: 'An element of an element — no single planet or sign'};
      const whS = (k, o) => sd(WH[k], Object.assign({cat: 'ddwh', ck: 'wh:' + k, h: `<b>${esc(WH[k])}</b>`}, o || {}));
      const ATU = {}; ORDER.forEach(k => { if (TC[k].kind === 'major') ATU[TC[k].num] = TC[k]; });
      const WA = [];
      // (Atu XIX Sun names its own planet: left out)
      X.classical.forEach(p => { if (p.card && ATU[p.atu] && !namesAny([p.card], [p.planet]))
        WA.push({o: p, k: 'pl', fx: 'patu:' + p.id, n: `${X.pl(p)} <span class="sub">(sheet, section 2)</span>`}); });
      SIGNS.forEach(s => { const o = X.bySign[s]; if (o && o.card && ATU[o.atu]) WA.push({o, k: 'sg', fx: 'atu:' + s, n: `${X.sg(s)} <span class="sub">(sheet, section 1)</span>`}); });
      (Array.isArray(DG.elemental) ? DG.elemental : []).forEach(e => { if (e && e.card && e.element && ATU[e.atu])
        WA.push({o: e, k: 'el', fx: 'e1:' + e.atu, n: `${esc(e.element)} <span class="sub">(sheet, section 3: Crowley pairs it with ${esc(e.outer || '')}, an outer planet that holds no dignity in this scheme)</span>`}); });
      rel({id: 'did.what', deck: 'dignities', name: 'Atu → what it carries: a planet, a sign or an element', dirs: ['f'], nomatch: true,
        synth: () => [{sd: whS('dec'), sc: 2.6}],
        fq: it => `For the dignities, what does ${X.atu(it.o)} carry?`,
        items: WA.map(w => note({key: ATU[w.o.atu].key, o: w.o, fx: [w.fx, 'wh:' + ATU[w.o.atu].key], s: sd(`Atu ${w.o.atu} ${w.o.card}`, {cat: 'ddatu'}),
          v: whS(w.k, {hl: `<b>${esc(WH[w.k])}</b> — ${w.n}`})}, () => `${X.atu(w.o)} carries ${w.n}.`))});
      rel({id: 'did.whatm', deck: 'dignities', name: 'Ace or court card → what it carries', dirs: ['f'], nomatch: true,
        synth: () => [{sd: whS('dec'), sc: 2.7}, {sd: whS('sg'), sc: 2.5}, {sd: whS('pl'), sc: 2.3}],
        fq: it => `For the dignities, what does the <b>${esc(nm(it.k))}</b> carry?`,
        items: SUITC.filter(k => TC[k].kind === 'ace' || TC[k].kind === 'court').map(k => {
          const c = TC[k], ace = c.kind === 'ace', w = ace ? 'root' : 'ee';
          const n = ace ? `the root of ${esc(c.suit.el)}; it carries no planet or sign`
            : `${esc(c.rank.el)} of ${esc(c.suit.el)}; it rules ${c.span ? `${esc(c.span.t)}, three decans` : 'a quadrant of the heavens about the North Pole'}, so no single planet or sign`;
          // one Ace and one court card at most: the explanation of one is true of every other card of its kind
          return note({key: k, k, wk: ace ? 'ace' : 'court', fx: [(ace ? 'ta.ace.el|' : 'ta.court.el|') + k, 'wh:' + (ace ? 'ace' : 'court')], s: sd(c.name, {cat: 'ddcm'}),
            v: whS(w, {hl: `<b>${esc(WH[w])}</b> — ${n}`})}, () => `The ${esc(c.name)}: ${n}.`); })});

      /* stage 3 · the small cards by their decan (the sheet's method) */
      const DV = {S: sd('Strengthens it', {cat: 'ddsw', ck: 'sw:S', h: '<b>Strengthens it</b><small>the planet rules the sign or is exalted there</small>'}),
        W: sd('Weakens it', {cat: 'ddsw', ck: 'sw:W', h: '<b>Weakens it</b><small>the planet is in detriment or in its fall there</small>'}),
        N: sd('Neither', {cat: 'ddsw', ck: 'sw:N', h: '<b>Neither</b><small>peregrine: none of the four</small>'})};
      rel({id: 'did.decsw', deck: 'dignities', name: 'Small card → strengthened or weakened by its decan (your sheet)', dirs: ['f'], nomatch: true,
        fq: it => `By your sheet's key, what does the planet of its decan do to the <b>${esc(it.cn)}</b>?`,
        items: DECANS.map(d => {
          const p = X.byPlanet[d.ruler]; if (!p || !X.bySign[d.sign] || !d.suit) return null;
          const dd = X.digIn(d.ruler, d.sign), w = digW(dd), pis = `${X.pl(p)} in ${X.sg(d.sign)}`, lab = X.digLabel(dd).toLowerCase();
          return note({key: d.key, cn: cnD(d), sg: d.sign, sp: d.ruler, row: 'ds-' + d.sign, fx: pisFx(d.ruler, d.sign, dd), s: sd(cnD(d), {cat: 'dcard'}),
            v: Object.assign({}, DV[w], {hl: `<b>${esc(DV[w].t)}</b> — ${pis}: ${esc(lab)}`})},
          () => `${esc(cnD(d))} = ${pis} <span class="sub">(${esc(d.sign)} ${d.rn})</span>: <b>${esc(lab)}</b>, so ${w === 'S' ? 'strengthened' : w === 'W' ? 'weakened' : 'neither strengthened nor weakened'}.`
            + (CR[2] ? ` <span class="sub">Your sheet: “${esc(CR[2])}”</span>` : '')); }).filter(Boolean)});

      /* stage 4 · a planetary Atu beside a zodiacal Atu (the sheet's cross-reference) */
      rel({id: 'did.xstr', deck: 'dignities', name: 'Planetary Atu → a zodiacal Atu that strengthens it', dirs: ['f'], nomatch: true,
        // never offered: another Atu that strengthens the same planet (it would be right too)
        near: (a, b) => a.sp === b.sp || X.digStrong(X.digIn(a.sp, b.sg)),
        fq: it => `By your sheet's rule, which zodiacal Atu laid beside ${X.atu(it.p)} strengthens it?`,
        items: XS.map(x => {
          const others = XS.filter(y => y.p === x.p && y !== x).map(y => X.atu(y.o));
          const how = x.d.length > 1 ? 'rules it and is exalted there' : x.d[0] === 'Domicile' ? 'rules it' : 'is exalted there';
          const why = () => `${X.atu(x.p)} is ${X.pl(x.p)}; ${X.atu(x.o)} is ${X.sg(x.s)}: ${esc(x.p.planet)} ${how}, so each strengthens the other.`;
          // (in a Learn quiz without the other Atus that strengthen it: they would answer that planet's other pairs)
          return {key: x.p.id + '@' + x.s, p: x.p, sp: x.p.planet, sg: x.s, row: 'dp-' + x.p.id, fx: pisFx(x.p.planet, x.s, x.d),
            s: sd(`${x.p.planet} beside ${x.s}`, {cat: 'ddxs'}), v: Object.assign(ctx.atuS(x.o), {typ: false}), noteL: why,
            note: () => why() + (others.length ? ` <span class="sub">It is strengthened beside ${listAnd(others)} too.</span>` : '')}; })});
      // (No question asks the rule's wording itself: every pair's explanation quotes it, so it would be answered in advance.)

      /* stage 5 · Book T's elemental dignities */
      rel({id: 'did.suit', deck: 'divination', name: 'Suit ↔ element', nomatch: true,
        fq: it => `Which element is the suit of ${it.s.h}?`, rq: it => `Which suit is the element <b>${esc(it.v.t)}</b>?`,
        items: SK.map(k => note({key: k, fx: ['sel:' + k], s: suitS(k), v: sd(SU[k].el, {typ: true, cat: 'ddel'})},
          () => `${esc(SU[k].n)}${SU[k].bt !== SU[k].n ? ` (Book T: ${esc(SU[k].bt)})` : ''} = <b>${esc(SU[k].el)}</b>.`))});
      const PV = {inimical: sd('Inimical', {cat: 'ddpr', ck: 'pr:i', h: '<b>Inimical</b><small>contrary to each other</small>'}),
        friendly: sd('Friendly', {cat: 'ddpr', ck: 'pr:f', h: '<b>Friendly</b>'}),
        unstated: sd('Book T does not say', {cat: 'ddpr', ck: 'pr:u', h: '<b>Book T does not say</b>'})};
      const PAIRS = []; SK.forEach((a, i) => SK.slice(i + 1).forEach(b => PAIRS.push([a, b])));
      // the explanation states this pair only: the sentence "Swords are friendly with Cups and Wands" would also answer a
      // question on Swords and Cups, so a friendship is stated, not quoted; an enmity is quoted (its sentence names the pair alone)
      const pairNote = (a, b) => { const r = relOf(a, b), t = sayOf(a, b).filter(s => /inimical/.test(s));
        return r === 'inimical' && t.length ? `Book T: “${esc(t[0])}”`
          : r === 'friendly' ? `Book T counts ${esc(SU[a].bt)} and ${esc(SU[b].bt)} friendly.`
            : `Book T names the friends of ${esc(SU.swords.bt)} and of ${esc(SU.wands.bt)} only; it gives no relation between ${esc(SU[a].bt)} and ${esc(SU[b].bt)}.`; };
      const disksNote = (...ks) => ks.includes('disks') ? ` <span class="sub">(Disks: Book T's ${esc(SU.disks.bt)})</span>` : '';
      rel({id: 'did.pair', deck: 'divination', name: 'Two suits → inimical or friendly (Book T)', dirs: ['f'], nomatch: true,
        fq: it => `By Book T, how do ${suitH(it.a)} and ${suitH(it.b)} stand to each other?${disksNote(it.a, it.b)}`,
        items: PAIRS.map(([a, b]) => note({key: a + '+' + b, a, b, fx: ['pr:' + pk(a, b)], s: sd(`${SU[a].n} and ${SU[b].n}`, {cat: 'ddpair'}), v: PV[relOf(a, b)]},
          () => pairNote(a, b)))});
      rel({id: 'did.enemy', deck: 'divination', name: 'Suit → the suit inimical to it (Book T)', dirs: ['f'], nomatch: true,
        near: () => true, synth: it => SK.filter(k => k !== it.key && k !== ENEMY[it.key]).map(k => ({sd: suitS(k), sc: 3})),
        // (the Pentacles note only for the suit asked about: added for its enemy, it would name the answer — "inimical to Swords?
        // (Disks: Book T's Pentacles)"; the options give Book T's name themselves)
        fq: it => `By Book T, which suit is inimical to ${suitH(it.key)}?${disksNote(it.key)}`,
        items: SK.map(k => note({key: k, fx: ['pr:' + pk(k, ENEMY[k])], s: suitS(k), v: suitS(ENEMY[k])}, () => pairNote(k, ENEMY[k])))});
      const frS = a => sd(listAnd(a.map(k => SU[k].n)), {cat: 'ddfr', ck: 'fr:' + a.slice().sort().join('+'), h: a.map(suitH).join(' and ')});
      const FR = SK.map(k => ({k, f: SK.filter(b => b !== k && REL[pk(k, b)] === 'friendly')})).filter(x => x.f.length === 2);
      rel({id: 'did.friends', deck: 'divination', name: 'Suit → its two friendly suits (Book T)', dirs: ['f'], nomatch: true,
        near: () => true, synth: it => { const o = SK.filter(k => k !== it.key); return [[o[0], o[1]], [o[0], o[2]], [o[1], o[2]]].map(c => ({sd: frS(c), sc: 3})); },
        fq: it => `By Book T, ${suitH(it.key)} are friendly with which two suits?${disksNote('disks')}`,
        items: FR.map(x => note({key: x.k, fx: x.f.map(b => 'pr:' + pk(x.k, b)), s: suitS(x.k), v: frS(x.f)},
          () => `Book T: “${esc(TEXT.find(t => new RegExp('^' + SU[x.k].bt + ' are friendly').test(t)) || '')}”`))});
      rel({id: 'did.rule', deck: 'divination', name: "Book T's rule: the cards on either side → the card", nomatch: true,
        fq: it => `Book T, “Of the Dignities”: <b>${esc(it.s.t)}</b>. What does this do to the card between them?`,
        rq: it => `Book T, “Of the Dignities”: the card is <b>${esc(it.v.t.charAt(0).toLowerCase() + it.v.t.slice(1))}</b>. When?`,
        items: ['same', 'opposite', 'between'].map(id => note({key: id, fx: ['rule:' + id], s: sd(RULE[id].when, {cat: 'ddwhen'}), v: sd(RULE[id].effect, {cat: 'ddeff'})},
          () => `Book T: “${esc(RULE[id].text)}”`))});
      // Book T's table of majorities (p. 205): the reason no drill judges an Ace. (The options are kinds of card the table gives no
      // strength to: its "Keys" row, "strong forces beyond the Querent's control", is left out as too near)
      const MAJ = ED.majorityNote && ED.majorityNote.text ? String(ED.majorityNote.text) : '';
      if (/^Aces\b/.test(MAJ)) rel({id: 'did.aces', deck: 'divination', name: 'Book T: the cards that are always strong', dirs: ['f'], nomatch: true,
        synth: () => ['Court cards', 'Tens', 'Twos'].map(t => ({sd: sd(t, {typ: true, cat: 'ddace'}), sc: 3})),
        fq: () => 'Book T\'s table of majorities: which cards are <b>“always strong cards”</b>?',
        items: [note({key: 'aces', fx: ['aces'], s: sd('Always strong cards', {cat: 'ddacq'}), v: sd('Aces', {typ: true, cat: 'ddace', alt: ['Ace', 'The Aces']})},
          () => `Book T: “${esc(MAJ)}” <span class="sub">(the table of majorities, p. 205)</span>`)]});

      /* stage 6 · the sheet's four steps */
      rel({id: 'did.step', deck: 'dignities', name: "The sheet's method in a spread: its four steps", nomatch: true,
        fq: it => `Your sheet's method in a spread: what is <b>step ${esc(it.key)}</b>?`,
        rq: it => `Your sheet's method in a spread: “${esc(it.v.t)}” — which step is this?`,
        items: STEPS.map((t, i) => note({key: String(i + 1), fx: ['step:' + (i + 1)], s: side(String(i + 1), {num: true, cat: 'ddstepn', h: `Step <b>${i + 1}</b>`}),
          v: sd(cap(t), {cat: 'ddstep'})}, () => `Step ${i + 1} of ${STEPS.length}: ${esc(cap(t))}.`))});
      const zS = o => sd(`Atu ${o.atu} ${o.card}`, {cat: 'ddz', h: `${X.atu(o)} · ${X.sg(o.sign)}`});
      // a ruler also states the detriment across the zodiac, an exaltation the fall ("Mars is exalted in Capricorn" answers
      // "Mars in Cancer: which dignity?"): the facts carry both, so such pairs are never in one quiz
      const oppOf = s => (X.bySign[s] || {}).opposite || '';
      const rulFx = s => ['rul:' + s, 'det:' + oppOf(s)], exaFx = s => ['exa:' + s, 'fal:' + oppOf(s)];
      const pS = p => sd(`Atu ${p.atu} ${p.card}`, {cat: 'ddp', h: `${X.atu(p)} · ${X.pl(p)}`});
      rel({id: 'did.m2r', deck: 'dignities', name: 'Step 2 · zodiacal Atu → its ruler (native mode)', dirs: ['f'],
        // (the prompts never say which step this is: that is asked by did.step)
        fq: it => `The ruler row: ${it.s.h}. Which planet rules it, giving the card its native mode?`,
        items: SIGNS.map(s => { const o = X.bySign[s], p = o && X.byPlanet[o.ruler];
          return o && o.card && p ? note({key: s, sg: s, row: 'ds-' + s, fx: rulFx(s), s: zS(o), v: ctx.plS(p)}, () => `${X.sg(s)} is ruled by ${X.pl(p)}. ${X.keyLine('Ruler')}`) : null; }).filter(Boolean)});
      rel({id: 'did.m2e', deck: 'dignities', name: 'Step 2 · zodiacal Atu → the planet exalted there (its peak)', dirs: ['f'],
        fq: it => `The exaltation row: ${it.s.h}. Which planet is exalted there, giving the card its peak?`,
        items: SIGNS.map(s => { const o = X.bySign[s]; if (!o || !o.card) return null; const p = o.exalted && X.byPlanet[o.exalted];
          return note({key: s, sg: s, row: 'ds-' + s, fx: exaFx(s), s: zS(o), v: p ? ctx.plS(p) : ctx.noneS('exalted')},
            () => p ? `${X.pl(p)} is exalted in ${X.sg(s)}. ${X.keyLine('Exaltation')}` : `No planet is exalted in ${X.sg(s)} in this scheme.`); }).filter(Boolean)});
      rel({id: 'did.m2p', deck: 'dignities', name: 'Step 2 · planetary Atu → the signs it rules (native mode)', dirs: ['f'], sim: (a, b) => a.v.n === b.v.n ? 1.5 : 0,
        fq: it => `The ruler row: ${it.s.h}. Which sign or signs does its planet rule, its native mode?`,
        items: X.classical.map(p => p.card && Array.isArray(p.domicile) && p.domicile.length
          ? note({key: p.id, sp: p.planet, row: 'dp-' + p.id, fx: p.domicile.flatMap(rulFx), s: pS(p), v: ctx.setS(p.domicile)},
            () => `${X.pl(p)} rules ${listAnd(p.domicile.map(X.sg))}. ${X.keyLine('Ruler')}`) : null).filter(Boolean)});
      rel({id: 'did.m2q', deck: 'dignities', name: 'Step 2 · planetary Atu → its exaltation (its peak)', dirs: ['f'],
        fq: it => `The exaltation row: ${it.s.h}. In which sign is its planet exalted, its peak?`,
        items: X.classical.map(p => p.card && p.exaltation && X.bySign[p.exaltation]
          ? note({key: p.id, sp: p.planet, row: 'dp-' + p.id, fx: exaFx(p.exaltation), s: pS(p), v: ctx.sgS(p.exaltation)},
            () => `${X.pl(p)} is exalted in ${X.sg(p.exaltation)}. ${X.keyLine('Exaltation')}`) : null).filter(Boolean)});

      /* stages 7 and 8 · spreads, drawn afresh at every asking (pre); the item fixes the case */
      // Book T's three rulings (tab Elemental dignity rules: the effect, up to its dash): S same suit, W inimical, N between contraries
      const JR = {S: 'same', W: 'opposite', N: 'between'}, jt = c => String(RULE[JR[c]].effect).split(' — ')[0];
      const JV = {S: sd(jt('S'), {cat: 'ddj', ck: 'j:S', h: `<b>${esc(jt('S'))}</b>`, hl: `<b>${esc(jt('S'))}</b>: strong, well dignified`}),
        W: sd(jt('W'), {cat: 'ddj', ck: 'j:W', h: `<b>${esc(jt('W'))}</b>`, hl: `<b>${esc(jt('W'))}</b>: weak, ill dignified`}),
        N: sd(jt('N'), {cat: 'ddj', ck: 'j:N', h: `<b>${esc(jt('N'))}</b>`, hl: `<b>${esc(jt('N'))}</b> neighbour`})};
      const CN = {S: 'both neighbours of its suit', W: 'both neighbours inimical to it', N: 'neighbours inimical to each other'};
      const judgeRel = (id, name, n, lead) => rel({id, deck: 'divination', name, dirs: ['f'], nomatch: true,
        pre: it => { it.ln = spread(it.m, it.cs, n); },
        fq: it => { if (!it.ln) it.ln = spread(it.m, it.cs, n); return `${lead}${line(it.ln)}`; },
        items: SK.flatMap(s => ['S', 'W', 'N'].map(cs => note({key: s + '~' + cs, m: s, cs, s: sd(`${SU[s].n} card · ${CN[cs]}`, {cat: 'ddsp'}), v: JV[cs]},
          it => reason(it.ln))))});
      judgeRel('did.tri', 'Three cards → the middle card by Book T', 3, 'Three cards in a line. By Book T\'s rule, how is the <b>middle card</b> dignified?');
      judgeRel('did.line5', 'Five cards → the centre card by Book T', 5, 'Five cards in a line. By Book T\'s rule, how is the <b>centre card</b> dignified?');
      const rdS = (m, w) => sd((w === 'well' ? 'Well dignified: ' : 'Ill dignified: ') + m[w], {cat: 'ddrd', ck: 'rd:' + m.k + ':' + w,
        h: `<b>${w === 'well' ? 'Well dignified' : 'Ill dignified'}</b><small>“${esc(brief(m[w], 170))}”</small>`,
        hl: `<b>${w === 'well' ? 'Well dignified' : 'Ill dignified'}</b>: “${esc(m[w])}”`});
      rel({id: 'did.trim', deck: 'divination', name: 'Three cards → the Book T reading of the middle card', dirs: ['f'], nomatch: true,
        near: () => true, synth: it => [{sd: it.other, sc: 9}],   // the options: this card's two readings, nothing else
        pre: it => { it.ln = spread(it.k, it.cs, 3); },
        fq: it => { if (!it.ln) it.ln = spread(it.k, it.cs, 3); return `Three cards in a line. Which Book T reading does the middle card, the <b>${esc(nm(it.k))}</b>, take here?${line(it.ln)}`; },
        items: MEAN.flatMap(m => ['S', 'W'].map(cs => note({key: m.k + '~' + cs, k: m.k, cs, row: 't' + m.k, fx: ['rd:' + m.k],
          s: sd(`${nm(m.k)} · ${CN[cs]}`, {cat: 'ddsp'}), v: rdS(m, cs === 'S' ? 'well' : 'ill'), other: rdS(m, cs === 'S' ? 'ill' : 'well')},
        it => reason(it.ln, m))))});
      const r3S = (m, cs) => cs === 'S'
        ? sd('Strong: its meaning holds — ' + m.well, {cat: 'dd3', ck: 'r3:' + m.k + ':S', h: `<b>Strong, well dignified</b><small>“${esc(brief(m.well, 150))}”</small>`, hl: `<b>Strong, well dignified</b>: “${esc(m.well)}”`})
        : cs === 'W' ? sd('Weak: ill dignified — ' + m.ill, {cat: 'dd3', ck: 'r3:' + m.k + ':W', h: `<b>Weak, ill dignified</b><small>“${esc(brief(m.ill, 150))}”</small>`, hl: `<b>Weak, ill dignified</b>: “${esc(m.ill)}”`})
          : sd('Not much affected: much as it stands', {cat: 'dd3', ck: 'r3:' + m.k + ':N', h: '<b>Not much affected</b><small>read much as it stands</small>', hl: '<b>Not much affected</b>: read much as it stands'});
      rel({id: 'did.read3', deck: 'divination', name: 'Three cards → how to read the middle card', dirs: ['f'], nomatch: true,
        near: () => true, synth: it => ['S', 'W', 'N'].filter(c => c !== it.cs).map(c => ({sd: r3S(it.mm, c), sc: 9})),
        pre: it => { it.ln = spread(it.k, it.cs, 3); },
        fq: it => { if (!it.ln) it.ln = spread(it.k, it.cs, 3); return `Three cards in a line. How do you read the middle card, the <b>${esc(nm(it.k))}</b>?${line(it.ln)}`; },
        items: MEAN.flatMap(m => ['S', 'W', 'N'].map(cs => note({key: m.k + '~' + cs, k: m.k, mm: m, cs, row: 't' + m.k, fx: ['rd3:' + m.k],
          s: sd(`${nm(m.k)} · ${CN[cs]}`, {cat: 'ddsp'}), v: r3S(m, cs)}, it => reason(it.ln, m))))});
    });

    /* ---------- the lessons (compact tables and card lines; the learner's photos where there are any) ---------- */
    const quote = (lines, cite) => `<blockquote class="ddq">${lines.map(t => `<p>${esc(t)}</p>`).join('')}${cite ? `<cite>${cite}</cite>` : ''}</blockquote>`;
    const details = (sum, body) => `<details class="ddd"><summary>${sum}</summary>${body}</details>`;
    const cap1 = t => esc(cap(String(t)));
    const verdict = sp => { const K = sp.keys, v = judge(suitOf(K[sp.c]), suitOf(K[sp.c - 1]), suitOf(K[sp.c + 1]));
      return v === 'S' ? '<span class="dst">strengthened greatly</span>' : v === 'W' ? '<span class="dwk">weakened greatly</span>' : '<span class="ddf">not much affected</span>'; };
    const cellOf = (a, b) => { const r = relOf(a, b);
      return r === 'same' ? '<span class="dst">same</span>' : r === 'inimical' ? '<span class="dwk">inimical</span>' : r === 'friendly' ? '<span class="ddf">friendly</span>' : '<span class="sub" title="Book T gives no relation">—</span>'; };
    const ABBR = Object.fromEntries(DB.rows('dignity_kinds').map(k => [k.name, k.abbr]));   // R, E, D, F (tab Dignity kinds)
    // the 36 small cards as a grid: suits down, 2–10 across; cell(d) → [class, html, title]
    function decGrid(cell, label) {
      const N = [2, 3, 4, 5, 6, 7, 8, 9, 10];
      const rows = SK.map(s => `<tr><th scope="row">${esc(SU[s].n)}</th>${N.map(n => { const d = DECANS.find(x => x.key === s + '-' + n); if (!d) return '<td></td>';
        const [cls, h, t] = cell(d); return `<td class="${cls}" title="${esc(t)}">${h}</td>`; }).join('')}</tr>`).join('');
      return `<div class="tscroll"><table class="pisg ddgrid" aria-label="${esc(label)}"><thead><tr><th scope="col"></th>${N.map(n => `<th scope="col">${n}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`;
    }
    const plG = n => g((X.byPlanet[n] || {}).glyph), sgG = s => g((X.bySign[s] || {}).glyph);

    function les1() {
      const K = DG.readingKey || {}, ex = ['wands-queen', 'cups-2', 'disks-prince'].map(k => MEANK[k]).filter(Boolean);
      return L.p('Two different things are called a card\'s <b>dignity</b>. A reading can use both; they answer different questions, and this path keeps them apart.')
        + L.table(['', 'Essential dignity', 'Elemental dignity'], [
          ['<b>From</b>', `your sheet, <i>${esc(DG.title || '')}</i>`, `Book T, “Of the Dignities” <span class="sub">(The Equinox I:8, 1912)</span>`],
          ['<b>It looks at</b>', 'a planet in a sign: a small card\'s decan, or a planetary Atu beside a zodiacal Atu', 'the suits of the two cards next to the card'],
          ['<b>Strong</b>', 'the planet rules the sign or is exalted there', 'both neighbours of its own suit'],
          ['<b>Weak</b>', 'the planet is in detriment or in its fall', 'both neighbours of the suit inimical to it'],
          ['<b>Neither</b>', 'peregrine: none of the four', 'its two neighbours inimical to each other']])
        + L.sec('Essential dignity: your reading key')
        + L.table(['Dignity', 'Reading key'], Object.keys(K).map(k => [`<b>${esc(k)}</b>${k === 'Ruler' ? ' <span class="sub">(domicile)</span>' : ''}`, esc(K[k])]))
        + L.sec('Elemental dignity: Book T')
        + quote([TEXT[0]], BT_CITE)
        + L.sec('What “well” and “ill dignified” change')
        + L.p('Book T gives each card its meaning and, for many cards, what it means <b>if ill dignified</b>. Its first sentence pairs <i>strong</i> with <i>well dignified</i> and <i>weak</i> with <i>ill dignified</i>. So in this path a card that is strengthened keeps its meaning at full strength, and a card that is weakened takes its ill-dignified reading where Book T gives one.')
        + L.table(['Card', 'Its meaning', 'If ill dignified'], ex.map(m => [`<b>${esc(nm(m.k))}</b>`, esc(brief(m.well, 110)), esc(brief(m.ill, 110))]))
        + details(`All ${MEAN.length} cards with an ill-dignified reading in Book T`,
          L.table(['Card', 'Well dignified', 'Ill dignified'], MEAN.map(m => [`<b>${esc(nm(m.k))}</b>`, esc(m.well) + (m.exp ? ' <span class="sub">(“when well dignified”)</span>' : ''), esc(m.ill)])))
        + L.p('<span class="sub">The other cards have no separate ill-dignified reading in Book T; several of their meanings end “according to dignity” or the like. The readings are quoted here without their opening or closing words “if ill dignified”.</span>');
    }

    function les2() {
      const A = {}; X.classical.forEach(p => { if (p.card) A[p.atu] = ['pl', p]; });
      SIGNS.forEach(s => { const o = X.bySign[s]; if (o && o.card) A[o.atu] = ['sg', o]; });
      (DG.elemental || []).forEach(e => { if (e && e.card) A[e.atu] = ['el', e]; });
      const atuRows = ORDER.filter(k => TC[k].kind === 'major').map(k => { const c = TC[k], a = A[c.num]; if (!a) return null;
        const [kind, o] = a;
        return [`Atu <b>${esc(c.num)}</b> ${esc(o.card || c.title)}`, kind === 'pl' ? `${X.pl(o)} <span class="sub">planet</span>`
          : kind === 'sg' ? `${X.sg(o.sign)} <span class="sub">sign</span>` : `${esc(o.element)} <span class="sub">element · ${esc(o.outer || '')}</span>`]; }).filter(Boolean);
      const ex = fixed(['atu-3', 'atu-8', 'atu-0', 'cups-4', 'cups-1', 'cups-queen'], -1);
      const d4 = DECANS.find(d => d.key === 'cups-4'), qc = TC['cups-queen'];
      const subs = [X.pn('Venus'), X.sg('Libra'), 'Air', d4 ? `${X.pn(d4.ruler)} in ${X.sg(d4.sign)}` : '', 'root of Water', qc ? `${esc(qc.rank.el)} of ${esc(qc.suit.el)}` : ''];
      return L.p('Before a dignity can be judged, find what the card carries. Each kind of card carries something different:')
        + L.table(['Cards', 'Carry', 'Where'], [
          ['7 planetary Atus', 'a planet', 'sheet, section 2'], ['12 zodiacal Atus', 'a sign', 'sheet, section 1'],
          ['3 elemental Atus', 'an element (the sheet pairs each with an outer planet, which holds no dignity in this scheme)', 'sheet, section 3'],
          ['36 small cards 2–10', 'a planet in a sign: the decan', 'Book T, Liber 777'],
          ['4 Aces', 'the root of an element: no planet or sign', 'Book T'],
          ['16 court cards', 'an element of an element (Knight Fire, Queen Water, Prince Air, Princess Earth of the suit\'s element). Knights, Queens and Princes rule 20° of one sign to 20° of the next, three decans; Princesses rule a quadrant of the heavens. So there is no single planet or sign.', 'Book T']])
        + line(ex, subs)
        + L.sec('The 22 Atus') + L.table(['Atu', 'Carries'], atuRows)
        + L.p(`<span class="sub">Mind the titles: Atu XVIII Moon is the sign ${X.sg('Pisces')}; the planet Moon's card is Atu II Priestess.</span>`)
        + L.sec('The 36 small cards: planet in sign')
        + decGrid(d => ['', `${plG(d.ruler)}${sgG(d.sign)}`, `${d.n} of ${d.suit.n}: ${d.ruler} in ${d.sign} (${d.sign} ${d.rn})`], 'Planet and sign of each small card')
        + L.p(`<span class="sub">Each cell gives the planet, then the sign: the 2 of Wands is ${X.pn('Mars')} in ${X.sg('Aries')}. The decans run from Aries I (the 2 of Wands) through the zodiac, and their planets follow the Chaldean order: Mars, Sun, Venus, Mercury, Moon, Saturn, Jupiter, then again.</span>`);
    }

    function les3() {
      const rows = w => DECANS.map(d => ({d, dd: X.digIn(d.ruler, d.sign)})).filter(x => digW(x.dd) === w)
        .map(x => [`<b>${esc(cnD(x.d))}</b>`, `${X.pn(x.d.ruler)} in ${X.sg(x.d.sign)}`, `<span class="${w === 'S' ? 'dst' : 'dwk'}">${esc(X.digLabel(x.dd))}</span>`]);
      const per = DECANS.filter(d => !X.digIn(d.ruler, d.sign).length).sort((a, b) => SK.indexOf(a.suit.k) - SK.indexOf(b.suit.k) || a.n - b.n).map(cnD);
      const ex = fixed(['cups-4', 'swords-3', 'disks-10'], -1);
      const exSub = ex ? ex.keys.map(k => { const d = DECANS.find(x => x.key === k); return d ? `${X.pn(d.ruler)} in ${X.sg(d.sign)}: ${esc(X.digLabel(X.digIn(d.ruler, d.sign)).toLowerCase())}` : ''; }) : null;
      return `<div class="note"><b>Your sheet's method, not Book T's.</b> ${CR[2] ? `Your sheet: “${esc(CR[2])}”` : ''} Book T gives each small card its planet and sign; judging the card by that planet's dignity is the sheet's addition. Book T's own rule for dignity is the elemental one (stage 5).</div>`
        + L.p('To judge a small card, take its decan (stage 2) and ask four questions in order:')
        + L.ol(['Does the planet <b>rule</b> the sign? → domicile, strengthened', 'Is it <b>exalted</b> there? → exaltation, strengthened',
          'Does it rule the <b>opposite</b> sign? → detriment, weakened', 'Is it exalted in the <b>opposite</b> sign? → fall, weakened', 'None of these → <b>peregrine</b>: neither'])
        + decGrid(d => { const dd = X.digIn(d.ruler, d.sign), w = digW(dd);
          return [w === 'S' ? 'dst' : w === 'W' ? 'dwk' : '', `${plG(d.ruler)}${sgG(d.sign)}${dd.length ? `<br>${dd.map(x => ABBR[x]).join('')}` : ''}`,
            `${d.n} of ${d.suit.n}: ${d.ruler} in ${d.sign}, ${X.digLabel(dd).toLowerCase()}`]; }, 'The dignity of each small card\'s planet')
        + `<div class="sub">R ruler (domicile) · E exaltation · D detriment · F fall · no letter: peregrine. Green strengthens, red weakens.</div>`
        + L.sec('Strengthened') + L.table(['Card', 'Planet in sign', 'Dignity'], rows('S'))
        + L.sec('Weakened') + L.table(['Card', 'Planet in sign', 'Dignity'], rows('W'))
        + L.p(`<span class="sub">Neither (peregrine), ${per.length} cards: ${esc(per.join(', '))}.</span>`)
        + L.sec('Three to remember') + line(ex, exSub);
    }

    function les4() {
      const P = X.classical.filter(p => p.card);
      const list = (p, f) => SIGNS.filter(s => { const d = X.digIn(p.planet, s); return f(d) && X.bySign[s] && X.bySign[s].card; })
        .map(s => { const o = X.bySign[s]; return `${esc(o.atu)} ${esc(o.card)}`; }).join(', ') || '—';
      const ex = fixed(['atu-16', 'atu-8'], -1), ex2 = fixed(['atu-3', 'atu-8'], -1);
      const d = X.digIn('Mars', 'Libra'), d2 = X.digIn('Venus', 'Libra');
      return quote(CR.slice(0, 2).map(cap), `your sheet, <i>${esc(DG.title || '')}</i>`)
        + L.p('Find the planetary Atu\'s planet and the zodiacal Atu\'s sign (stage 2). Then take the planet\'s dignity in that sign (stage 3):')
        + L.ol(['it <b>rules</b> the sign or is <b>exalted</b> there → the sheet says <b>both</b> cards are strengthened;',
          'it is in <b>detriment</b> or in its <b>fall</b> there → the sheet says the planetary card <b>is weakened</b>, and says nothing of the other;',
          'it is <b>peregrine</b> there → the rule says nothing.'], false)
        + (ex && ex2 ? `<div class="ddpair">${line(ex2, [`${X.pn('Venus')} in ${X.sg('Libra')}`, esc(X.digLabel(d2).toLowerCase()) + ': both strengthened'])}${line(ex, [`${X.pn('Mars')} in ${X.sg('Libra')}`, esc(X.digLabel(d).toLowerCase()) + ': Tower weakened'])}</div>` : '')
        + L.sec('Each planetary Atu')
        + L.table(['Planetary Atu', 'Strengthened beside', 'Weakened beside'], P.map(p => [`${X.atu(p)}<br><span class="sub">${X.pl(p)}</span>`,
          list(p, X.digStrong), list(p, dd => X.digWeak(dd))]))
        + L.p('<span class="sub">Beside any other zodiacal Atu the planet is peregrine and the rule says nothing.</span>');
    }

    function les5() {
      const S = SK.map(k => [`<b>${esc(SU[k].bt)}</b>`, esc(SU[k].n), esc(SU[k].el)]);
      const grid = `<div class="tscroll"><table class="dtab ddgrid" aria-label="How each suit stands to each other suit in Book T"><thead><tr><th scope="col"></th>${SK.map(k => `<th scope="col">${esc(SU[k].n)}</th>`).join('')}</tr></thead><tbody>`
        + SK.map(a => `<tr><th scope="row">${esc(SU[a].n)}</th>${SK.map(b => `<td>${cellOf(a, b)}</td>`).join('')}</tr>`).join('') + '</tbody></table></div>';
      const exs = [fixed(['cups-7', 'cups-3', 'cups-queen'], 1), fixed(['cups-2', 'wands-5', 'cups-knight'], 1), fixed(['swords-9', 'wands-6', 'disks-3'], 1)].filter(Boolean);
      return quote(TEXT, BT_CITE)
        + L.sec('The suits') + L.table(['Book T', 'Thoth', 'Element'], S)
        + L.p('<span class="sub">In elements: Fire and Water are contrary, and so are Air and Earth.</span>')
        + L.sec('Each suit to each suit') + grid
        + L.p(`<span class="sub">Book T names the friends of ${esc(SU.swords.bt)} and of ${esc(SU.wands.bt)}; it gives no relation between ${esc(SU.cups.bt)} and ${esc(SU.disks.bt)} (—). Friendly neighbours are given no effect of their own.</span>`)
        + L.sec('The three rulings')
        + L.table(['On either side', 'The card is'], ['same', 'opposite', 'between'].map(id => [esc(RULE[id].when), `<b>${esc(RULE[id].effect)}</b>`]))
        + exs.map(sp => line(sp) + `<div class="ddx">The ${esc(nm(sp.keys[sp.c]))}: ${verdict(sp)}</div>`).join('')
        + L.sec('What this path counts')
        + L.ol(['<b>Suits only.</b> The rule speaks of suits; Book T never says it counts the Keys, and the planetary Keys have no element at all. The drills use the 56 suit cards.',
          '<b>The two cards next to it.</b> In a longer line, cards further along do not count.',
          '<b>Only the three rulings above.</b> The text does not rule on any other pair of neighbours (for example its own suit beside a friendly suit, two Swords beside a Wand, or an inimical suit beside a friendly one), and the drills never show one. <span class="sub">Two friendly neighbours that are contrary to each other (a Wand and a Cup beside a Sword) come under the third ruling.</span>',
          `<b>Aces</b> are never the card judged: Book T also says “${esc((ED.majorityNote && ED.majorityNote.text) || 'Aces are always strong cards.')}”`], false);
    }

    function les6() {
      const ex = fixed(['atu-16', 'atu-8'], -1), ex2 = fixed(['cups-4'], -1);
      const ma = X.byPlanet.Mars, li = X.bySign.Libra, d = X.digIn('Mars', 'Libra');
      const d4 = DECANS.find(x => x.key === 'cups-4');
      const opp = li && li.opposite;
      return L.p('Your sheet gives a method for a spread, in four steps:') + L.ol(STEPS.map(cap1))
        + L.sec('Worked example: two Atus side by side') + line(ex)
        + (ma && li ? L.ol([`${X.atu(ma)} is ${X.pl(ma)}; ${X.atu(li)} is ${X.sg('Libra')}.`,
          `${X.pl(ma)} rules ${listAnd((ma.domicile || []).map(X.sg))} (its native mode) and is exalted in ${X.sg(ma.exaltation)} (its peak). ${X.sg('Libra')} is ruled by ${X.pn(li.ruler)}${li.exalted ? `, and ${X.pn(li.exalted)} is exalted there` : ''}.`,
          `${X.pl(ma)} rules ${X.sg(opp)}, the sign opposite: in ${X.sg('Libra')} it is in <b>${esc(X.digLabel(d).toLowerCase())}</b>, so the Tower is undermined.`,
          'Not needed: both cards are Atus.']) : '')
        + L.sec('Worked example: a small card (step 4)') + line(ex2)
        + (d4 ? L.p(`Step 4 reads a small card with the same key. The ${esc(cnD(d4))} is ${X.pn(d4.ruler)} in ${X.sg(d4.sign)}, its decan (step 1). The ruler row shows that ${X.pn(d4.ruler)} rules ${X.sg(d4.sign)}, its native mode (step 2). So the planet of the ${esc(cnD(d4))} is in its <b>${esc(X.digLabel(X.digIn(d4.ruler, d4.sign)).toLowerCase())}</b>, and the card is ${digW(X.digIn(d4.ruler, d4.sign)) === 'S' ? 'strengthened' : digW(X.digIn(d4.ruler, d4.sign)) === 'W' ? 'weakened' : 'neither strengthened nor weakened'}.`) : '')
        + L.p('<span class="sub">The sheet\'s method reads planets and signs; Book T\'s rule (stage 5) reads suits. A card can be judged both ways, and the two need not agree.</span>');
    }

    function les7() {
      const sp = fixed(['cups-3', 'wands-queen', 'cups-knight'], 1), m = MEANK['wands-queen'];
      return L.p('Each drill lays three suit cards in a line. Judge the middle card by Book T:')
        + L.ol(['Name the middle card\'s suit.', 'Name each neighbour: its own suit, the suit inimical to it, or another.', 'Apply the ruling that fits:'])
        + L.table(['On either side', 'The middle card is', 'Read it'], [
          ['two of its own suit', '<span class="dst">strengthened greatly</span>', 'strong, well dignified: its Book T meaning holds'],
          ['two of the suit inimical to it', '<span class="dwk">weakened greatly</span>', 'weak, ill dignified: its “if ill dignified” reading'],
          ['two suits inimical to each other', '<span class="ddf">not much affected</span>', 'much as it stands']])
        + L.p('Book T rules on no other mixture, and the drills never show one. Then choose the reading: Book T gives both readings for the court cards (except the Queen of Cups) and for the 10 of Wands, 2 of Cups, 8 of Swords and 6 of Disks.')
        + L.sec('Worked example') + line(sp) + (sp && m ? reason(sp, m) : '')
        + L.p(`<span class="sub">Book T adds that same-suit neighbours strengthen a card “for good or evil according to their nature”. The Aces are never judged, because Book T calls them “always strong cards”.</span>`);
    }

    function les8() {
      const s5 = fixed(['cups-9', 'wands-4', 'cups-7', 'wands-knight', 'cups-1'], 2), s3 = fixed(['disks-2', 'disks-prince', 'disks-10'], 1);
      const s3n = fixed(['swords-5', 'cups-knight', 'disks-8'], 1);
      return L.p('A longer line is read card by card, each by the two cards next to it: “according to the cards next to it on either side”. Only those two count.')
        + L.sec('Five cards: the centre card') + line(s5) + reason(s5)
        + L.p('<span class="sub">The two outer Cups do not help the centre card: they are not next to it.</span>')
        + L.sec('Three cards: how to read the middle card') + line(s3) + (s3 && MEANK['disks-prince'] ? reason(s3, MEANK['disks-prince']) : '')
        + L.p('<span class="sub">And a line whose two neighbours cancel out:</span>')
        + line(s3n) + (s3n && MEANK['cups-knight'] ? reason(s3n, MEANK['cups-knight']) : '')
        + L.p('In the quiz, the five-card lines ask how the centre card is dignified. The three-card lines ask how to read the middle card: strong, weak, or much as it stands. After each answer the reasoning is set out step by step.');
    }

    /* ---------- the path ---------- */
    const style = document.createElement('style');
    style.id = 'dd-style';
    style.textContent = `.ddline{display:grid;gap:6px;justify-content:center;margin:12px auto 6px}
.ddline.n1{grid-template-columns:minmax(0,92px)}.ddline.n2{grid-template-columns:repeat(2,minmax(0,92px))}
.ddline.n3{grid-template-columns:repeat(3,minmax(0,96px))}.ddline.n5{grid-template-columns:repeat(5,minmax(0,66px))}
.ddline.n6{grid-template-columns:repeat(3,minmax(0,96px));row-gap:10px}
.ddt{margin:0;min-width:0;display:flex;flex-direction:column;align-items:center}
.ddt .im{width:100%;aspect-ratio:2/3;border:1px solid var(--line);border-top:4px solid var(--su,var(--acc));border-radius:7px;overflow:hidden;background:var(--card);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px}
.ddt .im img{display:block;width:100%;height:100%;object-fit:cover}
.ddt .im b{font-size:20px;line-height:1.1;color:var(--ink);font-weight:700}.ddt .im b.w{font-size:12px}
.ddt .im small{font-size:11px;line-height:1.2;color:var(--sub);text-align:center;padding:0 2px;overflow-wrap:anywhere}
.ddt figcaption{font-size:12px;line-height:1.25;text-align:center;margin-top:4px;color:var(--sub);overflow-wrap:anywhere;font-weight:400}
.ddt figcaption small{display:block;font-size:11px;color:var(--ink);margin-top:2px}
.ddt.mid .im{box-shadow:0 0 0 3px var(--acc)}.ddt.mid figcaption{color:var(--acc);font-weight:700}
.ddt.su-wands{--su:#c0503a}.ddt.su-cups{--su:#3f78b5}.ddt.su-swords{--su:#c9a227}.ddt.su-disks{--su:#4f8a4a}
.ddq{margin:8px 0;padding:2px 0 2px 12px;border-left:3px solid var(--acc);font-family:Georgia,'Times New Roman',serif;font-size:15px;line-height:1.5}
.ddq p{margin:3px 0}.ddq cite{display:block;font:12px/1.4 system-ui,sans-serif;color:var(--sub);margin-top:6px}
.ddgrid th,.ddgrid td{text-align:center}.ddgrid td{font-weight:400;line-height:1.25}
.dtab.ddgrid th,.dtab.ddgrid td{padding:6px 2px}.dtab.ddgrid span{font-size:12px;padding:1px 4px}
.ddf{background:var(--hit);border-radius:6px;padding:1px 6px;font-weight:700}
.ddx{margin:0 0 10px;font-size:13px;text-align:center;color:var(--sub)}
.ddpair{display:flex;flex-wrap:wrap;justify-content:center;gap:4px 18px}
details.ddd{margin:10px 0;font-size:14px}details.ddd summary{cursor:pointer;color:var(--acc);font-weight:600;padding:8px 0}
.note .ddr,.fb .ddr{margin:4px 0 0;font-size:13px;line-height:1.45}.ddr li{margin:2px 0}`;
    if (!document.getElementById('dd-style')) document.head.appendChild(style);

    const S = (id, dir) => Q.sel(id, null, dir);
    const inSign = (a, b) => !!a.it.sg && a.it.sg === b.it.sg;   // two decans of one sign: one would show the other's sign
    // one planet in two opposite signs: the one dignity gives the other away (it rules Aries ⇔ it is in detriment in Libra;
    // exalted in Capricorn ⇔ its fall in Cancer); and one "which Atu strengthens it?" per planet
    const xClash = (a, b) => !!a.it.sp && a.it.sp === b.it.sp && !!a.it.sg && !!b.it.sg
      && ((a.rel.id === 'did.xstr' && b.rel.id === 'did.xstr') || (X.bySign[a.it.sg] || {}).opposite === b.it.sg);
    // "which zodiacal Atu strengthens Atu XVI Tower?" never beside a question on the same planet or on the answer's sign: their
    // explanations say "Atu XVI Tower is Mars" and "Atu XV Devil is Capricorn", the two steps the question asks for
    const xsClash = (a, b) => (a.rel.id === 'did.xstr' || b.rel.id === 'did.xstr')
      && ((!!a.it.sp && a.it.sp === b.it.sp) || (!!a.it.sg && a.it.sg === b.it.sg));
    const kindOf = c => c.rel.id === 'did.whatm' ? c.it.wk : c.rel.id === 'ta.ace.el' ? 'ace' : c.rel.id === 'ta.court.el' ? 'court' : '';
    const decSign = c => c.rel.id === 'ta.planet' && TC[c.it.key] && TC[c.it.key].dec ? TC[c.it.key].dec.sign : '';
    const courtClash = (a, b) => { if (a.rel.id !== 'ta.court.el' || b.rel.id !== 'ta.court.el') return false;
      const x = TC[a.it.key], y = TC[b.it.key]; return !!(x && y && x.rank && y.rank) && (x.rank.k === y.rank.k || x.suit.k === y.suit.k); };
    // a suit's element: an Ace's or a court card's explanation states it ("the root of Air", "Air (a Prince) of Water (the Cups)"),
    // and ta.ace.el / ta.court.el ask it — never two of these on one suit when one of them asks it (the Prince of Cups' "of Water"
    // answers "Element of the Ace of Cups?")
    const EL_ASK = new Set(['ta.ace.el', 'ta.court.el']), EL_SAY = new Set(['ta.ace.el', 'ta.court.el', 'did.whatm']);
    const elSuit = c => EL_SAY.has(c.rel.id) && TC[c.it.key] && TC[c.it.key].suit ? TC[c.it.key].suit.k : '';
    const suitClash = (a, b) => !!elSuit(a) && elSuit(a) === elSuit(b) && (EL_ASK.has(a.rel.id) || EL_ASK.has(b.rel.id));
    // Book T's suit relations: a question whose options are suits ("which suit is inimical to X?", "X are friendly with which two?")
    // is answered by elimination once another question of the quiz has said how X stands to one of the suits offered (Cups–Swords
    // friendly, Cups–Disks not stated: then "inimical to Cups?" can only be Wands; "Swords are inimical to Pentacles": then Swords'
    // two friends can only be Cups and Wands)
    const prOf = c => Q.facts(c).filter(f => /^pr:/.test(f)).map(f => f.slice(3));
    const cuts = (a, b) => { const X = a.it.key, e = SU[X] && ENEMY[X] ? pk(X, ENEMY[X]) : '';
      if (!e) return false;
      if (a.rel.id === 'did.enemy') return prOf(b).some(p => p !== e && p.split('|').includes(X));
      if (a.rel.id === 'did.friends') return prOf(b).includes(e);
      return false; };
    // two questions on one sign or planet (one study row) with the same answer: "Virgo is ruled by Mercury" beside "which planet is
    // exalted in Virgo?" (the leak guard lets equal answers pass)
    const ansK = c => Q.ckey(c.dir === 'f' ? c.it.v : c.it.s);
    const sameRowAns = (a, b) => !!a.it.row && a.it.row === b.it.row && ansK(a) === ansK(b);
    // at most n of a relation's facts in one quiz: a closed set asked in full (the four reading keys, Book T's three rulings, the four
    // suits' elements, the four steps) gives its last answer away by elimination. The facts kept are drawn afresh for every quiz
    // (a stage's items() runs once per quiz)
    // (kf: what counts as one fact, the item's key by default)
    const some = (id, n, kf = it => it.key) => { const keep = new Set(shuffle(uniq(Q.cards(id).map(c => kf(c.it)))).slice(0, n)); return Q.sel(id, it => keep.has(kf(it))); };
    // one fact of these relations per quiz (one group), drawn afresh for every quiz: a second "inimical to…?" would keep out two more
    // of the pair questions (cuts above), and the stage could not fill its ten
    const one = ids => { const all = ids.flatMap(id => uniq(Q.cards(id).map(c => c.it.key)).map(k => [id, k])), p = pick(all) || [];
      return ids.map(id => Q.sel(id, it => id === p[0] && it.key === p[1])); };
    Q.registerPath({id: 'dignidiv', title: 'Using dignities in a reading', short: 'Dignities in a reading', icon: '⚖︎',
      blurb: 'Your sheet and Book T in a spread', route: 'dignidiv',
      intro: () => `A guided path from your sheet <i>${esc(DG.title || '')}</i> and Book T's “Of the Dignities” to reading a spread`,
      retryHint: 'The lesson holds every answer.',
      // (MEAN: Book T's card readings, from divination.json; without them stage 1's table and the reading drills would be empty)
      requires: () => !!Q.data.dignities && MEAN.length > 0 && Q.cards('did.tri').length > 0 && Q.cards('dg.decan').length > 0,
      stages: [
        {id: 'kinds', title: 'Two kinds of dignity', sub: 'Essential (your sheet) and elemental (Book T); what well and ill dignified change',
          lesson: les1, items: () => [S('did.kind'), some('dg.key', 3), S('did.wi')], size: 10},
        {id: 'find', title: 'Find the planet and sign in any card', sub: 'Planetary, zodiacal and elemental Atus; the decans; Aces and court cards',
          lesson: les2, items: () => [S('did.what'), [S('dg.patu', 'f'), S('dg.satu', 'r'), S('dg.eatu.el', 'f')], S('ta.planet', 'f'), S('did.whatm'), [S('ta.ace.el', 'f'), S('ta.court.el', 'f')]], size: 12,
          // an Ace's or a court card's element (its options too) shows what every card of that kind carries; two small cards of one
          // sign, or two court cards of one rank or suit, would each give the other half its answer
          clash: (a, b) => Q.guards.leak(a, b) || (!!kindOf(a) && kindOf(a) === kindOf(b) && (a.rel.id === 'did.whatm') !== (b.rel.id === 'did.whatm'))
            || (!!decSign(a) && decSign(a) === decSign(b)) || courtClash(a, b) || suitClash(a, b),
          // the Tarot deck's own questions carry no explanation: say where the answer comes from (only the fact just asked)
          explain: (it, card) => { const id = card.rel.id, c = TC[it.key];
            if (id === 'ta.planet' && c && c.dec) return `The ${esc(nm(c.key))} is the decan ${esc(c.dec.sign)} ${c.dec.rn}: ${X.pn(c.dec.ruler)} in ${X.sg(c.dec.sign)}.`;
            if (id === 'ta.court.el' && c && c.rank) return `The ${esc(c.name)}: ${esc(c.rank.el)} (a ${esc(c.rank.n)}) of ${esc(c.suit.el)} (the ${esc(c.suit.n)}).`;
            if (id === 'ta.ace.el' && c) return `The ${esc(c.name)} is the root of the powers of ${esc(c.suit.el)}.`;
            return null; }},
        {id: 'decans', title: 'Strong and weak decan cards', sub: 'Your sheet\'s key read on the 36 small cards (the sheet\'s method)',
          lesson: les3, items: () => [S('dg.decan'), S('did.decsw')], size: 12, balance: true, clash: (a, b) => inSign(a, b) || Q.guards.leak(a, b)},
        {id: 'xref', title: 'Planetary Atu beside zodiacal Atu', sub: 'Your sheet\'s cross-reference rule',
          // (three planets' "which Atu strengthens it?" at most, one each (xClash): each keeps a planet and a sign out of the rest of
          // the quiz, see xsClash)
          lesson: les4, items: () => [S('dg.xref'), some('did.xstr', 3, it => it.sp)], size: 10,
          clash: (a, b) => Q.guards.leak(a, b) || xClash(a, b) || xsClash(a, b)},
        {id: 'elemental', title: 'Elemental dignities', sub: 'Book T: the suits that strengthen, weaken or cancel',
          lesson: les5, items: () => [some('did.suit', 3), S('did.pair'), one(['did.enemy', 'did.friends']), some('did.rule', 2), S('did.aces')], size: 10,
          clash: (a, b) => Q.guards.leak(a, b) || cuts(a, b) || cuts(b, a)},
        {id: 'method', title: 'The sheet\'s four steps', sub: 'Your method in a spread, step by step',
          lesson: les6, items: () => [some('did.step', 3), [S('did.m2r'), S('did.m2p')], [S('did.m2e'), S('did.m2q')], S('dg.xref'), S('dg.decan')], size: 10,
          clash: (a, b) => Q.guards.leak(a, b) || xClash(a, b) || sameRowAns(a, b)},
        {id: 'three', title: 'Three-card drills', sub: 'Judge the middle card, then choose its reading',
          lesson: les7, items: () => [S('did.tri'), S('did.trim')], size: 12},
        {id: 'spreads', title: 'Practice spreads', sub: 'Lines of three and five cards, worked through',
          lesson: les8, items: () => [S('did.line5'), S('did.read3')], size: 10}]
    });
  }
})();
