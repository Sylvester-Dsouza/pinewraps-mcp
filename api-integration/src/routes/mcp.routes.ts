import { Router } from 'express';
import { requireApiKey } from '../middleware/api-key';
import {
  listProductsForSeo,
  getProductForSeo,
  updateProductSeoForMcp,
  listCollectionsForSeo,
  getCollectionForSeo,
  updateCollectionSeoForMcp,
  createCollectionForMcp,
  listBlogPostsForSeo,
  getBlogPostForSeo,
  updateBlogPostSeoForMcp,
  createBlogPostForMcp,
  listRedirectsForMcp,
  getRedirectForMcp,
  createRedirectForMcp,
  updateRedirectForMcp
} from '../controllers/mcp.controller';

const router = Router();

router.use(requireApiKey);

router.get('/products', listProductsForSeo);
router.get('/products/:id', getProductForSeo);
router.put('/products/:id/seo', updateProductSeoForMcp);

router.get('/collections', listCollectionsForSeo);
router.get('/collections/:id', getCollectionForSeo);
router.post('/collections', createCollectionForMcp);
router.put('/collections/:id/seo', updateCollectionSeoForMcp);

router.get('/blogs', listBlogPostsForSeo);
router.get('/blogs/:id', getBlogPostForSeo);
router.post('/blogs', createBlogPostForMcp);
router.put('/blogs/:id/seo', updateBlogPostSeoForMcp);

router.get('/redirects', listRedirectsForMcp);
router.get('/redirects/:id', getRedirectForMcp);
router.post('/redirects', createRedirectForMcp);
router.put('/redirects/:id', updateRedirectForMcp);

export default router;
