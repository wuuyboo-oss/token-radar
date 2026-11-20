# token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/wuuyboo-oss/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/wuuyboo-oss/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar ranks pre-token DeFi protocols by implied value, with a farm plan for each. It reads a sealed DefiLlama snapshot, calibrates a market multiple from the snapshot's own live-token protocols (median mcap/TVL per category, shrunk toward the overall median), then scores every pre-token protocol on TVL, 7-day growth, age in the launch window and chain reach — and writes a static dashboard: the ranked board, a detail view per protocol with its model breakdown and farm plan, and live-token protocols set aside at market value.

Model radar-3 adds a measured size factor: across the snapshot's live tokens, log(mcap/TVL) falls with log(TVL) at a slope of −0.29, so a protocol far above its category's live median TVL scores at a lower multiple, by that slope, clamped to 0.5–1.5. The factor is not asserted — it is backtested. A leave-one-out harness (`lib/backtest.ts`, Node only, no network) calibrates on all other live-token protocols and predicts each one's market cap as if it had no token: median absolute log error 1.59 for the model without the size factor, 1.45 with it (−8.8%). Three other candidates were tested the same way and did not ship: a stronger prior (4/12/16/20: no clear gain over 8), a log-scale chain factor (no gain), and damping growth above +20% (untestable — no live protocol in the snapshot grew that fast in a week). The age bell curve is unchanged: the snapshot carries no token-launch dates for live protocols, so its peak cannot be calibrated from it.

Every farm plan now opens with a verify step — confirm the protocol's own points or rewards page is still live and no token has launched before depositing anything — and every detail view carries a risk line (distress when 7-day TVL is down more than 20%, concentration when the protocol runs on a single chain). The dashboard leads with a #1-pick hero card, an implied-value-by-category bar, and a short risks and caveats note, and the method panel states the backtest result.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

Node 22 or later, standard library only. The program writes `out/board.json`, `out/data.js`, `out/dashboard/`, `out/screenshots/` and `out/dossier.json`.

---

<sub>Entered on [make.fun](https://make.fun/?ref=wkz0m1sg&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
