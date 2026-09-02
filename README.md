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

```bash
npm install

# 1. Create the Cloudflare resources
npx wrangler d1 create trove-db          # paste the id into wrangler.jsonc
npx wrangler r2 bucket create trove-media
npx wrangler vectorize create trove-refs --dimensions=512 --metric=cosine
npx wrangler vectorize create-metadata-index trove-refs --property-name=ref --type=string

# 2. Apply the schema
npm run db:local      # local dev
npm run db:remote     # production

# 3. Add your Gemini key
cp .dev.vars.example .dev.vars            # local
npx wrangler secret put GEMINI_API_KEY    # production

npm run dev
```

Deploy with `npm run deploy`.

**Vectorize dimensions.** The index is created at 512 to match
`@cf/openai/clip-vit-base-patch32`, which powers image similarity. Vibe search
uses a text model at 768 dimensions, so it needs a second index before it can
run on embeddings — until then it falls back to full-text search, which already
covers everything the AI wrote. Image similarity is the feature the product
leans on, so it takes the single index.

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
