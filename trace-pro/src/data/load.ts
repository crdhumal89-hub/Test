/**
 * Fixture loading. The 614 KiB of data lives in `data/` and is fetched at runtime, so no source
 * file carries it and a different product or as-of date is a URL change rather than a rebuild.
 *
 * `universe.json` is 472 KiB — 77% of the payload — and only the Ownership and Data-quality lenses
 * need it, so it loads lazily with a real loading state (rubric R4) rather than being paid for on
 * every visit to the Reconciliation screen.
 */
import type { FixtureBundle, UniverseFixture } from '../domain/types.js';

export interface Manifest {
  default: { product: string; asof: string };
  products: {
    slug: string;
    name: string;
    code: string;
    asOfDates: string[];
    files: Record<string, string>;
  }[];
}

export type CoreFixtures = Omit<FixtureBundle, 'universe'>;

export class FixtureError extends Error {
  constructor(
    message: string,
    readonly url: string,
    override readonly cause?: unknown
  ) {
    super(message);
    this.name = 'FixtureError';
  }
}

/** Where the app looks for data. Relative so the build works from any subdirectory. */
const DATA_ROOT = 'data';

async function getJson<T>(url: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { cache: 'no-store' });
  } catch (cause) {
    throw new FixtureError(`Could not reach ${url}. Check that the data folder shipped with the app.`, url, cause);
  }
  if (!response.ok) {
    throw new FixtureError(`${url} returned ${response.status} ${response.statusText}.`, url);
  }
  try {
    return (await response.json()) as T;
  } catch (cause) {
    throw new FixtureError(`${url} is not valid JSON.`, url, cause);
  }
}

export async function loadManifest(): Promise<Manifest> {
  return getJson<Manifest>(`${DATA_ROOT}/manifest.json`);
}

/** Which product and as-of the URL asks for, falling back to the manifest default. */
export function resolveSelection(
  manifest: Manifest,
  search: string
): { product: string; asof: string; name: string; code: string } {
  const params = new URLSearchParams(search);
  const wantProduct = params.get('product') ?? manifest.default.product;
  const entry =
    manifest.products.find((p) => p.slug === wantProduct) ??
    manifest.products.find((p) => p.slug === manifest.default.product);
  if (!entry) throw new FixtureError('The data manifest lists no products.', `${DATA_ROOT}/manifest.json`);
  const wantAsof = params.get('asof') ?? manifest.default.asof;
  const asof = entry.asOfDates.includes(wantAsof) ? wantAsof : (entry.asOfDates[0] ?? manifest.default.asof);
  return { product: entry.slug, asof, name: entry.name, code: entry.code };
}

function dirFor(product: string, asof: string): string {
  return `${DATA_ROOT}/${product}/${asof}`;
}

/** The four fixtures every screen needs. Fetched together, since nothing renders without them. */
export async function loadCore(product: string, asof: string): Promise<CoreFixtures> {
  const dir = dirFor(product, asof);
  const [lookthrough, repricing, simulator, legacyPricing] = await Promise.all([
    getJson<FixtureBundle['lookthrough']>(`${dir}/lookthrough.json`),
    getJson<FixtureBundle['repricing']>(`${dir}/repricing.json`),
    getJson<FixtureBundle['simulator']>(`${dir}/simulator.json`),
    getJson<FixtureBundle['legacyPricing']>(`${dir}/legacy-pricing.json`),
  ]);
  return { lookthrough, repricing, simulator, legacyPricing };
}

/**
 * The firm-wide ownership universe, loaded on first use and then cached. Two lenses need it; the
 * other five screens never pay for it.
 */
export function createUniverseLoader(
  product: string,
  asof: string
): { get: () => Promise<UniverseFixture>; peek: () => UniverseFixture | null } {
  let cached: UniverseFixture | null = null;
  let inFlight: Promise<UniverseFixture> | null = null;
  return {
    peek: () => cached,
    get: () => {
      if (cached) return Promise.resolve(cached);
      inFlight ??= getJson<UniverseFixture>(`${dirFor(product, asof)}/universe.json`).then((u) => {
        cached = u;
        inFlight = null;
        return u;
      });
      return inFlight;
    },
  };
}
