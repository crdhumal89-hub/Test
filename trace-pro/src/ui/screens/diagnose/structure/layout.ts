/**
 * Structure lens geometry: where each node sits, and the shape of the link between two of them.
 *
 * Split out of the renderer so that geometry and drawing are separately readable — the original had
 * both interleaved in one 40-line `renderStructure` (lines 1246-1299). Ported from that function's
 * three layout branches plus `bez`.
 *
 * `dynamic` is the original's "Dynamic" layout and the only caller of `d3.forceSimulation` in the
 * whole app. It is never the default and never runs on a snapshot path: the simulation is stopped
 * immediately, ticked a fixed number of times and then read, so even this layout resolves to one
 * deterministic set of coordinates rather than animating toward one.
 */
import type { StructureD3, StructureDatum, StructureGraphSettings, StructureHierarchyNode } from './graph.js';

/** Which curve family the links use — vertical, horizontal, or a straight-ish radial spoke. */
export type StructureEdgeMode = 'v' | 'h' | 's';

/** Was `bez`. Curvature 0 collapses to a straight line, which is what the slider's left end means. */
export function structureEdgePath(
  s: { x: number; y: number },
  t: { x: number; y: number },
  mode: StructureEdgeMode,
  curvature: number
): string {
  if (curvature <= 0.02) return `M${s.x},${s.y}L${t.x},${t.y}`;
  const bend = 0.15 + curvature * 0.75;
  if (mode === 'v') {
    const my = (s.y + t.y) / 2;
    return `M${s.x},${s.y}C${s.x},${s.y + (my - s.y) * bend} ${t.x},${t.y - (t.y - my) * bend} ${t.x},${t.y}`;
  }
  if (mode === 'h') {
    const mx = (s.x + t.x) / 2;
    return `M${s.x},${s.y}C${s.x + (mx - s.x) * bend},${s.y} ${t.x - (t.x - mx) * bend},${t.y} ${t.x},${t.y}`;
  }
  return `M${s.x},${s.y}Q${(s.x + t.x) / 2},${(s.y + t.y) / 2} ${t.x},${t.y}`;
}

/**
 * Lay the tree out in place: every node gains `cx`/`cy`. Returns the edge mode the renderer needs.
 */
export function structureLayoutNodes(
  d3: StructureD3,
  root: StructureHierarchyNode<StructureDatum>,
  width: number,
  height: number,
  settings: StructureGraphSettings
): StructureEdgeMode {
  if (settings.layout === 'radial') return structureRadial(d3, root, width, height, settings);
  if (settings.layout === 'dynamic') return structureDynamic(d3, root, width, height, settings);
  const vertical = settings.layout === 'vertical';
  d3.tree<StructureDatum>()
    .size(vertical ? [width - 80, (height - 90) * settings.linkLength] : [height - 80, (width - 160) * settings.linkLength])
    .separation((a, b) => (a.parent === b.parent ? 1 : 1.35) * settings.spacing)(root);
  root.each((d) => {
    d.cx = vertical ? d.x + 40 : d.y + 90;
    d.cy = vertical ? d.y + 45 : d.x + 40;
  });
  return vertical ? 'v' : 'h';
}

function structureRadial(
  d3: StructureD3,
  root: StructureHierarchyNode<StructureDatum>,
  width: number,
  height: number,
  settings: StructureGraphSettings
): StructureEdgeMode {
  const radius = (Math.min(width, height) / 2 - 70) * settings.linkLength;
  d3.tree<StructureDatum>()
    .size([2 * Math.PI, radius])
    .separation((a, b) => ((a.parent === b.parent ? 1 : 1.7) / Math.max(1, a.depth)) * settings.spacing)(root);
  root.each((d) => {
    const angle = d.x - Math.PI / 2;
    d.cx = width / 2 + Math.cos(angle) * d.y;
    d.cy = height / 2 + Math.sin(angle) * d.y;
  });
  return 's';
}

function structureDynamic(
  d3: StructureD3,
  root: StructureHierarchyNode<StructureDatum>,
  width: number,
  height: number,
  settings: StructureGraphSettings
): StructureEdgeMode {
  const nodes = root.descendants();
  const deepest = Math.max(1, ...nodes.map((n) => n.depth));
  const rowY = (depth: number): number => 50 + depth * (((height - 100) / (deepest + 1)) * settings.linkLength);
  const byDepth = new Map<number, StructureHierarchyNode<StructureDatum>[]>();
  for (const n of nodes) byDepth.set(n.depth, [...(byDepth.get(n.depth) ?? []), n]);
  for (const row of byDepth.values()) {
    row.forEach((n, i) => {
      n.x = (width * (i + 1)) / (row.length + 1);
      n.y = rowY(n.depth);
    });
  }
  d3.forceSimulation(nodes)
    .force('charge', d3.forceManyBody().strength(-190 * settings.spacing))
    .force('x', d3.forceX(width / 2).strength(0.035))
    .force('y', d3.forceY<StructureHierarchyNode<StructureDatum>>((n) => rowY(n.depth)).strength(0.9))
    .stop()
    .tick(120);
  for (const n of nodes) {
    n.cx = n.x;
    n.cy = n.y;
  }
  return 'v';
}
