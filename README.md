# DNS Latency Tracker

[![Node.js](https://img.shields.io/badge/Node.js-16.4+-green.svg)](https://nodejs.org/)
[![dotenv](https://img.shields.io/badge/config-dotenv-yellow.svg)](https://github.com/motdotla/dotenv)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

If you run your own DNS server (AdGuard, Pi-hole, Unbound, etc.), you probably wonder whether it's actually faster than just using Cloudflare or Google. This tool answers that question — it fires parallel DNS lookups at your custom server and a public resolver simultaneously, and shows you live latency stats so you can see exactly how they compare.

Fires parallel A-record lookups at both servers, prints live stats every 5 seconds, and saves every result to a timestamped CSV.

- Live min / avg / p95 / max latency per server
- Error classification: `ok`, `nxdomain`, `error`
- Round-robin across 30 real-world domains
- Timestamped CSV output for offline analysis
- Zero dependencies — uses only Node.js built-ins

## Quick Start

```bash
npm install
cp .env.example .env   # edit CUSTOM_DNS to your AdGuard IP
node dns-tracker.js
```

Press `Ctrl+C` to stop. Final stats are printed and the CSV is flushed on exit.

## Configuration

Set values in your `.env` file (copy from `.env.example`):

| Key | Default | Description |
|---|---|---|
| `CUSTOM_DNS` | `10.0.1.15` | Your AdGuard server IP |
| `CLOUDFLARE` | `1.1.1.1` | Cloudflare resolver |
| `RPS` | `25` | Queries per second per server |
| `STATS_EVERY` | `5000` | ms between live stat prints |
| `TIMEOUT` | `5000` | DNS query timeout in ms |

## Output

Live stats print to the terminal on the configured interval:

```
Stats after 10s
┌──────────────┬────────┬───────┬───────────┬───────────┬───────────┬───────────┐
│       Server │     OK │   Err │       Min │       Avg │       p95 │       Max │
├──────────────┼────────┼───────┼───────────┼───────────┼───────────┼───────────┤
│      AdGuard │    250 │     0 │     1.2ms │     3.4ms │     8.1ms │    22.3ms │
│   Cloudflare │    250 │     0 │     8.5ms │    12.1ms │    18.4ms │    35.6ms │
└──────────────┴────────┴───────┴───────────┴───────────┴───────────┴───────────┘
```

A CSV file named `dns_latency_<timestamp>.csv` is written to the current directory:

```
timestamp,server,domain,latency_ms,status
2026-03-15T15:12:28.000Z,10.0.1.15,google.com,2.31,ok
```

## Prerequisites

- Node.js >= 16.4
- `npm install` (installs dotenv)

## License

MIT License - see [LICENSE](LICENSE) for details.
