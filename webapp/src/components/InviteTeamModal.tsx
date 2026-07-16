'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  Users, Mail, Link2, Copy, CheckCheck, X,
  UserPlus, Clock, AlertCircle, Loader2, Shield
} from 'lucide-react';

// Inline GitHub icon to avoid package version issues
function GithubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844a9.59 9.59 0 012.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
    </svg>
  );
}

/* ─── Supabase Realtime Presence ──────────────────────────────────── */
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/* ─── Types ───────────────────────────────────────────────────────── */
export interface TeamMember {
  id: string;
  name: string;
  email: string;
  avatar: string;   // 2-letter initials
  color: string;    // tailwind bg class
  status: 'online' | 'away' | 'offline';
  role: string;
  currentFile?: string;
  currentFeature?: string;
  joinedAt?: string;
  isCurrentUser?: boolean;
}

export interface CollaborationState {
  members: TeamMember[];
  count: number;
}

/* ─── Member avatar colours ───────────────────────────────────────── */
const AVATAR_COLORS = [
  'bg-rose-500', 'bg-sky-500', 'bg-violet-500',
  'bg-amber-500', 'bg-emerald-500', 'bg-fuchsia-500',
  'bg-orange-500', 'bg-teal-500', 'bg-indigo-500', 'bg-cyan-500',
];

function initialsOf(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function colorFor(name: string) {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) & 0xffff;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

/* ════════════════════════════════════════════════════════════════════
   useCollaboration — Supabase Realtime Presence hook
   ════════════════════════════════════════════════════════════════════ */
export function useCollaboration(
  workspaceId: string,
  currentUser: { id: string; name: string; email: string; role?: string } | null
) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const updatePresence = useCallback(
    (file?: string, feature?: string) => {
      if (!channelRef.current || !currentUser) return;
      channelRef.current.track({
        userId: currentUser.id,
        name: currentUser.name,
        email: currentUser.email,
        role: currentUser.role || 'Developer',
        avatar: initialsOf(currentUser.name),
        color: colorFor(currentUser.name),
        currentFile: file || null,
        currentFeature: feature || null,
        joinedAt: new Date().toISOString(),
      });
    },
    [currentUser]
  );

  useEffect(() => {
    if (!workspaceId || !currentUser) return;

    const channel = supabase.channel(`workspace:${workspaceId}`, {
      config: { presence: { key: currentUser.id } },
    });
    channelRef.current = channel;

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<any>();
        const live: TeamMember[] = [];
        for (const userId of Object.keys(state)) {
          const [presence] = state[userId];
          if (!presence) continue;
          live.push({
            id: userId,
            name: presence.name || 'Unknown',
            email: presence.email || '',
            avatar: presence.avatar || initialsOf(presence.name || '??'),
            color: presence.color || colorFor(presence.name || ''),
            status: 'online',
            role: presence.role || 'Developer',
            currentFile: presence.currentFile,
            currentFeature: presence.currentFeature,
            joinedAt: presence.joinedAt,
            isCurrentUser: userId === currentUser.id,
          });
        }
        setMembers(live);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          updatePresence();
        }
      });

    return () => {
      channel.unsubscribe();
    };
  }, [workspaceId, currentUser, updatePresence]);

  return { members, updatePresence };
}

/* ════════════════════════════════════════════════════════════════════
   InviteTeamModal
   ════════════════════════════════════════════════════════════════════ */
interface InviteTeamModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  repoSource: string;
  session: any;
}

type InviteTab = 'email' | 'github' | 'link';

export default function InviteTeamModal({
  isOpen, onClose, workspaceId, repoSource, session
}: InviteTeamModalProps) {
  const [tab, setTab] = useState<InviteTab>('email');
  const [emails, setEmails] = useState('');
  const [role, setRole] = useState('Developer');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [githubOrg, setGithubOrg] = useState('');
  const [pendingInvites, setPendingInvites] = useState<Array<{
    email: string; status: 'pending' | 'accepted'; sentAt: string
  }>>([]);

  // Derive invite link
  const inviteLink = typeof window !== 'undefined'
    ? `${window.location.origin}/join?workspace=${workspaceId}&ref=${session?.user?.id || 'guest'}`
    : '';

  // Load pending invites from localStorage (simulated persistence)
  useEffect(() => {
    if (isOpen) {
      try {
        const saved = localStorage.getItem(`invites_${workspaceId}`);
        if (saved) setPendingInvites(JSON.parse(saved));
      } catch { /* ignore */ }
    }
  }, [isOpen, workspaceId]);

  // Reset on close
  useEffect(() => {
    if (!isOpen) {
      setEmails(''); setError(''); setSuccess(''); setLoading(false);
    }
  }, [isOpen]);

  // ESC close
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    if (isOpen) document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [isOpen, onClose]);

  const handleEmailInvite = async () => {
    const emailList = emails.split(/[\n,;]/).map(e => e.trim()).filter(Boolean);
    if (!emailList.length) { setError('Enter at least one email address.'); return; }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const invalid = emailList.filter(e => !emailRegex.test(e));
    if (invalid.length) { setError(`Invalid email: ${invalid[0]}`); return; }

    setLoading(true); setError(''); setSuccess('');
    try {
      // Call the invite API route
      const res = await fetch('/api/team/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emails: emailList, role, workspaceId, repoSource }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Invite failed');

      const newInvites = emailList.map(email => ({
        email, status: 'pending' as const, sentAt: new Date().toISOString()
      }));
      const updated = [...pendingInvites, ...newInvites];
      setPendingInvites(updated);
      localStorage.setItem(`invites_${workspaceId}`, JSON.stringify(updated));

      setSuccess(`✓ Invitation sent to ${emailList.length} member${emailList.length > 1 ? 's' : ''}!`);
      setEmails('');
    } catch (e: any) {
      console.error('[Email Invite Error]', e);
      setError(e.message || 'Invitation failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleGithubOrgInvite = async () => {
    if (!githubOrg.trim()) { setError('Enter a GitHub organization name.'); return; }
    setLoading(true); setError(''); setSuccess('');
    try {
      const res = await fetch('/api/team/github-org', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ org: githubOrg.trim(), workspaceId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'GitHub Organization sync failed');
      setSuccess(`✓ Members from ${githubOrg} have been synced!`);
    } catch (e: any) {
      console.error('[GitHub Sync Error]', e);
      setError(e.message || 'Failed to sync members from GitHub organization.');
    } finally {
      setLoading(false);
    }
  };

  const copyLink = async () => {
    await navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  if (!isOpen) return null;

  const TAB_CLASSES = (active: boolean) =>
    `flex-1 py-2.5 text-[12px] font-bold transition-all rounded-lg ${
      active
        ? 'bg-white text-slate-900 shadow-sm border border-slate-200/60'
        : 'text-slate-500 hover:text-slate-800'
    }`;

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-6">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-200/80 overflow-hidden z-10">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-slate-950 flex items-center justify-center">
              <UserPlus className="w-4.5 h-4.5 text-white" />
            </div>
            <div>
              <h2 className="text-[15px] font-bold text-slate-900">Invite Team Members</h2>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Workspace: <span className="font-mono text-slate-600">{repoSource}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-800 transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="px-6 pt-4">
          <div className="flex gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200/60">
            <button onClick={() => setTab('email')} className={TAB_CLASSES(tab === 'email')}>
              <Mail className="w-3.5 h-3.5 inline mr-1.5" />Email
            </button>
            <button onClick={() => setTab('github')} className={TAB_CLASSES(tab === 'github')}>
              <GithubIcon className="w-3.5 h-3.5 inline mr-1.5" />GitHub Org
            </button>
            <button onClick={() => setTab('link')} className={TAB_CLASSES(tab === 'link')}>
              <Link2 className="w-3.5 h-3.5 inline mr-1.5" />Invite Link
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-5 space-y-4">
          {/* Success / Error */}
          {success && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-[12px] text-emerald-700 font-medium flex items-center gap-2">
              <CheckCheck className="w-4 h-4 flex-shrink-0" />{success}
            </div>
          )}
          {error && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-[12px] text-rose-700 font-medium flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
            </div>
          )}

          {/* Email Tab */}
          {tab === 'email' && (
            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 block">
                  Email Addresses
                </label>
                <textarea
                  value={emails}
                  onChange={(e) => setEmails(e.target.value)}
                  placeholder="alice@company.com, bob@company.com&#10;(separate with commas or newlines)"
                  rows={3}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs text-slate-700 placeholder-slate-400 focus:border-slate-900 focus:outline-none focus:bg-white transition-all resize-none font-mono"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 block">
                  Role
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-700 focus:border-slate-900 focus:outline-none focus:bg-white transition-all"
                >
                  <option>Developer</option>
                  <option>Staff Engineer</option>
                  <option>Engineering Manager</option>
                  <option>Reviewer</option>
                  <option>Viewer</option>
                </select>
              </div>
              <button
                onClick={handleEmailInvite}
                disabled={loading}
                className="w-full bg-slate-950 hover:bg-slate-800 text-white text-[13px] font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                {loading ? 'Sending invitations...' : 'Send Invitations'}
              </button>
            </div>
          )}

          {/* GitHub Org Tab */}
          {tab === 'github' && (
            <div className="space-y-4">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-start gap-3">
                <GithubIcon className="w-5 h-5 text-slate-800 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="text-[12px] font-bold text-slate-800 mb-1">GitHub Organization Sync</div>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    Sync all members from a GitHub organization. Members will see the workspace on their next login.
                    Shows who is editing what based on their GitHub activity.
                  </p>
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 block">
                  Organization Name
                </label>
                <div className="flex gap-2">
                  <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl px-3 text-xs text-slate-400 font-mono flex-shrink-0">
                    github.com/
                  </div>
                  <input
                    value={githubOrg}
                    onChange={(e) => setGithubOrg(e.target.value)}
                    placeholder="my-org"
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-700 placeholder-slate-400 focus:border-slate-900 focus:outline-none focus:bg-white transition-all font-mono"
                  />
                </div>
              </div>
              <button
                onClick={handleGithubOrgInvite}
                disabled={loading}
                className="w-full bg-slate-950 hover:bg-slate-800 text-white text-[13px] font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <GithubIcon className="w-4 h-4" />}
                {loading ? 'Syncing...' : 'Sync Organization Members'}
              </button>
            </div>
          )}

          {/* Invite Link Tab */}
          {tab === 'link' && (
            <div className="space-y-4">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-start gap-3">
                <Shield className="w-5 h-5 text-slate-600 flex-shrink-0 mt-0.5" />
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Share this link with team members. Anyone with this link can join the workspace with Viewer access.
                  You can upgrade their role anytime.
                </p>
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 block">
                  Workspace Invite Link
                </label>
                <div className="flex gap-2">
                  <input
                    readOnly
                    value={inviteLink}
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-600 font-mono focus:outline-none"
                  />
                  <button
                    onClick={copyLink}
                    className={`flex-shrink-0 px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                      copied
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-950 hover:bg-slate-800 text-white'
                    }`}
                  >
                    {copied ? <CheckCheck className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Pending Invites Footer */}
        {pendingInvites.length > 0 && (
          <div className="px-6 pb-6">
            <div className="border border-slate-100 rounded-xl overflow-hidden">
              <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  Pending Invitations ({pendingInvites.length})
                </span>
              </div>
              <div className="divide-y divide-slate-50 max-h-36 overflow-y-auto">
                {pendingInvites.map((inv, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-[9px] font-bold text-slate-500">
                        {inv.email[0].toUpperCase()}
                      </div>
                      <span className="text-[11px] font-mono text-slate-600">{inv.email}</span>
                    </div>
                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                      inv.status === 'accepted'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-amber-50 text-amber-700 border border-amber-200'
                    }`}>
                      {inv.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   CollaborationBar — "Live Collaboration Active" presence strip
   ════════════════════════════════════════════════════════════════════ */
interface CollaborationBarProps {
  members: TeamMember[];
  onInviteClick: () => void;
}

export function CollaborationBar({ members, onInviteClick }: CollaborationBarProps) {
  const online = members.filter(m => m.status === 'online');

  return (
    <section className="bg-white border-b border-slate-200/80 px-6 py-2 flex items-center justify-between shadow-[0_1px_2px_rgba(0,0,0,0.01)] z-10">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-full px-2.5 py-0.5 text-[10px] font-bold">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          Live Collaboration Active
        </div>
        <div className="h-3 w-px bg-slate-200" />

        {/* Member avatars */}
        <div className="flex items-center -space-x-1.5">
          {online.map((user, idx) => (
            <div
              key={idx}
              className={`w-6 h-6 rounded-full border-2 border-white flex items-center justify-center text-[9px] font-bold text-white ring-1 ring-slate-100 ${user.color} cursor-default relative group`}
              title={`${user.name}${user.isCurrentUser ? ' (you)' : ''} — ${user.currentFile || user.currentFeature || 'browsing'}`}
            >
              {user.avatar}
              {/* Tooltip */}
              <div className="absolute top-8 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[9px] font-medium py-1.5 px-2.5 rounded-lg shadow-xl whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                <div className="font-bold">{user.name}{user.isCurrentUser ? ' (you)' : ''}</div>
                {(user.currentFile || user.currentFeature) && (
                  <div className="text-slate-300 mt-0.5 font-mono">
                    {user.currentFile || user.currentFeature}
                  </div>
                )}
                <div className="text-slate-400">{user.role}</div>
              </div>
            </div>
          ))}
        </div>

        <span className="text-[10px] text-slate-400 font-medium ml-0.5 font-sans">
          {online.length} {online.length === 1 ? 'developer' : 'developers'} collaborating
        </span>
      </div>

      <button
        onClick={onInviteClick}
        className="flex items-center gap-1.5 bg-slate-950 hover:bg-slate-800 text-white rounded-lg px-3.5 py-1.5 text-[11px] font-bold transition-colors shadow-sm"
      >
        <UserPlus className="w-3.5 h-3.5" />
        Invite Team
      </button>
    </section>
  );
}
