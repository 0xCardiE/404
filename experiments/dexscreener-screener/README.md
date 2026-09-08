# DexScreener screener

Local TypeScript agent that polls DexScreener every five minutes, keeps tokens under $1M market cap, and checks whether they look worth a human follow-up.

This does **not** prove a token is safe. Paid DexScreener boosts and ads are marketing. The agent only filters obvious junk: dead or redirected sites, broken X accounts, and no liquidity.

## What it checks

1. **Discovery** from the public DexScreener API
   - latest token profiles
   - latest boosts
   - latest ads
2. **Market data** via `/tokens/v1/{chain}/{addresses}`
   - market cap under `$1,000,000` (override with `MAX_MARKET_CAP_USD`)
   - pair age under 21 days (`MAX_PAIR_AGE_DAYS`)
   - liquidity present (`MIN_LIQUIDITY_USD`, default `$10,000`)
3. **Paid promo** via `/orders/v1/{chain}/{token}` plus the discovery feeds
4. **Website**
   - exists
   - not parked / blocked / empty
   - does not redirect to another registrable domain
   - homepage is not a link shortener
5. **Twitter / X**
   - profile or tweet link resolves
   - account exists and is not suspended
   - handle does not bounce to a different account
   - when FixTweet returns a bio, it is stored on the card

Rejected tokens are stored as `not_worthy` and skipped on later scans.

## Categories

| Category | Meaning |
| --- | --- |
| `should_check` | Live site, usable X signal, liquidity, under $1M. Open the card and do real diligence. |
| `watch` | Something useful is there, but a signal is missing or thin. |
| `not_worthy` | Dead site, fake/missing socials, or no liquidity. Do not fetch again. |

## Run locally

```bash
cd experiments/dexscreener-screener
npm install
npm test
npm start
```

`npm start` (same as `npm run watch`) scans immediately, then every five minutes, and serves the desk at [http://localhost:3780](http://localhost:3780).

Useful commands:

```bash
npm run scan                 # one pass, print a JSON summary
npm run scan -- --limit 8    # smaller pass while developing
npm run dashboard            # UI only, no background polling
```

Environment knobs:

| Variable | Default | Role |
| --- | --- | --- |
| `MAX_MARKET_CAP_USD` | `1000000` | Upper market-cap filter |
| `MIN_LIQUIDITY_USD` | `10000` | Liquidity floor for `should_check` |
| `MAX_PAIR_AGE_DAYS` | `21` | Ignore older pairs |
| `SCAN_INTERVAL_MS` | `300000` | Watch-loop interval |
| `PORT` | `3780` | Dashboard port |
| `DATA_DIR` | `./data` | JSON store for projects and scan history |

State lives in `data/projects.json` (gitignored). Override a card from the UI if you want to keep or discard a token by hand.

## API used

[DexScreener API reference](https://docs.dexscreener.com/api/reference)

DexScreener does not publish a dedicated “upcoming launch” feed. This experiment treats newly paid profiles, boosts, and ads as the new-project queue, then keeps those still under $1M.
