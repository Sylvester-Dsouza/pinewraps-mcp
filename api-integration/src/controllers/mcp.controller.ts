import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { ApiError } from '../utils/api-error';
import { invalidateModelCache } from '../utils/cache-invalidation';

/**
 * Endpoints behind requireApiKey for the Pinewraps SEO MCP server. Deliberately narrow:
 * read + SEO-field-only write for product/collection/blog. No slug editing (see the
 * AUTO_SLUG-redirect gap noted for seo.controller.ts — until that's fixed, slug changes
 * should only happen through the main product/collection/blog update endpoints, which
 * create redirects correctly), no delete, no access to orders/customers/payments/etc.
 *
 * seoStatus mirrors the logic in seo.controller.ts's getSeoStatus (kept local here so
 * this file has no dependency on the admin SEO panel's controller).
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
