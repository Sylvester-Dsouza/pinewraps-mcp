import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { ApiError } from '../utils/api-error';
import { invalidateModelCache } from '../utils/cache-invalidation';
import { clearCachePattern } from '../middleware/cache';
import { RedirectService } from '../services/redirect.service';
import { RedirectType } from '@prisma/client';

/**
 * Endpoints behind requireApiKey for the Pinewraps SEO MCP server. Deliberately narrow:
 * read + SEO-field-only write for product/collection/blog, plus list/create/update for
 * redirects. No slug editing (see the AUTO_SLUG-redirect gap noted for seo.controller.ts
 * — until that's fixed, slug changes should only happen through the main
 * product/collection/blog update endpoints, which create redirects correctly), no delete
 * anywhere, no access to orders/customers/payments/etc.
 *
 * seoStatus mirrors the logic in seo.controller.ts's getSeoStatus (kept local here so
 * this file has no dependency on the admin SEO panel's controller). Redirect create/update
 * reuse RedirectService directly (src/services/redirect.service.ts) so the same loop/chain
 * detection and status-code validation the admin panel relies on applies here too.
 */

type SeoType = 'product' | 'collection' | 'blog';

const getSeoStatus = (item: any, type: SeoType): 'Done' | 'Pending' => {
  if (type === 'product') {
    const hasTitle = Boolean(item.metaTitle?.trim());
    const hasDesc = Boolean(item.metaDescription?.trim());
    const hasAltTags =
      item.images && item.images.length > 0 ? item.images.every((img: any) => Boolean(img.alt?.trim())) : true;
    return hasTitle && hasDesc && hasAltTags ? 'Done' : 'Pending';
  }
  if (type === 'collection') {
    return item.seoTitle?.trim() && item.seoDescription?.trim() ? 'Done' : 'Pending';
  }
  // blog
  return item.metaTitle?.trim() && item.metaDescription?.trim() ? 'Done' : 'Pending';
};

const paginate = <T>(items: T[], page: number, limit: number) => {
  const total = items.length;
  const start = (page - 1) * limit;
  return {
    data: items.slice(start, start + limit),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 }
  };
};

const parseListQuery = (req: Request) => {
  const search = String(req.query.search || '');
  const status = (req.query.status as string) || 'all';
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  return { search, status, page, limit };
};

// ---- Products ----

export const listProductsForSeo = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { search, status, page, limit } = parseListQuery(req);

    const products = await prisma.product.findMany({
      where: {
        name: { contains: search, mode: 'insensitive' },
        status: 'ACTIVE',
        isVisibleInWeb: true
      },
      include: { images: { orderBy: { order: 'asc' } }, category: { select: { name: true } } },
      orderBy: { updatedAt: 'desc' }
    });

    let withStatus = products.map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      category: p.category?.name,
      metaTitle: p.metaTitle,
      metaDescription: p.metaDescription,
      metaKeywords: p.metaKeywords,
      imageCount: p.images.length,
      updatedAt: p.updatedAt,
      seoStatus: getSeoStatus(p, 'product')
    }));

    if (status === 'pending' || status === 'done') {
      const wanted = status === 'pending' ? 'Pending' : 'Done';
      withStatus = withStatus.filter((p) => p.seoStatus === wanted);
    }

    res.json({ success: true, ...paginate(withStatus, page, limit) });
  } catch (error) {
    next(error);
  }
};

export const getProductForSeo = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        category: { select: { name: true } },
        subcategory: { select: { name: true } },
        images: { orderBy: { order: 'asc' } }
      }
    });

    if (!product) {
      throw new ApiError({ message: 'Product not found', statusCode: 404 });
    }

    res.json({
      success: true,
      data: {
        ...product,
        seoStatus: getSeoStatus(product, 'product')
      }
    });
  } catch (error) {
    next(error);
  }
};

export const updateProductSeoForMcp = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { metaTitle, metaDescription, metaKeywords, imageAlts } = req.body;

    const updated = await prisma.$transaction(async (tx) => {
      const product = await tx.product.update({
        where: { id },
        data: {
          ...(metaTitle !== undefined && { metaTitle }),
          ...(metaDescription !== undefined && { metaDescription }),
          ...(metaKeywords !== undefined && { metaKeywords })
        }
      });

      if (Array.isArray(imageAlts)) {
        for (const img of imageAlts) {
          if (img?.id && typeof img.alt === 'string') {
            await tx.productImage.update({ where: { id: img.id }, data: { alt: img.alt } });
          }
        }
      }

      return product;
    });

    res.json({ success: true, data: updated });

    await invalidateModelCache('SEO');
    await invalidateModelCache('PRODUCT');
  } catch (error) {
    next(error);
  }
};

// ---- Collections ----

export const listCollectionsForSeo = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { search, status, page, limit } = parseListQuery(req);

    const collections = await prisma.collection.findMany({
      where: { name: { contains: search, mode: 'insensitive' } },
      orderBy: { updatedAt: 'desc' }
    });

    let withStatus = collections.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      status: c.status,
      seoTitle: c.seoTitle,
      seoDescription: c.seoDescription,
      seoKeywords: c.seoKeywords,
      updatedAt: c.updatedAt,
      seoStatus: getSeoStatus(c, 'collection')
    }));

    if (status === 'pending' || status === 'done') {
      const wanted = status === 'pending' ? 'Pending' : 'Done';
      withStatus = withStatus.filter((c) => c.seoStatus === wanted);
    }

    res.json({ success: true, ...paginate(withStatus, page, limit) });
  } catch (error) {
    next(error);
  }
};

export const getCollectionForSeo = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const collection = await prisma.collection.findUnique({ where: { id } });

    if (!collection) {
      throw new ApiError({ message: 'Collection not found', statusCode: 404 });
    }

    res.json({ success: true, data: { ...collection, seoStatus: getSeoStatus(collection, 'collection') } });
  } catch (error) {
    next(error);
  }
};

export const updateCollectionSeoForMcp = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { seoTitle, seoDescription, seoKeywords } = req.body;

    const updated = await prisma.collection.update({
      where: { id },
      data: {
        ...(seoTitle !== undefined && { seoTitle }),
        ...(seoDescription !== undefined && { seoDescription }),
        ...(seoKeywords !== undefined && { seoKeywords })
      }
    });

    res.json({ success: true, data: updated });

    await invalidateModelCache('SEO');
    await invalidateModelCache('COLLECTION');
  } catch (error) {
    next(error);
  }
};

// ---- Blog posts ----

export const listBlogPostsForSeo = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { search, status, page, limit } = parseListQuery(req);

    const posts = await prisma.blogPost.findMany({
      where: { title: { contains: search, mode: 'insensitive' } },
      orderBy: { updatedAt: 'desc' }
    });

    let withStatus = posts.map((b) => ({
      id: b.id,
      title: b.title,
      slug: b.slug,
      status: b.status,
      metaTitle: b.metaTitle,
      metaDescription: b.metaDescription,
      updatedAt: b.updatedAt,
      seoStatus: getSeoStatus(b, 'blog')
    }));

    if (status === 'pending' || status === 'done') {
      const wanted = status === 'pending' ? 'Pending' : 'Done';
      withStatus = withStatus.filter((b) => b.seoStatus === wanted);
    }

    res.json({ success: true, ...paginate(withStatus, page, limit) });
  } catch (error) {
    next(error);
  }
};

export const getBlogPostForSeo = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const post = await prisma.blogPost.findUnique({ where: { id } });

    if (!post) {
      throw new ApiError({ message: 'Blog post not found', statusCode: 404 });
    }

    res.json({ success: true, data: { ...post, seoStatus: getSeoStatus(post, 'blog') } });
  } catch (error) {
    next(error);
  }
};

export const updateBlogPostSeoForMcp = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { metaTitle, metaDescription } = req.body;

    const updated = await prisma.blogPost.update({
      where: { id },
      data: {
        ...(metaTitle !== undefined && { metaTitle }),
        ...(metaDescription !== undefined && { metaDescription })
      }
    });

    res.json({ success: true, data: updated });

    await invalidateModelCache('SEO');
    await invalidateModelCache('BLOG_POST');
  } catch (error) {
    next(error);
  }
};

// ---- Redirects ----
//
// create/update reuse RedirectService directly so the same self-redirect prevention,
// loop/chain detection, and status-code validation the admin panel gets applies here too.
// RedirectService throws plain Errors for those validation failures (not ApiError), so we
// catch and convert to 400s ourselves — same as the existing /api/redirects controller does.

const REDIRECT_INCLUDE = {
  product: { select: { id: true, name: true, slug: true } },
  blogPost: { select: { id: true, title: true, slug: true } },
  collection: { select: { id: true, name: true, slug: true } }
} as const;

export const listRedirectsForMcp = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const search = req.query.search ? String(req.query.search) : undefined;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));

    const result = await RedirectService.getAllRedirects(page, limit, search);

    res.json({
      success: true,
      data: result.data,
      pagination: { page: result.page, limit: result.limit, total: result.total, totalPages: result.totalPages }
    });
  } catch (error) {
    next(error);
  }
};

export const getRedirectForMcp = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const redirect = await prisma.redirect.findUnique({ where: { id }, include: REDIRECT_INCLUDE });

    if (!redirect) {
      throw new ApiError({ message: 'Redirect not found', statusCode: 404 });
    }

    res.json({ success: true, data: redirect });
  } catch (error) {
    next(error);
  }
};

export const createRedirectForMcp = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { fromPath, toPath, statusCode, reason, productId, blogPostId, collectionId } = req.body;

    if (!fromPath || !toPath) {
      throw new ApiError({ message: 'fromPath and toPath are required', statusCode: 400 });
    }

    const redirect = await RedirectService.createRedirect({
      fromPath,
      toPath,
      statusCode: statusCode || 301,
      type: RedirectType.API_CREATED,
      reason,
      productId,
      blogPostId,
      collectionId
    });

    res.status(201).json({ success: true, data: redirect });

    clearCachePattern('/api/redirects*').catch((err) => console.error('Cache invalidation error:', err));
  } catch (error) {
    if (error instanceof ApiError) {
      return next(error);
    }
    // Validation failures from RedirectService (self-redirect, loop detection, bad status code).
    next(new ApiError({ message: error instanceof Error ? error.message : 'Failed to create redirect', statusCode: 400 }));
  }
};

export const updateRedirectForMcp = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { fromPath, toPath, statusCode, reason } = req.body;

    const existing = await prisma.redirect.findUnique({ where: { id } });
    if (!existing) {
      throw new ApiError({ message: 'Redirect not found', statusCode: 404 });
    }

    const nextFromPath = fromPath !== undefined ? fromPath : existing.fromPath;
    const nextToPath = toPath !== undefined ? toPath : existing.toPath;
    const nextStatusCode = statusCode !== undefined ? statusCode : existing.statusCode;

    const statusValidation = RedirectService.validateStatusCode(nextStatusCode);
    if (!statusValidation.valid) {
      throw new ApiError({ message: statusValidation.message || 'Invalid status code', statusCode: 400 });
    }

    if (nextFromPath === nextToPath) {
      throw new ApiError({ message: 'Cannot create redirect to the same path', statusCode: 400 });
    }

    const chainAnalysis = await RedirectService.detectRedirectChain(nextFromPath, nextToPath);
    if (chainAnalysis.hasLoop) {
      throw new ApiError({
        message: `Redirect would create a loop: ${chainAnalysis.chain.join(' -> ')}`,
        statusCode: 400
      });
    }

    const updated = await prisma.redirect.update({
      where: { id },
      data: {
        fromPath: nextFromPath,
        toPath: nextToPath,
        statusCode: nextStatusCode,
        reason: reason !== undefined ? reason : existing.reason
      },
      include: REDIRECT_INCLUDE
    });

    res.json({ success: true, data: updated });

    clearCachePattern('/api/redirects*').catch((err) => console.error('Cache invalidation error:', err));
  } catch (error) {
    next(error);
  }
};
