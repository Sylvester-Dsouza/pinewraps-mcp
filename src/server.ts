import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AxiosInstance } from 'axios';
import { registerBlogTools } from './tools/blogPosts.js';
import { registerCollectionTools } from './tools/collections.js';
import { registerProductTools } from './tools/products.js';

const SERVER_INSTRUCTIONS = `
This server manages SEO metadata (meta title, meta description, keywords, and product image alt text)
for pinewraps.com, a Dubai-based cakes/flowers/balloons/gifting e-commerce brand. It covers three
content types: products, collections, and blog posts. It does not manage categories, and it never
changes URL slugs.

Workflow: call the relevant list_* tool (optionally filtered to status="pending") to find items missing
SEO copy, call get_*_seo for the full context on a specific item, write the copy yourself, then call
update_*_seo with only the fields you want to change.
`.trim();

export function buildMcpServer(api: AxiosInstance): McpServer {
  const server = new McpServer(
    { name: 'pinewraps-seo', version: '1.0.0' },
    { instructions: SERVER_INSTRUCTIONS }
  );

  registerProductTools(server, api);
  registerCollectionTools(server, api);
  registerBlogTools(server, api);

  return server;
}
