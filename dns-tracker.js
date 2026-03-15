#!/usr/bin/env node
// DNS Latency Tracker — AdGuard vs. Cloudflare
// Requires: Node.js >= 16.4

require('dotenv').config();
const dns = require('node:dns/promises');
const fs = require('node:fs');
const { performance } = require('node:perf_hooks');

// ── Config ────────────────────────────────────────────────────────────────────
const rps = Number(process.env.RPS) || 25;
if (rps <= 0) { console.error('RPS must be a positive number'); process.exit(1); }

const CONFIG = {
  CUSTOM_DNS:    process.env.CUSTOM_DNS ?? '192.168.0.5', // ← your AdGuard LXC IP
  CLOUDFLARE:    process.env.CLOUDFLARE ?? '1.1.1.1',
  RPS:           rps,                                      // requests per second per server
  STATS_EVERY:   Number(process.env.STATS_EVERY) || 5000, // ms between live stat prints
  TIMEOUT:       Number(process.env.TIMEOUT)     || 5000, // DNS query timeout in ms
  OUTPUT:        `dns_latency_${new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-')}.csv`,
  WINDOW:        500,  // rolling window size — keeps memory bounded for long runs
  WARMUP_ROUNDS: 2,    // full passes through DOMAINS before recording starts
};
// ─────────────────────────────────────────────────────────────────────────────

const DOMAINS = [
  'google.com',     'youtube.com',    'facebook.com',   'twitter.com',
  'instagram.com',  'reddit.com',     'github.com',     'stackoverflow.com',
  'amazon.com',     'netflix.com',    'wikipedia.org',  'cloudflare.com',
  'apple.com',      'microsoft.com',  'linkedin.com',   'twitch.tv',
  'discord.com',    'spotify.com',    'tiktok.com',     'whatsapp.com',
  'zoom.us',        'dropbox.com',    'slack.com',      'heise.de',
  'spiegel.de',     'bbc.com',        'nytimes.com',    'reuters.com',
  'theguardian.com','medium.com',
];

// ── Helpers ───────────────────────────────────────────────────────────────────
const RESET = '\x1b[0m', BOLD = '\x1b[1m', DIM = '\x1b[2m';
const GREEN = '\x1b[32m', CYAN = '\x1b[36m', YELLOW = '\x1b[33m', RED = '\x1b[31m';

// Creates a DNS resolver pointed at a specific server IP
function createResolver(ip) {
  const r = new dns.Resolver({ timeout: CONFIG.TIMEOUT });
  r.setServers([ip]);
  return r;
}

// Returns the p-th percentile value from a pre-sorted array
function percentile(sorted, p) {
  if (!sorted.length) return 0;
  return sorted[Math.max(0, Math.ceil(sorted.length * p / 100) - 1)];
}

// Extracts stats from a rolling window of results for one server
function computeStats(results) {
  const ok      = results.filter(r => r.ok).map(r => r.ms);
  const blocked = results.filter(r => r.blocked).length;
  const errors  = results.filter(r => !r.ok && !r.blocked).length;
  if (!ok.length) return null;
  const sorted = [...ok].sort((a, b) => a - b);
  const avg    = ok.reduce((a, b) => a + b, 0) / ok.length;
  return { ok: ok.length, blocked, errors, min: sorted[0], avg, p95: percentile(sorted, 95), max: sorted.at(-1) };
}

function printStats(store, elapsed) {
  const fmtMs = v => `${v.toFixed(1)}ms`;
  const cols  = { server: 12, ok: 6, blocked: 7, err: 5, min: 9, avg: 9, p95: 9, max: 9 };
  const hr    = (l, m, r) => l + Object.values(cols).map(w => '─'.repeat(w + 2)).join(m) + r;
  const cell  = (v, w) => ` ${String(v).padStart(w)} `;

  console.log(`\n${BOLD}Stats after ${(elapsed / 1000).toFixed(0)}s${RESET}`);
  console.log(hr('┌', '┬', '┐'));
  console.log(
    '│' + cell('Server',  cols.server)  +
    '│' + cell('OK',      cols.ok)      +
    '│' + cell('Blocked', cols.blocked) +
    '│' + cell('Err',     cols.err)     +
    '│' + cell('Min',     cols.min)     +
    '│' + cell('Avg',     cols.avg)     +
    '│' + cell('p95',     cols.p95)     +
    '│' + cell('Max',     cols.max)     + '│'
  );
  console.log(hr('├', '┼', '┤'));

  for (const [ip, { label, color }] of Object.entries(SERVERS)) {
    const s = computeStats(store[ip]);
    if (!s) {
      console.log('│' + ` ${color}${BOLD}${label.padEnd(cols.server)}${RESET}` + ' │' + ' (no results yet)');
      continue;
    }
    console.log(
      '│' + ` ${color}${BOLD}${label.padEnd(cols.server)}${RESET} ` +
      '│' + cell(s.ok,            cols.ok)      +
      '│' + cell(s.blocked,       cols.blocked)  +
      '│' + cell(s.errors,        cols.err)      +
      '│' + cell(fmtMs(s.min),    cols.min)      +
      '│' + cell(fmtMs(s.avg),    cols.avg)      +
      '│' + cell(fmtMs(s.p95),    cols.p95)      +
      '│' + cell(fmtMs(s.max),    cols.max)      + '│'
    );
  }
  console.log(hr('└', '┴', '┘'));
}

// Prints a winner summary comparing the two servers by average latency
function printVerdict(store) {
  const [ipA, ipB] = Object.keys(SERVERS);
  const sA = computeStats(store[ipA]);
  const sB = computeStats(store[ipB]);
  if (!sA || !sB) return;

  const labelA = SERVERS[ipA].label, colorA = SERVERS[ipA].color;
  const labelB = SERVERS[ipB].label, colorB = SERVERS[ipB].color;
  const diff   = sB.avg - sA.avg;
  const pct    = Math.abs(diff / sB.avg * 100).toFixed(1);

  console.log(`\n${BOLD}Verdict${RESET}`);
  if (Math.abs(diff) < 0.5) {
    console.log(`  ${YELLOW}Too close to call${RESET} — avg latency within 0.5ms`);
  } else if (diff > 0) {
    console.log(`  ${colorA}${BOLD}${labelA}${RESET} is faster by ${BOLD}${Math.abs(diff).toFixed(1)}ms avg${RESET} (${pct}% improvement over ${colorB}${labelB}${RESET})`);
  } else {
    console.log(`  ${colorB}${BOLD}${labelB}${RESET} is faster by ${BOLD}${Math.abs(diff).toFixed(1)}ms avg${RESET} (${pct}% improvement over ${colorA}${labelA}${RESET})`);
  }
}

// ── Setup ─────────────────────────────────────────────────────────────────────
let SERVERS;
try {
  SERVERS = {
    [CONFIG.CUSTOM_DNS]: { label: 'AdGuard',    color: CYAN,  resolver: createResolver(CONFIG.CUSTOM_DNS) },
    [CONFIG.CLOUDFLARE]: { label: 'Cloudflare', color: GREEN, resolver: createResolver(CONFIG.CLOUDFLARE) },
  };
} catch (err) {
  console.error(`Invalid DNS server IP: ${err.message}`);
  process.exit(1);
}

if (CONFIG.CUSTOM_DNS === CONFIG.CLOUDFLARE) {
  console.error('CUSTOM_DNS and CLOUDFLARE must be different IPs');
  process.exit(1);
}

const store = { [CONFIG.CUSTOM_DNS]: [], [CONFIG.CLOUDFLARE]: [] }; // rolling window per server
const csv   = fs.createWriteStream(CONFIG.OUTPUT); // stream stays open for the run's duration
csv.write('timestamp,server,domain,latency_ms,status\n'); // CSV header

// ── Query ─────────────────────────────────────────────────────────────────────
// record=false during warmup — queries run but results are not stored
async function query(ip, domain, record = true) {
  const { resolver } = SERVERS[ip];
  const t0 = performance.now(); // start high-res timer before the query
  let status = 'ok';

  try {
    await resolver.resolve4(domain); // A-record lookup; result is discarded — we only care about latency
  } catch (err) {
    // distinguish "domain doesn't exist" from a real resolver error
    status = err.code === 'ENOTFOUND' ? 'nxdomain' : 'error';
  }

  if (!record) return; // warmup query — don't store or write

  const ms      = performance.now() - t0; // wall-clock latency in milliseconds
  const blocked = status === 'nxdomain';  // NXDOMAIN from custom DNS = blocked domain (ad/tracker)
  const ok      = status === 'ok';

  // keep the rolling window bounded
  if (store[ip].length >= CONFIG.WINDOW) store[ip].shift();
  store[ip].push({ ms, ok, blocked });

  csv.write(`${new Date().toISOString()},${ip},${domain},${ms.toFixed(2)},${status}\n`); // append row to CSV
}

// ── Warmup ────────────────────────────────────────────────────────────────────
// Fire CONFIG.WARMUP_ROUNDS full passes through DOMAINS at both servers so that
// both resolvers have a warm cache before any results are recorded.
async function warmup() {
  const total = DOMAINS.length * CONFIG.WARMUP_ROUNDS;
  process.stdout.write(`  Warming up cache (${total} queries per server)...`);
  for (let round = 0; round < CONFIG.WARMUP_ROUNDS; round++) {
    for (const domain of DOMAINS) {
      await Promise.all([
        query(CONFIG.CUSTOM_DNS, domain, false),
        query(CONFIG.CLOUDFLARE,  domain, false),
      ]);
    }
  }
  process.stdout.write(` ${GREEN}done${RESET}\n\n`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
console.log(`\n${BOLD}DNS Latency Tracker${RESET}`);
console.log(`  AdGuard    ${CYAN}${CONFIG.CUSTOM_DNS}${RESET}`);
console.log(`  Cloudflare ${GREEN}${CONFIG.CLOUDFLARE}${RESET}`);
console.log(`  Rate       ${CONFIG.RPS} req/s per server  →  ${CONFIG.RPS * 2} total`);
console.log(`  Window     last ${CONFIG.WINDOW} results per server`);
console.log(`  Output     ${CONFIG.OUTPUT}`);
console.log(`  Press ${BOLD}Ctrl+C${RESET} to stop\n`);

warmup().then(() => {
  let domainIdx = 0;
  const startTime = Date.now();
  let lastStats   = startTime;

  // fire both servers in parallel on each tick; interval derived from target RPS
  const ticker = setInterval(() => {
    const domain = DOMAINS[domainIdx++ % DOMAINS.length]; // cycle through domains round-robin
    query(CONFIG.CUSTOM_DNS, domain); // fire both queries without awaiting — intentionally parallel
    query(CONFIG.CLOUDFLARE,  domain);

    const now = Date.now();
    if (now - lastStats >= CONFIG.STATS_EVERY) { // print live stats on the configured interval
      printStats(store, now - startTime);
      lastStats = now;
    }
  }, 1000 / CONFIG.RPS);

  // graceful shutdown on Ctrl+C or kill — print final stats, verdict, and flush CSV
  function shutdown() {
    clearInterval(ticker);
    printStats(store, Date.now() - startTime);
    printVerdict(store);
    csv.end(() => { // wait for the write stream to flush before exiting
      console.log(`\n${GREEN}Results saved → ${CONFIG.OUTPUT}${RESET}\n`);
      process.exit(0);
    });
  }

  process.on('SIGINT',  shutdown);
  process.on('SIGTERM', shutdown); // handle kill / docker stop / systemd stop
});
