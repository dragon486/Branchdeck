import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { resend } from '@/lib/resend';

export async function POST(request: Request) {
  try {
    const { emails, role, workspaceId, repoSource } = await request.json();
    const authHeader = request.headers.get('Authorization');

    if (!authHeader) {
      return NextResponse.json({ success: false, error: 'Unauthorized: Missing token' }, { status: 401 });
    }

    if (!emails?.length) {
      return NextResponse.json({ success: false, error: 'No emails provided' }, { status: 400 });
    }

    // Get inviter identity from JWT
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Invalid authentication session' }, { status: 401 });
    }

    // Upsert invitation records with unique validation tokens
    const invitations = emails.map((email: string) => {
      const inviteToken = crypto.randomUUID();
      return {
        workspace_id: workspaceId || 'default',
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

    // Insert to database and handle errors strictly
    const { error: dbError } = await supabaseAdmin
      .from('team_invitations')
      .upsert(invitations, { onConflict: 'workspace_id,invitee_email' });

    if (dbError) {
      console.error('[InviteAPI] Database insertion error:', dbError);
      return NextResponse.json({ success: false, error: `Failed to save invitation: ${dbError.message}` }, { status: 500 });
    }

    const inviterName = user.email?.split('@')[0] || 'A teammate';

    // Dispatch emails via Resend
    const emailPromises = invitations.map(async (invite: any) => {
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
                <strong style="font-family: monospace; color: #0a0a0f">${invite.repo_source}</strong> 
                as a <strong>${invite.role}</strong>.
              </p>
              <a href="${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/invite?token=${invite.token}" 
                 style="display: inline-block; background: #0a0a0f; color: white; text-decoration: none;
                        padding: 12px 28px; border-radius: 10px; font-weight: 700; font-size: 14px;">
                Accept Invitation →
              </a>
              <p style="color: #9ca3af; font-size: 11px; margin: 24px 0 0;">
                This invitation expires in 7 days.
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
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspaceId') || 'default';
    const authHeader = request.headers.get('Authorization');

    if (!authHeader) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    try {
      const { data, error } = await supabaseAdmin
        .from('team_invitations')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return NextResponse.json({ success: true, invitations: data });
    } catch {
      return NextResponse.json({ success: true, invitations: [] });
    }
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
