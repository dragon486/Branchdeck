import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

/**
 * GitHub Organization Member Sync
 * Fetches public members of a GitHub org and adds them as workspace collaborators.
 * Requires GITHUB_TOKEN for private orgs.
 *
 * Security: The target organization_id is resolved from the authenticated session,
 * never from the request body. The caller must hold an 'owner' or 'admin' role.
 */
export async function POST(request: Request) {
  try {
    const { org } = await request.json();
    const authHeader = request.headers.get('Authorization');

    if (!authHeader) {
      return NextResponse.json({ success: false, error: 'Unauthorized: Missing token' }, { status: 401 });
    }

    // 1. Resolve caller identity from Supabase session — do NOT trust body fields for org resolution
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Invalid authentication session' }, { status: 401 });
    }

    // 2. Resolve caller's org membership and role from database
    const { data: membership, error: memberError } = await supabaseAdmin
      .from('org_memberships')
      .select('organization_id, role')
      .eq('user_id', user.id)
      .single();

    if (memberError || !membership) {
      return NextResponse.json({ success: false, error: 'No organization membership found for this user' }, { status: 403 });
    }

    // 3. Enforce admin/owner permission before syncing
    const allowedRoles = ['owner', 'admin'];
    if (!allowedRoles.includes(membership.role.toLowerCase())) {
      return NextResponse.json(
        { success: false, error: `Forbidden: Only owners or admins can sync GitHub organization members (your role: ${membership.role})` },
        { status: 403 }
      );
    }

    const sessionOrgId = membership.organization_id;

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

    // Map members to the session-derived org (never body-supplied workspaceId)
    const memberships = members.map((m: any) => ({
      user_id: `github:${m.login}`,
      organization_id: sessionOrgId,  // Always use session-resolved org
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
      workspaceId: sessionOrgId,
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
