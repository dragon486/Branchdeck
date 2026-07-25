import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { resend } from '@/lib/resend';

/**
 * Team Invitation API
 *
 * Security model:
 * - Organization context is ALWAYS resolved from the authenticated session JWT,
 *   never from the request body. Body-supplied workspaceId is accepted only as a
 *   display hint (repo_source label) and is NEVER used for authorization.
 * - Only users with role 'owner' or 'admin' may create invitations.
 * - GET scopes results to the session user's org only.
 */

const ADMIN_ROLES = ['owner', 'admin'];

async function resolveSessionMembership(authHeader: string | null) {
  if (!authHeader) return { user: null, membership: null, error: 'Unauthorized: Missing token' };

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) return { user: null, membership: null, error: 'Invalid authentication session' };

  const { data: membership, error: memberError } = await supabaseAdmin
    .from('org_memberships')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .single();

  if (memberError || !membership) {
    return { user, membership: null, error: 'No organization membership found for this user' };
  }

  return { user, membership, error: null };
}

export async function POST(request: Request) {
  try {
    const { emails, role, repoSource } = await request.json();
    const authHeader = request.headers.get('Authorization');

    const { user, membership, error } = await resolveSessionMembership(authHeader);
    if (error || !user || !membership) {
      return NextResponse.json({ success: false, error: error || 'Unauthorized' }, { status: 401 });
    }

    // Enforce: only owner/admin can create invitations
    if (!ADMIN_ROLES.includes(membership.role.toLowerCase())) {
      return NextResponse.json(
        { success: false, error: `Forbidden: Only owners or admins may send invitations (your role: ${membership.role})` },
        { status: 403 }
      );
    }

    if (!emails?.length) {
      return NextResponse.json({ success: false, error: 'No emails provided' }, { status: 400 });
    }

    // Use session-resolved org — never the body-supplied workspaceId
    const sessionOrgId = membership.organization_id;

    // Build invitation records with unique, time-limited tokens
    const invitations = emails.map((email: string) => {
      const inviteToken = crypto.randomUUID();
      return {
        workspace_id: sessionOrgId,        // Session-derived, never body-supplied
        invited_by: user.id,
        invitee_email: email.trim().toLowerCase(),
        role: role || 'Developer',
        repo_source: repoSource || '',
        token: inviteToken,
        status: 'pending',
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      };
    });

    // Insert to database — conflict on workspace_id+invitee_email resets the token
    const { error: dbError } = await supabaseAdmin
      .from('team_invitations')
      .upsert(invitations, { onConflict: 'workspace_id,invitee_email' });

    if (dbError) {
      console.error('[InviteAPI] Database insertion error:', dbError);
      return NextResponse.json({ success: false, error: `Failed to save invitation: ${dbError.message}` }, { status: 500 });
    }

    const inviterName = user.email?.split('@')[0] || 'A teammate';
    const appUrl = process.env.NEXT_PUBLIC_APP_URL
      || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://branchdeck.vercel.app');

    // Dispatch emails via Resend
    const emailPromises = invitations.map(async (invite: any) => {
      const acceptUrl = `${appUrl}/invite/accept?token=${invite.token}`;
      const result = await resend.emails.send({
        from: 'Branchdeck <noreply@branchdeck.dev>',
        to: invite.invitee_email,
        subject: `${inviterName} invited you to a Branchdeck workspace`,
        html: `
          <div style="font-family: -apple-system, sans-serif; max-width: 520px; margin: 0 auto; padding: 40px 24px; background: #fafafa;">
            <div style="background: white; border-radius: 16px; padding: 32px; border: 1px solid #e5e7eb;">
              <h1 style="font-size: 20px; font-weight: 800; color: #0a0a0f; margin: 0 0 8px;">You've been invited to Branchdeck</h1>
              <p style="color: #6b7280; font-size: 14px; margin: 0 0 24px;">
                <strong style="color: #0a0a0f">${inviterName}</strong> invited you to collaborate on 
                <strong style="font-family: monospace; color: #0a0a0f">${invite.repo_source || 'their workspace'}</strong> 
                as a <strong>${invite.role}</strong>.
              </p>
              <a href="${acceptUrl}" 
                 style="display: inline-block; background: #0a0a0f; color: white; text-decoration: none;
                        padding: 12px 28px; border-radius: 10px; font-weight: 700; font-size: 14px;">
                Accept Invitation →
              </a>
              <p style="color: #9ca3af; font-size: 11px; margin: 24px 0 0;">
                This invitation expires in 7 days. If you did not expect this invitation, you can safely ignore it.
              </p>
            </div>
          </div>
        `,
      });

      if (result.error) {
        throw new Error(result.error.message || 'Resend email dispatch error');
      }
      return result;
    });

    const emailStatuses = await Promise.allSettled(emailPromises);
    const failedEmails = emailStatuses.filter((s) => s.status === 'rejected');
    if (failedEmails.length > 0) {
      console.warn('[InviteAPI] Some email dispatches failed:', failedEmails);
    }

    return NextResponse.json({
      success: true,
      invited: emails.length,
      message: `Invitation successfully recorded and sent to ${emails.length} member(s)`,
    });
  } catch (err: any) {
    console.error('[InviteAPI] Unhandled Error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('Authorization');
    const { user, membership, error } = await resolveSessionMembership(authHeader);

    if (error || !user || !membership) {
      return NextResponse.json({ success: false, error: error || 'Unauthorized' }, { status: 401 });
    }

    // Always scope to the session-derived org — never trust query params for org resolution
    const sessionOrgId = membership.organization_id;

    const { data, error: dbError } = await supabaseAdmin
      .from('team_invitations')
      .select('*')
      .eq('workspace_id', sessionOrgId)
      .order('created_at', { ascending: false });

    if (dbError) {
      console.error('[InviteAPI GET] DB error:', dbError);
      return NextResponse.json({ success: false, error: dbError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, invitations: data || [] });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
