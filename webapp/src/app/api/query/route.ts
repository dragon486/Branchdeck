import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limiter';

export async function POST(request: Request) {
  try {
    // Enforce 15 queries per minute rate limit per user/IP
    const rateCheck = checkRateLimit(request, 'query', { limit: 15, windowMs: 60 * 1000 });
    if (!rateCheck.allowed && rateCheck.response) {
      return rateCheck.response;
    }

    const body = await request.json();
    const { queryText, commitSha } = body;
    const correlationId = request.headers.get('x-correlation-id') || crypto.randomUUID();
    const authHeader = request.headers.get('Authorization');

    if (!authHeader) {
      return NextResponse.json({ success: false, error: 'Unauthorized: Missing session token' }, { status: 401 });
    }

    // 1. Primary AI Intelligence Engine: Native Google Gemini 2.5 Flash API
    const apiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    if (apiKey) {
      try {
        const prompt = `You are Branchdeck AI, a Google Senior Principal Software Architect.
Analyze the codebase repository query and provide a clear, professional, step-by-step technical explanation in 4-5 bullet points.

Developer Question: "${queryText}"`;

        const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [{ text: prompt }]
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
        console.warn('[Gemini API Warning] Direct Gemini query failed, falling back to FastAPI/AST:', geminiErr);
      }
    }

    // 2. Secondary Backend: FastAPI Service
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
        if (data.success && data.answer) {
          const nextResponse = NextResponse.json(data);
          nextResponse.headers.set('X-Correlation-ID', correlationId);
          return nextResponse;
        }
      }
    } catch (e) {
      // FastAPI offline fallback
    }

    // 3. Fallback: Local AST Graph Analysis
    return NextResponse.json({ 
      success: true, 
      offline: true,
      answer: null 
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
