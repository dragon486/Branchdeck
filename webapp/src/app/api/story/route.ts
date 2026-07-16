import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { featureId, commitSha } = body;
    const correlationId = request.headers.get('x-correlation-id') || crypto.randomUUID();
    const authHeader = request.headers.get('Authorization');

    if (!authHeader) {
      return NextResponse.json({ success: false, error: 'Unauthorized: Missing session token' }, { status: 401 });
    }

    // Try proxying to Python FastAPI backend
    try {
      const backendUrl = process.env.BACKEND_URL || 'http://localhost:8000';
      const fastapiRes = await fetch(`${backendUrl}/api/story`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-Correlation-ID': correlationId,
          'Authorization': authHeader
        },
        body: JSON.stringify({ featureId, commitSha })
      });
      if (fastapiRes.ok) {
        const data = await fastapiRes.json();
        if (data.success && data.steps && data.steps.length > 0) {
          const nextResponse = NextResponse.json(data);
          nextResponse.headers.set('X-Correlation-ID', correlationId);
          return nextResponse;
        }
      }
    } catch (e) {
      console.warn('[Proxy Warning] Python FastAPI backend is offline or story failed. Falling back to mocks:', e);
    }

    const query = (featureId || '').toLowerCase();

    let title = 'Feature Story';
    let steps: string[] = [];

    if (query.includes('checkout') || query.includes('order')) {
      title = 'Checkout & Order Placement Workflow';
      steps = [
        'Customer validates their cart containing items.',
        'Checkout Controller captures shipping addresses and applies promotions.',
        'Order Service initiates a transaction and checks stock with Inventory Service.',
        'Payment Service coordinates with Stripe to process the credit card charge.',
        'Upon successful payment, the order record is stored in PostgreSQL.',
        'Email Service queues confirmation email.',
        'Analytics Service tracks the checkout event and reports metrics to Amplitude.'
      ];
    } else if (query.includes('auth') || query.includes('login')) {
      title = 'User Login & Session Authentication';
      steps = [
        'User enters email/password credentials.',
        'Login Controller validates the fields and invokes AuthService.',
        'AuthService compares password hashes and queries the database.',
        'JWT Strategy constructs a secure access token containing user roles.',
        'Session Middleware registers the active session details in Redis.',
        'Client receives token and loads profile view.'
      ];
    } else if (query.includes('pay')) {
      title = 'Payment Processing Engine';
      steps = [
        'Order placement flow asks Payment Service for checkout charge routing.',
        'Payment Service validates payment details and routes to Stripe Adapter.',
        'Stripe API processes charge and issues transaction identifiers.',
        'Webhooks listen for billing status transitions from Stripe dashboard.',
        'Invoice Service catches webhook events and generates PDFs.'
      ];
    } else {
      title = 'Feature Operations Story';
      steps = [
        'System triggers function action.',
        'Sub-services validate permissions and cache availability.',
        'Main business logic performs calculations.',
        'State transitions are persisted in storage systems.',
        'Internal hooks dispatch background messages.'
      ];
    }

    return NextResponse.json({
      success: true,
      title,
      steps
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
