# Trove — context for a Claude Code session

A visual reference library. Instagram saves and uploads come in, the AI files
them, boards turn into client directions, and the Concept Studio generates
imagery in a board's own visual language.

## Where the project stands

Built and pushed; never yet run against real Cloudflare or with images present.

**Verified working**
- Instagram export parsing — against a real 2,334-save export (`src/lib/instagram-export.ts`).
  Recovered 2,211 saves across 10 collections; 100% carry the account handle,
  99% the caption, 64% hashtags.
- Import, library, search (FTS5), collections, record pages — all exercised
  against a live local D1 with the real data in it.
- Gemini calls — model ids, enrichment, identification with Google Search
  grounding, and image generation all tested against the live API with a real key.

**Not yet proven**
- Instagram image recovery (oEmbed and the embed-page fallback). Written and
  wired, but the environment it was built in blocked every Meta host, so the
  fetches themselves have never run. This is the next thing to test.
- Workers AI embeddings and Vectorize — need a real Cloudflare account.
- Deployment.

## Design rules

White ground, black text, monospace (Space Mono) with Archivo for display.
No border radius, no shadows, hairline rules only. Bracketed labels instead of
chips and pills. Every image is captioned with its filename. Colour comes from
the imagery; the only accent is a red status ticker on screens where work is
happening. Tokens live in `src/app/globals.css`.

## Things worth knowing

- The Instagram export contains **no images at all** — Instagram only includes
  your own media, and saved posts are other people's. Pictures must be fetched
  after import. This was verified, not assumed.
- Captions in the export are rich and often name the studio, city and
  collaborators, so identification's caption-first layer is stronger than
  expected.
- Vectorize takes one vector size per index, so the single index serves CLIP
  image similarity; vibe search falls back to FTS until a second index exists.
- Colour is extracted in the browser at upload time, so palettes cost nothing.

## Commands

```
npm run dev
npm run db:local
node scripts/backfill-images.mjs
npm run typecheck
```
