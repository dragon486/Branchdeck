import { NextResponse } from 'next/server';
import { ECOMMERCE_DEMO_CALLS } from '@/lib/analyzer';
import { parseRepoUrl, fetchGitHubCommits, fetchGitHubContents } from '@/lib/github';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { functionName, commitSha, repoUrl } = body;
    const correlationId = request.headers.get('x-correlation-id') || crypto.randomUUID();
    const authHeader = request.headers.get('Authorization');

    // Default to main branch if repoUrl is valid
    const repoInfo = parseRepoUrl(repoUrl);
    
    if (repoInfo) {
      const githubToken = process.env.GITHUB_API || '';
      try {
        // Fetch contents of the selected file/folder
        const contents = await fetchGitHubContents(repoInfo.owner, repoInfo.repo, functionName, githubToken);
        
        let nodes = [];
        let edges = [];
        
        // If it's a directory, list its files as nodes
        if (Array.isArray(contents)) {
          // Parent node for the directory itself
          nodes.push({
            id: functionName,
            label: functionName.split('/').pop() || functionName,
            file: functionName,
            type: 'ui',
            developer: { name: 'System', role: 'Directory', avatar: 'DIR' },
            note: 'Directory contents flow'
          });

          // Fetch commit data for up to 5 items to keep it fast
          const items = contents.slice(0, 5);
          for (const item of items) {
            try {
              const commits = await fetchGitHubCommits(repoInfo.owner, repoInfo.repo, item.path, githubToken, 1);
              const author = commits[0]?.commit?.author?.name || 'Unknown';
              const email = commits[0]?.commit?.author?.email || '';
              const initial = author.substring(0, 2).toUpperCase();
              
              nodes.push({
                id: item.path,
                label: item.name,
                file: item.path,
                type: item.type === 'dir' ? 'service' : 'api',
                developer: { name: author, role: 'Contributor', avatar: initial },
                note: commits[0]?.commit?.message || 'No commit message'
              });

              edges.push({
                from: functionName,
                to: item.path,
                label: 'contains'
              });
            } catch (err) {
              console.warn('Failed to fetch commit for', item.path);
            }
          }
          
          return NextResponse.json({ success: true, nodes, edges });
        } else if (contents && contents.name) {
          // It's a single file
          const commits = await fetchGitHubCommits(repoInfo.owner, repoInfo.repo, functionName, githubToken, 1);
          const author = commits[0]?.commit?.author?.name || 'Unknown';
          const initial = author.substring(0, 2).toUpperCase();
          
          nodes.push({
            id: functionName,
            label: contents.name,
            file: functionName,
            type: 'api',
            developer: { name: author, role: 'Author', avatar: initial },
            note: commits[0]?.commit?.message || 'File history'
          });
          
          // Dummy edge to itself to render a node properly
          edges.push({
            from: functionName,
            to: functionName,
            label: 'self'
          });

          return NextResponse.json({ success: true, nodes, edges });
        }
      } catch (err) {
        console.error('GitHub fetch failed for callflow:', err);
      }
    }

    // Fallback if no repo URL or error
    return NextResponse.json({
      success: true,
      nodes: ECOMMERCE_DEMO_CALLS.nodes,
      edges: ECOMMERCE_DEMO_CALLS.edges
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
