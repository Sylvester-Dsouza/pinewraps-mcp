import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AxiosInstance } from 'axios';
import { toToolError, toToolJson } from '../format.js';

const SEO_GUIDANCE =
  "seoTitle: under 60 characters, specific to this collection, do not repeat the brand name 'Pinewraps'. " +
  'seoDescription: 120-160 characters, action-oriented, can mention Dubai/UAE delivery. seoKeywords: an ' +
  'array of 5-10 relevant search terms, no keyword stuffing. Only pass the fields you want to change.';

export function registerCollectionTools(server: McpServer, api: AxiosInstance): void {
  server.registerTool(
    'list_collections_seo',
    {
      title: 'List collections for SEO',
      description:
        'List Pinewraps collections with their current SEO status (seoTitle/seoDescription presence). ' +
        "Use status='pending' to find collections still missing SEO copy.",
      inputSchema: {
        search: z.string().optional().describe('Filter collections by name (case-insensitive substring)'),
        status: z.enum(['pending', 'done', 'all']).default('all'),
        page: z.number().int().min(1).default(1),
        limit: z.number().int().min(1).max(100).default(20)
      }
    },
    async ({ search, status, page, limit }) => {
      try {
        const { data } = await api.get('/api/mcp/collections', { params: { search, status, page, limit } });
        return toToolJson(data);
      } catch (err) {
        return toToolError(err);
      }
    }
  );

  server.registerTool(
    'get_collection_seo',
    {
      title: 'Get collection SEO detail',
      description:
        'Get full detail for one Pinewraps collection needed to write good SEO copy: name, description, ' +
        'content, and current seoTitle/seoDescription/seoKeywords.',
      inputSchema: {
        id: z.string().describe('Collection ID (as returned by list_collections_seo)')
      }
    },
    async ({ id }) => {
      try {
        const { data } = await api.get(`/api/mcp/collections/${encodeURIComponent(id)}`);
        return toToolJson(data);
      } catch (err) {
        return toToolError(err);
      }
    }
  );

  server.registerTool(
    'update_collection_seo',
    {
      title: 'Update collection SEO',
      description: `Update SEO metadata for a Pinewraps collection. ${SEO_GUIDANCE} Does not change the URL slug.`,
      inputSchema: {
        id: z.string().describe('Collection ID'),
        seoTitle: z.string().max(70).optional(),
        seoDescription: z.string().max(200).optional(),
        seoKeywords: z.array(z.string()).optional()
      }
    },
    async ({ id, ...rest }) => {
      if (!rest.seoTitle && !rest.seoDescription && !rest.seoKeywords) {
        return toToolError(new Error('Provide at least one of seoTitle, seoDescription, or seoKeywords'));
      }
      try {
        const { data } = await api.put(`/api/mcp/collections/${encodeURIComponent(id)}/seo`, rest);
        return toToolJson(data);
      } catch (err) {
        return toToolError(err);
      }
    }
  );
}
