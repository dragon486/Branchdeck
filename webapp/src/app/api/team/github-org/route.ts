import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

/**
 * GitHub Organization Member Sync
 * Fetches public members of a GitHub org and adds them as workspace collaborators.
 * Requires GITHUB_TOKEN for private orgs.
 */
export async function POST(request: Request) {
  try {
    const { org, workspaceId } = await request.json();
    const authHeader = request.headers.get('Authorization');

    if (!authHeader) {
      return NextResponse.json({ success: false, error: 'Unauthorized: Missing token' }, { status: 401 });
    }

    if (!org?.trim()) {
      return NextResponse.json({ success: false, error: 'Organization name is required' }, { status: 400 });
    }

    const githubToken = process.env.GITHUB_TOKEN;
    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };
    if (githubToken) headers['Authorization'] = `Bearer ${githubToken}`;

    // Fetch org members from GitHub API
    const res = await fetch(`https://api.github.com/orgs/${encodeURIComponent(org)}/members?per_page=30`, {
      headers,
    });

    if (!res.ok) {
      const msg = res.status === 404
        ? `Organization "${org}" not found on GitHub.`
        : res.status === 403
          ? 'GitHub API rate limit exceeded. Please provide a GITHUB_TOKEN.'
          : `GitHub API error: ${res.status}`;
      return NextResponse.json({ success: false, error: msg }, { status: res.status });
    }

    const members = await res.json();

    // Map and persist members directly to organization memberships in the database
    const memberships = members.map((m: any) => ({
      user_id: `github:${m.login}`,
      organization_id: workspaceId || 'default',
      role: 'Developer'
    }));

    if (memberships.length > 0) {
      const { error: dbError } = await supabaseAdmin
        .from('org_memberships')
        .upsert(memberships, { onConflict: 'user_id,organization_id' });
        
      if (dbError) {
        console.error('[GitHub Org Sync API] Database save failed:', dbError);
        return NextResponse.json({ success: false, error: `Failed to persist membership sync: ${dbError.message}` }, { status: 500 });
      }
    }

    return NextResponse.json({
      success: true,
      org,
      workspaceId,
      syncedCount: members.length,
      members: members.map((m: any) => ({
        githubLogin: m.login,
        githubAvatar: m.avatar_url,
        profileUrl: m.html_url,
      })),
      message: `Successfully synced and persisted ${members.length} members from GitHub organization "${org}".`,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
