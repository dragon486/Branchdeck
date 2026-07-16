/**
 * Resend email client initialization.
 * 
 * Resend is used for transactional emails (waitlist confirmations, welcome emails, etc.)
 * Configure RESEND_API_KEY in your .env.local to enable email sending.
 * 
 * Usage:
 *   import { resend } from '@/lib/resend';
 *   await resend.emails.send({ from: '...', to: '...', subject: '...', html: '...' });
 */

// Resend SDK is optional — install with: npm install resend
// For now this is a lightweight stub that avoids import errors if the package is not installed.

let _resendClient: {
  emails: {
    send: (opts: { from: string; to: string; subject: string; html: string }) => Promise<{ id?: string; error?: string }>;
  };
} | null = null;

function getResendClient() {
  if (_resendClient) return _resendClient;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('[Resend] RESEND_API_KEY is not set. Email sending is disabled.');
    // Return a no-op stub so callers don't crash
    _resendClient = {
      emails: {
        send: async () => ({ id: 'no-op', error: 'RESEND_API_KEY not configured' })
      }
    };
    return _resendClient;
  }

  try {
    // Dynamic require so the build doesn't fail if 'resend' is not installed
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Resend } = require('resend') as { Resend: new (key: string) => typeof _resendClient };
    _resendClient = new Resend(apiKey) as typeof _resendClient;
  } catch {
    console.warn('[Resend] Package not installed. Run: npm install resend');
    _resendClient = {
      emails: {
        send: async () => ({ id: 'no-op', error: 'resend package not installed' })
      }
    };
  }

  return _resendClient!;
}

export const resend = getResendClient();
