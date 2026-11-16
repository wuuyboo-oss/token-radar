// radar-2: scoring a snapshot of the protocol universe into a ranked board.
//
// The job, in one sentence: look at every protocol that has real locked value and
// no token yet, and put a defensible dollar figure on what its token would be worth
// if it launched tomorrow. The figure comes from the snapshot alone. Nothing in here
// names a protocol, a chain, or a category in advance; every number the model uses is
// either read straight from the snapshot or calibrated from the snapshot's own
// live-token protocols, so the same code scores a different snapshot differently.
//
// How the figure is built, for one protocol:
//
//   category multiple   the market's own pricing for this kind of protocol. Take the
//                       live-token protocols in the same category, look at each one's
//                       market-cap/TVL ratio, trim the extremes, and take the median.
//                       Then pull that median toward the overall live median with a
//                       prior worth eight protocols, so a category priced by a single
//                       live token borrows the market average instead of letting one
//                       token set the price. Clamp the result to [0.08, 0.60].
//   growth factor       recent momentum. The seven-day TVL change, clipped to
//                       [-40%, +60%], counted at 80% strength, so a hot week lifts the
//                       figure and a cold week drags it, but neither dominates. A
//                       seven-day fall past -20% takes a further 8% haircut: a token
//                       launching into a slide is worth less than the same TVL rising.
//   age factor          where the protocol sits in its token-less life. A bell curve
//                       peaking near 600 days: too young and it has not shown it can
//                       last; far older and the long silence says a launch is not
//                       coming soon. Protocols with no listing date score 0.85.
//   chain factor        reach. Each chain the protocol runs on adds 1.5%, up to twelve
//                       chains: a protocol live in many places has more doors to launch
//                       through than one confined to a single chain.
//
//   implied value = max(1, round(tvl x category multiple x growth x age x chain))
//
// The board itself is the watchlist first -- every slug the snapshot's watchlist
// names, whatever its TVL -- plus the strongest pre-token protocols below the
// watchlist floor, by TVL, up to 160 of them. Live-token protocols never enter the
// ranking: their market cap is a fact, not a model, and the dashboard shows them
// apart. Every board row also carries a six-step farm plan derived from the same
// record (category, chains, TVL, age), so the ranking is not just a list but a
// list with something to do about it. The dashboard re-derives every number from
// the same figures and shows the calibration, so a reader can check the arithmetic
// instead of taking it on trust.

/** One protocol as the sealed snapshot records it: exactly its ten fields. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The sealed snapshot document as a whole. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** Every tunable number in the model, in one place, so a run can say what it used. */
export interface ModelConstants {
  prior_strength: number;
  ratio_cap: number;
  ratio_floor: number;
  multiple_floor: number;
  multiple_cap: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  distress_threshold: number;
  distress_discount: number;
  age_floor: number;
  age_range: number;
  age_peak_days: number;
  age_spread_days: number;
  unknown_age_multiplier: number;
  chain_step: number;
  chain_max: number;
}

export const MODEL: ModelConstants = {
  prior_strength: 8,
  ratio_cap: 1.5,
  ratio_floor: 0.001,
  multiple_floor: 0.08,
  multiple_cap: 0.6,
  growth_weight: 0.8,
  growth_floor: -40,
  growth_cap: 60,
  distress_threshold: -20,
  distress_discount: 0.92,
  age_floor: 0.6,
  age_range: 0.4,
  age_peak_days: 600,
  age_spread_days: 650,
  unknown_age_multiplier: 0.85,
  chain_step: 0.015,
  chain_max: 12,
};

/** The version tag the dashboard prints next to the model name. */
export const MODEL_VERSION = 'radar-2';

/** How many sub-floor pre-token protocols the early radar may add, by TVL. */
export const EARLY_ROWS = 160;

/** How many live-token protocols the dashboard's live view carries, by market cap. */
export const LIVE_ROWS = 24;

/** One farm step: what to do, what it costs, how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One ranked row of board.json. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    category_multiple: number;
    growth_pct: number;
    growth_multiplier: number;
    age_multiplier: number;
    chain_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** A board row trimmed down for data.js; the page rebuilds the farm plan itself. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  category_multiple: number;
  growth_multiplier: number;
  age_multiplier: number;
  chain_multiplier: number;
  watchlist: boolean;
}

/** A protocol that already trades: the market's value, shown apart from the ranking. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** How one category was priced: how many live protocols priced it, and with what. */
export interface CategoryCalibration {
  live_count: number;
  median_ratio: number | null;
  multiple: number;
}

/** The calibration the snapshot's live tokens produce, for the whole market and per category. */
export interface Calibration {
  overall_median_ratio: number;
  live_count: number;
  by_category: Record<string, CategoryCalibration>;
}

/** Everything the dashboard needs to render: board, live set, model, calibration. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  calibration: Calibration;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Thrown when the snapshot file is not the shape this model scores. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** `value` when it is a finite number, `fallback` otherwise. */
function numOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Whole days from `listedAt` to `asOf`, never negative; null when a date is missing or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const end = Date.parse(`${asOf}T00:00:00Z`);
  const start = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(end) || !Number.isFinite(start)) return null;
  return Math.max(0, Math.floor((end - start) / DAY_MS));
}

/** The middle value of numbers already sorted ascending. */
function medianSorted(sorted: number[]): number {
  if (sorted.length === 0) return NaN;
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Four decimal places, for the multiples the board and the page both print. */
const round4dp = (n: number): number => Math.round(n * 1e4) / 1e4;

/**
 * Price the market from its own live tokens. For each category, the median of its live
 * mcap/TVL ratios after trimming the extremes, pulled toward the overall live median
 * by a prior worth `prior_strength` protocols. A thin category therefore leans on the
 * market average instead of trusting a lone outlier; a category with no live protocol
 * at all is left out here and falls back to the overall median when it is scored.
 */
export function calibrate(snapshot: Snapshot, model: ModelConstants = MODEL): Calibration {
  const live = snapshot.protocols.filter((p) => !isPreToken(p) && p.tvl_usd > 0 && p.mcap_usd !== null);
  const ratioOf = (p: SnapshotProtocol): number =>
    Math.min(model.ratio_cap, Math.max(model.ratio_floor, (p.mcap_usd as number) / p.tvl_usd));
  const overall = medianSorted(live.map(ratioOf).sort((a, b) => a - b));
  const perCategory = new Map<string, number[]>();
  for (const p of live) {
    const key = p.category ?? 'Other';
    const ratios = perCategory.get(key) ?? [];
    ratios.push(ratioOf(p));
    perCategory.set(key, ratios);
  }
  const out: Record<string, CategoryCalibration> = {};
  const keys = [...perCategory.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  for (const [key, ratios] of keys) {
    const med = medianSorted([...ratios].sort((a, b) => a - b));
    const shrunk = (ratios.length * med + model.prior_strength * overall) / (ratios.length + model.prior_strength);
    const multiple = Math.min(model.multiple_cap, Math.max(model.multiple_floor, shrunk));
    out[key] = { live_count: ratios.length, median_ratio: round4dp(med), multiple: round4dp(multiple) };
  }
  return { overall_median_ratio: round4dp(overall), live_count: live.length, by_category: out };
}

/** The multiple a category scores at: its calibrated one, or the overall median unpriced. */
export function categoryMultiple(category: string | null, calibration: Calibration, model: ModelConstants = MODEL): number {
  const entry = calibration.by_category[category ?? 'Other'];
  if (entry !== undefined) return entry.multiple;
  return Math.min(model.multiple_cap, Math.max(model.multiple_floor, calibration.overall_median_ratio));
}

/** The momentum factor: clipped seven-day change at partial strength, plus the slide haircut. */
function growthFactor(change7d: number | null, model: ModelConstants): { pct: number; factor: number } {
  const raw = numOr(change7d, 0);
  const pct = Math.min(model.growth_cap, Math.max(model.growth_floor, raw));
  let factor = 1 + (pct / 100) * model.growth_weight;
  if (raw < model.distress_threshold) factor *= model.distress_discount;
  return { pct, factor };
}

/** The age factor: a bell curve peaking near the launch window, or the unknown-age value. */
function ageFactor(age: number | null, model: ModelConstants): number {
  if (age === null) return model.unknown_age_multiplier;
  const z = (age - model.age_peak_days) / model.age_spread_days;
  return model.age_floor + model.age_range * Math.exp(-(z * z));
}

/** The reach factor: a little more for every chain, up to the cap. */
function chainFactor(chainCount: number, model: ModelConstants): number {
  return 1 + model.chain_step * Math.min(chainCount, model.chain_max);
}

/** One protocol's implied value and the four factors that produced it. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  calibration: Calibration,
  model: ModelConstants = MODEL,
): { implied: number; categoryMultiple: number; growthPct: number; growthMult: number; ageMult: number; chainMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const growth = growthFactor(protocol.change_7d, model);
  const ageMult = ageFactor(age, model);
  const chainMult = chainFactor(protocol.chains.length, model);
  const catMult = categoryMultiple(protocol.category, calibration, model);
  const implied = Math.max(1, Math.round(protocol.tvl_usd * catMult * growth.factor * ageMult * chainMult));
  return { implied, categoryMultiple: catMult, growthPct: growth.pct, growthMult: growth.factor, ageMult, chainMult, age };
}

/** A name ending in a version number marks a pool of some other protocol, not a protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** True when the record shows no token anywhere: no market cap, no CoinGecko id, no symbol. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** True when a protocol belongs on the board: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/** The snapshot's protocols keyed by slug, for watchlist lookups. */
function indexBySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The headline counts for the dashboard: watchlist size, board size, early and live counts. */
export interface BoardSummary {
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
}

/** Rank the board: watchlist first, then the strongest sub-floor pre-token protocols, by TVL. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const calibration = calibrate(snapshot, model);
  const index = indexBySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor, not a suggestion: every slug it names is scored, even one
  // the snapshot no longer carries (it cannot be, but coverage is the gate's own row and
  // is never left to chance on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar reaches below the floor for pre-token protocols, strongest TVL first,
  // and never displaces a watchlist row: anything already chosen stays chosen.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, calibration, model);
    return { p, ...v };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      category_multiple: round4dp(s.categoryMultiple),
      growth_pct: s.growthPct,
      growth_multiplier: round4dp(s.growthMult),
      age_multiplier: round4dp(s.ageMult),
      chain_multiplier: round4dp(s.chainMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

/** Render one farm step as a single string: action first, then cost and time, within 20..600 chars. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The protocol's first named chain, or a neutral phrase when it names none. */
function firstChain(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** The capital one farm position asks for, stepped by the protocol's own TVL. */
function stakeFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** The hold length, from age: the younger the protocol, the longer the qualifying window. */
function holdFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The one action for the protocol's category, phrased so a farmer can follow it directly. */
function entryActionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('risk')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** The weekly repeat of the same position: use it again, never a fresh deposit. */
function weeklyAction(p: SnapshotProtocol): string {
  const c = (p.category ?? '').toLowerCase();
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return 'borrow a small amount against the deposit and repay it the same week';
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return 'swap a small amount through the pool or add and remove a little liquidity';
  if (c.includes('bridge')) return 'bridge a small amount back and forth through the protocol';
  if (c.includes('staking') || c.includes('restak')) return 'claim any staking rewards and restake them';
  if (c.includes('perpetual') || c.includes('derivative')) return 'open and close one small hedge';
  if (c.includes('prediction')) return 'place one small market position';
  if (c.includes('curator') || c.includes('allocator') || c.includes('risk')) return 'deposit a small top-up into the vault or move between its vaults';
  if (c.includes('stable')) return 'mint or redeem a small amount of the stable asset';
  if (c.includes('rwa')) return 'claim any yield the asset paid and hold the receipt';
  if (c.includes('insurance')) return 'check the policy and renew or adjust the cover';
  return 'use the position once: a deposit, a swap or a vote inside the app';
}

/**
 * Six steps for farming a protocol, derived from its own record alone (category, chains,
 * TVL, age). No name is hand-listed anywhere in the plan.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = firstChain(p);
  const capital = stakeFor(p);
  const hold = holdFor(age);
  const action = entryActionFor(p, capital, chain);
  const weekly = weeklyAction(p);
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: `Once a week, ${weekly}, so the wallet shows repeated use instead of a single deposit.`,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** The live-token protocols by market cap, for the dashboard's live view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row in its compact dashboard form; the farm plan is rebuilt in the page. */
export function radarRow(row: BoardRow, watchlist: Set<string>): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    category_multiple: row.model.category_multiple,
    growth_multiplier: row.model.growth_multiplier,
    age_multiplier: row.model.age_multiplier,
    chain_multiplier: row.model.chain_multiplier,
    watchlist: watchlist.has(row.slug),
  };
}

/** The whole dashboard dataset, built from the snapshot in one pass. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const calibration = calibrate(snapshot, model);
  const live = liveRows(snapshot);
  const watch = new Set(snapshot.watchlist);
  const early = board.filter((r) => !watch.has(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    calibration,
    rows: board.map((r) => radarRow(r, watch)),
    live,
  };
  return { board, radar };
}

/** Read a snapshot file's text, and refuse it unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null when it passes every check. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** The dashboard's dataset as one script tag's worth of JavaScript: no fetch, no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
