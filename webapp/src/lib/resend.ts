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

import { Resend } from 'resend';

const apiKey = process.env.RESEND_API_KEY;

if (!apiKey) {
  console.warn('[Resend Warning] RESEND_API_KEY is not set in environment variables. Email invitations will fail.');
}

// Instantiate Resend client statically; calls will fail explicitly if apiKey is missing
export const resend = new Resend(apiKey || 'unconfigured_resend_api_key');
