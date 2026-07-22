import { NextResponse } from 'next/server';
import { parseRepoUrl, fetchGitHubCommits, fetchGitHubContents } from '@/lib/github';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { functionName, commitSha, repoUrl } = body;
    const correlationId = request.headers.get('x-correlation-id') || crypto.randomUUID();

    const repoInfo = parseRepoUrl(repoUrl);
    
    if (repoInfo && functionName) {
      const githubToken = process.env.GITHUB_API || '';
      try {
        const contents = await fetchGitHubContents(repoInfo.owner, repoInfo.repo, functionName, githubToken);
        
        let nodes = [];
        let edges = [];
        
        if (Array.isArray(contents)) {
          nodes.push({
            id: functionName,
            label: functionName.split('/').pop() || functionName,
            file: functionName,
            type: 'ui',
            note: 'Directory contents'
          });

          const items = contents.slice(0, 8);
          for (const item of items) {
            nodes.push({
              id: item.path,
              label: item.name,
              file: item.path,
              type: item.type === 'dir' ? 'service' : 'api',
              note: `Module: ${item.path}`
            });

            edges.push({
              from: functionName,
              to: item.path,
              label: 'contains'
            });
          }
          
          return NextResponse.json({ success: true, nodes, edges });
        } else if (contents && contents.name) {
          nodes.push({
            id: functionName,
            label: contents.name,
            file: functionName,
            type: 'api',
            note: `File module: ${functionName}`
          });
          return NextResponse.json({ success: true, nodes, edges: [] });
        }
      } catch (err) {
        console.error('GitHub fetch failed for callflow:', err);
      }
    }

    return NextResponse.json({
      success: true,
      nodes: [],
      edges: []
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
