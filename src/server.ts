import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AxiosInstance } from 'axios';
import { registerBlogTools } from './tools/blogPosts.js';
import { registerCollectionTools } from './tools/collections.js';
import { registerProductTools } from './tools/products.js';
import { registerRedirectTools } from './tools/redirects.js';

const SERVER_INSTRUCTIONS = `
This server manages SEO metadata (meta title, meta description, keywords, and product image alt text)
for pinewraps.com, a Dubai-based cakes/flowers/balloons/gifting e-commerce brand. It covers three
content types: products, collections, and blog posts. It does not manage categories, and it never
changes URL slugs on those directly.

Workflow: call the relevant list_* tool (optionally filtered to status="pending") to find items missing
SEO copy, call get_*_seo for the full context on a specific item, write the copy yourself, then call
update_*_seo with only the fields you want to change.

create_collection and create_blog_post make new collections/blog posts from scratch (defaulting to
DRAFT status so nothing goes live by accident — set status to PUBLISHED explicitly to publish
immediately). There is no create tool for products — those are only editable for SEO on existing
products, since creating one involves pricing, variants, and inventory beyond this server's scope.

It also manages redirects (list_redirects, get_redirect, create_redirect, update_redirect). If you ever
do need to change a URL that's already indexed or linked elsewhere, create a redirect from the old path
to the new one rather than just changing content — that's how old links and search rankings stay intact.

Collections also have an FAQ accordion (update_collection_seo's faqs field) shown on the collection page
next to the "Read more" description toggle. It's a full-list replace, not per-item — always fetch the
current list with get_collection_seo first if you're editing rather than fully rewriting it.
`.trim();

export function buildMcpServer(api: AxiosInstance): McpServer {
  const server = new McpServer(
    { name: 'pinewraps-seo', version: '1.0.0' },
    { instructions: SERVER_INSTRUCTIONS }
  );

  registerProductTools(server, api);
  registerCollectionTools(server, api);
  registerBlogTools(server, api);
  registerRedirectTools(server, api);

  return server;
}
