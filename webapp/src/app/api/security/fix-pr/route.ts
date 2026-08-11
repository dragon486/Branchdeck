import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const correlationId = request.headers.get('x-correlation-id') || crypto.randomUUID();
    const authHeader = request.headers.get('Authorization');

    if (!authHeader) {
      return NextResponse.json({ success: false, error: 'Unauthorized: Missing session token' }, { status: 401 });
    }

    const backendUrl = process.env.BACKEND_URL || 'http://localhost:8000';

    const fastapiRes = await fetch(`${backendUrl}/api/security/fix-pr`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Correlation-ID': correlationId,
        'Authorization': authHeader,
      },
      body: JSON.stringify(body),
    });

    if (fastapiRes.ok) {
      const data = await fastapiRes.json();
      const res = NextResponse.json(data);
      res.headers.set('X-Correlation-ID', correlationId);
      return res;
    }

    const errorData = await fastapiRes.json().catch(() => ({ detail: 'Failed to create fix PR' }));
    return NextResponse.json({ success: false, error: errorData.detail || 'Backend error' }, { status: fastapiRes.status });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
