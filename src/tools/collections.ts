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
        'content, current seoTitle/seoDescription/seoKeywords, and current faqs (the "Read FAQ" accordion ' +
        'shown on the collection page).',
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
    'create_collection',
    {
      title: 'Create a collection',
      description:
        'Create a new Pinewraps collection. Only name is required; a URL slug is generated ' +
        'automatically from it (uniquified if it collides with an existing one). status defaults to ' +
        `DRAFT — set to PUBLISHED to make it live immediately. ${SEO_GUIDANCE} faqs sets the initial ` +
        '"Read FAQ" accordion. productIds optionally adds existing products to the collection ' +
        '(invalid/unknown IDs are silently skipped).',
      inputSchema: {
        name: z.string().min(1).describe('Collection name'),
        description: z.string().optional().describe('Short description shown under the collection title'),
        content: z.string().optional().describe('Longer rich-text/SEO content shown further down the page'),
        status: z.enum(['DRAFT', 'PUBLISHED']).default('DRAFT'),
        image: z.string().optional().describe('Image URL for the collection'),
        seoTitle: z.string().max(70).optional(),
        seoDescription: z.string().max(200).optional(),
        seoKeywords: z.array(z.string()).optional(),
        faqs: z
          .array(z.object({ question: z.string().min(1), answer: z.string().min(1) }))
          .optional()
          .describe('Initial FAQ accordion items, in display order'),
        productIds: z.array(z.string()).optional().describe('Existing product IDs to add to this collection')
      }
    },
    async (args) => {
      try {
        const { data } = await api.post('/api/mcp/collections', args);
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
      description:
        `Update SEO metadata for a Pinewraps collection. ${SEO_GUIDANCE} Does not change the URL slug. ` +
        'faqs sets the "Read FAQ" accordion shown on the collection page next to the "Read more" ' +
        'description toggle — pass the complete desired list (call get_collection_seo first to see the ' +
        'current one), as this replaces the whole list rather than appending to it. Keep answers concise ' +
        'and specific to this collection; Pinewraps ships across Dubai/UAE so delivery-related FAQs can ' +
        'mention that.',
      inputSchema: {
        id: z.string().describe('Collection ID'),
        seoTitle: z.string().max(70).optional(),
        seoDescription: z.string().max(200).optional(),
        seoKeywords: z.array(z.string()).optional(),
        faqs: z
          .array(
            z.object({
              question: z.string().min(1),
              answer: z.string().min(1)
            })
          )
          .optional()
          .describe('Full replacement list for the FAQ accordion, in display order')
      }
    },
    async ({ id, ...rest }) => {
      if (!rest.seoTitle && !rest.seoDescription && !rest.seoKeywords && !rest.faqs) {
        return toToolError(new Error('Provide at least one of seoTitle, seoDescription, seoKeywords, or faqs'));
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
