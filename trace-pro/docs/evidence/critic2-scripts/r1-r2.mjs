/**
 * R1 (question, per screen AND per lens, first painted text of its region) and
 * R2 (the FULL 26-token rubric denylist, with per-token disposition).
 */
import { openBrowser, watch, go, settle, save, ROUTES } from './lib.mjs';

/** The rubric's list, verbatim from docs/ux-rubric.md lines 41-44. */
const RUBRIC_DENYLIST = [
  'lt','rfx','str','sim','iss','own','gls','MV','LTV','px','qty','gq','apex','nonav',
  'in tol','scen a','scen b','mv100','dcN','NAV','bps','SPV','VPM','Δ','FR','DC',
];
/** Tokens that are ordinary English words: judged only when they are an element's ENTIRE label. */
const LABEL_ONLY = new Set(['lt','str','sim','iss','own','gls','rfx']);
/** Expansions the rubric's "expanded on first use" clause can be satisfied by. */
const EXPANSIONS = {
  MV: /market value/i, LTV: /look-?through value|loan[- ]to[- ]value/i,
  px: /unit price/i, qty: /quantit(y|ies)|units outstanding/i,
  gq: /global (units|quantity)/i, apex: /top-level feeder/i,
  nonav: /no nav|reports no net asset value/i, mv100: /value of (the )?whole entity/i,
  dcN: /double-?count/i, NAV: /net asset value/i, bps: /basis points?/i,
  SPV: /special purpose vehicle/i, VPM: /valuation portfolio/i,
  'Δ': /\bchange\b/i, FR: /fund report|financial report/i, DC: /double-?count/i,
  'in tol': /in tolerance/i, 'scen a': /scenario a/i, 'scen b': /scenario b/i,
  lt: /look-?through/i, str: /structure/i, sim: /simulat/i, iss: /issue/i,
  own: /owner/i, gls: /glossar/i, rfx: /repric/i,
};

const HARVEST = () => {
  const hosts = ['#masthead', '#screen', '#drawer-host'].map((s) => document.querySelector(s)).filter(Boolean);
  const out = [];
  let order = 0;
  for (const host of hosts) {
    const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
    let n = walker.nextNode();
    while (n) {
      const text = (n.textContent ?? '').replace(/\s+/g, ' ').trim();
      const p = n.parentElement;
      if (text && p) {
        const style = getComputedStyle(p);
        const box = p.getBoundingClientRect();
        out.push({
          order: order++, text,
          host: host.id || host.className,
          tag: p.tagName.toLowerCase(),
          cls: p.className || '',
          id: p.id || '',
          ownText: [...p.childNodes].filter((c) => c.nodeType === 3).map((c) => (c.textContent ?? '').trim()).filter(Boolean).join(' '),
          glossaryLinked: !!p.closest('.gterm,[data-glossary-term]'),
          inGlossaryDrawer: !!p.closest('.glscard,.glssec'),
          visible: style.display !== 'none' && style.visibility !== 'hidden' && box.width > 0 && box.height > 0,
          hiddenAncestor: !!p.closest('[hidden]'),
          top: Math.round(box.top),
        });
      }
      n = walker.nextNode();
    }
  }
  const titles = [...document.querySelectorAll('#masthead [title], #screen [title]')].map((e) => ({
    title: e.getAttribute('title'), id: e.id || '', cls: e.className || '', tag: e.tagName.toLowerCase(),
    hiddenAncestor: !!e.closest('[hidden]'),
  }));
  return { texts: out, titles };
};

const QUESTIONS = () => {
  const ids = ['reconciliation-question','pricing-question','diagnose-question','structure-question','ownership-question','data-quality-question','simulator-question'];
  const found = [];
  for (const id of ids) {
    const e = document.getElementById(id);
    if (!e) continue;
    const b = e.getBoundingClientRect();
    found.push({ id, text: (e.textContent??'').replace(/\s+/g,' ').trim(), len: (e.textContent??'').trim().length,
      top: Math.round(b.top), bottom: Math.round(b.bottom), h: Math.round(b.height),
      isQuestion: /\?$/.test((e.textContent??'').trim()) });
  }
  // first painted own-text element inside the LENS host (the region below the lens tabs)
  const lensHost = document.querySelector('#lens-body, #lens-panel, [role="tabpanel"]') ?? null;
  let lensFirst = null;
  if (lensHost) {
    const items = [];
    for (const el of lensHost.querySelectorAll('*')) {
      const own = [...el.childNodes].filter((n)=>n.nodeType===3).map((n)=>(n.textContent??'').trim()).filter(Boolean).join(' ');
      if (!own) continue;
      const b = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      if (b.height === 0 || b.width === 0 || s.visibility === 'hidden' || s.display === 'none') continue;
      items.push({ top: Math.round(b.top), left: Math.round(b.left), id: el.id||null, cls: el.className||'', text: own.slice(0,90) });
    }
    items.sort((a,b)=>a.top-b.top||a.left-b.left);
    lensFirst = items[0] ?? null;
  }
  return { found, lensHost: lensHost ? (lensHost.id || lensHost.className) : null, lensFirst,
    questionElements: [...document.querySelectorAll('#screen .screen-question, #screen .lens-question')].map((e)=>e.id||e.className) };
};

function disposition(token, texts) {
  const isLabelOnly = LABEL_ONLY.has(token);
  const re = /^[A-Za-z0-9]+$/.test(token)
    ? new RegExp('(?<![A-Za-z0-9])' + token + '(?![A-Za-z0-9])', token === token.toLowerCase() ? '' : '')
    : new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const hits = [];
  for (const t of texts) {
    if (!t.visible || t.hiddenAncestor || t.inGlossaryDrawer) continue;
    if (isLabelOnly) {
      if (t.text.toLowerCase() === token.toLowerCase()) hits.push(t);
    } else if (re.test(t.text)) hits.push(t);
  }
  if (!hits.length) return { token, occurrences: 0, verdict: 'absent' };
  const first = hits[0];
  const expansion = EXPANSIONS[token];
  // "expanded on first use on that screen": an expansion painted at or before the first occurrence.
  const before = texts.filter((t) => t.visible && !t.hiddenAncestor && !t.inGlossaryDrawer && t.order <= first.order);
  const expandedBefore = expansion ? before.some((t) => expansion.test(t.text)) : false;
  const allLinked = hits.every((h) => h.glossaryLinked);
  return {
    token, occurrences: hits.length,
    firstOccurrence: { text: first.text.slice(0, 100), id: first.id, cls: String(first.cls).slice(0, 60), glossaryLinked: first.glossaryLinked, top: first.top },
    expandedOnFirstUse: expandedBefore,
    firstOccurrenceGlossaryLinked: first.glossaryLinked,
    everyOccurrenceGlossaryLinked: allLinked,
    verdict: (expandedBefore || first.glossaryLinked) ? 'pass' : 'BARE',
    bareExamples: (expandedBefore || first.glossaryLinked) ? [] : hits.slice(0, 4).map((h) => ({ text: h.text.slice(0, 80), id: h.id, cls: String(h.cls).slice(0, 50) })),
  };
}

const { browser, context } = await openBrowser();
const page = await context.newPage();
const problems = watch(page);
const report = { denylistTokenCount: RUBRIC_DENYLIST.length, routes: {} };

for (const route of ROUTES) {
  await go(page, route.hash);
  const q = await page.evaluate(QUESTIONS);
  const { texts, titles } = await page.evaluate(HARVEST);
  const r2 = RUBRIC_DENYLIST.map((t) => disposition(t, texts));
  // tooltips, which the rubric explicitly puts in scope
  const tooltipHits = [];
  for (const t of titles) {
    if (t.hiddenAncestor) continue;
    for (const token of RUBRIC_DENYLIST) {
      if (LABEL_ONLY.has(token)) continue;
      const re = new RegExp('(?<![A-Za-z0-9])' + token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![A-Za-z0-9])');
      if (re.test(t.title)) tooltipHits.push({ token, title: t.title.slice(0, 110), id: t.id, cls: String(t.cls).slice(0,40) });
    }
  }
  report.routes[route.id] = {
    r1: q,
    r2: { bare: r2.filter((x) => x.verdict === 'BARE'), all: r2 },
    r2TooltipHits: tooltipHits.slice(0, 25),
    visibleTextNodes: texts.filter((t) => t.visible && !t.hiddenAncestor).length,
  };
  console.log(route.id, '| R1 questions:', q.found.map((f)=>f.id+(f.isQuestion?'?':'!')).join(','),
    '| R2 bare:', r2.filter((x)=>x.verdict==='BARE').map((x)=>x.token).join(' ') || 'none');
}
report.consoleProblems = problems;
save('critic2-r1-r2.json', report);
await browser.close();
