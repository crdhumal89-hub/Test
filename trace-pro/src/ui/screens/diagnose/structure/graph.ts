/**
 * Structure lens — the d3 ownership tree, plus the narrow d3 surface both graph lenses share.
 *
 * Ported from `renderStructure` / `strData` / `strMakePills` / `styleFocus` (original lines
 * 1230-1300). Nothing about a rendered figure changes: 46 node circles, 45 link paths, 45
 * ownership pills, ownership % at 2dp, node area proportional to look-through value.
 *
 * WHY THE d3 TYPES LIVE HERE. `@types/d3` is not installed and eslint bans `any` in src/, so the
 * slice of d3 the two lenses actually touch is typed by hand, once, in this file and imported by
 * the Simulator scene. It is deliberately narrow: if a call is not typed here, it is not used.
 *
 * WHY d3 IS LOADED BY A SCRIPT TAG. `vendor/d3.min.js` is the vendored 7.8.5 UMD bundle, copied
 * into `dist/vendor/` by vite.config.ts. Resolving it against `document.baseURI` makes one
 * same-origin request in dev and in the built app, so the app runs offline and no CDN is involved.
 */
import type { LookthroughNode } from '../../../../domain/types.js';

/* ------------------------------------------------------------------ the d3 surface, typed */

export type StructureAttrValue = string | number | boolean | null | undefined;

/** A d3 selection, narrowed to the calls these two lenses make. */
export interface StructureSelection<Datum> {
  selectAll<Next>(selector: string): StructureSelection<Next>;
  select<Next = Datum>(selector: string): StructureSelection<Next>;
  data<Next>(values: Next[], key?: (d: Next) => string): StructureSelection<Next>;
  join(tag: string): StructureSelection<Datum>;
  append(tag: string): StructureSelection<Datum>;
  attr(name: string, value: StructureAttrValue | ((d: Datum, i: number) => StructureAttrValue)): StructureSelection<Datum>;
  style(name: string, value: string | null | ((d: Datum) => string | null)): StructureSelection<Datum>;
  classed(name: string, value: boolean | ((d: Datum) => boolean)): StructureSelection<Datum>;
  text(value: string | ((d: Datum) => string)): StructureSelection<Datum>;
  filter(test: (d: Datum) => boolean): StructureSelection<Datum>;
  each(visit: (this: Element, d: Datum) => void): StructureSelection<Datum>;
  on(type: string, handler: ((event: Event, d: Datum) => void) | null): StructureSelection<Datum>;
  call(fn: unknown, ...args: unknown[]): StructureSelection<Datum>;
  transition(): StructureSelection<Datum>;
  duration(ms: number): StructureSelection<Datum>;
  ease(easing: unknown): StructureSelection<Datum>;
  raise(): StructureSelection<Datum>;
  remove(): StructureSelection<Datum>;
  empty(): boolean;
  node(): Element | null;
  nodes(): Element[];
}

/** A `d3.hierarchy` node. `cx`/`cy`/`px`/`py` are laid on by the callers, as the original does. */
export interface StructureHierarchyNode<Datum> {
  id?: string;
  data: Datum;
  depth: number;
  parent: StructureHierarchyNode<Datum> | null;
  x: number;
  y: number;
  cx: number;
  cy: number;
  px: number;
  py: number;
  descendants(): StructureHierarchyNode<Datum>[];
  links(): { source: StructureHierarchyNode<Datum>; target: StructureHierarchyNode<Datum> }[];
  each(visit: (d: StructureHierarchyNode<Datum>) => void): void;
}

export interface StructureZoomTransform {
  k: number;
  x: number;
  y: number;
  translate(x: number, y: number): StructureZoomTransform;
  scale(k: number): StructureZoomTransform;
}

export interface StructureZoom {
  scaleExtent(extent: [number, number]): StructureZoom;
  on(type: string, handler: ((event: { transform: StructureZoomTransform; sourceEvent?: Event }) => void) | null): StructureZoom;
  transform: unknown;
  scaleBy: unknown;
}

export interface StructureDragBehaviour {
  on(type: string, handler: (this: Element, event: { x: number; y: number; active?: number }, d: never) => void): StructureDragBehaviour;
}

export interface StructureLayout<Datum> {
  (root: StructureHierarchyNode<Datum>): void;
  size(size: [number, number]): StructureLayout<Datum>;
  separation(fn: (a: StructureHierarchyNode<Datum>, b: StructureHierarchyNode<Datum>) => number): StructureLayout<Datum>;
}

export interface StructureStratify<Datum> {
  (values: Datum[]): StructureHierarchyNode<Datum>;
  id(accessor: (d: Datum) => string | number | null): StructureStratify<Datum>;
  parentId(accessor: (d: Datum) => string | number | null): StructureStratify<Datum>;
}

export interface StructureScale {
  (value: number): number;
  domain(domain: [number, number]): StructureScale;
  range(range: [number, number]): StructureScale;
}

export interface StructureLinkShape {
  (link: { source: { x: number; y: number }; target: { x: number; y: number } }): string | null;
  x(accessor: (p: { x: number; y: number }) => number): StructureLinkShape;
  y(accessor: (p: { x: number; y: number }) => number): StructureLinkShape;
}

export interface StructureForce {
  (): void;
  force(name: string, force: unknown): StructureForce;
  on(type: string, handler: () => void): StructureForce;
  stop(): StructureForce;
  tick(count?: number): StructureForce;
  alphaTarget(value: number): StructureForce;
  restart(): StructureForce;
}

/** Only the members used below. Every other d3 export stays out of the type system on purpose. */
export interface StructureD3 {
  select<Datum>(node: Element): StructureSelection<Datum>;
  stratify<Datum>(): StructureStratify<Datum>;
  tree<Datum>(): StructureLayout<Datum>;
  zoom(): StructureZoom;
  zoomIdentity: StructureZoomTransform;
  drag(): StructureDragBehaviour;
  scaleSqrt(): StructureScale;
  linkVertical(): StructureLinkShape;
  max<Datum>(values: Datum[], accessor: (d: Datum) => number): number | undefined;
  easeCubicInOut: unknown;
  forceSimulation<Datum>(nodes: Datum[]): StructureForce;
  forceLink(links: unknown[]): { distance(d: number): unknown; strength(s: number): unknown };
  forceManyBody(): { strength(s: number): unknown };
  forceX(x: number): { strength(s: number): unknown };
  forceY<Datum>(y: (d: Datum) => number): { strength(s: number): unknown };
  forceCollide(): { radius(fn: (d: never) => number): unknown };
}

let structureD3Pending: Promise<StructureD3> | null = null;

function structureGlobalD3(): StructureD3 | undefined {
  return (globalThis as { d3?: StructureD3 }).d3;
}

/** Load the vendored d3 once, from disk, same-origin. Never a CDN. */
export function structureEnsureD3(): Promise<StructureD3> {
  const ready = structureGlobalD3();
  if (ready) return Promise.resolve(ready);
  structureD3Pending ??= new Promise<StructureD3>((resolve, reject) => {
    const href = new URL('vendor/d3.min.js', document.baseURI).href;
    const script = document.createElement('script');
    script.src = href;
    script.addEventListener('load', () => {
      const loaded = structureGlobalD3();
      if (loaded) resolve(loaded);
      else reject(new Error('vendor/d3.min.js loaded but defined no d3'));
    });
    script.addEventListener('error', () => reject(new Error(`could not load ${href}`)));
    document.head.append(script);
  });
  return structureD3Pending;
}

/**
 * The harness sets `prefers-reduced-motion: reduce`, and every animated path in both lenses checks
 * this: transitions are skipped and the final state is written synchronously, so a snapshot can
 * never catch a half-finished figure.
 */
export function structureReducedMotion(): boolean {
  return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

/* ------------------------------------------------------------------ the graph */

export type StructureLayoutName = 'vertical' | 'horizontal' | 'radial' | 'dynamic';

/** One graph node. `value` drives node area; it is the look-through value, so pricing view cannot move it. */
export interface StructureDatum {
  id: number;
  pid: number | null;
  code: string;
  name: string;
  kind: string;
  value: number;
  ownpct: number;
}

export interface StructureGraphSettings {
  layout: StructureLayoutName;
  spacing: number;
  linkLength: number;
  curvature: number;
  labelDensity: number;
  focus: string;
  showPercent: boolean;
}

export interface StructureGraphResult {
  nodeCount: number;
  edgeCount: number;
  fit: () => void;
}

const STRUCTURE_FILL: Record<string, string> = { leaf: '#6E2932', vehicle: '#1F4A4F' };
const STRUCTURE_LABEL_MIN = [999, 17, 9, 0];

/** Was `strData`. Leaves are securities, not entities, so the graph is the 46 entity nodes. */
export function structureGraphData(nodes: readonly LookthroughNode[]): StructureDatum[] {
  const entities = nodes.filter((n) => n.kind !== 'leaf');
  const present = new Set(entities.map((n) => n.id));
  return entities.map((n) => {
    const trail = n.path.split('/').filter(Boolean);
    const raw = trail.length > 1 ? Number(trail[trail.length - 2]) : null;
    return {
      id: n.id,
      pid: raw != null && present.has(raw) ? raw : null,
      code: n.code,
      name: n.name,
      kind: n.kind,
      value: Math.abs(n.derived) || 1,
      ownpct: n.ownpct,
    };
  });
}

/** Was `strPctText`. Identical to the Simulator's per-edge %, so the two lenses tie. */
export function structurePercentText(v: number): string {
  return (v * 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
}

function structureCurve(
  s: { x: number; y: number },
  t: { x: number; y: number },
  mode: 'v' | 'h' | 's',
  curvature: number
): string {
  if (curvature <= 0.02) return `M${s.x},${s.y}L${t.x},${t.y}`;
  const b = 0.15 + curvature * 0.75;
  if (mode === 'v') {
    const my = (s.y + t.y) / 2;
    return `M${s.x},${s.y}C${s.x},${s.y + (my - s.y) * b} ${t.x},${t.y - (t.y - my) * b} ${t.x},${t.y}`;
  }
  if (mode === 'h') {
    const mx = (s.x + t.x) / 2;
    return `M${s.x},${s.y}C${s.x + (mx - s.x) * b},${s.y} ${t.x - (t.x - mx) * b},${t.y} ${t.x},${t.y}`;
  }
  return `M${s.x},${s.y}Q${(s.x + t.x) / 2},${(s.y + t.y) / 2} ${t.x},${t.y}`;
}

/**
 * Render the tree. Default layout is `vertical`; `dynamic` is the original's force layout and is
 * reachable only by explicit choice, because a tick-driven layout is not snapshot-stable.
 */
export function structureRenderGraph(
  d3: StructureD3,
  svgNode: SVGSVGElement,
  data: StructureDatum[],
  settings: StructureGraphSettings,
  onSelect: (code: string) => void
): StructureGraphResult {
  const svg = d3.select<StructureDatum>(svgNode);
  svg.selectAll('*').remove();
  const box = svgNode.parentElement;
  const width = Math.max(600, box?.clientWidth ?? 0);
  const height = Math.max(400, box?.clientHeight ?? 0);
  svg.attr('viewBox', `0 0 ${width} ${height}`);

  const rootG = svg.append('g');
  const zoom = d3
    .zoom()
    .scaleExtent([0.15, 4])
    .on('zoom', (event) => {
      rootG.attr('transform', `translate(${event.transform.x},${event.transform.y}) scale(${event.transform.k})`);
    });
  svg.call(zoom).on('dblclick.zoom', null);

  let root: StructureHierarchyNode<StructureDatum>;
  try {
    root = d3
      .stratify<StructureDatum>()
      .id((d) => String(d.id))
      .parentId((d) => (d.pid == null ? null : String(d.pid)))(data);
  } catch {
    svg.append('text').attr('x', 20).attr('y', 30).attr('fill', '#1A1F2E').text('structure unavailable');
    return { nodeCount: 0, edgeCount: 0, fit: () => undefined };
  }

  const largest = d3.max(data, (d) => d.value) ?? 1;
  const radiusOf = d3.scaleSqrt().domain([0, largest]).range([5, 26]);
  const labelFloor = STRUCTURE_LABEL_MIN[settings.labelDensity] ?? 0;
  const labelled = (d: StructureHierarchyNode<StructureDatum>): boolean =>
    d.data.kind === 'product' || d.data.kind === 'apex' || radiusOf(d.data.value) >= labelFloor;

  const reduced = structureReducedMotion();
  let apply: () => void = () => undefined;
  const frame = (points: [number, number][]): void => {
    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    const bw = Math.max(1, Math.max(...xs) - Math.min(...xs));
    const bh = Math.max(1, Math.max(...ys) - Math.min(...ys));
    const k = Math.min(width / (bw + 90), height / (bh + 90), 2.4);
    const tx = (width - (Math.max(...xs) + Math.min(...xs)) * k) / 2;
    const ty = (height - (Math.max(...ys) + Math.min(...ys)) * k) / 2;
    apply = () => {
      const target = d3.zoomIdentity.translate(tx, ty).scale(k);
      if (reduced) svg.call(zoom.transform, target);
      else svg.transition().duration(420).call(zoom.transform, target);
    };
    apply();
  };

  let mode: 'v' | 'h' | 's' = 'v';
  if (settings.layout === 'dynamic') {
    structureDynamicLayout(d3, root, width, height, settings);
  } else if (settings.layout === 'radial') {
    const radius = (Math.min(width, height) / 2 - 70) * settings.linkLength;
    d3.tree<StructureDatum>()
      .size([2 * Math.PI, radius])
      .separation((a, b) => ((a.parent === b.parent ? 1 : 1.7) / Math.max(1, a.depth)) * settings.spacing)(root);
    root.each((d) => {
      const angle = d.x - Math.PI / 2;
      d.cx = width / 2 + Math.cos(angle) * d.y;
      d.cy = height / 2 + Math.sin(angle) * d.y;
    });
    mode = 's';
  } else {
    const vertical = settings.layout === 'vertical';
    d3.tree<StructureDatum>()
      .size(vertical ? [width - 80, (height - 90) * settings.linkLength] : [height - 80, (width - 160) * settings.linkLength])
      .separation((a, b) => (a.parent === b.parent ? 1 : 1.35) * settings.spacing)(root);
    root.each((d) => {
      d.cx = vertical ? d.x + 40 : d.y + 90;
      d.cy = vertical ? d.y + 45 : d.x + 40;
    });
    mode = vertical ? 'v' : 'h';
  }

  const links = root.links();
  const linkSel = rootG
    .append('g')
    .selectAll<(typeof links)[number]>('path')
    .data(links)
    .join('path')
    .attr('class', 'lnk')
    .attr('data-parity', 'structure.graph.edge_count')
    .attr('fill', 'none')
    .attr('stroke', '#8E6724')
    .attr('stroke-opacity', 0.45)
    .attr('stroke-width', 1.2)
    .attr('d', (l) => structureCurve({ x: l.source.cx, y: l.source.cy }, { x: l.target.cx, y: l.target.cy }, mode, settings.curvature));

  const descendants = root.descendants();
  const nodeSel = rootG
    .append('g')
    .selectAll<StructureHierarchyNode<StructureDatum>>('g')
    .data(descendants)
    .join('g')
    .attr('class', (d) => `strnode k-${d.data.kind}`)
    .attr('data-code', (d) => d.data.code)
    .attr('role', 'button')
    .attr('tabindex', (_d, i) => (i === 0 ? 0 : -1))
    .attr('aria-label', (d) => `${d.data.code} — ${d.data.name}, ${structurePercentText(d.data.ownpct)} of its parent`)
    .attr('transform', (d) => `translate(${d.cx},${d.cy})`);

  nodeSel
    .append('circle')
    .attr('class', 'ncirc')
    .attr('data-parity', 'structure.graph.node_count')
    .attr('r', (d) => radiusOf(d.data.value))
    .attr('stroke', '#F6F2E8')
    .attr('stroke-width', 2.5)
    .attr('fill', (d) => STRUCTURE_FILL[d.data.kind] ?? '#0A1226')
    .append('title')
    .text((d) => `${d.data.code} — ${d.data.name}`);

  nodeSel
    .append('text')
    .attr('class', 'nodelbl')
    .attr('x', (d) => (mode === 'v' ? 0 : radiusOf(d.data.value) + 3))
    .attr('y', (d) => (mode === 'v' ? -radiusOf(d.data.value) - 3 : 3))
    .attr('text-anchor', mode === 'v' ? 'middle' : 'start')
    .attr('font-size', 10)
    .attr('font-weight', 600)
    .attr('fill', '#1A1F2E')
    .attr('display', (d) => (labelled(d) ? null : 'none'))
    .text((d) => d.data.code);

  nodeSel.on('click', (_event, d) => onSelect(d.data.code));
  nodeSel.on('keydown', (event, d) => structureRove(event as KeyboardEvent, nodeSel.nodes(), () => onSelect(d.data.code)));

  const pills = rootG
    .append('g')
    .attr('class', 'strpcts')
    .attr('display', settings.showPercent ? null : 'none')
    .selectAll<(typeof links)[number]>('g')
    .data(links.filter((l) => Number.isFinite(l.target.data.ownpct)))
    .join('g')
    .attr('class', 'strpct')
    .attr('data-parity', 'structure.graph.ownership_pill_count')
    .attr('pointer-events', 'none')
    .attr('transform', (l) => `translate(${(l.source.cx + l.target.cx) / 2},${(l.source.cy + l.target.cy) / 2})`);

  pills.each(function pill(l) {
    const label = structurePercentText(l.target.data.ownpct);
    const w = Math.round(label.length * 6.1 + 12);
    const g = d3.select<unknown>(this);
    g.append('rect')
      .attr('x', -w / 2)
      .attr('y', -8)
      .attr('width', w)
      .attr('height', 16)
      .attr('rx', 8)
      .attr('fill', '#0b1f3a')
      .attr('stroke', '#c9a24a')
      .attr('stroke-width', 1);
    g.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '0.34em')
      .attr('fill', '#f3f7ff')
      .attr('font-size', 10)
      .attr('font-weight', 700)
      .attr('font-family', 'ui-monospace, Menlo, monospace')
      .text(label);
    g.append('title').text(`${label} ownership (held units ÷ units outstanding)`);
  });

  const focus = settings.focus.trim().toUpperCase();
  if (focus) {
    const hit = (d: StructureHierarchyNode<StructureDatum>): boolean =>
      `${d.data.code}${d.data.name}`.toUpperCase().includes(focus);
    nodeSel.attr('opacity', (d) => (hit(d) ? 1 : 0.12));
    linkSel.attr('opacity', 0.08);
  } else {
    nodeSel.attr('opacity', 1);
    linkSel.attr('opacity', 0.5);
  }

  frame(descendants.map((d) => [d.cx, d.cy] as [number, number]));
  return { nodeCount: descendants.length, edgeCount: links.length, fit: () => apply() };
}

/** Roving tabindex over the node set: the graph is reachable and traversable without a mouse. */
function structureRove(event: KeyboardEvent, all: Element[], activate: () => void): void {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    activate();
    return;
  }
  const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
  if (!step) return;
  event.preventDefault();
  const here = all.indexOf(event.currentTarget as Element);
  const next = all[(here + step + all.length) % all.length];
  if (!(next instanceof SVGElement)) return;
  all.forEach((n) => n.setAttribute('tabindex', '-1'));
  next.setAttribute('tabindex', '0');
  next.focus();
}

/**
 * The original's "Dynamic" layout. `d3.forceSimulation` lives here and ONLY here: it is never the
 * default, and under reduced motion it is ticked a fixed number of times and stopped, so even this
 * path settles to a single DOM state rather than animating.
 */
function structureDynamicLayout(
  d3: StructureD3,
  root: StructureHierarchyNode<StructureDatum>,
  width: number,
  height: number,
  settings: StructureGraphSettings
): void {
  const nodes = root.descendants();
  const deepest = Math.max(1, ...nodes.map((n) => n.depth));
  const rowHeight = ((height - 100) / (deepest + 1)) * settings.linkLength;
  const byDepth = new Map<number, StructureHierarchyNode<StructureDatum>[]>();
  for (const n of nodes) {
    const row = byDepth.get(n.depth) ?? [];
    row.push(n);
    byDepth.set(n.depth, row);
  }
  for (const row of byDepth.values()) {
    row.forEach((n, i) => {
      n.cx = (width * (i + 1)) / (row.length + 1);
      n.cy = 50 + n.depth * rowHeight;
      n.x = n.cx;
      n.y = n.cy;
    });
  }
  const sim = d3
    .forceSimulation(nodes)
    .force('charge', d3.forceManyBody().strength(-190 * settings.spacing))
    .force('x', d3.forceX(width / 2).strength(0.035))
    .force('y', d3.forceY<StructureHierarchyNode<StructureDatum>>((n) => 50 + n.depth * rowHeight).strength(0.9));
  sim.stop();
  sim.tick(120);
  for (const n of nodes) {
    n.cx = n.x;
    n.cy = n.y;
  }
}
