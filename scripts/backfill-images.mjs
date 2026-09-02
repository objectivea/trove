#!/usr/bin/env node
/**
 * Walks the library recovering pictures for saves imported as records.
 *
 * Run it against a local dev server or a deployed worker. It is resumable:
 * stop it whenever, run it again, and it picks up where it left off.
 *
 *   node scripts/backfill-images.mjs
 *   node scripts/backfill-images.mjs --base https://trove.you.workers.dev --delay 1200
 *   node scripts/backfill-images.mjs --retry-failed
 */

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};

const base = arg("base", "http://localhost:3000").replace(/\/$/, "");
const delay = Number(arg("delay", 900));
const batch = Number(arg("batch", 10));
const retryFailed = process.argv.includes("--retry-failed");

const started = Date.now();
let recovered = 0, failed = 0, passes = 0;

console.log(`Trove image backfill\n  target ${base}\n  ${batch} per pass, ${delay}ms between posts${retryFailed ? ", retrying past failures" : ""}\n`);

while (true) {
  let data;
  try {
    const res = await fetch(`${base}/api/instagram/backfill`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ limit: batch, delayMs: delay, retryFailed }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`);
    data = await res.json();
  } catch (e) {
    console.error(`\n  request failed: ${e.message}\n  waiting 30s before retrying…`);
    await new Promise((r) => setTimeout(r, 30_000));
    continue;
  }

  passes++;
  recovered += data.recovered;
  failed += data.failed;

  const mins = ((Date.now() - started) / 60000).toFixed(1);
  console.log(
    `  pass ${String(passes).padStart(3)} · +${data.recovered} recovered · ${data.failed} missed` +
    ` · ${data.withImages} with images · ${data.remaining} to go · ${mins}m`
  );

  if (data.failures?.length && passes % 10 === 1) {
    for (const f of data.failures.slice(0, 2)) console.log(`      ${f.reason} — ${f.url}`);
  }

  if (!data.attempted || data.remaining === 0) {
    console.log(`\nDone. ${recovered} recovered, ${failed} could not be fetched, ${data.withImages} images in the library.`);
    if (data.previouslyFailed) {
      console.log(`${data.previouslyFailed} are marked failed — re-run with --retry-failed to try them again.`);
    }
    break;
  }
}
