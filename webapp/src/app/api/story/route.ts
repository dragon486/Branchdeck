import { NextResponse } from 'next/server';
import { parseRepoUrl, fetchGitHubCommits } from '@/lib/github';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { featureId, commitSha, repoUrl } = body;
    const correlationId = request.headers.get('x-correlation-id') || crypto.randomUUID();
    
    const repoInfo = parseRepoUrl(repoUrl);

    if (repoInfo) {
      const githubToken = process.env.GITHUB_API || '';
      try {
        const commits = await fetchGitHubCommits(repoInfo.owner, repoInfo.repo, featureId, githubToken, 7);
        
        if (commits && commits.length > 0) {
          const title = `Story of ${featureId.split('/').pop()}`;
          const steps = commits.map((item: any) => {
            const author = item.commit.author.name || 'Unknown';
            const msg = item.commit.message.split('\n')[0]; // first line
            return `${author} implemented: "${msg}"`;
          });
          
          return NextResponse.json({
            success: true,
            title,
            steps,
            provenance: 'github-api'
          });
        }
      } catch (err) {
        console.error('GitHub fetch failed for story:', err);
      }
    }

    let title = 'Feature Story';
    let steps: string[] = ['No repository data available.', 'Failed to fetch from GitHub API.'];

    return NextResponse.json({
      success: true,
      title,
      steps
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
