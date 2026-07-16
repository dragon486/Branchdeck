import { NextResponse } from 'next/server';
import { ECOMMERCE_DEMO_CALLS } from '@/lib/analyzer';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { functionName, commitSha } = body;
    const correlationId = request.headers.get('x-correlation-id') || crypto.randomUUID();
    const authHeader = request.headers.get('Authorization');

    if (!authHeader) {
      return NextResponse.json({ success: false, error: 'Unauthorized: Missing session token' }, { status: 401 });
    }

    // Try proxying to Python FastAPI backend
    try {
      const backendUrl = process.env.BACKEND_URL || 'http://localhost:8000';
      const fastapiRes = await fetch(`${backendUrl}/api/callflow`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-Correlation-ID': correlationId,
          'Authorization': authHeader
        },
        body: JSON.stringify({ functionName, commitSha })
      });
      if (fastapiRes.ok) {
        const data = await fastapiRes.json();
        if (data.success && data.nodes && data.nodes.length > 0) {
          const nextResponse = NextResponse.json({ ...data, provenance: 'database' });
          nextResponse.headers.set('X-Correlation-ID', correlationId);
          return nextResponse;
        }
      }
    } catch (e) {
      console.warn('[Proxy Warning] Python FastAPI backend is offline or callflow failed. Falling back to mocks:', e);
    }

    const query = (functionName || '').toLowerCase();

    // Custom flow paths for E-commerce MVP demo
    if (query.includes('login') || query.includes('auth')) {
      return NextResponse.json({
        success: true,
        nodes: [
          { 
            id: '1', 
            label: 'User Client', 
            file: 'Web App', 
            type: 'ui',
            developer: { name: 'Sarah Chen', role: 'Frontend Lead', avatar: 'SC' },
            note: 'Form submission. Sends login payload to backend.'
          },
          { 
            id: '2', 
            label: 'Login Controller', 
            file: 'src/auth/auth.controller.ts', 
            type: 'api',
            developer: { name: 'Alex River', role: 'API Lead', avatar: 'AR' },
            note: 'Validates fields and triggers AuthService.'
          },
          { 
            id: '3', 
            label: 'AuthService', 
            file: 'src/auth/auth.service.ts', 
            type: 'service',
            developer: { name: 'Arjun K.', role: 'Senior Engineer', avatar: 'AK' },
            note: 'Queries user tables and compares encrypted password hashes.'
          },
          { 
            id: '4', 
            label: 'JWT Strategy', 
            file: 'src/auth/strategies/jwt.strategy.ts', 
            type: 'service',
            developer: { name: 'Arjun K.', role: 'Senior Engineer', avatar: 'AK' },
            note: 'Issues signed tokens containing authentication claims.'
          },
          { 
            id: '5', 
            label: 'Session Middleware', 
            file: 'src/middleware/session.ts', 
            type: 'service',
            developer: { name: 'Elena Rostova', role: 'Backend Staff', avatar: 'ER' },
            note: 'Intercepts requests to verify session presence.'
          },
          { 
            id: '6', 
            label: 'Redis Cache', 
            file: 'Redis Session Store', 
            type: 'db',
            developer: { name: 'Arjun K.', role: 'Senior Engineer', avatar: 'AK' },
            note: 'Holds active sessions. Resets daily at 2AM.'
          }
        ],
        edges: [
          { from: '1', to: '2', label: 'POST /auth/login' },
          { from: '2', to: '3', label: 'login()' },
          { from: '3', to: '4', label: 'generateToken()' },
          { from: '3', to: '5', label: 'createSession()' },
          { from: '5', to: '6', label: 'setex()' }
        ]
      });
    }

    if (query.includes('payment') || query.includes('pay') || query.includes('stripe')) {
      return NextResponse.json({
        success: true,
        nodes: [
          { 
            id: '1', 
            label: 'OrderService', 
            file: 'src/orders/order.service.ts', 
            type: 'service',
            developer: { name: 'Elena Rostova', role: 'Backend Staff', avatar: 'ER' },
            note: 'Coordinates order state updates.'
          },
          { 
            id: '2', 
            label: 'PaymentService', 
            file: 'src/payments/payment.service.ts', 
            type: 'service',
            developer: { name: 'Marcus Vance', role: 'Payment Specialist', avatar: 'MV' },
            note: 'Maps active payment gateways (Stripe vs PayPal).'
          },
          { 
            id: '3', 
            label: 'StripeAdapter', 
            file: 'src/payments/stripe.adapter.ts', 
            type: 'external',
            developer: { name: 'Marcus Vance', role: 'Payment Specialist', avatar: 'MV' },
            note: 'Stripe token charging adapter.'
          },
          { 
            id: '4', 
            label: 'Stripe Webhook', 
            file: 'src/payments/webhook.controller.ts', 
            type: 'api',
            developer: { name: 'Alex River', role: 'API Lead', avatar: 'AR' },
            note: 'Listens to Stripe asynchronous payout success signals.'
          },
          { 
            id: '5', 
            label: 'Invoice Service', 
            file: 'src/orders/cron/billing.ts', 
            type: 'service',
            developer: { name: 'Dave Miller', role: 'Logistics Dev', avatar: 'DM' },
            note: 'Generates billing PDF receipts.'
          }
        ],
        edges: [
          { from: '1', to: '2', label: 'processPayment()' },
          { from: '2', to: '3', label: 'charge()' },
          { from: '3', to: '4', label: 'Stripe Webhook (async)' },
          { from: '4', to: '5', label: 'generateInvoice()' }
        ]
      });
    }

    // Default flow: checkout flow
    return NextResponse.json({
      success: true,
      nodes: ECOMMERCE_DEMO_CALLS.nodes,
      edges: ECOMMERCE_DEMO_CALLS.edges
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
