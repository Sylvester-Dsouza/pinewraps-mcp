import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AxiosInstance } from 'axios';
import { toToolError, toToolJson } from '../format.js';

const SEO_GUIDANCE =
  "metaTitle: under 60 characters, specific to this post, do not repeat the brand name 'Pinewraps'. " +
  'metaDescription: 120-160 characters, written to earn the click from a search results page. ' +
  'Only pass the fields you want to change.';

export function registerBlogTools(server: McpServer, api: AxiosInstance): void {
  server.registerTool(
    'list_blog_posts_seo',
    {
      title: 'List blog posts for SEO',
      description:
        'List Pinewraps blog posts with their current SEO status (metaTitle/metaDescription presence). ' +
        "Use status='pending' to find posts still missing SEO copy.",
      inputSchema: {
        search: z.string().optional().describe('Filter posts by title (case-insensitive substring)'),
        status: z.enum(['pending', 'done', 'all']).default('all'),
        page: z.number().int().min(1).default(1),
        limit: z.number().int().min(1).max(100).default(20)
      }
    },
    async ({ search, status, page, limit }) => {
      try {
        const { data } = await api.get('/api/mcp/blogs', { params: { search, status, page, limit } });
        return toToolJson(data);
      } catch (err) {
        return toToolError(err);
      }
    }
  );

  server.registerTool(
    'get_blog_post_seo',
    {
      title: 'Get blog post SEO detail',
      description:
        'Get full detail for one Pinewraps blog post needed to write good SEO copy: title, excerpt, ' +
        'content, and current metaTitle/metaDescription.',
      inputSchema: {
        id: z.string().describe('Blog post ID (as returned by list_blog_posts_seo)')
      }
    },
    async ({ id }) => {
      try {
        const { data } = await api.get(`/api/mcp/blogs/${encodeURIComponent(id)}`);
        return toToolJson(data);
      } catch (err) {
        return toToolError(err);
      }
    }
  );

  server.registerTool(
    'create_blog_post',
    {
      title: 'Create a blog post',
      description:
        'Create a new Pinewraps blog post. title and content are required (content is HTML). A URL ' +
        'slug is generated automatically from the title (uniquified if it collides with an existing ' +
        `one). status defaults to DRAFT — set to PUBLISHED to make it live immediately. ${SEO_GUIDANCE} ` +
        'categoryIds optionally files it under existing blog categories.',
      inputSchema: {
        title: z.string().min(1),
        content: z.string().min(1).describe('Full post body as HTML'),
        excerpt: z.string().optional().describe('Short summary shown on blog listing pages'),
        featuredImage: z.string().optional().describe('Featured image URL'),
        status: z.enum(['DRAFT', 'PUBLISHED']).default('DRAFT'),
        metaTitle: z.string().max(70).optional(),
        metaDescription: z.string().max(200).optional(),
        categoryIds: z.array(z.string()).optional().describe('Existing blog category IDs')
      }
    },
    async (args) => {
      try {
        const { data } = await api.post('/api/mcp/blogs', args);
        return toToolJson(data);
      } catch (err) {
        return toToolError(err);
      }
    }
  );

  server.registerTool(
    'update_blog_post_seo',
    {
      title: 'Update blog post SEO',
      description: `Update SEO metadata for a Pinewraps blog post. ${SEO_GUIDANCE} Does not change the URL slug.`,
      inputSchema: {
        id: z.string().describe('Blog post ID'),
        metaTitle: z.string().max(70).optional(),
        metaDescription: z.string().max(200).optional()
      }
    },
    async ({ id, ...rest }) => {
      if (!rest.metaTitle && !rest.metaDescription) {
        return toToolError(new Error('Provide at least one of metaTitle or metaDescription'));
      }
      try {
        const { data } = await api.put(`/api/mcp/blogs/${encodeURIComponent(id)}/seo`, rest);
        return toToolJson(data);
      } catch (err) {
        return toToolError(err);
      }
    }
  );
}
