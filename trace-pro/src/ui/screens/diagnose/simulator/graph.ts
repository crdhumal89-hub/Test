/**
 * Simulator lens — the d3 scene.
 *
 * Ported from `buildSimGraph` / `simPaintBase` / `simSetAfter` / `simAnimate` / `simFRSetNode` /
 * `simFRLightEdge` / `simDeoverlap` (original 1633-1996): 27 node boxes and 36 ownership-% pills,
 * unchanged. The d3 surface is the one typed in the Structure lens — there is exactly one
 * hand-written d3 typing in the app and both graphs use it.
 *
 * Determinism: every motion path checks `structureReducedMotion()`. Under reduced motion the scene
 * writes its final state synchronously and starts no transition, so a snapshot of the resting scene
 * and of a completed sweep is always the same DOM.
 */
import type { CascadeResult } from '../../../../domain/cascade.js';
import { formatPrice } from '../../../../domain/money.js';
import type { SimulatorFixture } from '../../../../domain/types.js';
import { structureReducedMotion, type StructureD3, type StructureHierarchyNode, type StructureSelection } from '../structure/graph.js';
import { structureRoveNodes } from '../structure/controls.js';
import { simulatorCompactUsd, simulatorCompactUsdParens } from './ledger.js';

/** A node of the simulator tree, exactly the fixture's `treeNodes` shape. */
export interface SimulatorTreeDatum {
  id: string;
  pid: string | null;
  level: number;
  kind: string;
}

/** One drawn edge. `prod` marks the three product legs; `cross` a co-ownership edge. */
export interface SimulatorEdgeDatum {
  from: string;
  to: string;
  prod: boolean;
  cross: boolean;
  share: number | null;
  offsetX: number;
  offsetY: number;
  width: number;
}

interface SimulatorPillBox {
  cx: number;
  cy: number;
  w: number;
  h: number;
  fixed?: boolean;
  edge?: SimulatorEdgeDatum;
}

export interface SimulatorSceneOptions {
  fixture: SimulatorFixture;
  /** Display value of a node in the active pricing view; null when the fund reports no NAV. */
  valueOf(id: string): number | null;
  /** Display unit price of a node; null for the product and for funds without a price. */
  priceOf(id: string): number | null;
  nameOf(id: string): string;
  onActivate(id: string): void;
}

export interface SimulatorScene {
  nodeCount: number;
  edgeCount: number;
  fit(): void;
  focusOn(ids: readonly string[]): void;
  /** Back to the resting picture, with `selected` outlined. */
  paintBase(selected: string | null): void;
  /** Paint a completed cascade: the origin, every holder's new value, its P&L halo and the lit path. */
  showCascade(result: CascadeResult, isolate: boolean): void;
  /** Paint one fund as repriced: `was <before>`, the new value, its price and its P&L. */
  markRepriced(id: string, before: number | null, after: number | null, pnl: number, price: number | null): void;
  lightEdges(edges: readonly { from: string; to: string }[], pnlOf: (id: string) => number): void;
  /** Gold-ring the level the controller may reprice next. */
  armNext(ids: readonly string[]): void;
  /** The product's reconciled endpoint, with the ✓ badge the original draws on the box. */
  finishProduct(before: number, after: number, pnl: number): void;
}

const SIMULATOR_KIND_FILL: Record<string, string> = { product: '#0A1226', apex: '#14304a', vehicle: '#1F4A4F' };
const SIMULATOR_GAIN = '#41c99b';
const SIMULATOR_LOSS = '#ef7468';

/** Greedy label de-overlap; was `simDeoverlap`. Node boxes are fixed obstacles, only pills move. */
function simulatorDeoverlap(boxes: SimulatorPillBox[]): void {
  for (let pass = 0; pass < 12; pass++) {
    let moved = false;
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        if (!a || !b || (a.fixed && b.fixed)) continue;
        const dx = b.cx - a.cx;
        const dy = b.cy - a.cy;
        const ox = (a.w + b.w) / 2 + 3 - Math.abs(dx);
        const oy = (a.h + b.h) / 2 + 3 - Math.abs(dy);
        if (ox <= 0 || oy <= 0) continue;
        const along = ox < oy ? 'cx' : 'cy';
        const push = ((ox < oy ? ox : oy) / 2) * ((ox < oy ? dx : dy) < 0 ? -1 : 1);
        if (a.fixed) b[along] += 2 * push;
        else if (b.fixed) a[along] -= 2 * push;
        else {
          a[along] -= push;
          b[along] += push;
        }
        moved = true;
      }
    }
    if (!moved) break;
  }
}

function simulatorShareText(share: number | null): string {
  return share == null ? '' : (share * 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
}

function simulatorValueText(options: SimulatorSceneOptions, id: string): string {
  const value = options.valueOf(id);
  if (value != null) return simulatorCompactUsd(value);
  return options.fixture.funds[id]?.gqZero ? 'top-level feeder' : 'no NAV reported';
}

/** Build the scene. One call per (re)layout; the returned handle mutates it in place after that. */
export function simulatorBuildScene(d3: StructureD3, svgNode: SVGSVGElement, options: SimulatorSceneOptions): SimulatorScene {
  const fixture = options.fixture;
  const svg = d3.select<SimulatorTreeDatum>(svgNode);
  svg.selectAll('*').remove();
  const width = Math.max(700, svgNode.parentElement?.clientWidth ?? 0);
  const height = Math.max(440, svgNode.parentElement?.clientHeight ?? 0);
  svg.attr('viewBox', `0 0 ${width} ${height}`);
  const stage = svg.append('g');
  const zoom = d3
    .zoom()
    .scaleExtent([0.16, 4])
    .on('zoom', (event) => {
      stage.attr('transform', `translate(${event.transform.x},${event.transform.y}) scale(${event.transform.k})`);
    });
  svg.call(zoom).on('dblclick.zoom', null);

  const root = d3
    .stratify<SimulatorTreeDatum>()
    .id((d) => d.id)
    .parentId((d) => d.pid)(fixture.treeNodes as SimulatorTreeDatum[]);
  const descendants = root.descendants();
  const byDepth = new Map<number, number>();
  root.each((d) => byDepth.set(d.depth, (byDepth.get(d.depth) ?? 0) + 1));
  d3.tree<SimulatorTreeDatum>()
    .size([
      Math.max(width - 140, Math.max(1, ...byDepth.values()) * 176),
      Math.max(height - 190, Math.max(1, ...descendants.map((d) => d.depth)) * 152),
    ])
    .separation((a, b) => (a.parent === b.parent ? 1.06 : 1.4))(root);

  const pos = new Map<string, { x: number; y: number }>();
  root.each((d) => {
    d.px = d.x + 64;
    d.py = d.y + 74;
    pos.set(d.data.id, { x: d.px, y: d.py });
  });

  const edgeData: SimulatorEdgeDatum[] = [];
  for (const l of root.links()) {
    if (l.source.data.id !== fixture.productNodeId) continue;
    edgeData.push({ from: l.target.data.id, to: l.source.data.id, prod: true, cross: false, share: 1, offsetX: 0, offsetY: 0, width: 34 });
  }
  for (const e of fixture.edges) {
    const units = fixture.funds[e.i]?.gq ?? 0;
    const share = e.ownpct ?? (units ? e.units / units : null);
    edgeData.push({ from: e.i, to: e.h, prod: false, cross: !(e as { tree?: number }).tree, share, offsetX: 0, offsetY: 0, width: 34 });
  }

  const link = d3.linkVertical().x((p) => p.x).y((p) => p.y);
  const pathOf = (d: SimulatorEdgeDatum): string | null => {
    const s = pos.get(d.from);
    const t = pos.get(d.to);
    return s && t ? link({ source: { x: s.x, y: s.y - 37 }, target: { x: t.x, y: t.y + 38 } }) : null;
  };
  const midOf = (d: SimulatorEdgeDatum): { x: number; y: number } | null => {
    const s = pos.get(d.from);
    const t = pos.get(d.to);
    return s && t ? { x: (s.x + t.x) / 2, y: (s.y + t.y) / 2 } : null;
  };

  const edge = stage
    .append('g')
    .selectAll<SimulatorEdgeDatum>('path')
    .data(edgeData)
    .join('path')
    .attr('class', (d) => `simedge${d.cross ? ' cross' : ''}`)
    .attr('data-k', (d) => `${d.from}|${d.to}`)
    .attr('fill', 'none')
    .attr('stroke-dasharray', (d) => (d.cross ? '4 3' : null))
    .attr('d', pathOf);

  const node = stage
    .append('g')
    .selectAll<StructureHierarchyNode<SimulatorTreeDatum>>('g')
    .data(descendants, (d) => d.data.id)
    .join('g')
    .attr('class', (d) => `simnode k-${d.data.kind}`)
    .attr('data-code', (d) => d.data.id)
    .attr('role', 'button')
    .attr('tabindex', (_d, i) => (i === 0 ? 0 : -1))
    .attr('aria-label', (d) => `${d.data.id}, ${options.nameOf(d.data.id)}, level ${d.data.level}. Activate to shock this fund.`)
    .attr('transform', (d) => `translate(${d.px},${d.py})`);

  node
    .append('rect')
    .attr('class', 'body')
    .attr('data-parity', 'simulator.graph.node_count')
    .attr('x', -80)
    .attr('y', -37)
    .attr('width', 160)
    .attr('height', 74)
    .attr('rx', 13)
    .attr('fill', (d) => SIMULATOR_KIND_FILL[d.data.kind] ?? '#1F4A4F');
  const text = (cls: string, y: number, size: number, weight: number, fill: string, value: (d: StructureHierarchyNode<SimulatorTreeDatum>) => string): void => {
    node.append('text').attr('class', cls).attr('text-anchor', 'middle').attr('y', y).attr('font-size', size).attr('font-weight', weight).attr('fill', fill).attr('pointer-events', 'none').text(value);
  };
  text('code', -20, 11.5, 800, '#ffffff', (d) => (d.data.id.length > 14 ? d.data.id.slice(0, 14) : d.data.id));
  text('name', -7, 9.5, 500, 'rgba(226,236,250,.78)', (d) => {
    const name = options.nameOf(d.data.id);
    return name.length > 28 ? `${name.slice(0, 27)}…` : name;
  });
  text('val', 13, 12, 800, '#e8f1ff', (d) => simulatorValueText(options, d.data.id));
  text('px', 29, 9.5, 600, 'rgba(200,216,238,.8)', (d) => {
    const price = options.priceOf(d.data.id);
    return price == null ? '' : `px ${formatPrice(price)}`;
  });
  node.append('title').text((d) => `${d.data.id} — ${options.nameOf(d.data.id)}`);
  node.on('click', (_event, d) => options.onActivate(d.data.id));
  // Same roving tabindex as the Structure lens: Tab in once, then arrow through all 27 boxes.
  node.on('keydown', (event, d) => structureRoveNodes(event as KeyboardEvent, node.nodes(), () => options.onActivate(d.data.id)));

  /* ---- ownership-% pills at every edge midpoint, de-overlapped against the node boxes ---- */
  const pillData = edgeData.filter((d) => d.share != null);
  const boxes: SimulatorPillBox[] = [];
  for (const d of pillData) {
    const mid = midOf(d);
    if (!mid) continue;
    d.width = Math.max(34, Math.round(simulatorShareText(d.share).length * 6.6 + 16));
    boxes.push({ cx: mid.x, cy: mid.y, w: d.width, h: 18, edge: d });
  }
  for (const p of pos.values()) boxes.push({ cx: p.x, cy: p.y, w: 166, h: 80, fixed: true });
  simulatorDeoverlap(boxes);
  for (const b of boxes) {
    const mid = b.edge ? midOf(b.edge) : null;
    if (!b.edge || !mid) continue;
    b.edge.offsetX = b.cx - mid.x;
    b.edge.offsetY = b.cy - mid.y;
  }

  const pct = stage
    .append('g')
    .attr('class', 'edgepcts')
    .selectAll<SimulatorEdgeDatum>('g')
    .data(pillData)
    .join('g')
    .attr('class', (d) => `edgepct${d.cross ? ' cross' : ' rest'}`)
    .attr('data-parity', 'simulator.graph.edge_count')
    .attr('data-k', (d) => `${d.from}|${d.to}`)
    .attr('pointer-events', 'none')
    .attr('transform', (d) => {
      const mid = midOf(d);
      return mid ? `translate(${mid.x + d.offsetX},${mid.y + d.offsetY})` : null;
    });
  pct.each(function pill(d) {
    const share = simulatorShareText(d.share);
    const g = d3.select<unknown>(this);
    g.append('rect').attr('x', -d.width / 2).attr('y', -9).attr('width', d.width).attr('height', 18).attr('rx', 9).attr('fill', '#0b1f3a').attr('stroke', '#c9a24a');
    g.append('text').attr('text-anchor', 'middle').attr('dy', '0.34em').attr('fill', '#f3f7ff').attr('font-size', 10).attr('font-weight', 700).text(share);
    g.append('title').text(`${share} of ${d.from} held by ${d.to}`);
  });

  /* ---- the mutating half: paint, cascade, staged reprice ---- */
  const frame = (ids: readonly string[], pad: number): void => {
    const points = ids.map((id) => pos.get(id)).filter((p): p is { x: number; y: number } => !!p);
    if (!points.length) return;
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const bw = Math.max(1, Math.max(...xs) - Math.min(...xs) + pad * 2);
    const bh = Math.max(1, Math.max(...ys) - Math.min(...ys) + pad * 1.5 + 28);
    const k = Math.min(width / bw, height / bh, 2.2) * 0.93;
    const cx = (Math.max(...xs) + Math.min(...xs)) / 2;
    const cy = (Math.max(...ys) + Math.min(...ys)) / 2;
    const to = d3.zoomIdentity.translate(width / 2 - cx * k, height / 2 - cy * k).scale(k);
    if (structureReducedMotion()) svg.call(zoom.transform, to);
    else svg.transition().duration(520).call(zoom.transform, to);
  };

  const halo = (sel: StructureSelection<StructureHierarchyNode<SimulatorTreeDatum>>, delta: number): void => {
    sel.select('g.simpnl').remove();
    const label = `${delta >= 0 ? '▲ ' : '▼ '}${simulatorCompactUsdParens(delta)}`;
    const w = Math.max(46, Math.round(label.length * 7.7 + 18));
    const group = sel.append('g').attr('class', `simpnl ${delta >= 0 ? 'pos' : 'neg'}`).attr('transform', 'translate(0,-51)');
    group.append('rect').attr('x', -w / 2).attr('y', -11).attr('width', w).attr('height', 21).attr('rx', 7).attr('fill', delta >= 0 ? '#0f3d2e' : '#4a1d1a').attr('stroke', delta >= 0 ? SIMULATOR_GAIN : SIMULATOR_LOSS);
    group.append('text').attr('text-anchor', 'middle').attr('dy', '0.34em').attr('fill', delta >= 0 ? '#7ff0c4' : '#ffb3a8').attr('font-size', 10).attr('font-weight', 800).text(label);
  };

  const setAfter = (id: string, before: number | null, after: number | null, delta: number, price: number | null): void => {
    const sel = node.filter((d) => d.data.id === id);
    if (sel.empty()) return;
    sel.select('text.val').text(after != null ? simulatorCompactUsd(after) : simulatorValueText(options, id));
    sel.select('text.px').text(before != null ? `was ${simulatorCompactUsd(before)}${price != null ? ` · px ${formatPrice(price)}` : ''}` : '');
    sel.select('rect.body').attr('stroke', delta >= 0 ? SIMULATOR_GAIN : SIMULATOR_LOSS).attr('stroke-width', 2);
    halo(sel, delta);
  };

  const scene: SimulatorScene = {
    nodeCount: node.nodes().length,
    edgeCount: pct.nodes().length,
    fit: () => frame([...pos.keys()], 86),
    focusOn: (ids) => frame(ids, 104),
    paintBase(selected: string | null): void {
      stage.selectAll('g.simpnl').remove();
      stage.selectAll('g.simbadge').remove();
      node.attr('opacity', 1);
      node.select('rect.body').attr('stroke', (d) => (d.data.id === selected ? '#D4A04A' : 'rgba(232,241,255,.28)')).attr('stroke-width', (d) => (d.data.id === selected ? 3 : 1));
      edge.attr('opacity', 1).attr('stroke', '#7d8ea8').attr('stroke-opacity', 0.5).attr('stroke-width', 1.4);
      pct.attr('opacity', 1);
      node.select<StructureHierarchyNode<SimulatorTreeDatum>>('text.val').text((d) => simulatorValueText(options, d.data.id));
      node.select<StructureHierarchyNode<SimulatorTreeDatum>>('text.px').text((d) => {
        const price = options.priceOf(d.data.id);
        return price == null ? '' : `px ${formatPrice(price)}`;
      });
    },
    showCascade(result: CascadeResult, isolate: boolean): void {
      const booked = new Set(result.bookings.map((b) => `${b.child}|${b.parent}`));
      const live = (d: SimulatorEdgeDatum): boolean =>
        d.prod ? fixture.apex.includes(d.from) && Math.abs(result.valueDelta[d.from] ?? 0) > 1 : booked.has(`${d.from}|${d.to}`);
      node.attr('opacity', (d) => (!isolate || result.affected.has(d.data.id) || d.data.id === fixture.productNodeId ? 1 : 0.22));
      edge.attr('opacity', (d) => (!isolate || live(d) ? 1 : 0.12));
      pct.attr('opacity', (d) => (!isolate || live(d) ? 1 : 0.12));
      setAfter(result.shocked, result.valueBefore, result.valueAfter, result.valueAfter - result.valueBefore, result.priceAfter);
      for (const code of result.affected) {
        if (code === result.shocked) continue;
        const before = options.valueOf(code);
        const delta = result.valueDelta[code] ?? 0;
        setAfter(code, before, before == null ? null : before + delta, delta, null);
      }
      for (const booking of result.bookings) {
        edge
          .filter((d) => d.from === booking.child && d.to === booking.parent)
          .attr('stroke', booking.pnl >= 0 ? SIMULATOR_GAIN : SIMULATOR_LOSS)
          .attr('stroke-opacity', 1)
          .attr('stroke-width', 3);
      }
      setAfter(fixture.productNodeId, fixture.productNAV, fixture.productNAV + result.productValueDelta, result.productValueDelta, null);
    },
    markRepriced: (id, before, after, pnl, price) => setAfter(id, before, after, pnl, price),
    lightEdges(edges, pnlOf): void {
      for (const e of edges) {
        const pnl = pnlOf(e.from);
        edge.filter((d) => d.from === e.from && d.to === e.to).attr('stroke', pnl >= 0 ? SIMULATOR_GAIN : SIMULATOR_LOSS).attr('stroke-opacity', 1).attr('stroke-width', 3);
        pct.filter((d) => d.from === e.from && d.to === e.to).attr('opacity', 1);
      }
    },
    armNext(ids): void {
      node.filter((d) => ids.includes(d.data.id)).select('rect.body').attr('stroke', '#D4A04A').attr('stroke-width', 3);
    },
    finishProduct(before, after, pnl): void {
      setAfter(fixture.productNodeId, before, after, pnl, null);
      const at = pos.get(fixture.productNodeId);
      if (!at) return;
      const label = '✓ reconciled · no pricing break';
      const w = Math.round(label.length * 6.7 + 22);
      const badge = stage.append('g').attr('class', 'simbadge').attr('transform', `translate(${at.x},${at.y + 54})`);
      badge.append('rect').attr('x', -w / 2).attr('y', -11).attr('width', w).attr('height', 22).attr('rx', 11).attr('fill', '#0f3d2e').attr('stroke', SIMULATOR_GAIN);
      badge.append('text').attr('text-anchor', 'middle').attr('dy', '0.34em').attr('fill', '#7ff0c4').attr('font-size', 10).attr('font-weight', 800).text(label);
    },
  };
  scene.fit();
  scene.paintBase(null);
  return scene;
}
