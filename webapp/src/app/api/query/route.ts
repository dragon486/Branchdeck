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
      console.warn('[Proxy Warning] Python FastAPI backend is offline. Trying native Gemini API...', e);
      
      const apiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;
      if (apiKey) {
        try {
          const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{
                parts: [{
                  text: `You are an expert Google Senior Software Architect analyzing repository logic. Answer the user developer query clearly and structurally in 4-5 key bullet points:\n\nUser Query: "${queryText}"`
                }]
              }]
            })
          });

          if (geminiRes.ok) {
            const geminiData = await geminiRes.json();
            const answerText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
            if (answerText) {
              return NextResponse.json({
                success: true,
                answer: answerText,
                provenance: 'database-llm'
              });
            }
          }
        } catch (geminiErr) {
          console.error('Gemini API direct call error:', geminiErr);
        }
      }

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
