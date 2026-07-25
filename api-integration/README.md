# pinewraps-api changes needed for the MCP server

These files are **not applied** to `pinewraps-api` — they're staged here so nothing outside
this repo was touched while building the MCP server. Copy them in when ready:

1. Copy `src/middleware/api-key.ts` → `pinewraps-api/src/middleware/api-key.ts`
2. Copy `src/controllers/mcp.controller.ts` → `pinewraps-api/src/controllers/mcp.controller.ts`
3. Copy `src/routes/mcp.routes.ts` → `pinewraps-api/src/routes/mcp.routes.ts`
4. In `pinewraps-api/src/app.ts`, next to the existing:
   ```ts
   import seoRoutes from './routes/seo.routes';
   ...
   app.use('/api/seo', seoRoutes);
   ```
   add:
   ```ts
   import mcpRoutes from './routes/mcp.routes';
   ...
   app.use('/api/mcp', mcpRoutes);
   ```
5. Generate a long random secret and add it to `pinewraps-api`'s env (`.env` locally, and
   Render's environment settings for production):
   ```bash
   openssl rand -hex 32
   ```
   ```
   MCP_API_KEY=<paste the generated value>
   ```
6. Put the **same value** in `pinewraps-mcp`'s `PINEWRAPS_API_KEY` env var.

## Why these endpoints exist separately from `/api/seo`

`/api/seo/*` (`src/routes/seo.routes.ts`) is authenticated with `requireAuth`, which only
accepts Firebase user session tokens (cookie, Bearer header, or query param) — there's no
API-key/machine auth path in the codebase. Rather than bolt key-based auth onto the
Firebase-oriented admin routes, `/api/mcp/*` is a separate, deliberately narrow route group:

- Read + SEO-field write only for product / collection / blog.
- No slug editing — `seo.controller.ts`'s `updateProductSeo` / `updateCollectionSeo` /
  `updateBlogSeo` let the slug change but never create a `Redirect` row (unlike the main
  product/collection/blog update controllers, which call
  `RedirectService.createSlugChangeRedirect`). Until that's fixed, slug changes should only
  go through the main entity-update endpoints.
- No delete, no access to orders/customers/payments/inventory/etc — even if `MCP_API_KEY`
  ever leaks, the blast radius is "someone can rewrite your meta tags," not "someone can
  touch your store."

## Testing after wiring it up

```bash
curl -H "x-api-key: $MCP_API_KEY" http://localhost:3001/api/mcp/products?limit=5
curl -H "x-api-key: wrong-key" http://localhost:3001/api/mcp/products   # expect 401
curl -X PUT -H "x-api-key: $MCP_API_KEY" -H "Content-Type: application/json" \
  -d '{"metaTitle":"Test title"}' \
  http://localhost:3001/api/mcp/products/<some-product-id>/seo
```
