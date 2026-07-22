export interface FileNode {
  path: string;
  type: 'blob' | 'tree';
  size?: number;
}

export interface FeatureNode {
  id: string;
  name: string;
  description: string;
  files: string[];
  color: string;
}

export interface Developer {
  name: string;
  avatar: string;
  role: string;
}

export interface CallGraphNode {
  id: string;
  label: string;
  file: string;
  type: 'ui' | 'api' | 'service' | 'db' | 'external' | 'worker';
  developer?: Developer;
  note?: string;
}

export interface CallGraphEdge {
  from: string;
  to: string;
  label?: string;
  animated?: boolean;
}

export interface ImpactAnalysisResult {
  target: string;
  risk: 'High' | 'Medium' | 'Low';
  stats: {
    files: number;
    apis: number;
    services: number;
    screens: number;
  };
  affectedList: Array<{
    name: string;
    path: string;
    level: 'High' | 'Medium' | 'Low';
  }>;
}

// Pre-defined premium E-commerce platform demo dataset
export const ECOMMERCE_DEMO_FEATURES: FeatureNode[] = [
  {
    id: 'auth',
    name: 'Authentication',
    description: 'Handles user login, token generation, session validation, and password resets.',
    color: '#334155',
    files: [
      'src/auth/auth.service.ts',
      'src/auth/auth.controller.ts',
      'src/auth/strategies/jwt.strategy.ts',
      'src/auth/dto/login.dto.ts',
      'src/middleware/session.ts'
    ]
  },
  {
    id: 'checkout',
    name: 'Checkout & Cart',
    description: 'Manages user shopping carts, tax calculations, discounts, and checkout flow initiation.',
    color: '#06b6d4',
    files: [
      'src/checkout/checkout.controller.ts',
      'src/checkout/checkout.service.ts',
      'src/cart/cart.service.ts',
      'src/cart/cart.controller.ts'
    ]
  },
  {
    id: 'orders',
    name: 'Order Management',
    description: 'Coordinates order placement, state transitions, invoice creation, and order history tracking.',
    color: '#0f172a',
    files: [
      'src/orders/order.service.ts',
      'src/orders/order.controller.ts',
      'src/orders/entities/order.entity.ts',
      'src/orders/cron/billing.ts'
    ]
  },
  {
    id: 'payments',
    name: 'Payments Integration',
    description: 'Integrates with Stripe, PayPal, and Webhooks for processing refunds and secure checkouts.',
    color: '#10b981',
    files: [
      'src/payments/stripe.adapter.ts',
      'src/payments/paypal.adapter.ts',
      'src/payments/payment.service.ts',
      'src/payments/webhook.controller.ts'
    ]
  },
  {
    id: 'inventory',
    name: 'Inventory & Shipping',
    description: 'Controls real-time inventory counts, stock reservation, and courier shipping updates.',
    color: '#f59e0b',
    files: [
      'src/inventory/inventory.service.ts',
      'src/inventory/inventory.controller.ts',
      'src/shipping/shipping.service.ts'
    ]
  },
  {
    id: 'notifications',
    name: 'Notification Service',
    description: 'Dispatches automated invoice updates, receipts, and security alerts via SendGrid.',
    color: '#ec4899',
    files: [
      'src/email/email.service.ts',
      'src/email/templates/receipt.html',
      'src/sms/sms.service.ts'
    ]
  },
  {
    id: 'analytics',
    name: 'Analytics & Insights',
    description: 'Streams customer actions, funnel milestones, and checkout conversion rates to Amplitude.',
    color: '#3b82f6',
    files: [
      'src/analytics/analytics.service.ts',
      'src/analytics/track.ts'
    ]
  }
];

export const ECOMMERCE_DEMO_CALLS: { nodes: CallGraphNode[]; edges: CallGraphEdge[] } = {
  nodes: [
    { 
      id: 'user', 
      label: 'User Action', 
      file: 'Client Web/Mobile', 
      type: 'ui',
      developer: { name: 'Sarah Chen', role: 'Frontend Lead', avatar: 'SC' },
      note: 'Web Checkout Page. Triggers createOrder flow on user submit.'
    },
    { 
      id: 'checkout_api', 
      label: 'Checkout API', 
      file: 'src/checkout/checkout.controller.ts', 
      type: 'api',
      developer: { name: 'Alex River', role: 'API Lead', avatar: 'AR' },
      note: 'Validates checkout request payload. Secure JWT middleware wrapper.'
    },
    { 
      id: 'cart_service', 
      label: 'CartService', 
      file: 'src/cart/cart.service.ts', 
      type: 'service',
      developer: { name: 'Sarah Chen', role: 'Frontend Lead', avatar: 'SC' },
      note: 'Calculates active items, promotions, and items subtotal values.'
    },
    { 
      id: 'order_service', 
      label: 'OrderService', 
      file: 'src/orders/order.service.ts', 
      type: 'service',
      developer: { name: 'Elena Rostova', role: 'Backend Staff', avatar: 'ER' },
      note: 'Orchestrates order state machine transition to PENDING status.'
    },
    { 
      id: 'inventory_service', 
      label: 'InventoryService', 
      file: 'src/inventory/inventory.service.ts', 
      type: 'service',
      developer: { name: 'Dave Miller', role: 'Logistics Dev', avatar: 'DM' },
      note: 'Deducts stock levels and checks items availability thresholds.'
    },
    {
      id: 'shipping_service',
      label: 'ShippingService',
      file: 'src/shipping/shipping.service.ts',
      type: 'service',
      developer: { name: 'Dave Miller', role: 'Logistics Dev', avatar: 'DM' },
      note: 'Coordinates dispatch window with external logistics API.'
    },
    { 
      id: 'payment_service', 
      label: 'PaymentService', 
      file: 'src/payments/payment.service.ts', 
      type: 'service',
      developer: { name: 'Marcus Vance', role: 'Payment Specialist', avatar: 'MV' },
      note: 'Routes checkout request payload to the designated gateway.'
    },
    { 
      id: 'stripe_adapter', 
      label: 'StripeAdapter', 
      file: 'src/payments/stripe.adapter.ts', 
      type: 'external',
      developer: { name: 'Marcus Vance', role: 'Payment Specialist', avatar: 'MV' },
      note: 'Direct client connection to Stripe API. Handles charge retries.'
    },
    { 
      id: 'email_service', 
      label: 'EmailService', 
      file: 'src/email/email.service.ts', 
      type: 'service',
      developer: { name: 'Arjun K.', role: 'Senior Engineer', avatar: 'AK' },
      note: 'Constructs receipts using HTML templates and routes via SendGrid.'
    },
    { 
      id: 'analytics_service', 
      label: 'AnalyticsService', 
      file: 'src/analytics/analytics.service.ts', 
      type: 'service',
      developer: { name: 'Sara L.', role: 'Staff Data Eng', avatar: 'SL' },
      note: 'Fires analytical checkouts events for conversion tracking.'
    },
    { 
      id: 'order_db', 
      label: 'Orders Database', 
      file: 'PostgreSQL - Order Table', 
      type: 'db',
      developer: { name: 'Elena Rostova', role: 'Backend Staff', avatar: 'ER' },
      note: 'Holds transactional records. Locked during checkout stock allocation.'
    },
    { 
      id: 'redis_cache', 
      label: 'Redis Cache', 
      file: 'Redis Session Store', 
      type: 'db',
      developer: { name: 'Arjun K.', role: 'Senior Engineer', avatar: 'AK' },
      note: 'Cache resets every day at 2AM. Temporary checkout locker.'
    }
  ],
  edges: [
    { from: 'user', to: 'checkout_api', label: 'clicks "Place Order"' },
    { from: 'checkout_api', to: 'cart_service', label: 'validateCart()' },
    { from: 'cart_service', to: 'redis_cache', label: 'getSession()' },
    { from: 'checkout_api', to: 'order_service', label: 'createOrder()' },
    { from: 'order_service', to: 'inventory_service', label: 'checkStock()' },
    { from: 'inventory_service', to: 'shipping_service', label: 'arrangeShipping()' },
    { from: 'order_service', to: 'payment_service', label: 'processPayment()' },
    { from: 'payment_service', to: 'stripe_adapter', label: 'charge()' },
    { from: 'order_service', to: 'order_db', label: 'save()' },
    { from: 'order_service', to: 'email_service', label: 'sendConfirmation()' },
    { from: 'order_service', to: 'analytics_service', label: 'trackCheckout()' }
  ]
};

// Generates simulated features for any parsed repository list of files
export function generateFeaturesFromFiles(files: string[]): FeatureNode[] {
  const features: Record<string, { name: string; desc: string; files: string[]; color: string }> = {
    core: { name: 'Core Engine', desc: 'Base components, main server, and routing entry points.', color: '#334155', files: [] },
    data: { name: 'Data Layer', desc: 'Database connections, schema models, and migrations.', color: '#0f172a', files: [] },
    utils: { name: 'Utilities & Helpers', desc: 'Common helper utilities, helpers, constants, and tools.', color: '#06b6d4', files: [] },
    ui: { name: 'User Interface', desc: 'Visual client pages, layouts, and styles.', color: '#10b981', files: [] },
    api: { name: 'API Endpoints', desc: 'Controllers, route handlers, and request models.', color: '#f59e0b', files: [] }
  };

  files.forEach(file => {
    if (file.includes('db/') || file.includes('model') || file.includes('schema') || file.includes('entity')) {
      features.data.files.push(file);
    } else if (file.includes('util') || file.includes('helper') || file.includes('config')) {
      features.utils.files.push(file);
    } else if (file.includes('app/') || file.includes('pages/') || file.includes('components/') || file.includes('view') || file.endsWith('.css')) {
      features.ui.files.push(file);
    } else if (file.includes('api/') || file.includes('controller') || file.includes('route')) {
      features.api.files.push(file);
    } else {
      features.core.files.push(file);
    }
  });

  return Object.entries(features)
    .filter(([_, data]) => data.files.length > 0)
    .map(([id, data]) => ({
      id,
      name: data.name,
      description: data.desc,
      files: data.files,
      color: data.color
    }));
}

// Robust GitHub repository URL parser supporting full links, short format (owner/repo), and tree paths
export function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  try {
    if (!url || typeof url !== 'string') return null;
    let cleaned = url.trim().replace(/\/$/, '');
    
    // Strip trailing .git
    cleaned = cleaned.replace(/\.git$/, '');

    // 1. Full URL pattern matching: https://github.com/owner/repo or github.com/owner/repo
    const fullMatch = cleaned.match(/github\.com\/([^\/]+)\/([^\/#?]+)/i);
    if (fullMatch) {
      return {
        owner: fullMatch[1],
        repo: fullMatch[2]
      };
    }

    // 2. Short format pattern matching: owner/repo
    const shortMatch = cleaned.match(/^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)$/);
    if (shortMatch && !cleaned.includes('://')) {
      return {
        owner: shortMatch[1],
        repo: shortMatch[2]
      };
    }
  } catch (e) {
    return null;
  }
  return null;
}

// Recursive file tree fetcher from GitHub REST API
export async function fetchGitHubRepoTree(owner: string, repo: string): Promise<string[]> {
  try {
    const headers: Record<string, string> = {
      'User-Agent': 'Branchdeck-Codebase-Analyzer'
    };
    const token = process.env.GITHUB_TOKEN || process.env.GITHUB_API || process.env.NEXT_PUBLIC_GITHUB_TOKEN;
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const repoRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers });
    if (!repoRes.ok) {
      if (repoRes.status === 403) throw new Error('GitHub API rate limit exceeded. Please try again later or configure a GITHUB_TOKEN.');
      if (repoRes.status === 404) throw new Error(`GitHub repository "${owner}/${repo}" not found or private.`);
      throw new Error(`GitHub API error: ${repoRes.status} ${repoRes.statusText}`);
    }
    const repoData = await repoRes.json();
    const defaultBranch = repoData.default_branch || 'main';

    const treeRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/${defaultBranch}?recursive=1`, { headers });
    if (!treeRes.ok) {
      if (treeRes.status === 403) throw new Error('GitHub API rate limit exceeded on tree fetch.');
      throw new Error('Failed to retrieve repository file tree');
    }
    const treeData = await treeRes.json();

    if (!treeData.tree) return [];
    
    return treeData.tree
      .filter((node: any) => node.type === 'blob')
      .map((node: any) => node.path);
  } catch (e) {
    console.error('Error fetching from GitHub API:', e);
    throw e;
  }
}

// Builds a realistic, highly-connected dependency and call graph from any workspace file tree
export function generateCallGraphFromFiles(
  files: string[],
  repoId: string = 'local-repo',
  commitSha: string = 'local-commit'
): { nodes: CallGraphNode[]; edges: CallGraphEdge[] } {
  const nodes: CallGraphNode[] = files.map((file) => {
    const filename = file.split('/').pop() || file;
    const cleanName = filename.replace(/\.[^/.]+$/, ""); // Strip file extension
    let type: 'ui' | 'api' | 'service' | 'db' | 'external' | 'worker' = 'service';

    const pathLower = file.toLowerCase();
    if (pathLower.includes('page') || pathLower.includes('layout') || pathLower.includes('view') || pathLower.endsWith('.css') || pathLower.includes('screen') || pathLower.includes('component') || pathLower.includes('components/')) {
      type = 'ui';
    } else if (pathLower.includes('controller') || pathLower.includes('route') || pathLower.includes('api/') || pathLower.includes('endpoint')) {
      type = 'api';
    } else if (pathLower.includes('db/') || pathLower.includes('model') || pathLower.includes('entity') || pathLower.includes('repository') || pathLower.includes('schema') || pathLower.includes('db-') || pathLower.includes('database') || pathLower.includes('sql')) {
      type = 'db';
    } else if (pathLower.includes('cron') || pathLower.includes('worker') || pathLower.includes('job') || pathLower.includes('task')) {
      type = 'worker';
    } else if (pathLower.includes('adapter') || pathLower.includes('external') || pathLower.includes('client') || pathLower.includes('sdk')) {
      type = 'external';
    }

    return {
      id: `${repoId}:${commitSha}:${file}`,
      label: cleanName,
      file: file,
      type,
      note: `Module: ${file}`
    };
  });

  const edges: CallGraphEdge[] = [];

  // Construct real structural relationships based on module paths and directory imports
  nodes.forEach(sourceNode => {
    const sourceFile = sourceNode.file;
    const sourceDir = sourceFile.substring(0, Math.max(0, sourceFile.lastIndexOf('/')));
    const sourceFileName = sourceFile.split('/').pop() || '';
    const sourceCleanName = sourceFileName.replace(/\.[^/.]+$/, "").toLowerCase();

    nodes.forEach(targetNode => {
      if (sourceNode.id === targetNode.id) return;

      const targetFile = targetNode.file;
      const targetDir = targetFile.substring(0, Math.max(0, targetFile.lastIndexOf('/')));
      const targetFileName = targetFile.split('/').pop() || '';
      const targetCleanName = targetFileName.replace(/\.[^/.]+$/, "").toLowerCase();

      let shouldConnect = false;
      let label = 'imports';

      // 1. UI pages / components import API routes, components, or services
      if (sourceNode.type === 'ui' && (targetNode.type === 'api' || targetNode.type === 'service')) {
        if (sourceDir === targetDir || targetFile.includes('api') || targetFile.includes('lib') || targetFile.includes('services')) {
          shouldConnect = true;
          label = 'uses';
        }
      }

      // 2. API endpoints delegate to services or models
      if (sourceNode.type === 'api' && (targetNode.type === 'service' || targetNode.type === 'db')) {
        if (sourceDir === targetDir || targetFile.includes('services') || targetFile.includes('db') || targetFile.includes('lib')) {
          shouldConnect = true;
          label = 'delegates to';
        }
      }

      // 3. Services query DB models or call external adapters
      if (sourceNode.type === 'service' && (targetNode.type === 'db' || targetNode.type === 'external')) {
        if (sourceDir === targetDir || targetFile.includes('db') || targetFile.includes('model') || targetFile.includes('adapter')) {
          shouldConnect = true;
          label = targetNode.type === 'db' ? 'queries' : 'uses adapter';
        }
      }

      // 4. Files sharing parent folder directory
      if (sourceDir !== '' && sourceDir === targetDir) {
        // Connect pages/components to sibling helpers/styles
        if (sourceFileName.endsWith('.tsx') || sourceFileName.endsWith('.jsx')) {
          if (targetFileName.endsWith('.css') || targetCleanName.includes(sourceCleanName)) {
            shouldConnect = true;
            label = 'styles/imports';
          }
        }
      }

      // 5. Explicit path or filename inclusion
      if (targetCleanName.length > 3 && sourceFile.toLowerCase().includes(targetCleanName)) {
        shouldConnect = true;
        label = 'imports';
      }

      if (shouldConnect) {
        const exists = edges.some(e => e.from === sourceNode.id && e.to === targetNode.id);
        if (!exists) {
          edges.push({
            from: sourceNode.id,
            to: targetNode.id,
            label,
            animated: true
          });
        }
      }
    });
  });

  return { nodes, edges };
}

