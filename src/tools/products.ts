import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AxiosInstance } from 'axios';
import { toToolError, toToolJson } from '../format.js';

const SEO_GUIDANCE =
  "metaTitle: under 60 characters, specific to this product, do not repeat the brand name 'Pinewraps' " +
  '(it is appended by the site automatically). metaDescription: 120-160 characters, action-oriented, ' +
  'can mention Dubai/UAE delivery since Pinewraps ships across Dubai. metaKeywords: a comma-separated ' +
  'list of 5-10 relevant search terms, no keyword stuffing. Only pass the fields you want to change.';

export function registerProductTools(server: McpServer, api: AxiosInstance): void {
  server.registerTool(
    'list_products_seo',
    {
      title: 'List products for SEO',
      description:
        'List Pinewraps products with their current SEO status (metaTitle/metaDescription/metaKeywords ' +
        "presence). Use status='pending' to find products still missing SEO copy.",
      inputSchema: {
        search: z.string().optional().describe('Filter products by name (case-insensitive substring)'),
        status: z
          .enum(['pending', 'done', 'all'])
          .default('all')
          .describe('Filter by whether SEO fields + image alt text are already filled in'),
        page: z.number().int().min(1).default(1),
        limit: z.number().int().min(1).max(100).default(20)
      }
    },
    async ({ search, status, page, limit }) => {
      try {
        const { data } = await api.get('/api/mcp/products', { params: { search, status, page, limit } });
        return toToolJson(data);
      } catch (err) {
        return toToolError(err);
      }
    }
  );

  server.registerTool(
    'get_product_seo',
    {
      title: 'Get product SEO detail',
      description:
        'Get full detail for one Pinewraps product needed to write good SEO copy: name, description, ' +
        'category, price, current metaTitle/metaDescription/metaKeywords, and images with their current alt text.',
      inputSchema: {
        id: z.string().describe('Product ID (as returned by list_products_seo)')
      }
    },
    async ({ id }) => {
      try {
        const { data } = await api.get(`/api/mcp/products/${encodeURIComponent(id)}`);
        return toToolJson(data);
      } catch (err) {
        return toToolError(err);
      }
    }
  );

  server.registerTool(
    'update_product_seo',
    {
      title: 'Update product SEO',
      description: `Update SEO metadata for a Pinewraps product. ${SEO_GUIDANCE} imageAlts lets you set ` +
        'descriptive alt text per image (use the image ids from get_product_seo). Does not change the URL slug.',
      inputSchema: {
        id: z.string().describe('Product ID'),
        metaTitle: z.string().max(70).optional(),
        metaDescription: z.string().max(200).optional(),
        metaKeywords: z.string().optional().describe('Comma-separated keywords'),
        imageAlts: z
          .array(
            z.object({
              id: z.string().describe('ProductImage ID'),
              alt: z.string().describe('New alt text for this image')
            })
          )
          .optional()
      }
    },
    async ({ id, ...rest }) => {
      if (!rest.metaTitle && !rest.metaDescription && !rest.metaKeywords && !rest.imageAlts) {
        return toToolError(new Error('Provide at least one of metaTitle, metaDescription, metaKeywords, or imageAlts'));
      }
      try {
        const { data } = await api.put(`/api/mcp/products/${encodeURIComponent(id)}/seo`, rest);
        return toToolJson(data);
      } catch (err) {
        return toToolError(err);
      }
    }
  );
}
