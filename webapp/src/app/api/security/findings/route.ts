import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const correlationId = request.headers.get('x-correlation-id') || crypto.randomUUID();

  try {
    const authHeader = request.headers.get('Authorization');
    const { searchParams } = new URL(request.url);
    const commitSha = searchParams.get('commitSha');

    if (!authHeader) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: Missing session token', code: 'no_auth' },
        { status: 401 }
      );
    }

    const backendUrl = process.env.BACKEND_URL || 'http://localhost:8000';
    const targetUrl = `${backendUrl}/api/security/findings${commitSha ? `?commit_sha=${encodeURIComponent(commitSha)}` : ''}`;

    let fastapiRes: Response;
    try {
      fastapiRes = await fetch(targetUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-Correlation-ID': correlationId,
          'Authorization': authHeader,
        },
        signal: AbortSignal.timeout(8000),
      });
    } catch (networkErr: any) {
      // Backend is offline or unreachable
      const res = NextResponse.json(
        {
          success: false,
          error: 'backend_offline',
          message: 'Backend is not reachable. Start the backend server to view security findings.',
        },
        { status: 503 }
      );
      res.headers.set('X-Correlation-ID', correlationId);
      return res;
    }

    if (fastapiRes.ok) {
      const data = await fastapiRes.json();
      const res = NextResponse.json(data);
      res.headers.set('X-Correlation-ID', correlationId);
      return res;
    }

    // Auth failure
    if (fastapiRes.status === 401 || fastapiRes.status === 403) {
      const res = NextResponse.json(
        { success: false, error: 'auth_required', message: 'Authentication required. Please sign in and run an analysis first.' },
        { status: fastapiRes.status }
      );
      res.headers.set('X-Correlation-ID', correlationId);
      return res;
    }

    // No data yet — backend returned 404 / empty
    if (fastapiRes.status === 404) {
      const res = NextResponse.json(
        { success: true, findings: [], tags: [], commit_sha: null },
      );
      res.headers.set('X-Correlation-ID', correlationId);
      return res;
    }

    const errorData = await fastapiRes.json().catch(() => ({ detail: 'Backend error' }));
    const res = NextResponse.json(
      { success: false, error: errorData.detail || 'Backend error' },
      { status: fastapiRes.status }
    );
    res.headers.set('X-Correlation-ID', correlationId);
    return res;

  } catch (err: any) {
    const res = NextResponse.json(
      { success: false, error: err.message || 'Internal server error' },
      { status: 500 }
    );
    res.headers.set('X-Correlation-ID', correlationId);
    return res;
  }
}
