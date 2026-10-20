import { authentication, authRoutes } from './auth.js';
import { productRoutes } from './products.js';
import { customerRoutes } from './customers.js';
import { orderRoutes } from './orders.js';
import { analyticsRoutes } from './analytics.js';
import { adminRoutes } from './admin.js';
import { connectionRoutes } from './connections.js';
export const mongoRoutes = {
  authentication,
  authRoutes,
  productRoutes,
  customerRoutes,
  orderRoutes,
  analyticsRoutes,
  adminRoutes,
  connectionRoutes,
};
