import { NextResponse } from 'next/server';

export async function GET(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  try {
    const { jobId } = await params;
    const authHeader = request.headers.get('Authorization');

    if (!authHeader) {
      return NextResponse.json({ success: false, error: 'Unauthorized: Missing session token' }, { status: 401 });
    }

    const backendUrl = process.env.BACKEND_URL || 'http://localhost:8000';
    const fastapiRes = await fetch(`${backendUrl}/api/analyze/status/${jobId}`, {
      method: 'GET',
      headers: {
        'Authorization': authHeader
      }
    });

    if (fastapiRes.ok) {
      const data = await fastapiRes.json();
      return NextResponse.json(data);
    } else {
      const errData = await fastapiRes.json().catch(() => ({ detail: 'Failed to fetch job status' }));
      return NextResponse.json({ success: false, error: errData.detail || 'Failed to fetch job status' }, { status: fastapiRes.status });
    }
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
