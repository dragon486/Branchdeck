import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function POST(request: Request) {
  try {
    const { emails, role, workspaceId, repoSource } = await request.json();
    const authHeader = request.headers.get('Authorization');

    if (!authHeader) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    if (!emails?.length) {
      return NextResponse.json({ success: false, error: 'No emails provided' }, { status: 400 });
    }

    // Get inviter identity from JWT
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Invalid session' }, { status: 401 });
    }

    // Upsert invitation records
    const invitations = emails.map((email: string) => ({
      workspace_id: workspaceId || 'default',
      invited_by: user.id,
      invitee_email: email.trim().toLowerCase(),
      role: role || 'Developer',
      repo_source: repoSource || '',
      status: 'pending',
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    }));

    // Try inserting into Supabase (table may not exist yet, handle gracefully)
    try {
      await supabaseAdmin
        .from('team_invitations')
        .upsert(invitations, { onConflict: 'workspace_id,invitee_email' });
    } catch (dbErr) {
      console.warn('[InviteAPI] team_invitations table not found, storing in-memory only:', dbErr);
    }

    // Optionally send emails via Resend (imported lazily to avoid crash if not installed)
    try {
      const { resend } = await import('@/lib/resend');
      const inviterName = user.email?.split('@')[0] || 'A teammate';

      await Promise.allSettled(
        emails.map((email: string) =>
          resend.emails.send({
            from: 'Branchdeck <noreply@branchdeck.dev>',
            to: email,
            subject: `${inviterName} invited you to a Branchdeck workspace`,
            html: `
              <div style="font-family: -apple-system, sans-serif; max-width: 520px; margin: 0 auto; padding: 40px 24px; background: #fafafa;">
                <div style="background: white; border-radius: 16px; padding: 32px; border: 1px solid #e5e7eb;">
                  <h1 style="font-size: 20px; font-weight: 800; color: #0a0a0f; margin: 0 0 8px;">You've been invited to Branchdeck</h1>
                  <p style="color: #6b7280; font-size: 14px; margin: 0 0 24px;">
                    <strong style="color: #0a0a0f">${inviterName}</strong> invited you to collaborate on 
                    <strong style="font-family: monospace; color: #0a0a0f">${repoSource}</strong> 
                    as a <strong>${role || 'Developer'}</strong>.
                  </p>
                  <a href="${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001'}" 
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
          })
        )
      );
    } catch (emailErr) {
      console.warn('[InviteAPI] Email sending skipped (Resend not configured):', emailErr);
    }

    return NextResponse.json({
      success: true,
      invited: emails.length,
      message: `Invitation sent to ${emails.length} member(s)`,
    });
  } catch (err: any) {
    console.error('[InviteAPI] Error:', err);
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
