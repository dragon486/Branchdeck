import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const correlationId = request.headers.get('x-correlation-id') || crypto.randomUUID();
    const authHeader = request.headers.get('Authorization');
    const { searchParams } = new URL(request.url);
    const commitSha = searchParams.get('commitSha');

    if (!authHeader) {
      return NextResponse.json({ success: false, error: 'Unauthorized: Missing session token' }, { status: 401 });
    }

    const backendUrl = process.env.BACKEND_URL || 'http://localhost:8000';
    const targetUrl = `${backendUrl}/api/security/findings${commitSha ? `?commit_sha=${encodeURIComponent(commitSha)}` : ''}`;

    const fastapiRes = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Correlation-ID': correlationId,
        'Authorization': authHeader,
      },
    });

    if (fastapiRes.ok) {
      const data = await fastapiRes.json();
      const res = NextResponse.json(data);
      res.headers.set('X-Correlation-ID', correlationId);
      return res;
    }

    const errorData = await fastapiRes.json().catch(() => ({ detail: 'Failed to fetch security findings' }));
    return NextResponse.json({ success: false, error: errorData.detail || 'Backend error' }, { status: fastapiRes.status });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
