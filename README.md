# DNS Latency Tracker

[![Node.js](https://img.shields.io/badge/Node.js-16.4+-green.svg)](https://nodejs.org/)
[![dotenv](https://img.shields.io/badge/config-dotenv-yellow.svg)](https://github.com/motdotla/dotenv)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

If you run your own DNS server (AdGuard, Pi-hole, Unbound, etc.), you probably wonder whether it's actually faster than just using Cloudflare or Google. This tool answers that question — it fires parallel DNS lookups at your custom server and a public resolver simultaneously, and shows you live latency stats so you can see exactly how they compare.

- Live min / avg / p95 / max latency per server
- **Cache warmup** — both resolvers are pre-warmed before recording starts, so cold-cache queries don't skew results
- **Blocked domain detection** — NXDOMAIN responses from your custom DNS are counted separately as `Blocked`, not as errors, so ad-blocking doesn't make your server look worse than it is
- **Verdict on exit** — when you stop the run, prints a clear winner with the avg latency difference and % improvement
- Round-robin across 30 real-world domains
- Timestamped CSV output for offline analysis

## Quick Start

```bash
npm install
cp .env.example .env   # edit CUSTOM_DNS to your AdGuard IP
node dns-tracker.js
```

Press `Ctrl+C` to stop. Final stats, verdict, and CSV are all flushed on exit.

## Configuration

Set values in your `.env` file (copy from `.env.example`):

| Key | Default | Description |
|---|---|---|
| `CUSTOM_DNS` | `192.168.0.5` | Your AdGuard server IP |
| `CLOUDFLARE` | `1.1.1.1` | Public resolver to compare against |
| `RPS` | `25` | Queries per second per server |
| `STATS_EVERY` | `5000` | ms between live stat prints |
| `TIMEOUT` | `5000` | DNS query timeout in ms |

## Output

Both resolvers are warmed up silently before recording starts:

```
  Warming up cache (60 queries per server)... done
```

Live stats print to the terminal every 5 seconds:

```
Stats after 10s
┌──────────────┬────────┬─────────┬───────┬───────────┬───────────┬───────────┬───────────┐
│       Server │     OK │ Blocked │   Err │       Min │       Avg │       p95 │       Max │
├──────────────┼────────┼─────────┼───────┼───────────┼───────────┼───────────┼───────────┤
│      AdGuard │    241 │       9 │     0 │     1.2ms │     3.4ms │     8.1ms │    22.3ms │
│   Cloudflare │    250 │       0 │     0 │     8.5ms │    12.1ms │    18.4ms │    35.6ms │
└──────────────┴────────┴─────────┴───────┴───────────┴───────────┴───────────┴───────────┘
```

On exit, a verdict is printed:

```
Verdict
  AdGuard is faster by 8.7ms avg (71.9% improvement over Cloudflare)
```

A CSV file named `dns_latency_<timestamp>.csv` is written to the current directory:

```
timestamp,server,domain,latency_ms,status
2026-03-15T15:12:28.000Z,192.168.0.5,google.com,2.31,ok
2026-03-15T15:12:28.001Z,192.168.0.5,doubleclick.net,1.10,nxdomain
```

## Prerequisites

- Node.js >= 16.4
- `npm install` (installs dotenv)

## License

MIT License - see [LICENSE](LICENSE) for details.
