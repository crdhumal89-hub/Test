/**
 * Structure lens — the d3 ownership tree, plus the narrow d3 surface both graph lenses share.
 *
 * Ported from `renderStructure` / `strMakePills` / `styleFocus` (original 1230-1300). No rendered
 * figure changes: 46 node circles, 45 link paths, 45 ownership pills at 2dp, node area ∝ the
 * look-through value, so the pricing view cannot move the picture.
 *
 * `@types/d3` is not installed and eslint bans `any`, so the slice of d3 these lenses touch is
 * typed by hand, once, here, and imported by the Simulator scene: a call not typed here is a call
 * we do not make. `vendor/d3.min.js` is the vendored 7.8.5 UMD bundle that vite.config.ts copies
 * into `dist/vendor/`; resolving it against `document.baseURI` makes one same-origin request in dev
 * and in the built app, so the app runs offline and no CDN is ever involved.
 */

import { structureRoveNodes } from './controls.js';
import { structureEdgePath, structureLayoutNodes, type StructureEdgeMode } from './layout.js';

/* ------------------------------------------------------------------ the d3 surface, typed */

type StructureAttr = string | number | boolean | null | undefined;

/** A d3 selection, narrowed to the calls these two lenses make. */
export interface StructureSelection<Datum> {
  selectAll<Next>(selector: string): StructureSelection<Next>;
  select<Next = Datum>(selector: string): StructureSelection<Next>;
  data<Next>(values: Next[], key?: (d: Next) => string): StructureSelection<Next>;
  join(tag: string): StructureSelection<Datum>;
  append(tag: string): StructureSelection<Datum>;
  attr(name: string, v: StructureAttr | ((d: Datum, i: number) => StructureAttr)): StructureSelection<Datum>;
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
  on(type: string, handler: (this: Element, event: { x: number; y: number }, d: never) => void): StructureDragBehaviour;
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
  force(name: string, force: unknown): StructureForce;
  stop(): StructureForce;
  tick(count?: number): StructureForce;
}

/** Only the members used by the two lenses. Every other d3 export stays out of the types on purpose. */
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
  forceManyBody(): { strength(s: number): unknown };
  forceX(x: number): { strength(s: number): unknown };
  forceY<Datum>(y: (d: Datum) => number): { strength(s: number): unknown };
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

/** One graph node. `value` drives node area and is the look-through value at current marks. */
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
  /** The shared Diagnose selection. Ringed, never used to fade the rest of the graph. */
  selected: string | null;
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

/** Was `strPctText`. Identical to the Simulator's per-edge %, so the two lenses tie. */
export function structurePercentText(v: number): string {
  return (v * 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
}

/** Render the tree into `svgNode`. Returns the counts the caption states and a re-fit handle. */
export function structureRenderGraph(
  d3: StructureD3,
  svgNode: SVGSVGElement,
  data: StructureDatum[],
  settings: StructureGraphSettings,
  onSelect: (code: string) => void
): StructureGraphResult {
  const svg = d3.select<StructureDatum>(svgNode);
  svg.selectAll('*').remove();
  const width = Math.max(600, svgNode.parentElement?.clientWidth ?? 0);
  const height = Math.max(400, svgNode.parentElement?.clientHeight ?? 0);
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

  const radiusOf = d3.scaleSqrt().domain([0, d3.max(data, (d) => d.value) ?? 1]).range([5, 26]);
  const labelFloor = STRUCTURE_LABEL_MIN[settings.labelDensity] ?? 0;
  const mode: StructureEdgeMode = structureLayoutNodes(d3, root, width, height, settings);
  const links = root.links();
  const descendants = root.descendants();

  const linkSel = rootG
    .append('g')
    .selectAll<(typeof links)[number]>('path')
    .data(links)
    .join('path')
    .attr('class', 'lnk')
    .attr('data-parity', 'structure.graph.edge_count')
    .attr('fill', 'none')
    .attr('stroke', '#8E6724')
    .attr('stroke-width', 1.2)
    .attr('d', (l) => structureEdgePath({ x: l.source.cx, y: l.source.cy }, { x: l.target.cx, y: l.target.cy }, mode, settings.curvature));

  const nodeSel = rootG
    .append('g')
    .selectAll<StructureHierarchyNode<StructureDatum>>('g')
    .data(descendants)
    .join('g')
    .attr('class', (d) => `strnode k-${d.data.kind}`)
    .attr('data-code', (d) => d.data.code)
    .attr('role', 'button')
    .attr('tabindex', (_d, i) => (i === 0 ? 0 : -1))
    .attr('aria-label', (d) => `${d.data.code} — ${d.data.name}, ${structurePercentText(d.data.ownpct)} of its holder`)
    .attr('transform', (d) => `translate(${d.cx},${d.cy})`);

  nodeSel
    .append('circle')
    .attr('class', 'ncirc')
    .attr('data-parity', 'structure.graph.node_count')
    .attr('r', (d) => radiusOf(d.data.value))
    .attr('stroke', (d) => (d.data.code === settings.selected ? '#D4A04A' : '#F6F2E8'))
    .attr('stroke-width', (d) => (d.data.code === settings.selected ? 4 : 2.5))
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
    .attr('display', (d) => (d.data.kind === 'product' || d.data.kind === 'apex' || d.data.code === settings.selected || radiusOf(d.data.value) >= labelFloor ? null : 'none'))
    .text((d) => d.data.code);

  nodeSel.on('click', (_event, d) => onSelect(d.data.code));
  nodeSel.on('keydown', (event, d) => structureRoveNodes(event as KeyboardEvent, nodeSel.nodes(), () => onSelect(d.data.code)));

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
    g.append('rect').attr('x', -w / 2).attr('y', -8).attr('width', w).attr('height', 16).attr('rx', 8).attr('fill', '#0b1f3a').attr('stroke', '#c9a24a');
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
  const hit = (d: StructureHierarchyNode<StructureDatum>): boolean => `${d.data.code}${d.data.name}`.toUpperCase().includes(focus);
  nodeSel.attr('opacity', (d) => (focus ? (hit(d) ? 1 : 0.12) : 1));
  linkSel.attr('stroke-opacity', focus ? 0.08 : 0.45);

  const xs = descendants.map((d) => d.cx);
  const ys = descendants.map((d) => d.cy);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const k = Math.min(width / (Math.max(1, x1 - x0) + 90), height / (Math.max(1, y1 - y0) + 90), 2.4);
  const target = d3.zoomIdentity.translate((width - (x1 + x0) * k) / 2, (height - (y1 + y0) * k) / 2).scale(k);
  const fit = (): void =>
    structureReducedMotion() ? void svg.call(zoom.transform, target) : void svg.transition().duration(420).call(zoom.transform, target);
  fit();
  return { nodeCount: descendants.length, edgeCount: links.length, fit };
}
