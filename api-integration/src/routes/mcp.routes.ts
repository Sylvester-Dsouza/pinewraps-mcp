import { Router } from 'express';
import { requireApiKey } from '../middleware/api-key';
import {
  listProductsForSeo,
  getProductForSeo,
  updateProductSeoForMcp,
  listCollectionsForSeo,
  getCollectionForSeo,
  updateCollectionSeoForMcp,
  listBlogPostsForSeo,
  getBlogPostForSeo,
  updateBlogPostSeoForMcp
} from '../controllers/mcp.controller';

const router = Router();

router.use(requireApiKey);

router.get('/products', listProductsForSeo);
router.get('/products/:id', getProductForSeo);
router.put('/products/:id/seo', updateProductSeoForMcp);

router.get('/collections', listCollectionsForSeo);
router.get('/collections/:id', getCollectionForSeo);
router.put('/collections/:id/seo', updateCollectionSeoForMcp);

router.get('/blogs', listBlogPostsForSeo);
router.get('/blogs/:id', getBlogPostForSeo);
router.put('/blogs/:id/seo', updateBlogPostSeoForMcp);

export default router;
