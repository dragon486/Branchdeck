import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limiter';
import { 
  ECOMMERCE_DEMO_FEATURES, 
  ECOMMERCE_DEMO_CALLS, 
  parseGitHubUrl, 
  fetchGitHubRepoTree, 
  generateFeaturesFromFiles,
  generateCallGraphFromFiles
} from '@/lib/analyzer';
import { generateCallGraphFromAST } from '@/lib/server-analyzer';

export async function POST(request: Request) {
  try {
    // Enforce 10 codebase analysis requests per minute rate limit per user/IP
    const rateCheck = checkRateLimit(request, 'analyze', { limit: 10, windowMs: 60 * 1000 });
    if (!rateCheck.allowed && rateCheck.response) {
      return rateCheck.response;
    }

    const body = await request.json();
    const { url, workspacePath, files: requestFiles } = body;
    const correlationId = request.headers.get('x-correlation-id') || crypto.randomUUID();
    const authHeader = request.headers.get('Authorization');

    if (!authHeader) {
      return NextResponse.json({ success: false, error: 'Unauthorized: Missing session token' }, { status: 401 });
    }

    // Try proxying to Python FastAPI backend
    try {
      const backendUrl = process.env.BACKEND_URL || 'http://localhost:8000';
      const fastapiRes = await fetch(`${backendUrl}/api/analyze`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-Correlation-ID': correlationId,
          'Authorization': authHeader
        },
        body: JSON.stringify(body)
      });
      if (fastapiRes.ok) {
        const data = await fastapiRes.json();
        const nextResponse = NextResponse.json(data);
        nextResponse.headers.set('X-Correlation-ID', correlationId);
        return nextResponse;
      }
    } catch (e) {
      console.warn('[Proxy Warning] Python FastAPI backend is offline. Falling back to Next.js local analysis:', e);
    }

    // Next.js Fallback if FastAPI is offline
    if (workspacePath && requestFiles && requestFiles.length > 0) {
      const generatedFeatures = generateFeaturesFromFiles(requestFiles);
      const { nodes: dynamicNodes, edges: dynamicEdges } = generateCallGraphFromAST(workspacePath, requestFiles);

      return NextResponse.json({
        success: true,
        source: 'local-workspace',
        features: generatedFeatures,
        callGraph: {
          nodes: dynamicNodes,
          edges: dynamicEdges
        }
      });
    }

    if (!url || url.trim() === '' || url === 'default') {
      return NextResponse.json({ success: false, error: 'Repository URL is required.' }, { status: 400 });
    }
    const targetUrl = url.trim();

    if (targetUrl === 'mock-ecommerce') {
      return NextResponse.json({
        success: true,
        source: 'mock-ecommerce',
        features: ECOMMERCE_DEMO_FEATURES,
        callGraph: ECOMMERCE_DEMO_CALLS
      });
    }

    const githubDetails = parseGitHubUrl(targetUrl);
    if (!githubDetails) {
      return NextResponse.json(
        { success: false, error: 'Invalid GitHub Repository URL structure.' },
        { status: 400 }
      );
    }

    try {
      const files = await fetchGitHubRepoTree(githubDetails.owner, githubDetails.repo);
      const generatedFeatures = generateFeaturesFromFiles(files);
      
      const repoId = `repo-${githubDetails.owner}-${githubDetails.repo}`;
      const commitSha = 'github-main';
      
      // Build a full, rich call graph dynamically based on all repository files
      const { nodes: dynamicNodes, edges: dynamicEdges } = generateCallGraphFromFiles(files, repoId, commitSha);

      return NextResponse.json({
        success: true,
        source: `${githubDetails.owner}/${githubDetails.repo}`,
        features: generatedFeatures,
        callGraph: {
          nodes: dynamicNodes,
          edges: dynamicEdges
        }
      });
    } catch (e: any) {
      return NextResponse.json({
        success: false,
        error: `Failed to access Github repo (possibly rate-limited or private). Error: ${e.message}`
      }, { status: 400 });
    }
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
