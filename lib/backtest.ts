// Token Radar backtest: leave-one-out over the snapshot's own live-token protocols.
//
// For each live-token protocol, calibrate the model on every OTHER live protocol,
// predict its market cap as if it were pre-token, and compare with its real market
// cap. Score = median absolute log error. A model change ships only if it lowers
// this error: every constant the model asserts is measured here instead.
//
// Run with Node only, no network:
//   node lib/backtest.ts --input ../token-radar-01-kit/input/snapshot.json

import { readFileSync } from 'node:fs';
import {
  calibrate,
  impliedValue,
  isPreToken,
  isVersionedPool,
  MODEL,
  parseSnapshot,
  type ModelConstants,
  type Snapshot,
} from './model.ts';

function flag(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const joined = process.argv.find((a) => a.startsWith(`--${name}=`));
  return joined === undefined ? fallback : joined.slice(name.length + 3);
}

const snapshot: Snapshot = parseSnapshot(readFileSync(flag('input', '/input/snapshot.json'), 'utf8'));

/** The live tokens the model can be tested against: a market cap on record and TVL above zero. */
const live = snapshot.protocols.filter(
  (p) => !isPreToken(p) && p.tvl_usd > 0 && (p.mcap_usd ?? 0) > 0 && p.category !== 'CEX' && !isVersionedPool(p.name),
);
const liveNonCex = live.filter((p) => p.category !== 'CEX');

/** radar-2 exactly: the new radar-3 switches forced off, so the baseline is v1's model. */
const BASELINE: ModelConstants = {
  ...MODEL,
  growth_damp_above: 60,
  growth_damp_power: 1,
  chain_mode: 'linear',
  size_decay_strength: 0,
};

interface Variant {
  name: string;
  model: ModelConstants;
}

const VARIANTS: Variant[] = [
  { name: 'baseline (radar-2)', model: BASELINE },
  { name: 'prior 4', model: { ...BASELINE, prior_strength: 4 } },
  { name: 'prior 12', model: { ...BASELINE, prior_strength: 12 } },
  { name: 'chain log', model: { ...BASELINE, chain_mode: 'log', chain_log_k: 0.05 } },
  { name: 'growth sqrt>20%', model: { ...BASELINE, growth_damp_above: 20, growth_damp_power: 0.5 } },
  { name: 'growth pow0.75>20%', model: { ...BASELINE, growth_damp_above: 20, growth_damp_power: 0.75 } },
  { name: 'size decay 0.5', model: { ...BASELINE, size_decay_strength: 0.5 } },
  { name: 'size decay 1.0', model: { ...BASELINE, size_decay_strength: 1 } },
  { name: 'size decay 1.5', model: { ...BASELINE, size_decay_strength: 1.5 } },
  { name: 'prior 16', model: { ...BASELINE, prior_strength: 16 } },
  { name: 'prior 20', model: { ...BASELINE, prior_strength: 20 } },
  { name: 'size 1.0 + prior 12', model: { ...BASELINE, size_decay_strength: 1, prior_strength: 12 } },
  { name: 'size 1.0 + prior 16', model: { ...BASELINE, size_decay_strength: 1, prior_strength: 16 } },
  { name: 'size 1.0 + prior 20', model: { ...BASELINE, size_decay_strength: 1, prior_strength: 20 } },
  { name: 'size 1.5 + prior 16', model: { ...BASELINE, size_decay_strength: 1.5, prior_strength: 16 } },
];

interface Metrics {
  n: number;
  medianAbsLog: number;
  meanAbsLog: number;
  medianBias: number;
  within2x: number;
  medianAbsLogNonCex: number;
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

function runVariant(variant: Variant): Metrics {
  const signed: number[] = [];
  const signedNonCex: number[] = [];
  for (const p of live) {
    const rest: Snapshot = { ...snapshot, protocols: snapshot.protocols.filter((q) => q.slug !== p.slug) };
    const cal = calibrate(rest, variant.model);
    const pred = impliedValue(p, snapshot.as_of, cal, variant.model).implied;
    const actual = p.mcap_usd as number;
    const e = Math.log(pred / actual);
    signed.push(e);
    if (p.category !== 'CEX') signedNonCex.push(e);
  }
  const errors = signed.map((e) => Math.abs(e));
  if (errors.some((e) => !Number.isFinite(e))) {
    throw new Error(`backtest: non-finite error in variant ${variant.name}: the live set still holds a bad market cap`);
  }
  const within2x = errors.filter((e) => e < Math.log(2)).length / errors.length;
  return {
    n: errors.length,
    medianAbsLog: median(errors),
    meanAbsLog: errors.reduce((a, b) => a + b, 0) / errors.length,
    medianBias: median(signed),
    within2x,
    medianAbsLogNonCex: median(signedNonCex.map((e) => Math.abs(e))),
  };
}

const fullCal = calibrate(snapshot, BASELINE);
const spikeCount = live.filter((p) => (p.change_7d ?? 0) > 20).length;
const multiChainCount = live.filter((p) => p.chains.length >= 4).length;
process.stdout.write(
  `backtest: ${live.length} live-token protocols (${liveNonCex.length} non-CEX), snapshot ${snapshot.as_of}\n` +
    `backtest: measured size slope log(mcap/TVL) on log(TVL) = ${fullCal.size_slope.toFixed(4)} (negative means bigger protocols trade cheaper)\n` +
    `backtest: overall median mcap/TVL ${fullCal.overall_median_ratio}, overall median TVL $${Math.round(fullCal.overall_median_tvl).toLocaleString('en-US')}\n` +
    `backtest: ${spikeCount} live protocols have 7d growth above +20% (growth damping only touches these); ${multiChainCount} run on 4+ chains (chain log only touches these)\n\n`,
);

const rows: { name: string; m: Metrics }[] = [];
for (const v of VARIANTS) {
  const m = runVariant(v);
  rows.push({ name: v.name, m });
  process.stdout.write(
    `${v.name.padEnd(22)} median|log| ${m.medianAbsLog.toFixed(4)}  mean|log| ${m.meanAbsLog.toFixed(4)}  bias ${m.medianBias >= 0 ? '+' : ''}${m.medianBias.toFixed(4)}  within-2x ${(m.within2x * 100).toFixed(1)}%  median|log| non-CEX ${m.medianAbsLogNonCex.toFixed(4)}\n`,
  );
}

const base = rows[0]!.m.medianAbsLog;
process.stdout.write('\nvs baseline (median |log| error):\n');
for (const { name, m } of rows) {
  const delta = ((m.medianAbsLog - base) / base) * 100;
  process.stdout.write(`  ${name.padEnd(22)} ${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%\n`);
}

// Paired check: does the stronger prior really help, or is the median just jumpy?
// For each live protocol, the per-protocol |log| error under size 1.0 alone and under
// size 1.0 + prior 20. A real improvement improves most protocols a little; noise
// improves a few a lot and worsens the rest.
function perProtocolErrors(model: ModelConstants): number[] {
  const out: number[] = [];
  for (const p of live) {
    const rest: Snapshot = { ...snapshot, protocols: snapshot.protocols.filter((q) => q.slug !== p.slug) };
    const cal = calibrate(rest, model);
    const pred = impliedValue(p, snapshot.as_of, cal, model).implied;
    out.push(Math.abs(Math.log(pred / (p.mcap_usd as number))));
  }
  return out;
}
const sizeOnly = perProtocolErrors({ ...BASELINE, size_decay_strength: 1 });
const sizePrior20 = perProtocolErrors({ ...BASELINE, size_decay_strength: 1, prior_strength: 20 });
let improved = 0;
let worsened = 0;
const deltas: number[] = [];
for (let i = 0; i < sizeOnly.length; i++) {
  const d = sizePrior20[i]! - sizeOnly[i]!;
  deltas.push(d);
  if (d < -0.01) improved++;
  else if (d > 0.01) worsened++;
}
deltas.sort((a, b) => a - b);
process.stdout.write(
  `\npaired size-1.0 vs size-1.0+prior-20 (per-protocol |log| error): improved ${improved}, worsened ${worsened}, ` +
    `median delta ${deltas[Math.floor(deltas.length / 2)]!.toFixed(4)}, mean delta ${(deltas.reduce((a, b) => a + b, 0) / deltas.length).toFixed(4)} (negative is better)\n`,
);
