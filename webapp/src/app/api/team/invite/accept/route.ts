import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

/**
 * Invite Acceptance Endpoint
 *
 * POST /api/team/invite/accept
 *
 * Validates an invitation token and, if valid:
 * 1. Checks the token is not expired and not already accepted
 * 2. Marks the invitation as 'accepted' (single-use, prevents replay)
 * 3. Creates or updates an org_membership row for the invitee
 * 4. Returns the org context so the frontend can redirect into the workspace
 *
 * The caller must be authenticated; the token is then bound to the session user.
 */
export async function POST(request: Request) {
  try {
    const { token } = await request.json();

    if (!token) {
      return NextResponse.json({ success: false, error: 'Invitation token is required' }, { status: 400 });
    }

    // 1. Require authentication — invitee must be logged in before accepting
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
      return NextResponse.json({ success: false, error: 'Unauthorized: Please sign in before accepting the invitation' }, { status: 401 });
    }

    const bearerToken = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(bearerToken);
    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Invalid authentication session' }, { status: 401 });
    }

    // 2. Look up the invitation by token
    const { data: invitation, error: fetchError } = await supabaseAdmin
      .from('team_invitations')
      .select('*')
      .eq('token', token)
      .single();

    if (fetchError || !invitation) {
      return NextResponse.json({ success: false, error: 'Invitation not found or already consumed' }, { status: 404 });
    }

    // 3. Check if already accepted (single-use enforcement)
    if (invitation.status === 'accepted') {
      return NextResponse.json(
        { success: false, error: 'This invitation has already been accepted and cannot be reused' },
        { status: 409 }
      );
    }

    // 4. Check expiry
    const now = new Date();
    const expiresAt = new Date(invitation.expires_at);
    if (now > expiresAt) {
      // Mark as expired in DB for housekeeping
      await supabaseAdmin
        .from('team_invitations')
        .update({ status: 'expired' })
        .eq('token', token);

      return NextResponse.json(
        { success: false, error: 'This invitation has expired. Please ask your team admin to send a new one.' },
        { status: 410 }
      );
    }

    // 5. Verify invitee email matches authenticated user (prevents token theft)
    if (user.email?.toLowerCase() !== invitation.invitee_email.toLowerCase()) {
      return NextResponse.json(
        { success: false, error: 'This invitation was issued for a different email address' },
        { status: 403 }
      );
    }

    // 6. Mark the invitation as accepted — single-use token consumed here
    const { error: updateError } = await supabaseAdmin
      .from('team_invitations')
      .update({ status: 'accepted' })
      .eq('token', token);

    if (updateError) {
      console.error('[InviteAccept] Failed to mark invitation as accepted:', updateError);
      return NextResponse.json({ success: false, error: 'Failed to process invitation' }, { status: 500 });
    }

    // 7. Create or update org_membership for the invitee
    const { error: membershipError } = await supabaseAdmin
      .from('org_memberships')
      .upsert(
        {
          user_id: user.id,
          organization_id: invitation.workspace_id,
          role: invitation.role || 'Developer',
        },
        { onConflict: 'user_id,organization_id' }
      );

    if (membershipError) {
      console.error('[InviteAccept] Failed to create org membership:', membershipError);
      return NextResponse.json({ success: false, error: 'Failed to grant workspace access' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Invitation accepted successfully. Welcome to the workspace!',
      workspaceId: invitation.workspace_id,
      role: invitation.role,
    });
  } catch (err: any) {
    console.error('[InviteAccept] Unhandled error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

/**
 * GET /api/team/invite/accept?token=...
 *
 * Validates a token without consuming it — used by the frontend acceptance page
 * to display invitation details (org name, role, inviter) before the user confirms.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (!token) {
      return NextResponse.json({ success: false, error: 'Token is required' }, { status: 400 });
    }

    const { data: invitation, error } = await supabaseAdmin
      .from('team_invitations')
      .select('invitee_email, role, repo_source, workspace_id, status, expires_at, invited_by')
      .eq('token', token)
      .single();

    if (error || !invitation) {
      return NextResponse.json({ success: false, error: 'Invitation not found' }, { status: 404 });
    }

    if (invitation.status === 'accepted') {
      return NextResponse.json({ success: false, error: 'This invitation has already been accepted', status: invitation.status }, { status: 409 });
    }

    const expiresAt = new Date(invitation.expires_at);
    if (new Date() > expiresAt) {
      return NextResponse.json({ success: false, error: 'This invitation has expired', status: 'expired' }, { status: 410 });
    }

    return NextResponse.json({
      success: true,
      invitation: {
        inviteeEmail: invitation.invitee_email,
        role: invitation.role,
        repoSource: invitation.repo_source,
        workspaceId: invitation.workspace_id,
        status: invitation.status,
        expiresAt: invitation.expires_at,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
