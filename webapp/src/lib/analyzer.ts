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

// Helper: Filter out non-code assets and rank high-value architecture files for large scale repos
export function filterHighValueCodeFiles(files: string[], maxFiles: number = 180): string[] {
  const IGNORED_EXTS = new Set([
    '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp', '.woff', '.woff2', '.ttf', '.eot',
    '.mp4', '.pdf', '.zip', '.tar', '.gz', '.lock', '.json', '.md', '.txt', '.csv', '.map',
    '.min.js', '.min.css', '.d.ts', '.po', '.pot', '.mo', '.yml', '.yaml', '.toml'
  ]);

  const IGNORED_DIRS = [
    'node_modules/', 'vendor/', 'third_party/', '.git/', 'dist/', 'build/', '.next/', '.out/',
    '__tests__/', 'test/', 'tests/', 'fixtures/', 'spec/', 'coverage/', 'docs/', '.github/'
  ];

  const codeFiles = files.filter(f => {
    const fLower = f.toLowerCase();
    if (IGNORED_DIRS.some(dir => fLower.includes(dir))) return false;
    const extMatch = fLower.match(/\.[^/.]+$/);
    if (extMatch && IGNORED_EXTS.has(extMatch[0])) return false;
    return true;
  });

  if (codeFiles.length <= maxFiles) return codeFiles;

  // Rank files by architectural importance for massive repositories (e.g. Supabase, Monorepos)
  const scoreFile = (file: string): number => {
    const fLower = file.toLowerCase();
    let score = 0;
    if (fLower.includes('controller') || fLower.includes('route') || fLower.includes('api/')) score += 100;
    if (fLower.includes('service') || fLower.includes('handler') || fLower.includes('adapter')) score += 90;
    if (fLower.includes('model') || fLower.includes('schema') || fLower.includes('entity') || fLower.includes('db/')) score += 85;
    if (fLower.includes('worker') || fLower.includes('cron') || fLower.includes('job')) score += 80;
    if (fLower.includes('app/') || fLower.includes('pages/') || fLower.includes('page.') || fLower.includes('main.')) score += 70;
    if (fLower.includes('components/')) score += 40;
    if (fLower.includes('utils/') || fLower.includes('helpers/')) score += 20;
    return score;
  };

  const ranked = [...codeFiles].sort((a, b) => scoreFile(b) - scoreFile(a));
  return ranked.slice(0, maxFiles);
}

// Enterprise-grade feature group generator supporting massive repositories and monorepos
export function generateFeaturesFromFiles(rawFiles: string[]): FeatureNode[] {
  const files = Array.from(new Set(rawFiles.map(normalizePath).filter(Boolean)));
  const codeFiles = filterHighValueCodeFiles(files, 500);

  // Check for Monorepo directory patterns (e.g., packages/*, apps/*, services/*, studio/*, realtime/*)
  const packageMap: Record<string, string[]> = {};
  codeFiles.forEach(file => {
    const parts = file.split('/');
    if (parts.length > 2 && (parts[0] === 'packages' || parts[0] === 'apps' || parts[0] === 'services' || parts[0] === 'modules')) {
      const pkgKey = `${parts[0]}/${parts[1]}`;
      if (!packageMap[pkgKey]) packageMap[pkgKey] = [];
      packageMap[pkgKey].push(file);
    }
  });

  const monorepoKeys = Object.keys(packageMap);
  if (monorepoKeys.length >= 2) {
    const colors = ['#0f172a', '#0284c7', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#64748b'];
    return monorepoKeys.map((pkg, idx) => {
      const pkgFiles = packageMap[pkg];
      const cleanTitle = pkg.split('/')[1].replace(/[-_]/g, ' ').toUpperCase();
      return {
        id: `pkg-${pkg.replace('/', '-')}`,
        name: cleanTitle,
        description: `Monorepo package grouping ${pkgFiles.length} domain modules.`,
        files: pkgFiles.slice(0, 35),
        color: colors[idx % colors.length]
      };
    });
  }

  // Categorize by architectural domains
  const features: Record<string, { name: string; desc: string; files: string[]; color: string }> = {
    api: { name: 'API & Controllers', desc: 'Controllers, route handlers, and REST/GraphQL endpoints.', color: '#f59e0b', files: [] },
    services: { name: 'Business Logic & Services', desc: 'Core domain services, managers, and adapters.', color: '#0284c7', files: [] },
    data: { name: 'Data Layer & Schemas', desc: 'Database connections, ORM models, and migrations.', color: '#0f172a', files: [] },
    ui: { name: 'User Interface', desc: 'Client components, pages, and layout views.', color: '#10b981', files: [] },
    utils: { name: 'Utilities & System', desc: 'Common helpers, config, and background workers.', color: '#06b6d4', files: [] }
  };

  codeFiles.forEach(file => {
    const fLower = file.toLowerCase();
    if (fLower.includes('db/') || fLower.includes('model') || fLower.includes('schema') || fLower.includes('entity') || fLower.includes('repository')) {
      features.data.files.push(file);
    } else if (fLower.includes('controller') || fLower.includes('route') || fLower.includes('api/') || fLower.includes('endpoint')) {
      features.api.files.push(file);
    } else if (fLower.includes('service') || fLower.includes('handler') || fLower.includes('adapter') || fLower.includes('manager')) {
      features.services.files.push(file);
    } else if (fLower.includes('app/') || fLower.includes('pages/') || fLower.includes('component') || fLower.includes('view') || fLower.endsWith('.css')) {
      features.ui.files.push(file);
    } else {
      features.utils.files.push(file);
    }
  });

  return Object.entries(features)
    .filter(([_, data]) => data.files.length > 0)
    .map(([id, data]) => ({
      id,
      name: data.name,
      description: data.desc,
      files: data.files.slice(0, 35),
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

export function normalizePath(path: string): string {
  if (!path) return '';
  let normalized = path.replace(/\\/g, '/').trim();
  while (normalized.startsWith('./') || normalized.startsWith('/')) {
    if (normalized.startsWith('./')) normalized = normalized.substring(2);
    else if (normalized.startsWith('/')) normalized = normalized.substring(1);
  }
  return normalized;
}

// Scalable O(N) dependency and call graph generator capable of handling massive repositories (e.g. Supabase, Next.js, Monorepos)
export function generateCallGraphFromFiles(
  rawFiles: string[],
  repoId: string = 'local-repo',
  commitSha: string = 'local-commit'
): { nodes: CallGraphNode[]; edges: CallGraphEdge[] } {
  // Deduplicate and normalize input file paths
  const files = Array.from(new Set(rawFiles.map(normalizePath).filter(Boolean)));
  
  // 1. High-value file culling
  const targetFiles = filterHighValueCodeFiles(files, 150);

  // 2. Build Nodes
  const nodes: CallGraphNode[] = targetFiles.map((file) => {
    const filename = file.split('/').pop() || file;
    const cleanName = filename.replace(/\.[^/.]+$/, "");
    let type: 'ui' | 'api' | 'service' | 'db' | 'external' | 'worker' = 'service';

    const pathLower = file.toLowerCase();
    if (pathLower.includes('page') || pathLower.includes('layout') || pathLower.includes('view') || pathLower.endsWith('.css') || pathLower.includes('screen') || pathLower.includes('component')) {
      type = 'ui';
    } else if (pathLower.includes('controller') || pathLower.includes('route') || pathLower.includes('api/') || pathLower.includes('endpoint')) {
      type = 'api';
    } else if (pathLower.includes('db/') || pathLower.includes('model') || pathLower.includes('entity') || pathLower.includes('repository') || pathLower.includes('schema') || pathLower.includes('sql')) {
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

  // 3. Fast O(N) Hash-Indexed Edge Construction
  const dirMap = new Map<string, CallGraphNode[]>();
  const typeMap = new Map<string, CallGraphNode[]>();
  const nameMap = new Map<string, CallGraphNode>();

  nodes.forEach(node => {
    const dir = node.file.substring(0, Math.max(0, node.file.lastIndexOf('/')));
    if (!dirMap.has(dir)) dirMap.set(dir, []);
    dirMap.get(dir)!.push(node);

    if (!typeMap.has(node.type)) typeMap.set(node.type, []);
    typeMap.get(node.type)!.push(node);

    nameMap.set(node.label.toLowerCase(), node);
  });

  const edges: CallGraphEdge[] = [];
  const edgeSet = new Set<string>();

  const addEdge = (fromId: string, toId: string, label: string) => {
    if (fromId === toId) return;
    const key = `${fromId}->${toId}`;
    if (!edgeSet.has(key) && edges.length < 200) {
      edgeSet.add(key);
      edges.push({
        from: fromId,
        to: toId,
        label,
        animated: false
      });
    }
  };

  // Connect logical architecture layers using indexed bucketing
  nodes.forEach(sourceNode => {
    const dir = sourceNode.file.substring(0, Math.max(0, sourceNode.file.lastIndexOf('/')));

    // 1. Connect sibling files sharing parent folder
    const siblings = dirMap.get(dir) || [];
    siblings.forEach(targetNode => {
      if (sourceNode.id !== targetNode.id) {
        if (sourceNode.type === 'ui' && (targetNode.type === 'service' || targetNode.type === 'api')) {
          addEdge(sourceNode.id, targetNode.id, 'uses');
        } else if (sourceNode.type === 'api' && (targetNode.type === 'service' || targetNode.type === 'db')) {
          addEdge(sourceNode.id, targetNode.id, 'delegates to');
        } else if (sourceNode.type === 'service' && (targetNode.type === 'db' || targetNode.type === 'external')) {
          addEdge(sourceNode.id, targetNode.id, targetNode.type === 'db' ? 'queries' : 'uses adapter');
        }
      }
    });
  });

  return { nodes, edges };
}

