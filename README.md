# pinewraps-mcp

Remote MCP server that lets Claude (Cowork or any MCP-compatible client) read and update SEO
metadata — meta title, meta description, keywords, and product image alt text — for Pinewraps
**products, collections, and blog posts**. Categories are intentionally out of scope (no SEO
fields exist for them yet). It never touches the database directly; it calls a small set of
API-key-protected endpoints on `pinewraps-api`.

```
Claude Cowork ── OAuth access token ──> pinewraps-mcp (this repo) ── x-api-key ──> pinewraps-api
```

## Auth model

Claude Cowork's connector setup only supports OAuth (it auto-discovers and dynamically
registers a client against the server URL — a static bearer header isn't an option in that
flow). This server implements a minimal single-tenant OAuth 2.1 authorization server
(`src/oauth/`) using the SDK's built-in auth router:

1. Cowork registers itself as an OAuth client (open registration — anyone can register a
   *client*, that's normal for dynamic client registration).
2. Cowork sends you to `/authorize`, which redirects to this server's own consent page
   (`src/oauth/consent.ts`) asking for `MCP_SERVER_ACCESS_TOKEN` — a one-time password gate.
   This is the actual security boundary: only someone who knows that token can turn a
   registered client into an approved one.
3. On success, real OAuth access + refresh tokens are issued (1 hour access token lifetime,
   rotating refresh tokens). `/mcp` requests are verified against those, not the raw secret.

Registered clients and refresh tokens are persisted to `data/oauth-store.json` so a process
restart doesn't force reconnecting the connector (see `src/oauth/store.ts` for the tradeoffs).

## Setup

1. **Apply the API-side changes first** — see [`api-integration/README.md`](./api-integration/README.md).
   Without those, this server has nothing to call.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy `.env.example` to `.env` and fill in:
   - `PUBLIC_URL` — this server's own public URL (`http://localhost:3900` locally).
   - `PINEWRAPS_API_URL` — e.g. `http://localhost:3001` locally, or the deployed
     `pinewraps-api` URL in production.
   - `PINEWRAPS_API_KEY` — same value as `MCP_API_KEY` set on `pinewraps-api`.
   - `MCP_SERVER_ACCESS_TOKEN` — a separate long random secret (`openssl rand -hex 32`).
     This is the password you type into the consent page the first time you connect —
     it's what stops anyone else from approving a connection to your server.
4. Run it:
   ```bash
   npm run dev
   ```

## Tools exposed

| Tool | What it does |
|---|---|
| `list_products_seo` | List products, optionally filtered by name / SEO status (`pending`/`done`/`all`) |
| `get_product_seo` | Full detail for one product: description, category, images + alt text, current SEO fields |
| `update_product_seo` | Set `metaTitle`, `metaDescription`, `metaKeywords`, and/or per-image `alt` text |
| `list_collections_seo` | List collections, optionally filtered by name / SEO status |
| `get_collection_seo` | Full detail for one collection |
| `update_collection_seo` | Set `seoTitle`, `seoDescription`, `seoKeywords[]`, and/or the `faqs[]` accordion (full-list replace) |
| `list_blog_posts_seo` | List blog posts, optionally filtered by title / SEO status |
| `get_blog_post_seo` | Full detail for one blog post |
| `update_blog_post_seo` | Set `metaTitle`, `metaDescription` |
| `list_redirects` | List URL redirects, optionally filtered by fromPath/toPath/reason |
| `get_redirect` | Full detail for one redirect, including linked product/collection/blog post |
| `create_redirect` | Create a `fromPath` → `toPath` redirect (self-redirect and loop detection built in) |
| `update_redirect` | Update `fromPath`, `toPath`, `statusCode`, and/or `reason` on an existing redirect |

None of the SEO tools change URL slugs — see `api-integration/README.md` for why. Redirects are the
correct way to actually move a URL: create one from the old path to the new one instead.

## Verifying locally

With the server running (`npm run dev`) and pointed at a local `pinewraps-api`, drive the OAuth
flow by hand with curl (register → authorize → approve on the consent page → exchange code for
a token → call a tool) or point `npx @modelcontextprotocol/inspector` at `http://localhost:3900/mcp`
and let it walk the OAuth flow itself.

## Deploying

Deploy like any Node HTTP service (this has been run on Railway; Render works the same way):

```bash
npm run build
npm start
```

Set `PUBLIC_URL` (your deployed URL), `PINEWRAPS_API_URL`, `PINEWRAPS_API_KEY`, and
`MCP_SERVER_ACCESS_TOKEN` in the hosting platform's environment settings. Leave `PORT` unset if
the host injects its own (Railway and Render both do). Then in Claude Cowork, add
`https://<your-deployed-host>/mcp` as a connector — it will register itself and send you to the
consent page, where you enter `MCP_SERVER_ACCESS_TOKEN` once to approve it.

For durability across full redeploys (not just process restarts), mount a persistent volume at
the directory holding `data/oauth-store.json` (see `OAUTH_STORE_PATH` in `.env.example`) —
otherwise a redeploy just means reconnecting the connector once, which is a minor inconvenience,
not a functional problem.
