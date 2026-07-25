import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AxiosInstance } from 'axios';
import { toToolError, toToolJson } from '../format.js';

const VALID_STATUS_CODES = [301, 302, 303, 307, 308, 410, 451] as const;

export function registerRedirectTools(server: McpServer, api: AxiosInstance): void {
  server.registerTool(
    'list_redirects',
    {
      title: 'List redirects',
      description:
        'List Pinewraps URL redirects (from an old path to a new one). Use this to check ' +
        'whether a path already redirects somewhere before creating a new redirect for it.',
      inputSchema: {
        search: z.string().optional().describe('Filter by fromPath, toPath, or reason (case-insensitive substring)'),
        page: z.number().int().min(1).default(1),
        limit: z.number().int().min(1).max(100).default(20)
      }
    },
    async ({ search, page, limit }) => {
      try {
        const { data } = await api.get('/api/mcp/redirects', { params: { search, page, limit } });
        return toToolJson(data);
      } catch (err) {
        return toToolError(err);
      }
    }
  );

  server.registerTool(
    'get_redirect',
    {
      title: 'Get redirect detail',
      description:
        'Get full detail for one redirect by its ID, including which product/collection/blog post ' +
        '(if any) it is linked to.',
      inputSchema: {
        id: z.string().describe('Redirect ID (as returned by list_redirects)')
      }
    },
    async ({ id }) => {
      try {
        const { data } = await api.get(`/api/mcp/redirects/${encodeURIComponent(id)}`);
        return toToolJson(data);
      } catch (err) {
        return toToolError(err);
      }
    }
  );

  server.registerTool(
    'create_redirect',
    {
      title: 'Create a redirect',
      description:
        'Create a new URL redirect on pinewraps.com. fromPath and toPath are site-relative paths ' +
        `(e.g. "/shop/old-slug", not a full URL). statusCode defaults to 301 (permanent) if omitted ` +
        `— valid values are ${VALID_STATUS_CODES.join(', ')}. The server rejects self-redirects and ` +
        'redirect loops/chains automatically. Optionally link it to a productId, blogPostId, or ' +
        'collectionId for context.',
      inputSchema: {
        fromPath: z.string().describe('The old path that should redirect, e.g. "/shop/old-product-slug"'),
        toPath: z.string().describe('Where it should redirect to, e.g. "/shop/new-product-slug"'),
        statusCode: z.number().int().optional().describe(`One of ${VALID_STATUS_CODES.join(', ')}. Defaults to 301.`),
        reason: z.string().optional().describe('Why this redirect exists, for future reference'),
        productId: z.string().optional(),
        blogPostId: z.string().optional(),
        collectionId: z.string().optional()
      }
    },
    async (args) => {
      try {
        const { data } = await api.post('/api/mcp/redirects', args);
        return toToolJson(data);
      } catch (err) {
        return toToolError(err);
      }
    }
  );

  server.registerTool(
    'update_redirect',
    {
      title: 'Update a redirect',
      description:
        'Update an existing redirect\'s fromPath, toPath, statusCode, and/or reason. Only pass the ' +
        'fields you want to change. Same self-redirect and loop validation as create_redirect applies.',
      inputSchema: {
        id: z.string().describe('Redirect ID'),
        fromPath: z.string().optional(),
        toPath: z.string().optional(),
        statusCode: z.number().int().optional().describe(`One of ${VALID_STATUS_CODES.join(', ')}`),
        reason: z.string().optional()
      }
    },
    async ({ id, ...rest }) => {
      if (!rest.fromPath && !rest.toPath && rest.statusCode === undefined && rest.reason === undefined) {
        return toToolError(new Error('Provide at least one of fromPath, toPath, statusCode, or reason'));
      }
      try {
        const { data } = await api.put(`/api/mcp/redirects/${encodeURIComponent(id)}`, rest);
        return toToolJson(data);
      } catch (err) {
        return toToolError(err);
      }
    }
  );
}
