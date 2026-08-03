import fs from 'node:fs';
import path from 'node:path';
import type { FixtureBundle } from '../../src/domain/types.js';

const DATA = path.resolve(import.meta.dirname, '../../data/apollo-sports-capital/2026-06-30');

function read<T>(file: string): T {
  return JSON.parse(fs.readFileSync(path.join(DATA, file), 'utf8')) as T;
}

/** The shipped fixtures, loaded from disk so tests exercise the same bytes the app fetches. */
export function loadFixtures(): FixtureBundle {
  return {
    lookthrough: read('lookthrough.json'),
    universe: read('universe.json'),
    repricing: read('repricing.json'),
    simulator: read('simulator.json'),
    legacyPricing: read('legacy-pricing.json'),
  };
}

/** Figures the original reports, asserted here so a refactor cannot move them silently. */
export const SHIPPED = {
  product: 'Apollo Sports Capital',
  productCode: 'SPORT',
  asof: '2026-06-30',
  /** Σ apex ENDING_NAV. */
  nav: 2062198835.86,
  /** Fund-entity NAV stamp. Differs from `nav` by the DUNK feeder; see spec §1.8.1. */
  fundEntityNav: 2062196050.07,
  derived: 2060224441.400303,
  revised: 2060610338.2903035,
  deltaPricing: 385896.89000058174,
  deltaNonPosition: 1588497.5696964264,
  apex: ['ASCHON', 'DUNK', 'SPORTHLD'],
  dunkNav: 2785.79,
  fundCount: 26,
  treeNodeCount: 149,
  sumAllFundNav: 7407316162.58,
} as const;
