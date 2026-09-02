# Trove

A visual reference library that files itself. Drop images in — or bring your
Instagram saves across — and the library writes the tags, pulls the palette out
of the pixels, works out what it is looking at, and groups itself into named
style territories. Boards turn a selection into a client-facing direction; the
Concept Studio turns that direction into generated imagery.

White ground, black text, monospace throughout. Every image is captioned with its
filename, because a reference library is an archive of files.

## Stack

| Concern | Choice |
|---|---|
| App | Next.js 15 (App Router) on Cloudflare Workers via OpenNext |
| Catalogue | D1 (SQLite), with FTS5 for instant keyword search |
| Images | R2, served through `/api/media/*` |
| Similarity | Vectorize, with CLIP image embeddings from Workers AI |
| Vision + generation | Gemini (your own API key, server-side only) |
| Colour | Extracted in the browser at upload time — no API cost |

## Setup

### Run it locally

Nothing needs to exist in Cloudflare for this. Wrangler simulates D1 and R2 on
disk, so a local library works offline.

```bash
npm install
npm run db:local
```

Add your Gemini key (only needed for tagging, identification and concepts):

```bash
cp .dev.vars.example .dev.vars
```

Then, in one terminal:

```bash
npm run dev
```

Open http://localhost:3000/import, choose **Instagram export**, and select your
`saved_posts.json` and `saved_collections.json` together (or the whole ZIP).
Untick *Try to recover thumbnails* — the import finishes far faster, and the
backfill below does a better job of it.

Once the import has finished, in a second terminal:

```bash
node scripts/backfill-images.mjs
```

### Deploy it

R2 has to be switched on once in the Cloudflare dashboard before a bucket can be
created (Cloudflare returns `code: 10042` until you do). Then:

```bash
npx wrangler d1 create trove-db
```

Paste the returned id into `wrangler.jsonc`, then:

```bash
npx wrangler r2 bucket create trove-media
npx wrangler vectorize create trove-refs --dimensions=512 --metric=cosine
npx wrangler vectorize create-metadata-index trove-refs --property-name=ref --type=string
npm run db:remote
npx wrangler secret put GEMINI_API_KEY
npm run deploy
```

**Vectorize dimensions.** The index is created at 512 to match
`@cf/openai/clip-vit-base-patch32`, which powers image similarity. Vibe search
uses a text model at 768 dimensions, so it needs a second index before it can
run on embeddings — until then it falls back to full-text search, which already
covers everything the AI wrote.

## How the AI layer works

**On upload** (`src/lib/enrich.ts`) — one vision call writes subject tags, style
descriptors, mood and any legible text; the image is embedded for similarity; the
words are mirrored into FTS. Colour never reaches the model: the browser
quantises the bitmap before upload and posts the swatches alongside the file.

**Identify** (`src/lib/gemini.ts`) runs in three layers, and is deliberately
separate because it costs a web search: the post caption first (Instagram credits
the architect more often than not), then the model's own knowledge, then Google
Search grounding for anything uncertain. Sources come back as real links and
become the footnotes on the record. Where nothing can be established the field
says "not established" rather than guessing.

**Clustering** (`src/app/api/clusters/route.ts`) groups by shared style
vocabulary rather than running k-means on every request, then has a model name
each group — which is why clusters read as territories rather than "Cluster 3".

**Concepts** (`src/app/api/concept/route.ts`) send the board's actual reference
images to Gemini alongside the brief, so output inherits the board's palette,
light and materials instead of a generic reading of the words.

## Instagram

There is no API for saved posts — not for us, not for anyone. Two legitimate
paths are implemented:

- **Bulk import** of the official "Download your information" export, parsed by
  `src/lib/instagram-export.ts` and verified against a real 2,334-post export.
  The ZIP is unpacked in the browser and never uploaded; loose `saved_posts.json`
  and `saved_collections.json` are accepted too. Collection membership lives in a
  nested `Media` block on each collection, not on the posts, and is reassembled
  on import so your folder names survive.

  The export is richer than it looks: it carries the account handle for ~100% of
  saves, the caption for ~99%, and hashtags for ~64%. That means a save is
  searchable and identifiable from the moment it lands, with no API call at all.

### Where the pictures come from

The export contains **no images at all** — verified against a real 2,334-save
export: every `media` array is empty, and there is not one CDN URL in the file.
Instagram only ever includes your *own* media, and saved posts are other
people's. Pictures therefore have to be fetched from Instagram after import.

Two routes are implemented, tried in order per post (`src/lib/instagram.ts`):

1. **oEmbed** — the documented, tokenless endpoint. ~640px thumbnail, no app
   review needed. Fails on private and deleted posts.
2. **The public embed page** — `instagram.com/p/<code>/embed/captioned/`, parsed
   for the image URL. Often larger than the oEmbed thumbnail, and works when
   oEmbed throttles.

Run the backfill with `node scripts/backfill-images.mjs`. It is resumable and
polite: small batches, a delay with jitter between posts, failures marked
`held_failed` so they can be retried separately with `--retry-failed`. A record
that never resolves keeps its caption, account and collection, and stays
searchable.

CDN URLs are signed and short-lived, so images are downloaded during the same
request and stored in R2 rather than hot-linked.

- **oEmbed recovery** supplies the thumbnail, and only the thumbnail. It is
  best-effort: posts from private or deleted accounts will not resolve and are
  stored with status `held` — still searchable by caption, account and
  collection, rather than silently dropped. Import can be run with thumbnail
  fetching off entirely.

  **Unverified:** oEmbed itself has not been exercised against live Instagram —
  the network in the environment this was built in blocks Meta's hosts. The
  parser, the database writes and search are all verified against real data;
  thumbnail recovery is the one step still to be proven.

## Layout

```
src/
  app/                 pages + API routes
  components/          UI, including the spatial Explore canvas
  lib/
    db.ts              D1 access and the row → Reference mapping
    enrich.ts          the on-upload pipeline
    gemini.ts          vision, identification, narrative, image generation
    vectors.ts         Workers AI embeddings + Vectorize
    palette.ts         median-cut quantisation, colour naming, WCAG contrast
    instagram.ts       oEmbed
migrations/0001_init.sql
```

## Not built yet

- PWA share-target capture, so saving from the Instagram app lands here directly
- Shareable public board pages for clients
- Reverse image search across the open web
- Scheduled re-import when a new Instagram export lands
