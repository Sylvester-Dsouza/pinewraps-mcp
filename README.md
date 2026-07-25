# pinewraps-mcp

Remote MCP server that lets Claude (Cowork or any MCP-compatible client) read and update SEO
metadata — meta title, meta description, keywords, and product image alt text — for Pinewraps
**products, collections, and blog posts**. Categories are intentionally out of scope (no SEO
fields exist for them yet). It never touches the database directly; it calls a small set of
API-key-protected endpoints on `pinewraps-api`.

```
Claude Cowork ── Bearer token ──> pinewraps-mcp (this repo) ── x-api-key ──> pinewraps-api
```

## Setup

1. **Apply the API-side changes first** — see [`api-integration/README.md`](./api-integration/README.md).
   Without those, this server has nothing to call.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy `.env.example` to `.env` and fill in:
   - `PINEWRAPS_API_URL` — e.g. `http://localhost:3001` locally, or the deployed
     `pinewraps-api` URL in production.
   - `PINEWRAPS_API_KEY` — same value as `MCP_API_KEY` set on `pinewraps-api`.
   - `MCP_SERVER_ACCESS_TOKEN` — a separate long random secret
     (`openssl rand -hex 32`). This is what you enter when adding this server as a
     connector in Claude — it stops anyone else from calling your MCP server.
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
| `update_collection_seo` | Set `seoTitle`, `seoDescription`, `seoKeywords[]` |
| `list_blog_posts_seo` | List blog posts, optionally filtered by title / SEO status |
| `get_blog_post_seo` | Full detail for one blog post |
| `update_blog_post_seo` | Set `metaTitle`, `metaDescription` |

None of these tools change URL slugs — see `api-integration/README.md` for why.

## Verifying locally with MCP Inspector

With the server running (`npm run dev`) and pointed at a local `pinewraps-api`:

```bash
npx @modelcontextprotocol/inspector
```

Connect to `http://localhost:3900/mcp` using "Streamable HTTP", with header
`Authorization: Bearer <your MCP_SERVER_ACCESS_TOKEN>`. You should see all 9 tools listed and
be able to call them directly.

## Deploying

Deploy like any Node HTTP service (e.g. a second Render web service alongside `pinewraps-api`):

```bash
npm run build
npm start
```

Set `PORT`, `PINEWRAPS_API_URL`, `PINEWRAPS_API_KEY`, and `MCP_SERVER_ACCESS_TOKEN` in the
hosting platform's environment settings. Then add `https://<your-deployed-host>/mcp` as a
remote connector in Claude Cowork, with the bearer token you generated.

**Before deploying**, confirm how Claude Cowork's "add connector" flow actually authenticates
to a self-hosted remote MCP server — if it only supports OAuth and not a static bearer token,
`src/auth.ts` needs a small OAuth shim instead of the current header check.
