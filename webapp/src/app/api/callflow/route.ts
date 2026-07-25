import { NextResponse } from 'next/server';
import { parseRepoUrl } from '@/lib/github';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { functionName, commitSha, repoUrl } = body;
    const correlationId = request.headers.get('x-correlation-id') || crypto.randomUUID();
    const authHeader = request.headers.get('Authorization');

    if (!authHeader) {
      return NextResponse.json({ success: false, error: 'Unauthorized: Missing session token' }, { status: 401 });
    }

    // 1. Primary: Proxy to FastAPI backend (has real tree-sitter parsed call graph in DB)
    try {
      const backendUrl = process.env.BACKEND_URL || 'http://localhost:8000';
      const fastapiRes = await fetch(`${backendUrl}/api/callflow`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Correlation-ID': correlationId,
          'Authorization': authHeader,
        },
        body: JSON.stringify({ functionName, commitSha }),
      });
      if (fastapiRes.ok) {
        const data = await fastapiRes.json();
        if (data.success && (data.nodes?.length > 0 || data.edges?.length > 0)) {
          const res = NextResponse.json(data);
          res.headers.set('X-Correlation-ID', correlationId);
          return res;
        }
      }
    } catch (e) {
      console.warn('[Callflow] FastAPI offline, falling back to GitHub contents:', e);
    }

    // 2. Fallback: GitHub Contents API (shows directory/file structure when FastAPI is offline)
    const repoInfo = parseRepoUrl(repoUrl);
    if (repoInfo && functionName) {
      const githubToken = process.env.GITHUB_API || process.env.GITHUB_TOKEN || '';
      const headers: Record<string, string> = {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Branchdeck-App',
      };
      if (githubToken) headers['Authorization'] = `Bearer ${githubToken}`;

      try {
        const res = await fetch(
          `https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}/contents/${encodeURIComponent(functionName)}`,
          { headers }
        );

        if (res.ok) {
          const contents = await res.json();
          const nodes = [];
          const edges = [];

          if (Array.isArray(contents)) {
            // Directory listing — show as a mini hub-and-spoke graph
            nodes.push({
              id: functionName,
              label: functionName.split('/').pop() || functionName,
              file: functionName,
              type: 'api',
              note: `Directory: ${functionName}`,
              subtitle: functionName,
            });
            for (const item of contents.slice(0, 12)) {
              nodes.push({
                id: item.path,
                label: item.name,
                file: item.path,
                type: item.type === 'dir' ? 'service' : 'api',
                note: `Module: ${item.path}`,
                subtitle: item.path,
              });
              edges.push({ from: functionName, to: item.path, label: 'contains', animated: false });
            }
          } else if (contents?.name) {
            // Single file
            nodes.push({
              id: functionName,
              label: contents.name,
              file: functionName,
              type: 'api',
              note: `File: ${functionName}`,
              subtitle: functionName,
            });
          }

          return NextResponse.json({ success: true, nodes, edges, source: 'github-contents' });
        }
      } catch (githubErr) {
        console.error('[Callflow] GitHub contents fetch failed:', githubErr);
      }
    }

    // 3. Empty safe response — the graph just shows nothing rather than crashing
    return NextResponse.json({ success: true, nodes: [], edges: [], source: 'empty' });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
