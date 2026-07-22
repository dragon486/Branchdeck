import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { queryText, commitSha } = body;
    const correlationId = request.headers.get('x-correlation-id') || crypto.randomUUID();
    const authHeader = request.headers.get('Authorization');

    if (!authHeader) {
      return NextResponse.json({ success: false, error: 'Unauthorized: Missing session token' }, { status: 401 });
    }

    try {
      const backendUrl = process.env.BACKEND_URL || 'http://localhost:8000';
      const fastapiRes = await fetch(`${backendUrl}/api/query`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-Correlation-ID': correlationId,
          'Authorization': authHeader
        },
        body: JSON.stringify({ queryText, commitSha })
      });
      
      if (fastapiRes.ok) {
        const data = await fastapiRes.json();
        const nextResponse = NextResponse.json(data);
        nextResponse.headers.set('X-Correlation-ID', correlationId);
        return nextResponse;
      } else {
        const errText = await fastapiRes.text();
        let errMsg = 'FastAPI query failed';
        try {
          const parsed = JSON.parse(errText);
          errMsg = parsed.detail || parsed.error || errMsg;
        } catch {
          // ignore
        }
        return NextResponse.json({ success: false, error: errMsg }, { status: fastapiRes.status });
      }
    } catch (e: any) {
      console.warn('[Proxy Warning] Python FastAPI backend is offline. Utilizing client AST semantic search:', e);
      return NextResponse.json({ 
        success: true, 
        offline: true,
        answer: null 
      });
    }
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
