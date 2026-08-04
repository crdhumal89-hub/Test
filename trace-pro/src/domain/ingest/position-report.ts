/**
 * Reading an uploaded Position Report into the two models every screen is drawn from.
 *
 * Two ports, both from the original: `buildMaps` (1048) becomes `positionIndexFromRows`, and
 * `buildModel` (1059) becomes `lookthroughFromPositions`. `domain/repricing.ts` already carried
 * `repriceFromPositions`, which is the other half; between them an uploaded report replaces the
 * look-through hierarchy AND every value derived from it, so the tree, the waterfall, the prices and
 * the walk cannot disagree with each other after an upload. That is the whole reason the tree is
 * rebuilt here rather than left alone: a screen showing the shipped structure above freshly uploaded
 * values would be a lie assembled out of two true halves.
 *
 * Pure: no DOM, no fetch, no library. The caller turns a file into rows; this turns rows into models.
 */
import type { LookthroughFixture, LookthroughNode, NodeKind } from '../types.js';
import type { PositionIndex } from '../lookthrough.js';
import { lookThroughValue, ownershipShare } from '../lookthrough.js';
import { normaliseCell, normaliseHeader, parseFigure } from './cells.js';

/** The columns the report is read through. Each name is matched header-insensitively. */
const POSITION_COLUMNS = {
  entity: ['fundentity'],
  fundCode: ['fundcode'],
  spvCode: ['spvfundcode'],
  securityCode: ['securitycode'],
  securityName: ['security'],
  issuer: ['issuer'],
  quantity: ['quantityvpm', 'quantity'],
  marketValue: ['mvusd', 'mv'],
  entityNav: ['navendusd', 'navend'],
  fundName: ['fund'],
} as const;

type PositionColumnMap = Record<keyof typeof POSITION_COLUMNS, number>;

/** Which column holds which field, by index. -1 when the report does not carry it. */
export function positionColumns(header: readonly string[]): PositionColumnMap {
  const normalised = header.map(normaliseHeader);
  const find = (names: readonly string[]): number =>
    normalised.findIndex((h) => names.some((n) => h === n));
  return {
    entity: find(POSITION_COLUMNS.entity),
    fundCode: find(POSITION_COLUMNS.fundCode),
    spvCode: find(POSITION_COLUMNS.spvCode),
    securityCode: find(POSITION_COLUMNS.securityCode),
    securityName: find(POSITION_COLUMNS.securityName),
    issuer: find(POSITION_COLUMNS.issuer),
    quantity: find(POSITION_COLUMNS.quantity),
    marketValue: find(POSITION_COLUMNS.marketValue),
    entityNav: find(POSITION_COLUMNS.entityNav),
    fundName: find(POSITION_COLUMNS.fundName),
  };
}

/** What a report has to carry before it can be read at all, in plain language — or null. */
export function positionReportProblem(rows: readonly string[][]): string | null {
  const header = rows[0];
  if (!header || rows.length < 2) return 'the file has no rows under its header';
  const columns = positionColumns(header);
  const missing: string[] = [];
  if (columns.fundCode < 0) missing.push('Fund Code');
  if (columns.spvCode < 0) missing.push('SPV Fund Code');
  if (columns.quantity < 0) missing.push('Quantity VPM');
  if (columns.marketValue < 0) missing.push('MV USD');
  if (missing.length) return `it carries no ${missing.join(', no ')} column`;
  return null;
}

function emptyIndex(): PositionIndex {
  return {
    edgeUnits: new Map(),
    globalUnits: new Map(),
    carried: new Map(),
    childrenByHolder: new Map(),
    leavesByFund: new Map(),
    fundName: new Map(),
    navByEntity: new Map(),
    symByInv: new Map(),
    secIndex: new Map(),
    entHolders: new Map(),
    entInvestees: new Map(),
  };
}

/**
 * Index the report. Was `buildMaps`, field for field: a row with an SPV code is an ownership edge,
 * a row without one is a security the fund holds directly, and units outstanding is the sum over
 * every holder — including holders outside this product, which is what makes a direct share honest.
 */
export function positionIndexFromRows(rows: readonly string[][]): PositionIndex {
  const header = rows[0];
  const index = emptyIndex();
  if (!header) return index;
  const c = positionColumns(header);
  const cell = (row: readonly string[], at: number): string => (at < 0 ? '' : normaliseCell(row[at]));

  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    if (!row || row.length === 1) continue;
    const entity = cell(row, c.entity);
    const fund = cell(row, c.fundCode);
    const spv = cell(row, c.spvCode);
    const security = cell(row, c.securityCode);
    const name = cell(row, c.securityName);
    const issuer = cell(row, c.issuer);
    const quantity = parseFigure(c.quantity < 0 ? null : row[c.quantity]) ?? 0;
    const marketValue = parseFigure(c.marketValue < 0 ? null : row[c.marketValue]) ?? 0;
    const entityNav = parseFigure(c.entityNav < 0 ? null : row[c.entityNav]);

    if (fund && !index.fundName.has(fund)) index.fundName.set(fund, cell(row, c.fundName) || fund);
    if (entity) {
      if (!index.navByEntity.has(entity) && entityNav != null) index.navByEntity.set(entity, entityNav);
      const holders = index.entHolders.get(entity) ?? new Set<string>();
      holders.add(fund);
      index.entHolders.set(entity, holders);
      if (spv) {
        const investees = index.entInvestees.get(entity) ?? new Set<string>();
        investees.add(spv);
        index.entInvestees.set(entity, investees);
      }
    }

    if (spv && fund !== spv) {
      const key = `${fund}|${spv}`;
      index.edgeUnits.set(key, (index.edgeUnits.get(key) ?? 0) + quantity);
      index.carried.set(key, (index.carried.get(key) ?? 0) + marketValue);
      index.globalUnits.set(spv, (index.globalUnits.get(spv) ?? 0) + quantity);
      const kids = index.childrenByHolder.get(fund) ?? new Set<string>();
      kids.add(spv);
      index.childrenByHolder.set(fund, kids);
      if (!index.symByInv.has(spv)) index.symByInv.set(spv, security || spv);
      if (!index.fundName.has(spv)) index.fundName.set(spv, name || spv);
    } else if (!spv) {
      const leaves = index.leavesByFund.get(fund) ?? [];
      leaves.push({ sec: security, name, issuer, qty: quantity, mv: marketValue });
      index.leavesByFund.set(fund, leaves);
      const entry = index.secIndex.get(security) ?? { name, issuer, totalQty: 0, holders: [] };
      entry.totalQty += quantity;
      entry.holders.push([fund, quantity]);
      index.secIndex.set(security, entry);
    }
  }
  return index;
}

/** Which fund entities the report describes, and which of them this app should open on. */
export function positionEntities(index: PositionIndex, prefer: string): { entities: string[]; product: string } {
  const entities = [...index.entHolders.keys()].sort();
  const product = entities.includes(prefer) ? prefer : (entities[0] ?? prefer);
  return { entities, product };
}

interface TreeBuilder {
  nodes: LookthroughNode[];
  index: PositionIndex;
  memo: Map<string, number>;
}

function pushNode(build: TreeBuilder, node: Omit<LookthroughNode, 'id' | 'path'>, parentPath: string): LookthroughNode {
  const id = build.nodes.length;
  const full: LookthroughNode = { ...node, id, path: `${parentPath}${id}/` };
  build.nodes.push(full);
  return full;
}

function valueOf(build: TreeBuilder, fund: string): number {
  return lookThroughValue(build.index, fund, build.memo, new Set());
}

/** One holder's children and directly held securities, depth first. Was the inner `walk`. */
function walkHolder(build: TreeBuilder, fund: string, applied: number, level: number, parentPath: string, onPath: ReadonlySet<string>): void {
  for (const investee of [...(build.index.childrenByHolder.get(fund) ?? [])].sort()) {
    const share = ownershipShare(build.index, fund, investee);
    const effective = applied * share;
    const whole = valueOf(build, investee);
    const carried = build.index.carried.get(`${fund}|${investee}`) ?? 0;
    const node = pushNode(
      build,
      {
        level,
        isLeaf: 0,
        kind: 'vehicle',
        holder: fund,
        code: investee,
        name: build.index.fundName.get(investee) ?? investee,
        issuer: '',
        units: build.index.edgeUnits.get(`${fund}|${investee}`) ?? 0,
        ownpct: share,
        applied: effective,
        mv100: whole,
        derived: effective * whole,
        carried,
        position: applied * carried,
        variance: effective * whole - applied * carried,
      },
      parentPath
    );
    if (!onPath.has(investee)) {
      walkHolder(build, investee, effective, level + 1, node.path, new Set([...onPath, investee]));
    }
  }
  for (const leaf of build.index.leavesByFund.get(fund) ?? []) {
    pushNode(
      build,
      {
        level,
        isLeaf: 1,
        kind: 'leaf',
        holder: fund,
        code: leaf.sec,
        name: leaf.name || leaf.sec,
        issuer: leaf.issuer,
        units: leaf.qty,
        ownpct: 1,
        applied,
        mv100: leaf.mv,
        derived: applied * leaf.mv,
        carried: leaf.mv,
        position: applied * leaf.mv,
        variance: 0,
      },
      parentPath
    );
  }
}

/**
 * The look-through hierarchy for one fund entity. Was `buildModel`, minus the `recon` block and the
 * `dcN` stamp, which spec §6 Q2 records as data nothing reads; they are emitted empty rather than
 * invented, so no screen can quietly start depending on a figure this path cannot produce.
 */
export function lookthroughFromPositions(index: PositionIndex, product: string, asof: string): LookthroughFixture {
  const holders = index.entHolders.get(product) ?? new Set<string>();
  const investees = index.entInvestees.get(product) ?? new Set<string>();
  const apex = [...holders].filter((code) => code && !investees.has(code)).sort();
  const build: TreeBuilder = { nodes: [], index, memo: new Map() };

  const root = pushNode(
    build,
    {
      level: 0,
      isLeaf: 0,
      kind: 'product' as NodeKind,
      holder: '',
      code: product,
      name: product,
      issuer: '',
      units: 0,
      ownpct: 1,
      applied: 1,
      mv100: 0,
      derived: 0,
      carried: 0,
      position: 0,
      variance: 0,
    },
    ''
  );

  for (const feeder of apex) {
    const whole = valueOf(build, feeder);
    let carried = 0;
    for (const child of index.childrenByHolder.get(feeder) ?? []) {
      carried += index.carried.get(`${feeder}|${child}`) ?? 0;
    }
    for (const leaf of index.leavesByFund.get(feeder) ?? []) carried += leaf.mv;
    const node = pushNode(
      build,
      {
        level: 1,
        isLeaf: 0,
        kind: 'apex',
        holder: product,
        code: feeder,
        name: index.fundName.get(feeder) ?? feeder,
        issuer: '',
        units: 0,
        ownpct: 1,
        applied: 1,
        mv100: whole,
        derived: whole,
        carried,
        position: carried,
        variance: whole - carried,
      },
      root.path
    );
    walkHolder(build, feeder, 1, 2, node.path, new Set([feeder]));
  }

  const grand = build.nodes.filter((n) => n.isLeaf).reduce((sum, n) => sum + n.derived, 0);
  const apexPosition = build.nodes
    .filter((n) => n.kind === 'apex')
    .reduce((sum, n) => sum + n.position, 0);
  root.mv100 = grand;
  root.derived = grand;
  root.carried = apexPosition;
  root.position = apexPosition;
  root.variance = grand - apexPosition;

  const prodNAV = index.navByEntity.get(product) ?? 0;
  return {
    product,
    asof,
    prodNAV,
    grand,
    resid: grand - prodNAV,
    bps: prodNAV ? ((grand - prodNAV) / prodNAV) * 1e4 : 0,
    dcN: 0,
    apexPos: apexPosition,
    grandVar: grand - apexPosition,
    recon: [],
    nodes: build.nodes,
  };
}
