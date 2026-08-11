'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  GitPullRequest,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Code2,
  ExternalLink,
  RefreshCw,
  FileCode,
  Check,
  Wifi,
  WifiOff,
  Zap,
  Eye,
  EyeOff,
  AlertCircle,
  Activity,
} from 'lucide-react';

export interface SecurityFindingItem {
  id: string;
  rule_id: string;
  title: string;
  description: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | string;
  target_node_id?: string;
  file_path: string;
  is_reachable: boolean;
  patch_diff?: string;
  pr_url?: string;
  details?: Record<string, any>;
}

export interface SecurityTagItem {
  id: string;
  node_id: string;
  tag_name: string;
  details?: Record<string, any>;
}

interface SecurityFindingsTabProps {
  commitSha?: string | null;
  sessionToken?: string | null;
}

const SEV_CONFIG: Record<string, { label: string; dot: string; badge: string; text: string }> = {
  CRITICAL: {
    label: 'Critical',
    dot: 'bg-rose-500',
    badge: 'bg-rose-500/15 border-rose-500/30 text-rose-300',
    text: 'text-rose-400',
  },
  HIGH: {
    label: 'High',
    dot: 'bg-orange-500',
    badge: 'bg-orange-500/15 border-orange-500/30 text-orange-300',
    text: 'text-orange-400',
  },
  MEDIUM: {
    label: 'Medium',
    dot: 'bg-amber-400',
    badge: 'bg-amber-400/15 border-amber-400/30 text-amber-300',
    text: 'text-amber-400',
  },
  LOW: {
    label: 'Low',
    dot: 'bg-blue-400',
    badge: 'bg-blue-400/15 border-blue-400/30 text-blue-300',
    text: 'text-blue-400',
  },
};

function SevBadge({ severity }: { severity: string }) {
  const cfg = SEV_CONFIG[severity] || SEV_CONFIG['LOW'];
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest rounded border ${cfg.badge}`}
    >
      <span className={`w-1 h-1 rounded-full ${cfg.dot}`} />
      {severity}
    </span>
  );
}

type ErrorCode = 'backend_offline' | 'auth_required' | 'generic' | null;

export default function SecurityFindingsTab({ commitSha, sessionToken }: SecurityFindingsTabProps) {
  const [findings, setFindings] = useState<SecurityFindingItem[]>([]);
  const [tags, setTags] = useState<SecurityTagItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorCode, setErrorCode] = useState<ErrorCode>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [creatingPR, setCreatingPR] = useState<Record<string, boolean>>({});
  const [prResults, setPRResults] = useState<Record<string, { pr_url?: string; branch?: string; note?: string }>>({});
  const [filterSeverity, setFilterSeverity] = useState('ALL');
  const [filterReachable, setFilterReachable] = useState(false);

  const fetchFindings = useCallback(async () => {
    setLoading(true);
    setErrorCode(null);
    setErrorMsg('');
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: sessionToken ? `Bearer ${sessionToken}` : 'Bearer local',
      };
      const url = `/api/security/findings${commitSha ? `?commitSha=${encodeURIComponent(commitSha)}` : ''}`;
      const res = await fetch(url, { headers });
      const data = await res.json();

      if (data.success) {
        setFindings(data.findings || []);
        setTags(data.tags || []);
      } else if (data.error === 'backend_offline') {
        setErrorCode('backend_offline');
        setErrorMsg(data.message || '');
      } else if (data.error === 'auth_required') {
        setErrorCode('auth_required');
        setErrorMsg(data.message || '');
      } else {
        setErrorCode('generic');
        setErrorMsg(data.error || data.message || 'Unknown error');
      }
    } catch (err: any) {
      setErrorCode('backend_offline');
      setErrorMsg('Could not reach the backend. Make sure it is running.');
    } finally {
      setLoading(false);
    }
  }, [commitSha, sessionToken]);

  useEffect(() => { fetchFindings(); }, [fetchFindings]);

  const handleCreateFixPR = async (findingId: string) => {
    setCreatingPR(prev => ({ ...prev, [findingId]: true }));
    try {
      const res = await fetch('/api/security/fix-pr', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: sessionToken ? `Bearer ${sessionToken}` : 'Bearer local',
        },
        body: JSON.stringify({ findingId }),
      });
      const data = await res.json();
      if (data.success) {
        setPRResults(prev => ({ ...prev, [findingId]: { pr_url: data.pr_url, branch: data.branch, note: data.note } }));
        setFindings(prev => prev.map(f => f.id === findingId ? { ...f, pr_url: data.pr_url } : f));
      }
    } catch { /* silent */ } finally {
      setCreatingPR(prev => ({ ...prev, [findingId]: false }));
    }
  };

  const filtered = findings.filter(f => {
    if (filterSeverity !== 'ALL' && f.severity !== filterSeverity) return false;
    if (filterReachable && !f.is_reachable) return false;
    return true;
  });

  const reachableCount = findings.filter(f => f.is_reachable).length;
  const highCount = findings.filter(f => f.severity === 'CRITICAL' || f.severity === 'HIGH').length;
  const patchCount = findings.filter(f => Boolean(f.patch_diff)).length;

  return (
    <div
      className="flex flex-col h-full text-white overflow-hidden"
      style={{ background: 'transparent' }}
    >
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-3 border-b"
        style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.25)' }}>
            <ShieldAlert className="w-3.5 h-3.5 text-blue-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-bold tracking-tight text-white">Security Findings</span>
              <span className="px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest rounded"
                style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.25)', color: '#86efac' }}>
                MCP Active
              </span>
            </div>
            <p className="text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>
              AST call-graph reachability &amp; automated patch pass
            </p>
          </div>
        </div>

        <button
          onClick={fetchFindings}
          disabled={loading}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all disabled:opacity-40"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.09)'; (e.currentTarget as HTMLElement).style.color = '#fff'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)'; (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.5)'; }}
        >
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* ── Stat Strip ────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-2 px-4 py-3 border-b"
        style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        {[
          { label: 'Total', value: findings.length, color: 'rgba(255,255,255,0.7)' },
          { label: 'Reachable', value: reachableCount, color: '#34d399' },
          { label: 'High+', value: highCount, color: '#f87171' },
          { label: 'Patchable', value: patchCount, color: '#60a5fa' },
        ].map(({ label, value, color }) => (
          <div key={label} className="flex flex-col items-center py-2 rounded-xl"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <span className="text-[18px] font-black" style={{ color }}>{value}</span>
            <span className="text-[9px] font-bold uppercase tracking-wider mt-0.5"
              style={{ color: 'rgba(255,255,255,0.3)' }}>{label}</span>
          </div>
        ))}
      </div>

      {/* ── Filter Bar ────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-2 border-b"
        style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
        <div className="flex items-center gap-1">
          {['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map(sev => {
            const active = filterSeverity === sev;
            const cfg = SEV_CONFIG[sev];
            return (
              <button
                key={sev}
                onClick={() => setFilterSeverity(sev)}
                className="px-2 py-0.5 rounded text-[10px] font-bold transition-all"
                style={{
                  background: active ? (cfg ? `rgba(255,255,255,0.1)` : 'rgba(255,255,255,0.08)') : 'transparent',
                  color: active ? '#fff' : 'rgba(255,255,255,0.3)',
                  border: active ? '1px solid rgba(255,255,255,0.15)' : '1px solid transparent',
                }}
              >
                {sev === 'ALL' ? 'All' : sev.charAt(0) + sev.slice(1).toLowerCase()}
              </button>
            );
          })}
        </div>
        <button
          onClick={() => setFilterReachable(v => !v)}
          className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold transition-all"
          style={{
            background: filterReachable ? 'rgba(52,211,153,0.12)' : 'transparent',
            color: filterReachable ? '#6ee7b7' : 'rgba(255,255,255,0.3)',
            border: filterReachable ? '1px solid rgba(52,211,153,0.25)' : '1px solid transparent',
          }}
        >
          <Activity className="w-2.5 h-2.5" />
          Reachable only
        </button>
      </div>

      {/* ── Body ──────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">

        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)' }}>
              <RefreshCw className="w-5 h-5 text-blue-400 animate-spin" />
            </div>
            <span className="text-[11px] font-medium" style={{ color: 'rgba(255,255,255,0.35)' }}>
              Evaluating call-graph reachability…
            </span>
          </div>
        )}

        {/* Backend offline */}
        {!loading && errorCode === 'backend_offline' && (
          <div className="flex flex-col items-center justify-center py-14 gap-4">
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center"
              style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.18)' }}>
              <WifiOff className="w-5 h-5 text-rose-400" />
            </div>
            <div className="text-center max-w-[240px]">
              <p className="text-[12px] font-bold text-white mb-1">Backend offline</p>
              <p className="text-[11px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.35)' }}>
                Start the backend server, then click Refresh.
              </p>
              <code className="mt-2 block text-[9px] px-2 py-1.5 rounded-lg font-mono"
                style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.06)' }}>
                uvicorn main:app --reload
              </code>
            </div>
            <button onClick={fetchFindings}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)' }}>
              <RefreshCw className="w-3 h-3" /> Try again
            </button>
          </div>
        )}

        {/* Auth required */}
        {!loading && errorCode === 'auth_required' && (
          <div className="flex flex-col items-center justify-center py-14 gap-3">
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center"
              style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.18)' }}>
              <AlertCircle className="w-5 h-5 text-amber-400" />
            </div>
            <div className="text-center max-w-[240px]">
              <p className="text-[12px] font-bold text-white mb-1">Analysis required</p>
              <p className="text-[11px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.35)' }}>
                Run an analysis on your repo first, then security findings will appear here.
              </p>
            </div>
          </div>
        )}

        {/* Generic error */}
        {!loading && errorCode === 'generic' && (
          <div className="flex items-start gap-3 p-3 rounded-xl"
            style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.15)' }}>
            <AlertTriangle className="w-4 h-4 text-rose-400 mt-0.5 shrink-0" />
            <p className="text-[11px] text-rose-300 leading-relaxed">{errorMsg}</p>
          </div>
        )}

        {/* Empty state */}
        {!loading && !errorCode && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-14 gap-3">
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center"
              style={{ background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.18)' }}>
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
            </div>
            <div className="text-center max-w-[240px]">
              <p className="text-[12px] font-bold text-white mb-1">All clear</p>
              <p className="text-[11px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.35)' }}>
                No security findings detected for this commit.
              </p>
            </div>
          </div>
        )}

        {/* Finding cards */}
        {!loading && !errorCode && filtered.map(finding => {
          const isOpen = expandedId === finding.id;
          const isPRLoading = Boolean(creatingPR[finding.id]);
          const prInfo = prResults[finding.id] || (finding.pr_url ? { pr_url: finding.pr_url } : null);
          const sevCfg = SEV_CONFIG[finding.severity] || SEV_CONFIG['LOW'];

          return (
            <div key={finding.id}
              className="rounded-xl overflow-hidden transition-all"
              style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)' }}>

              {/* Card header */}
              <div className="p-3 flex items-start gap-3">
                {/* Severity stripe */}
                <div className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${sevCfg.dot}`} style={{ marginTop: '5px' }} />

                <div className="flex-1 min-w-0">
                  {/* Top row */}
                  <div className="flex items-center gap-1.5 flex-wrap mb-1">
                    <SevBadge severity={finding.severity} />
                    <span
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-bold rounded border"
                      style={finding.is_reachable
                        ? { background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.25)', color: '#6ee7b7' }
                        : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.3)' }
                      }
                    >
                      <span className={`w-1 h-1 rounded-full ${finding.is_reachable ? 'bg-emerald-400 animate-pulse' : 'bg-white/20'}`} />
                      {finding.is_reachable ? 'Reachable' : 'Isolated'}
                    </span>
                    <span className="font-mono text-[9px] px-1.5 py-0.5 rounded"
                      style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.25)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      {finding.rule_id}
                    </span>
                  </div>

                  <p className="text-[12px] font-semibold text-white leading-snug">{finding.title}</p>
                  <p className="text-[11px] mt-0.5 leading-relaxed" style={{ color: 'rgba(255,255,255,0.45)' }}>
                    {finding.description}
                  </p>

                  {/* File path */}
                  <div className="flex items-center gap-1 mt-1.5">
                    <FileCode className="w-3 h-3 shrink-0" style={{ color: 'rgba(255,255,255,0.25)' }} />
                    <span className="font-mono text-[10px] truncate" style={{ color: 'rgba(255,255,255,0.3)' }}>
                      {finding.file_path}
                    </span>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-1.5 shrink-0">
                  {finding.patch_diff && (
                    <button
                      onClick={() => setExpandedId(isOpen ? null : finding.id)}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold transition-all"
                      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)' }}
                    >
                      <Code2 className="w-3 h-3" />
                      Patch
                      {isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                    </button>
                  )}

                  {prInfo?.pr_url ? (
                    <a href={prInfo.pr_url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold transition-all"
                      style={{ background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.25)', color: '#6ee7b7' }}>
                      <GitPullRequest className="w-3 h-3" />
                      PR
                      <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  ) : finding.patch_diff ? (
                    <button
                      onClick={() => handleCreateFixPR(finding.id)}
                      disabled={isPRLoading}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold transition-all disabled:opacity-50"
                      style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.25)', color: '#93c5fd' }}
                    >
                      <GitPullRequest className={`w-3 h-3 ${isPRLoading ? 'animate-spin' : ''}`} />
                      {isPRLoading ? 'Creating…' : 'Fix PR'}
                    </button>
                  ) : null}
                </div>
              </div>

              {/* Expanded diff */}
              {isOpen && finding.patch_diff && (
                <div className="border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                  <div className="flex items-center justify-between px-3 py-1.5"
                    style={{ background: 'rgba(255,255,255,0.02)' }}>
                    <span className="text-[10px] font-bold font-mono" style={{ color: 'rgba(255,255,255,0.35)' }}>
                      Automated patch diff
                    </span>
                    <span className="text-[9px] font-semibold text-emerald-400">✓ Verified safe autofix</span>
                  </div>
                  <pre className="px-3 pb-3 font-mono text-[10px] leading-relaxed overflow-x-auto"
                    style={{ color: 'rgba(255,255,255,0.6)' }}>
                    {finding.patch_diff.split('\n').map((line, i) => (
                      <div key={i}
                        style={{
                          color: line.startsWith('+') ? '#6ee7b7'
                            : line.startsWith('-') ? '#fca5a5'
                            : line.startsWith('@') ? '#93c5fd'
                            : 'rgba(255,255,255,0.5)',
                          background: line.startsWith('+') ? 'rgba(52,211,153,0.05)'
                            : line.startsWith('-') ? 'rgba(239,68,68,0.05)'
                            : 'transparent',
                        }}
                      >
                        {line || ' '}
                      </div>
                    ))}
                  </pre>
                </div>
              )}

              {/* PR success note */}
              {prResults[finding.id]?.note && (
                <div className="px-3 py-2 flex items-center gap-2 border-t"
                  style={{ borderColor: 'rgba(255,255,255,0.05)', background: 'rgba(52,211,153,0.05)' }}>
                  <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                  <span className="text-[10px] font-mono text-emerald-300">{prResults[finding.id].note}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
