/* Athanor — Study & Quiz: the Goetia learning path ("Learn the Goetia": the 72 spirits of the 1904 Goetia).
 * Loaded by tools/quiz.html after its own script; the API (registerPath, addRelations, onReady, guards, lesson helpers…)
 * is documented in quiz.html under "Learning paths: a registry".
 *
 * Ten stages, each a lesson built from the app's data and a quiz drawn only from that lesson:
 *   1 the structure (ranks: metals, planets, hours of binding; the four great Kings)   2–7 the spirits, twelve at a time
 *   8 the zodiac (decans by day and night, the Shem angels)   9 the seals   10 working practice
 * Data: goetia.json (Q.data.goetia: the Mathers/Crowley 1904 text as the app summarises it; ranks, pens, offeringsGeneral),
 * compass.json (the four Kings of the quarters, compass set goetic-kings-goetia-1904; the spirits whose entry names a quarter,
 * set goetic-goetia-1904-spirits) and lesserkey.json (the text after the 72 spirits as reprinted by de Laurence: the Observations,
 * the Circle and the Triangle). The seals are de Laurence's 1916 plates. The content tables (window.DB): Goetic ranks (plural,
 * other names, hours alike), Quarters, Planets, Spirits, Spirit charges (what each entry requires) and Spirit twins (texts largely
 * true of each other); quiz.html loads the last three at start-up (PTABLES), and without them this path stays away. OBS (the
 * Circle and the Triangle) reads its figures from the text itself (lesserkey.json); its question wording moves with the others.
 * Copyright: the 1904 Goetia and de Laurence 1916 are public domain; DuQuette is not — nothing here comes from him.
 *
 * Questions: the existing Goetia relations (go.num, go.rank, go.legions, go.office, go.appear, go.decan, go.seal, go.rmetal,
 * go.rplanet) and ten added here (go.hours, go.king, go.dn, go.shem, go.pen, go.offer, go.quarter, go.charge, go.moon, go.obs).
 * The added ones carry no study row, so "Learn a spirit" and its mastery stay exactly as they were.
 * Leak guards, on top of QuizPaths.guards.leak: a number shown by one question is never another's answer (legions / numbers),
 * a quoted text never names another question's spirit, nothing about a spirit shows a rank word of its own rank ("ducal crown"),
 * two questions with one answer never show each other's clue (Mercury / "Mercury (quicksilver)"), and items a relation calls
 * near-twins (Halphas and Shax the stock-doves) never share a quiz. Texts that name their own
 * spirit or rank even after the name is taken out (Phenex "like the bird Phœnix", Sallos "a ducal crown") are left out.
 * Options: each stage keeps them to what its lesson covers (stage.refine: near / synth for this stage's questions only); the
 * seals come six at a time, one question per six. Never offered as a wrong option: a text that is largely true of the spirit asked
 * as well (TWIN: Amon / Gusion / Barbatos's offices, Malphas / Räum's crows …), a "what the entry requires" phrase that the
 * spirit's own entry also says (CHARGE: most entries say to wear the seal; Beleth is commanded into a triangle), President against
 * Earl's copper and silver (the note after the Classified List suggests it for Presidents). Quotations are the printed text (the
 * hours of binding, the Earls' metals). Nothing in quiz.html is changed by this path; the TWIN pairs are handed to it
 * (QuizPaths.addNear), so Practice and the daily review never offer them against each other either, and the deck's office and
 * appearance texts that name their spirit or its rank are asked there only as the stages' rule allows (it.dirs, see addRelations).
 */
(function () {
  'use strict';
  if (!window.QuizPaths) return;   // loaded outside quiz.html
  QuizPaths.onReady(function (Q) {
    const G = Q.data.goetia;
    if (!G || !Array.isArray(G.spirits) || !G.spirits.length) return;
    if (!window.DB || !['spirits', 'spirit_charges', 'spirit_twins'].every(t => DB.has(t))) return;   // (see the header)
    // compass.json and lesserkey.json are optional: without them the questions that need them are left out and the lessons say so
    const opt = u => Q.getJSON(u).catch(() => null);
    return Promise.all([opt('../../data/compass.json'), opt('../../data/lesserkey.json')])
      .then(([C, LK]) => setup(Q, G, C, LK))
      .catch(e => console.error('goetia path:', e));
  });

  function setup(Q, G, C, LK) {
    const esc = Q.esc, norm = Q.norm, L = Q.lesson, GO = Q.goetia;
    const SP = G.spirits, byN = GO.spiritByN, prim = GO.prim;
    const RANKS = Object.keys(G.ranks || {});                                     // King, Duke, Prince, Marquis, President, Earl, Knight
    const OR = (G.offeringsGeneral && G.offeringsGeneral.ranks) || {};
    const GEN = (G.offeringsGeneral && G.offeringsGeneral.general) || {};
    const cap = t => { t = String(t || ''); return t.charAt(0).toUpperCase() + t.slice(1); };
    const anB = w => (/^[AEIOU]/.test(w) ? 'an' : 'a') + ` <b>${esc(w)}</b>`;   // "an <b>Earl</b>", "a <b>Duke</b>"
    const PL = Object.fromEntries(DB.rows('planets').filter(p => p.name_777).map(p => [p.name, p.name_777]));   // Sun: Sol, Moon: Luna
    const plH = p => esc(Q.symOf(PL[p] || p)) + esc(p);
    // the ranks' other names (Prince: Prelate, Earl: Count) and plurals, as tab Goetic ranks gives them
    const GR = DB.rows('goetic_ranks');
    const RANK_ALT = Object.fromEntries(GR.filter(r => r.spellings).map(r => [r.name, DB.items(r.spellings)]));
    const rankLbl = r => RANK_ALT[r] ? `${r} (${RANK_ALT[r].join(', ')})` : r;
    const pluralOf = r => (GR.find(x => x.name === r) || {}).plural || r + 's';
    const Q4 = DB.where('quarters', q => !q.between).map(q => q.name);   // East, South, West, North (tab Quarters)

    /* ---------- reading the texts ---------- */
    // words without accents (Phœnix → phoenix); a rank's own words ("ducal", "duchess", "prelacies"); a name's consonants
    const toks = t => String(t || '').toLowerCase().replace(/æ/g, 'ae').replace(/œ/g, 'oe').normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z]+/).filter(Boolean);
    const RANK_W = GO.rankW || {};   // (quiz.html's table: Learn a spirit orders the same texts after the rank question)
    const rankWordIn = (t, ranks) => { const w = toks(t); return ranks.some(r => (RANK_W[r] || [norm(r)]).some(x => w.includes(x))); };
    const skel = w => w.replace(/[aeiouy]/g, '');
    // a word that is the spirit's name, or sounds like it (the same consonants: Phœnix / Phenex)
    const nameLike = (t, sp) => {
      const ids = GO.ids(sp).map(norm).filter(Boolean), ws = toks(t);
      return ws.some(w => ids.some(id => w === id || (id.length >= 5 && skel(id).length >= 3 && skel(w) === skel(id))));
    };
    // the 1904 texts the relations quote, with the spirit's own name taken out (as go.office / go.appear show them)
    const leaksOwn = (t, sp) => !!t && (nameLike(GO.redact(t, sp), sp) || rankWordIn(t, GO.ranks(sp)));
    const OFF_OUT = new Set(SP.filter(s => leaksOwn(s.office, s)).map(s => s.n));
    const APP_OUT = new Set(SP.filter(s => leaksOwn(s.appearance, s)).map(s => s.n));
    const numsIn = t => (String(t || '').match(/\d+(?:,\d{3})*/g) || []).map(x => +x.replace(/,/g, ''));
    const strip = h => String(h == null ? '' : h).replace(/<[^>]*>/g, ' ').replace(/&(?:#\d+|[a-z]+);/gi, ' ');

    /* ---------- the extra data ---------- */
    const GOE = C && C.layers && Array.isArray(C.layers.goetic) ? C.layers.goetic : [];
    // the four great Kings (the Observations list them, then "East, West, North, and South"), and the spirits whose entry names a quarter
    // (by their compass sets: tab Compass sets, the entries' set in tab Compass entries)
    const KINGS = GOE.filter(e => e.set === 'goetic-kings-goetia-1904' && Q4.includes(e.direction));
    const QTR_ALL = GOE.filter(e => e.set === 'goetic-goetia-1904-spirits' && byN(+e.goetia));
    const QTR = QTR_ALL.filter(e => e.confidence === 'high' && Q4.includes(e.direction));
    const APX = LK && typeof LK.appendix === 'string' ? LK.appendix.replace(/\s+/g, ' ') : '';
    const mCircle = APX.match(/(This Magical Circle is to be made (\d+) feet across[^.]*?beginning at (\w+), and ending at (\w+)[^.]*\.)/i);
    const mTri = APX.match(/(It is to be made at (\d+) feet distance from the Magical Circle and it is (\d+) feet across)/i);
    // the Moon's age: the Observations (lesserkey.json), else the same sentence as goetia.json quotes it
    const moonQ = (APX.match(/(The best days be when the Moon Luna is [^.]*?days old[^.]*?profitable)/i) || [])[1]
      || ((String(GEN.timingAdvice || '').match(/'(The best days be when the Moon Luna is [^']*)'/) || [])[1] || '').replace(/[.\s]+$/, '');
    const AGES = ((moonQ.match(/Moon Luna is ([\d,\sor]+?) days old/i) || [])[1] || '').match(/\d+/g);
    const MOON = AGES ? AGES.map(Number) : [];
    const shemP = t => { const m = String(t || '').match(/^\s*(\d+)\s+([^()]+?)\s*(?:\(([^)]+)\))?\s*$/);
      return m ? { n: +m[1], name: m[2].trim(), alt: m[3] ? m[3].split(/[,/]/).map(x => x.trim()).filter(Boolean) : [] } : null; };
    const penOf = o => { if (!o || !o.code) return null; const p = G.pens && G.pens[o.code], hex = p && /^#[0-9a-f]{6}$/i.test(p.hex) ? p.hex : '';
      return { code: o.code, label: o.label || o.code, hex }; };
    const penH = p => p ? (p.hex ? `<span class="pen" style="background:${p.hex}"></span>` : '') + esc(p.label) : '';
    // modern offerings as a clue: without the candles (their colours are the planets') and anything naming the rank's metal or planet
    const offerClue = r => { const k = OR[r], g = G.ranks[r] || {};
      if (!k || !Array.isArray(k.offerings)) return [];
      const bad = [...toks(g.metal), ...toks(g.planet)].filter(w => w.length >= 3);
      return k.offerings.filter(o => !/candle/i.test(o) && !toks(o).some(w => bad.some(b => w.startsWith(b)))); };
    // the sentences of a text that pass keep (the app's notes mix points: a rank's metal with its modern offerings)
    const sents = (t, keep) => (String(t || '').match(/[^.]+(?:\.|$)/g) || []).map(s => s.trim()).filter(s => s && keep.test(s)).join(' ');
    // the hours of binding: each rank's clause of the Observations as printed (goetia.json's rankHoursQuote, else the text after the
    // spirits in lesserkey.json), so that what is shown in quotation marks is the text itself ("Knights may from Dawning of Day…",
    // "Counties or Earls any hour…"). Without either, the app's summary (offeringsGeneral.ranks[r].hours), never shown as a quotation
    const HQ = String((G.offeringsGeneral && G.offeringsGeneral.rankHoursQuote)
      || (APX.match(/(And the Chief Kings may be bound[\s\S]*?where no noise is, etc\.)/) || [])[1] || '');
    const HSUBJ = { King: /^Chief Kings\b/i, Marquis: /^Marquises\b/i, Duke: /^Dukes\b/i, Prince: /^Prelates\b/i, Knight: /^Knights\b/i,
      President: /^Presidents\b/i, Earl: /^Counties or Earls\b/i };
    const HRS = {};
    HQ.split(';').forEach(raw => {
      const cl = raw.trim().replace(/^and\s+(?:the\s+)?/i, '').replace(/[.\s]+$/, ''), r = Object.keys(HSUBJ).find(k => HSUBJ[k].test(cl));
      if (!r || HRS[r]) return;
      const part = cl.replace(/^.*?\b(?:Kings|Marquises|Dukes|Prelates|Knights|Presidents|Earls)\s+(?:may\s+(?:be\s+bound\s+)?)?/i, '').replace(/,\s*etc$/i, '').trim();
      if (part) HRS[r] = { q: cl + '.', part };
    });
    const hoursSum = r => String((OR[r] || {}).hours || '').replace(/\s*\(Manuscript:[\s\S]*$/, '').trim();
    const hoursOf = r => HRS[r] ? HRS[r].q : hoursSum(r);
    const hoursPart = r => HRS[r] ? HRS[r].part : (hoursSum(r).match(/\bmay be bound\s+([\s\S]+?)\.?$/i) || [])[1] || '';
    const hoursNote = r => HRS[r] ? `“${esc(HRS[r].q)}” <span class="sub">(the Observations)</span>` : `${esc(hoursSum(r))} <span class="sub">(the app's summary of the Observations)</span>`;
    // what each entry itself requires (or warns) in working with the spirit (tab Spirit charges): the phrase as goetia.json
    // summarises the 1904 text (the office, or for Phenex the appearance), shown from there. kinds: what the phrase states; also: what
    // the spirit's own 1904 entry says as well. A phrase is never offered for a spirit whose entry says the same kind of thing
    // (go.charge near), e.g. Bael's "character … worn as a lamen" against Paimon ("His Character is this which must be worn as a
    // Lamen before thee"), a triangle warning against Beleth (the exorcist "make[s] a triangle … and then command[s] him into it"),
    // Furfur's "never speaks truth unless compelled" against Belial ("unless constrained by divine power"). lamen: the entries that
    // say to wear the seal, read from the 1904 text (lesserkey.json) when it is loaded. Astaroth (ring and lamen) is in the lesson
    // only (lesson_only): too few kinds would be left to offer
    const WEARS = new Set(LK && Array.isArray(LK.spirits)
      ? LK.spirits.filter(e => /\b(wear|worn)\b/i.test(String(e.crowley && e.crowley.text || ''))).map(e => e.n) : []);
    const CHARGE = DB.rows('spirit_charges').map(r => {
      const sp = byN((DB.get('spirits', r.id) || {}).n), text = String(sp && sp[r.field || 'office'] || ''), phrase = String(r.phrase || '');
      const at = phrase ? text.toLowerCase().indexOf(phrase.toLowerCase()) : -1;   // (left out while the entry no longer says it)
      if (at < 0) return null;
      const kinds = DB.items(r.kinds), also = DB.items(r.also);
      return { n: sp.n, sp, cat: kinds[0], kinds, also: WEARS.has(sp.n) ? Q.uniq([...also, 'lamen']) : also,
        t: cap(text.slice(at, at + phrase.length).trim()), quiz: !r.lesson_only };
    }).filter(Boolean);

    /* ---------- the relations added by this path (deck goetia; no study row: see the header) ---------- */
    Q.addRelations(function (ctx) {
      if (!ctx.spS) return;   // the Goetia's builders exist only while goetia.json is loaded
      const { rel, side, spS } = ctx;
      // the deck's own office and appearance questions (Practice, the daily review, Learn a spirit), by the rule that leaves these
      // texts out of the stages (leaksOwn): a text that still names its spirit (Phenex "like the bird Phœnix") is not asked either
      // way; one that names the spirit's rank ("a ducal crown", "as a great King") is not asked back: "which spirit …?" would single
      // out the only Duke among the options (it.dirs; each stays an option of the other questions)
      ['go.office', 'go.appear'].forEach(id => { const r = Q.relation(id); if (!r) return;
        r.items.forEach(it => { const sp = byN(parseInt(it.key, 10)); if (!sp) return;
          if (nameLike(it.v.t, sp)) it.dirs = []; else if (rankWordIn(it.v.t, GO.ranks(sp))) it.dirs = ['f']; }); });
      const rankS = r => side(r, { cat: 'rank', alt: RANK_ALT[r] || [] });
      const quarterS = d => side(d, { cat: 'quarter' });

      // Rank ↔ hours of binding (the Observations). The "any hour of the day" family (Prelates, Earls in woods, Presidents
      // excepting twilight) is never offered against itself, nor the King whom a President's hours name (tab Goetic ranks, hours_like)
      const HNEAR = GR.flatMap(r => DB.ref(r, 'hours_like').map(x => [r.name, x.name]));
      rel({ id: 'go.hours', deck: 'goetia', name: 'Rank ↔ hours of binding',
        near: (a, b) => HNEAR.some(([x, y]) => (a.key === x && b.key === y) || (a.key === y && b.key === x)),
        fq: it => `When may ${anB(rankLbl(it.key))} be bound, by the Observations?`,
        rq: it => `Which rank may be bound “${esc(it.v.t)}”?`,
        items: RANKS.map(r => { const h = hoursPart(r);
          return h ? { key: r, s: rankS(r), v: side(h, { h: esc(cap(h)), cat: 'ghours', typ: false }),
            noteL: () => hoursNote(r) } : null; }) });

      // the four great Kings ↔ their quarters (Goetia 1904, from compass.json)
      rel({ id: 'go.king', deck: 'goetia', name: 'Four great Kings ↔ quarter',
        fq: it => `In the Goetia (1904), which quarter does ${it.s.h} rule?`,
        rq: it => `Which of the four great Kings rules the <b>${esc(it.v.t)}</b> in the Goetia (1904)?`,
        items: KINGS.map(e => { const nm = prim(e.name), alt = (String(e.name).match(/\(([^)]+)\)/) || [, ''])[1].split(/[,/]/).map(x => x.trim()).filter(Boolean);
          if (/AMAIMON/.test(e.extra || '') && /^Amaymon$/i.test(nm)) alt.push('Amaimon');
          // fx: one King of East / West and one of North / South at most in a quiz (four pairs: the third would go by elimination)
          return { key: norm(nm), fx: [/^(East|West)$/.test(e.direction) ? 'king:ew' : 'king:ns'], s: side(nm, { h: `<b>${esc(e.name)}</b>`, cat: 'gking', alt }), v: quarterS(e.direction),
            noteL: () => e.confidence === 'high' && /outright/.test(e.note || '') ? `${esc(nm)}: the one of the four whose quarter the 1904 text states outright.`
              : `${esc(nm)}: ${esc(e.direction)} by the order of the Observations' two lists — the four rulers, then the four quarters.` }; }) });

      // Spirit → by day or by night (spirits 1–36 rule by day, 37–72 by night). Two options only, so all are one fact (fx): one
      // per quiz; the leak guard keeps it from the same spirit's decan ("Aries I by day")
      rel({ id: 'go.dn', deck: 'goetia', name: 'Spirit → day or night', dirs: ['f'],
        fq: it => `When does ${it.s.h} rule his decan?`,
        items: SP.map(s => /^(Day|Night)$/.test(s.dayNight || '') ? { key: String(s.n), fx: ['go.dn'], s: spS(s),
          v: side(s.dayNight, { h: s.dayNight === 'Day' ? 'By day' : 'By night', cat: 'gdn', alt: [s.dayNight + ' spirit', 'By ' + s.dayNight.toLowerCase()] }),
          noteL: () => 'Spirits 1–36 rule their decans by day, 37–72 by night.' } : null) });

      // Spirit ↔ its Shem ha-Mephorash angel (goetia.json: the angel of the spirit's own number). Two spirits share "Lauviah"
      // (11, and 17 "Lauviah (Leviah)"): one answer (ck), so neither is offered against the other and neither is asked in reverse
      rel({ id: 'go.shem', deck: 'goetia', name: 'Spirit ↔ Shem angel',
        sim: (a, b) => 2 / (1 + Math.abs(a.n - b.n) / 3),
        fq: it => `Which angel of the Shem ha-Mephorash is paired with ${it.s.h}?`,
        rq: it => `Which spirit is paired with the Shem angel <b>${esc(it.v.t)}</b>?`,
        items: SP.map(s => { const a = shemP(s.shem); if (!a || nameLike(a.name, s)) return null;
          return { key: String(s.n), n: s.n, s: spS(s), v: side(a.name, { cat: 'shem', alt: a.alt, ck: 'shem:' + norm(a.name),
            h: esc(a.name) + (a.alt.length ? ` <span class="sub">(${esc(a.alt.join(', '))})</span>` : '') }),
            noteL: () => 'Each spirit is paired with the Shem angel of its own number.' }; }) });

      // Rank ↔ the pen your altar workbook suggests for its seals. A pen that is another rank's alternative or Golden Dawn colour
      // (MC024 Pearl white: President's pen, Prince's alternative, Marquis's GD colour) is never offered against that rank
      rel({ id: 'go.pen', deck: 'goetia', name: 'Rank ↔ pen (altar workbook)',
        near: (a, b) => a.codes.some(c => b.codes.includes(c)),
        fq: it => `Which metallic pen does your altar workbook suggest for ${anB(it.key)}'s seal?`,
        rq: it => `Your altar workbook suggests ${it.v.h} for the seals of which rank?`,
        items: RANKS.map(r => { const k = G.ranks[r], p = penOf(k.pen); if (!p) return null;
          return { key: r, s: rankS(r), codes: [k.pen, k.alt, k.gd].filter(o => o && o.code).map(o => o.code),
            v: side(p.label, { h: penH(p), cat: 'gpen', typ: false, ck: 'pen:' + p.code }) }; }) });

      // Offerings → rank (modern conventions, the app's offering research); the clue leaves out candles and the rank's metal / planet
      rel({ id: 'go.offer', deck: 'goetia', name: 'Offerings → rank (modern)', dirs: ['r'],
        rq: it => `In modern practice (the app's offering notes), which rank are these usual offerings for?<br>“${esc(it.v.t)}”`,
        items: RANKS.map(r => { const o = offerClue(r);
          return o.length >= 3 ? { key: r, s: rankS(r), v: side(o.join(' · '), { cat: 'goffer', typ: false }),
            noteL: () => 'Modern conventions, not the Goetia: its text prescribes offerings for only a few spirits.' } : null; }) });

      // Spirit ↔ the quarter its own 1904 entry names (only the ones compass.json rates high: the text states them)
      rel({ id: 'go.quarter', deck: 'goetia', name: 'Spirit ↔ quarter (1904 text)',
        synth: it => Q4.filter(d => d !== it.v.t).map((d, i) => ({ sd: quarterS(d), sc: 2.5 - i * .1 })),
        fq: it => `Which quarter does the 1904 text give for ${it.s.h}?`,
        rq: it => `Whose entry in the 1904 text points to the <b>${esc(it.v.t)}</b>?`,
        // fx: one question per quarter in a quiz (three of the four are East: never three alike)
        items: QTR.map(e => ({ key: String(e.goetia), fx: ['qtr:' + e.direction], s: spS(byN(+e.goetia)), v: quarterS(e.direction), noteL: () => esc(e.note || '') })) });

      // Spirit ↔ what its entry requires (or warns) in working with it. near: the same spirit, or either phrase states what the other
      // spirit's entry says as well (see CHARGE)
      rel({ id: 'go.charge', deck: 'goetia', name: 'Spirit ↔ what the text requires',
        near: (a, b) => a.sn === b.sn || a.kinds.some(k => b.also.includes(k)) || b.kinds.some(k => a.also.includes(k)),
        fq: it => `What does the 1904 text say about working with ${it.s.h}?`,
        rq: it => `Whose entry says this?<br>“${esc(it.v.t)}”`,
        items: CHARGE.filter(c => c.quiz).map(c => ({ key: c.n + '.' + c.cat, sn: c.n, kinds: c.kinds, also: c.also, fx: ['charge:' + c.n], s: spS(c.sp),
          v: side(c.t, { cat: 'gcharge', typ: false }) })) });

      // the Moon's age: one of the profitable days among ages that are not (all such questions are one fact: one per quiz)
      const ageS = d => side(String(d), { num: true, cat: 'gmoonage', typ: false, h: `${d} day${d === 1 ? '' : 's'} old` });
      rel({ id: 'go.moon', deck: 'goetia', name: 'The profitable Moon days', dirs: ['f'],
        near: () => true,
        synth: () => { const out = []; for (let d = 1; d <= 16; d++) if (!MOON.includes(d)) out.push({ sd: ageS(d), sc: 3 + Math.random() }); return out; },
        fq: () => `Which of these is one of the Goetia's profitable days for a working? <span class="sub">(the Moon's age)</span>`,
        items: MOON.map(d => ({ key: String(d), fx: ['go.moon'], s: side('A profitable Moon age', { cat: 'gmoon', typ: false }), v: ageS(d),
          noteL: () => `The Observations: “${esc(moonQ)}.”` })) });

      // the Magical Circle and Triangle (the text after the 72 spirits, lesserkey.json)
      const ftS = n => side(String(n), { num: true, cat: 'gft', h: `${n} ${+n === 1 ? 'foot' : 'feet'}` });
      const OBS = [
        mCircle && { key: 'circle', q: 'How many feet across is the Magical Circle to be made?', n: +mCircle[2], fx: ['obs:circle'], note: mCircle[1] },
        mTri && { key: 'tridist', q: 'How far from the Magical Circle is the Magical Triangle to be made?', n: +mTri[2], fx: ['obs:tri'], note: mTri[1] + '.' },
        mTri && { key: 'trisize', q: 'How many feet across is the Magical Triangle?', n: +mTri[3], fx: ['obs:tri'], note: mTri[1] + '.' }
      ].filter(Boolean);
      rel({ id: 'go.obs', deck: 'goetia', name: 'The Circle and the Triangle', dirs: ['f'],
        synth: it => Q.uniq([it.v.t - 1, +it.v.t + 1, +it.v.t + 2, it.v.t * 2]).filter(x => x > 0 && x !== +it.v.t).map(x => ({ sd: ftS(x), sc: 2.5 + Math.random() })),
        fq: it => it.q,
        items: OBS.map(o => ({ key: o.key, q: o.q, fx: o.fx, s: side(o.q, { cat: 'gobs', typ: false }), v: ftS(o.n),
          noteL: () => `“${esc(o.note)}”` })) });
    });

    /* ---------- leak guards (see the header) ---------- */
    const ansOf = c => c.dir === 'f' ? c.it.v : c.it.s;
    const INFO = new WeakMap();
    function info(c) {
      let o = INFO.get(c); if (o) return o;
      const a = ansOf(c);
      let p = '', n = '';
      try { p = strip(c.dir === 'f' ? c.rel.fq(c.it) : c.rel.rq(c.it)); } catch (e) { p = ''; }
      try { const x = explain(c.it, c); n = x != null ? strip(x) : c.it.noteL ? strip(c.it.noteL()) : c.it.note && !c.it.note.spoils ? strip(c.it.note()) : ''; } catch (e) { n = ''; }
      // a quoted text the question shows (a value that is not a spirit: the stem of a reverse card, an option and the answer of a forward one)
      const quote = c.it.v && c.it.v.cat !== 'spirit' && !c.it.v.num ? String(c.it.v.t) : '';
      const sn = c.it.s && c.it.s.cat === 'spirit' ? parseInt(c.it.key, 10) : null;
      // (the answer as a stage quiz shows it: hl, else hb, else h — a seal's figure numbers are never shown there)
      o = { k: Q.ckey(a), num: a.num ? +a.t : null, nums: numsIn([p, n, a.num ? '' : strip(a.hl || a.hb || a.h)].join(' ')), quote: quote + ' ' + n,
        text: [p, n, quote].join(' '), p, sp: a.cat === 'spirit' ? [a.t, ...(a.alt || [])] : null, sn,
        vids: [c.it.v.t, ...(c.it.v.alt || [])].map(String) };
      INFO.set(c, o); return o;
    }
    // one way round: does question a give away question b?
    function gives(a, b) {
      const A = info(a), B = info(b);
      if (B.num != null && A.nums.includes(B.num)) return true;                                   // a number shown is b's answer
      if (B.sp && Q.namesAny([A.quote], B.sp)) return true;                                        // a quote names b's spirit
      if (b.rel.id === 'go.rank' && A.sn != null && A.sn === B.sn && a.rel.id !== 'go.rank') {     // a rank word about the same spirit
        const sp = byN(B.sn); if (sp && rankWordIn(A.text, GO.ranks(sp))) return true;
      }
      // one answer, and a's prompt shows b's clue ("Which rank belongs to Mercury?" / "… made in Mercury (quicksilver)?")
      if (A.k === B.k && a.dir === 'r' && b.dir === 'r' && Q.namesAny([A.p], B.vids)) return true;
      return false;
    }
    // two items the relation calls near-twins (never offered against each other) are never asked in one quiz either:
    // Halphas and Shax the stock-doves, the "any hour of the day" hours, two triangle warnings
    const twins = (a, b) => { if (a.rel.id !== b.rel.id || typeof a.rel.near !== 'function') return false;
      try { return !!a.rel.near(a.it, b.it); } catch (e) { return false; } };
    const guard = (a, b) => Q.guards.leak(a, b) || twins(a, b) || gives(a, b) || gives(b, a);
    // the seals six at a time: a question's options come from its own six, and no two questions share a six (after a question the
    // four seals it offered are shown whole with their spirits' names)
    const six = c => Math.ceil(parseInt(c.it.key, 10) / 6);

    /* ---------- explanations after an answer (the fact just asked, nothing another question asks) ---------- */
    function explain(it, card) {
      const id = card.rel.id;
      if (id === 'go.seal' && it.v && it.v.figs && it.v.figs.length > 1)
        return `${esc(it.v.sp ? it.v.sp.name : '')} has two seals in the plates; either one counts as the spirit's seal.`;
      if (id === 'go.decan') {
        const sp = byN(+it.key), d = sp && (G.decans || []).find(x => `${x.sign} ${x.decan}` === sp.decan);
        return sp && d ? `${esc(prim(sp.name))} rules ${esc(sp.decan)} (${esc(d.degrees)}) by ${sp.dayNight === 'Day' ? 'day' : 'night'} — the decan of the ${esc(d.card)}.` : null;
      }
      return null;
    }

    /* ---------- lessons ---------- */
    if (!document.getElementById('gp-goetia-css')) {
      const st = document.createElement('style'); st.id = 'gp-goetia-css';
      st.textContent = '.gpsp{border-top:1px solid var(--line);padding:10px 0 6px}.gpsp:first-of-type{border-top:none}'
        + '.gph{display:flex;align-items:center;gap:10px;margin-bottom:6px}.gph .sl{width:44px;height:44px}.gph .sub{display:block}'
        + '.gpseals{display:grid;grid-template-columns:repeat(auto-fill,minmax(92px,1fr));gap:6px;margin:6px 0 10px}'
        + '.gpseals figure{margin:0;border:1px solid var(--line);border-radius:10px;padding:8px 4px 6px;text-align:center;min-width:0}'
        + '.gpseals .sl{width:72px;height:72px}.gpseals .two .sl{width:40px;height:40px;margin:16px 1px}'
        + '.gpseals figcaption{font-size:12px;line-height:1.25;margin-top:4px;overflow-wrap:anywhere}.gpseals figcaption b{display:block;font-size:13px}';
      document.head.appendChild(st);
    }
    const nm = s => `${s.n} ${esc(prim(s.name))}`;
    const vars = s => { const v = GO.ids(s).slice(1); return v.length ? `<br><span class="sub">also ${esc(v.join(', '))}</span>` : ''; };
    const legN = s => (String(s.legions || '').match(/^\s*(\d+)/) || [])[1] || '';
    const legRest = s => String(s.legions || '').replace(/^\s*\d+\s*/, '').trim();

    function lesStructure() {
      const two = SP.filter(s => GO.ranks(s).length > 1);
      const holders = r => SP.filter(s => GO.ranks(s).includes(r)).map(s => s.n);
      // (only the sentences of the app's rank notes that bear on the point: not their offerings, nor "No special place stated")
      // Earl's footnote in the text's own words where lesserkey.json has it (the app's note paraphrases "Probably … should be" as
      // "'should probably'"), else the app's note
      const eObs = (APX.match(/Earls[’'] in (Venus \(Copper\), and Luna \(Silver\), alike equal)/) || [])[1],
        eNote = (APX.match(/(Probably the Seals of Earls should be made of Iron[^;]*;\s*as otherwise the Metal of one Planet, Mars, is excluded from the List)/) || [])[1];
      const earl = eObs && eNote ? `The Observations give Earls “${eObs}”; Mars comes from the note printed after the Classified List: “${eNote}.”`
          : sents(OR.Earl && OR.Earl.notes, /^(?!.*offering)/i),
        prelate = sents(OR.Prince && OR.Prince.notes, /^(?!.*offering)/i),
        kingsCall = sents(OR.King && OR.King.place, /Kings/);
      // the Classified List printed after the Observations, where it counts a rank's spirits differently from their own entries
      const CLW = Object.fromEntries(GR.filter(r => r.plural).map(r => [r.plural.toUpperCase(), r.name]));   // KINGS: King … (the list's headings)
      const clist = {};
      const CLX = (APX.match(/CLASSIFIED LIST[\s\S]*?(?=NOTE\.)/) || [''])[0];
      (CLX.match(/\b(?:KINGS|DUKES|PRINCES AND PRELATES|MARQUISES|PRESIDENTS|EARLS, or COUNTS|KNIGHTS)\.—[\s\S]*?(?=\(Seal in|$)/g) || []).forEach(l => {
        const r = CLW[l.split(/[ ,.]/)[0]]; if (r) clist[r] = (l.match(/\((\d+)\.\)/g) || []).map(x => parseInt(x.slice(1), 10)); });
      const clDiff = RANKS.filter(r => clist[r]).map(r => {
        const plural = pluralOf(r), names = ns => Q.listAnd(ns.map(n => `${n} ${prim(byN(n).name)}`));
        const extra = holders(r).filter(n => !clist[r].includes(n)), miss = clist[r].filter(n => byN(n) && !holders(r).includes(n));
        return [extra.length ? `does not count ${names(extra)} among the ${plural}, though ${extra.length > 1 ? `their own entries make them ${plural}` : `his own entry makes him ${/^[AEIOU]/.test(r) ? 'an' : 'a'} ${r}`} too` : '',
          miss.length ? `counts ${names(miss)} among the ${plural}, which ${miss.length > 1 ? 'their own entries do' : 'his own entry does'} not` : ''].filter(Boolean).join('; ');
      }).filter(Boolean);
      let h = L.p(`The Goetia (Mathers/Crowley, 1904) sets out <b>${SP.length}</b> spirits, each with a rank; ${two.length} hold two ranks (${two.slice(0, 3).map(s => `${nm(s)}, ${esc(s.rank)}`).join('; ')} …).`)
        + L.p('The Observations after the spirits give each rank a metal for its seals, named with its planet:')
        + L.table(['Rank', 'Seal metal', 'Planet'], RANKS.map(r => [`<b>${esc(r)}</b>${RANK_ALT[r] ? `<br><span class="sub">or ${esc(RANK_ALT[r].join(', '))}</span>` : ''}`,
          esc(G.ranks[r].metal), plH(G.ranks[r].planet) + (r === 'Earl' ? ' *' : '')]))
        + (earl ? L.p(`<span class="sub">* ${esc(earl)}</span>`) : '')
        + (prelate ? L.p(`<span class="sub">${esc(prelate)}</span>`) : '')
        + L.sec('Who holds each rank')
        + L.table(['Rank', 'Spirits, by number (each one\'s own entry)'], RANKS.map(r => [`<b>${esc(r)}</b>`, esc(holders(r).join(', '))]))
        + (clDiff.length ? L.p(`<span class="sub">The Classified List printed after the Observations ${esc(clDiff.join('; '))}.</span>`) : '')
        + L.sec('When each rank may be bound')
        + L.table(['Rank', HRS.King ? 'The Observations' : 'The Observations (the app\'s summary)'], RANKS.filter(r => hoursOf(r)).map(r => [`<b>${esc(r)}</b>`, esc(hoursOf(r))]));
      h += L.sec('The four great Kings of the quarters');
      if (KINGS.length) {
        h += L.p('The 72 are under the power of four great Kings ruling the four quarters. The Observations name the Kings, then the quarters “East, West, North, and South”; read in order, the lists pair them:')
          + L.table(['King', 'Quarter', 'In the text'], KINGS.map(e => [`<b>${esc(e.name)}</b>`, `<b>${esc(e.direction)}</b>`, `<span class="sub">${esc(Q.brief(e.note || '', 170))}</span>`]))
          + (kingsCall ? L.p(`<span class="sub">${esc(kingsCall)}</span>`) : '')
          + L.p('<span class="sub">Other grimoires place these Kings differently (Weyer, for one, makes Gorson King of the South and Goap of the West); this path asks only the 1904 Goetia.</span>');
      } else h += L.p('<span class="sub">The compass data (compass.json) could not be read, so the four Kings are left out this time.</span>');
      return h;
    }

    function lesBlock(lo, hi) {
      const S = SP.filter(s => s.n >= lo && s.n <= hi);
      return L.p(`Spirits ${lo} to ${hi} of the Goetia (1904): each one's number, rank and legions, what it does (its office) and how it appears. The quiz asks only about these ${S.length}.`)
        + L.table(['No.', 'Spirit', 'Rank', 'Legions'], S.map(s => [`<b>${s.n}</b>`, `${esc(prim(s.name))}${vars(s)}`, esc(s.rank), esc(legN(s))]))
        + L.sec('What they do and how they appear')
        + S.map(s => { const f = GO.sealFigs(s)[0], rest = legRest(s);
          return `<div class="gpsp"><div class="gph">${f ? GO.sealImg(f, { deco: true }) : ''}<div><b>${nm(s)}</b><span class="sub">${esc(s.rank)} · ${esc(legN(s))} legions</span></div></div>`
            + `<dl class="kv">${rest ? `<dt>Legions</dt><dd>${esc(legN(s))} <span class="sub">${esc(rest)}</span></dd>` : ''}<dt>Office</dt><dd>${esc(s.office)}</dd>`
            + `<dt>Appears</dt><dd>${s.appearance ? esc(s.appearance) : '<span class="sub">No form is described.</span>'}</dd></dl></div>`; }).join('');
    }

    function lesZodiac() {
      const D = (G.decans || []).slice().sort((a, b) => a.i - b.i);
      const rule = D.length === 36 && D.every(d => d.day === d.i + 1 && d.night === d.i + 37);
      const cell = n => { const s = byN(n); if (!s) return ''; const a = shemP(s.shem);
        return `<b>${s.n}</b> ${esc(prim(s.name))}${a ? `<br><span class="sub">✦ ${esc(a.name)}</span>` : ''}`; };
      return L.p('The 72 spirits are laid on the 36 decans of the zodiac, ten degrees each, and each decan is a small card of the Tarot (2 to 10).'
          + (rule ? ' Spirits <b>1–36</b> rule the decans <b>by day</b>, in order from Aries I; spirits <b>37–72</b> rule them <b>by night</b>, beginning again at Aries I — so spirit n and spirit n + 36 share a decan.' : ''))
        + L.p('<span class="sub">✦ The angel of the Shem ha-Mephorash paired with each spirit: the angel of the same number (1 Vehuiah with 1 Bael, 37 Aniel with 37 Phenex).</span>')
        // (three columns: the card under its decan, so the table fits a 390 px phone)
        + L.table(['Decan · card', 'By day ✦', 'By night ✦'], D.map(d => [`<b>${esc(d.sign)} ${esc(d.decan)}</b> <span class="sub">${esc(d.degrees)}</span>`
          + `<br>${esc(d.card)} <span class="sub">${esc(d.title)}</span>`, cell(d.day), cell(d.night)]))
        + L.p('<span class="sub">Book T and Liber 777 give each decan a different pair of angels, counted from Leo I (see the small cards in Learn a card). This stage asks only the pairing by number.</span>');
    }

    function lesSeals() {
      const two = SP.filter(s => GO.sealFigs(s).length > 1);
      let h = L.p('The seals of the 72 spirits, from de Laurence\'s 1916 plates. The letters round each seal\'s rim spell the spirit\'s name; in the quiz the rim is hidden, so learn each seal by its inner figure. The four seals offered in one question come from the same six (1–6, 7–12, …): learn them six at a time.');
      for (let lo = 1; lo <= SP.length; lo += 6) {
        const S = SP.filter(s => s.n >= lo && s.n < lo + 6); if (!S.length) continue;
        h += L.sec(`${lo}–${S[S.length - 1].n}`) + `<div class="gpseals">${S.map(s => { const f = GO.sealFigs(s);
          return `<figure${f.length > 1 ? ' class="two"' : ''}>${f.map(x => GO.sealImg(x, { label: `seal of ${prim(s.name)}${f.length > 1 ? ', fig. ' + x : ''}` })).join('')}`
            + `<figcaption><b>${s.n}</b>${esc(prim(s.name))}</figcaption></figure>`; }).join('')}</div>`;
      }
      return h + (two.length ? L.p(`<span class="sub">Two seals each: ${esc(Q.listAnd(two.map(s => `${s.n} ${prim(s.name)}`)))}. The quiz shows either one; both are the spirit's seal.</span>`) : '');
    }

    function lesPractice() {
      let h = L.sec('What the text sets down, in its order');
      // the text after the 72 spirits (lesserkey.json), in the order it gives them; without it, what goetia.json quotes
      const obs = [];
      const at = re => { const m = APX.search(re); return m < 0 ? Infinity : m; };
      if (moonQ) obs.push([at(/observe the Moon/i), `<b>The Moon's age</b>: “${esc(moonQ)}.”`]);
      if (/Seals of the 72 Kings are to be made in Metals/i.test(APX)) obs.push([at(/Seals of the 72 Kings/i), '<b>The seals</b> are to be made in metals, each rank its own (stage 1).']);
      if (/Four Great Kings/i.test(APX)) obs.push([at(/Four Great Kings/i), '<b>The four great Kings</b> are not to be called forth except upon great occasions, but invoked and commanded to send the spirits under their power (stage 1).']);
      if (/may be bound/i.test(APX) || hoursOf('King')) obs.push([at(/may be bound/i), '<b>The hours</b> in which each rank may be bound (stage 1).']);
      if (mCircle) obs.push([at(/THE MAGICAL CIRCLE/), `<b>The Magical Circle</b>: “${esc(mCircle[1])}”`]);
      if (mTri) obs.push([at(/THE MAGICAL TRIANGLE/), `<b>The Magical Triangle</b>: “${esc(mTri[1])}.”`]);
      obs.sort((a, b) => a[0] - b[0]);
      h += L.ol(obs.map(x => x[1]))
        + L.p(`<span class="sub">${APX ? 'From the Observations and the sections after them (the 1904 text as de Laurence reprinted it). ' : 'The full text (lesserkey.json) could not be read; this is what goetia.json quotes. '}The app's data holds nothing more about the order of a working — the conjurations themselves are not in it — so this path goes no further.</span>`);
      h += L.sec('What the entries themselves say about working');
      if (CHARGE.length) h += L.table(['Spirit', 'The 1904 text (as the app summarises it)'], CHARGE.map(c => [`<b>${nm(c.sp)}</b>`, esc(c.t)]));
      // (the Goetia's own sentences of the app's summary; not the neighbouring grimoires it compares)
      if (GEN.classical) h += L.p(`<span class="sub">${esc(sents(GEN.classical, /^(?!Neighbouring)/))}</span>`);
      h += L.sec('Pens for the seals — your altar workbook')
        + L.table(['Rank', 'Pen', 'Alternatives'], RANKS.map(r => { const k = G.ranks[r], p = penOf(k.pen), a = penOf(k.alt), g = penOf(k.gd);
          return [`<b>${esc(r)}</b><br><span class="sub">${esc(G.ranks[r].metal)}</span>`, penH(p), [a ? `${penH(a)} <span class="sub">alt.</span>` : '', g ? `${penH(g)} <span class="sub">Golden Dawn colour</span>` : ''].filter(Boolean).join('<br>')]; }));
      h += L.sec('Offerings by rank — modern practice')
        + L.p('<span class="sub">From the app\'s offering research: modern conventions matched to each rank\'s planet, not the Goetia\'s own rule.</span>')
        + L.table(['Rank', 'Usual offerings'], RANKS.filter(r => OR[r] && Array.isArray(OR[r].offerings)).map(r => [`<b>${esc(r)}</b>`, esc(OR[r].offerings.join(' · '))]));
      h += L.sec('Spirits whose entry names a quarter');
      if (QTR_ALL.length) {
        const conf = { high: 'stated', medium: 'medium confidence', low: 'low confidence' };   // (compass.json's own rating)
        h += L.table(['Spirit', 'Quarter', 'In the text'], QTR_ALL.map(e => [`<b>${nm(byN(+e.goetia))}</b>`, `${esc(e.direction)}<br><span class="sub">${esc(conf[e.confidence] || e.confidence || '')}</span>`, `<span class="sub">${esc(e.note || '')}</span>`]))
          + L.p(`<span class="sub">The quiz asks only the ones the text states outright: ${esc(Q.listAnd(QTR.map(e => prim(byN(+e.goetia).name))))}.</span>`);
      } else h += L.p('<span class="sub">The compass data (compass.json) could not be read, so the quarters are left out this time.</span>');
      return h;
    }

    /* ---------- the stages ---------- */
    const inR = (lo, hi) => it => { const n = parseInt(it.key, 10); return n >= lo && n <= hi; };
    const origNear = (id, a, b) => { const r = Q.relation(id); return !!(r && typeof r.near === 'function' && r.near(a, b)); };
    // refine (see quiz.html): a stage's questions offer only the spirits its lesson covers — as options, and as made-up numbers
    // (go.num offers n ± 1 and n ± 36); the stage's cards keep their ids, answers and schedule. (The office is asked back without the
    // spirit's rank, which among twelve spirits nearly names it: quiz.html asks it so everywhere now)
    // Offices and appearances where most of one text is true of the other spirit too, though the words differ too much for the
    // relation's own rule (jacc > .5): never offered against each other — in this path, and (addNear below) in Practice, the daily
    // review and Learn a spirit, where any of the 72 can be an option. They are the groups of tab Spirit twins, each with what its
    // texts share (Amon, Barbatos, Gusion … past and to come, friends and foes; Halphas, Malphas, Sabnock: towers …)
    const all = ns => ns.flatMap((p, i) => ns.slice(i + 1).map(q => [p, q]));   // every pair of a group
    const TWIN = {}, TWIN_REL = { office: 'go.office', appearance: 'go.appear' };
    DB.rows('spirit_twins').forEach(r => { const id = TWIN_REL[r.field]; if (id) (TWIN[id] = TWIN[id] || []).push(...all(DB.ref(r, 'spirits').map(s => s.n))); });
    const twin = (id, a, b) => { const x = parseInt(a.key, 10), y = parseInt(b.key, 10);
      return (TWIN[id] || []).some(([p, q]) => (p === x && q === y) || (p === y && q === x)); };
    // the same pairs everywhere else too — Practice, the daily review, Learn a spirit (QuizPaths.addNear); so, as near-twins of the
    // relation itself, they are never asked in one stage quiz either (twins above)
    if (typeof Q.addNear === 'function') Object.keys(TWIN).forEach(id => Q.addNear(id, (a, b) => twin(id, a, b)));
    const rangeRefine = (lo, hi) => {
      const inr = inR(lo, hi), o = {};
      ['go.num', 'go.rank', 'go.legions', 'go.office', 'go.appear'].forEach(id => { o[id] = { near: (a, b) => !inr(a) || !inr(b) || origNear(id, a, b) || twin(id, a, b) }; });
      o['go.num'].synth = it => { const r = Q.relation('go.num'); return (r && typeof r.synth === 'function' ? r.synth(it) : []).filter(x => typeof x !== 'number' || (x >= lo && x <= hi)); };
      return o;
    };
    const block = (lo, hi) => ({
      id: `sp${lo}-${hi}`, title: `Spirits ${lo}–${hi}`, sub: 'Number, name, rank, legions, office and appearance', size: 12,
      lesson: () => lesBlock(lo, hi), refine: rangeRefine(lo, hi), explain,
      items: () => [Q.sel('go.num', inR(lo, hi)), Q.sel('go.rank', inR(lo, hi)), Q.sel('go.legions', inR(lo, hi)),
        Q.sel('go.office', it => inR(lo, hi)(it) && !OFF_OUT.has(+it.key)),
        Q.sel('go.appear', it => inR(lo, hi)(it) && !APP_OUT.has(+it.key))]
    });
    // the seals six at a time (see six above)
    const sixIt = it => Math.ceil(parseInt(it.key, 10) / 6);
    const stages = [
      { id: 'structure', title: 'The structure', sub: 'Seventy-two spirits and seven ranks: metals, planets, hours; the four great Kings', size: 12,
        lesson: lesStructure, explain,
        // Earl → Mars is Mathers' suggestion (the Observations give Earls copper and silver, Venus and Luna): never asked, never offered.
        // Metals: the note after the Classified List would make Presidents' seals "Copper and Silver" too, so Earl and President are
        // never offered against each other; and Earl's "Copper + silver" is never the only two-metal option (two made-up pairs of
        // metals that no source gives any rank, one always among the options)
        refine: { 'go.rplanet': { near: (a, b) => a.key === 'Earl' || b.key === 'Earl' },
          'go.rmetal': { near: (a, b) => [a.key, b.key].sort().join() === 'Earl,President',
            synth: it => !/\+/.test(it.v.t) ? [] : [['Gold + tin', 9], ['Lead + tin', 3 + Math.random()]].map(([t, sc]) =>
              ({ sd: Q.side(t, { cat: 'metal', typ: false, parts: t.toLowerCase().split('+').map(x => x.trim()) }), sc })) } },
        items: () => [Q.sel('go.rmetal'), Q.sel('go.rplanet', it => it.key !== 'Earl'), Q.sel('go.hours'), Q.sel('go.king')] },
      block(1, 12), block(13, 24), block(25, 36), block(37, 48), block(49, 60), block(61, 72),
      { id: 'zodiac', title: 'The zodiac', sub: 'Each spirit\'s decan, by day or by night, and its Shem angel', size: 12,
        lesson: lesZodiac, explain,
        items: () => [Q.sel('go.decan', null, 'f'), Q.sel('go.decan', null, 'r'), Q.sel('go.shem'), Q.sel('go.dn')] },
      { id: 'seals', title: 'The seals', sub: 'Whose seal is this? Which seal is whose? (de Laurence, 1916)', size: 12,
        lesson: lesSeals, explain,
        refine: { 'go.seal': { near: (a, b) => sixIt(a) !== sixIt(b) } },
        clash: (a, b) => (a.rel.id === 'go.seal' && b.rel.id === 'go.seal' && six(a) === six(b)) || guard(a, b),
        items: () => [Q.sel('go.seal', null, 'f'), Q.sel('go.seal', null, 'r')] },
      { id: 'practice', title: 'Working practice', sub: 'Pens, offerings, quarters, what the entries require; the Moon, the Circle and the Triangle', size: 12,
        lesson: lesPractice, explain,
        items: () => [Q.sel('go.pen'), Q.sel('go.offer'), Q.sel('go.quarter'), Q.sel('go.charge'), [Q.sel('go.moon'), Q.sel('go.obs')]] }
    ];
    Q.registerPath({
      id: 'goetia', title: 'Learn the Goetia', short: 'Goetia', icon: '72', blurb: 'The 72 spirits (1904)', route: 'goetia',
      intro: 'A guided path through the 72 spirits of the Goetia (Mathers/Crowley 1904; seals from de Laurence 1916)',
      retryHint: "The lesson holds every answer.", clash: guard,
      requires: () => !!Q.data.goetia && Q.cards('go.rank').length > 0,
      stages
    });
  }
})();
