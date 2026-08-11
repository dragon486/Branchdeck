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
  WifiOff,
  AlertCircle,
  Activity,
  Zap,
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

const SEV: Record<string, { dot: string; badge: string; icon: string }> = {
  CRITICAL: { dot: 'bg-rose-500',   badge: 'bg-rose-50 text-rose-700 border-rose-200',   icon: 'text-rose-500' },
  HIGH:     { dot: 'bg-orange-500', badge: 'bg-orange-50 text-orange-700 border-orange-200', icon: 'text-orange-500' },
  MEDIUM:   { dot: 'bg-amber-400',  badge: 'bg-amber-50 text-amber-700 border-amber-200',  icon: 'text-amber-500' },
  LOW:      { dot: 'bg-blue-400',   badge: 'bg-blue-50 text-blue-700 border-blue-200',    icon: 'text-blue-500' },
};

type ErrorCode = 'backend_offline' | 'auth_required' | 'generic' | null;

export default function SecurityFindingsTab({ commitSha, sessionToken }: SecurityFindingsTabProps) {
  const [findings, setFindings]     = useState<SecurityFindingItem[]>([]);
  const [loading, setLoading]       = useState(true);
  const [errorCode, setErrorCode]   = useState<ErrorCode>(null);
  const [errorMsg, setErrorMsg]     = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [creatingPR, setCreatingPR] = useState<Record<string, boolean>>({});
  const [prResults, setPRResults]   = useState<Record<string, { pr_url?: string; note?: string }>>({});
  const [filterSev, setFilterSev]   = useState('ALL');
  const [reachableOnly, setReachableOnly] = useState(false);

  const fetchFindings = useCallback(async () => {
    setLoading(true); setErrorCode(null); setErrorMsg('');
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: sessionToken ? `Bearer ${sessionToken}` : 'Bearer local',
      };
      const url = `/api/security/findings${commitSha ? `?commitSha=${encodeURIComponent(commitSha)}` : ''}`;
      const res  = await fetch(url, { headers });
      const data = await res.json();
      if (data.success) {
        setFindings(data.findings || []);
      } else if (data.error === 'backend_offline') {
        setErrorCode('backend_offline'); setErrorMsg(data.message || '');
      } else if (data.error === 'auth_required') {
        setErrorCode('auth_required');  setErrorMsg(data.message || '');
      } else {
        setErrorCode('generic'); setErrorMsg(data.error || data.message || 'Unknown error');
      }
    } catch {
      setErrorCode('backend_offline');
      setErrorMsg('Could not reach the backend. Make sure it is running.');
    } finally { setLoading(false); }
  }, [commitSha, sessionToken]);

  useEffect(() => { fetchFindings(); }, [fetchFindings]);

  const handleCreateFixPR = async (findingId: string) => {
    setCreatingPR(p => ({ ...p, [findingId]: true }));
    try {
      const res  = await fetch('/api/security/fix-pr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: sessionToken ? `Bearer ${sessionToken}` : 'Bearer local' },
        body: JSON.stringify({ findingId }),
      });
      const data = await res.json();
      if (data.success) {
        setPRResults(p => ({ ...p, [findingId]: { pr_url: data.pr_url, note: data.note } }));
        setFindings(p => p.map(f => f.id === findingId ? { ...f, pr_url: data.pr_url } : f));
      }
    } catch { /* silent */ } finally {
      setCreatingPR(p => ({ ...p, [findingId]: false }));
    }
  };

  const filtered = findings.filter(f => {
    if (filterSev !== 'ALL' && f.severity !== filterSev) return false;
    if (reachableOnly && !f.is_reachable) return false;
    return true;
  });

  const reachableCount = findings.filter(f => f.is_reachable).length;
  const highCount      = findings.filter(f => f.severity === 'CRITICAL' || f.severity === 'HIGH').length;
  const patchCount     = findings.filter(f => Boolean(f.patch_diff)).length;

  return (
    <div className="flex flex-col h-full bg-white border border-slate-200/80 rounded-xl overflow-hidden shadow-sm">

      {/* ── Header ───────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50/60">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-slate-600" />
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Security Findings
              </span>
              <span className="px-1.5 py-0.5 text-[8px] font-black uppercase tracking-widest rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
                MCP Active
              </span>
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5">AST call-graph reachability &amp; auto-patch</p>
          </div>
        </div>
        <button
          onClick={fetchFindings}
          disabled={loading}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold text-slate-500 bg-slate-100 hover:bg-slate-200 border border-slate-200 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* ── Stat strip ───────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-2 px-3 py-2.5 border-b border-slate-100 bg-slate-50/30">
        {[
          { label: 'Total',     value: findings.length, cls: 'text-slate-800' },
          { label: 'Reachable', value: reachableCount,  cls: 'text-emerald-600' },
          { label: 'High+',     value: highCount,       cls: 'text-rose-600' },
          { label: 'Patchable', value: patchCount,      cls: 'text-blue-600' },
        ].map(({ label, value, cls }) => (
          <div key={label} className="flex flex-col items-center py-1.5 rounded-lg bg-white border border-slate-200/80 shadow-sm">
            <span className={`text-lg font-black ${cls}`}>{value}</span>
            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mt-0.5">{label}</span>
          </div>
        ))}
      </div>

      {/* ── Filters ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100">
        <div className="flex items-center gap-1">
          {['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map(sev => (
            <button
              key={sev}
              onClick={() => setFilterSev(sev)}
              className={`px-2 py-0.5 rounded text-[9px] font-bold transition-all border ${
                filterSev === sev
                  ? 'bg-slate-800 text-white border-slate-800'
                  : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300 hover:text-slate-600'
              }`}
            >
              {sev === 'ALL' ? 'All' : sev.charAt(0) + sev.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
        <button
          onClick={() => setReachableOnly(v => !v)}
          className={`flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold transition-all border ${
            reachableOnly
              ? 'bg-emerald-600 text-white border-emerald-600'
              : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300 hover:text-slate-600'
          }`}
        >
          <Activity className="w-2.5 h-2.5" />
          Reachable
        </button>
      </div>

      {/* ── Body ─────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">

        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-14 gap-3 text-slate-400">
            <div className="w-6 h-6 border-2 border-slate-800 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs font-medium">Evaluating call-graph reachability…</span>
          </div>
        )}

        {/* Backend offline */}
        {!loading && errorCode === 'backend_offline' && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-rose-50 border border-rose-200">
              <WifiOff className="w-5 h-5 text-rose-500" />
            </div>
            <div className="text-center max-w-[220px]">
              <p className="text-xs font-bold text-slate-700 mb-1">Backend offline</p>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Start the backend, then click Refresh.
              </p>
              <code className="mt-2 block text-[9px] px-2 py-1.5 rounded-lg font-mono bg-slate-100 text-slate-500 border border-slate-200">
                uvicorn main:app --reload
              </code>
            </div>
            <button
              onClick={fetchFindings}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-200 transition-colors"
            >
              <RefreshCw className="w-3 h-3" /> Try again
            </button>
          </div>
        )}

        {/* Auth / no analysis */}
        {!loading && errorCode === 'auth_required' && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-amber-50 border border-amber-200">
              <AlertCircle className="w-5 h-5 text-amber-500" />
            </div>
            <div className="text-center max-w-[220px]">
              <p className="text-xs font-bold text-slate-700 mb-1">No analysis yet</p>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Run an analysis on your repo first — security findings will appear here automatically.
              </p>
            </div>
          </div>
        )}

        {/* Generic error */}
        {!loading && errorCode === 'generic' && (
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-rose-50 border border-rose-200">
            <AlertTriangle className="w-4 h-4 text-rose-500 mt-0.5 shrink-0" />
            <p className="text-[11px] text-rose-700 leading-relaxed">{errorMsg}</p>
          </div>
        )}

        {/* Empty state */}
        {!loading && !errorCode && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-emerald-50 border border-emerald-200">
              <ShieldCheck className="w-5 h-5 text-emerald-500" />
            </div>
            <div className="text-center max-w-[220px]">
              <p className="text-xs font-bold text-slate-700 mb-1">All clear</p>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                No security findings detected for this commit.
              </p>
            </div>
          </div>
        )}

        {/* Finding cards */}
        {!loading && !errorCode && filtered.map(finding => {
          const isOpen     = expandedId === finding.id;
          const isPRBusy   = Boolean(creatingPR[finding.id]);
          const prInfo     = prResults[finding.id] || (finding.pr_url ? { pr_url: finding.pr_url } : null);
          const sev        = SEV[finding.severity] || SEV['LOW'];

          return (
            <div
              key={finding.id}
              className="bg-white border border-slate-200 rounded-xl overflow-hidden hover:border-slate-300 transition-colors shadow-sm"
            >
              <div className="p-3 flex items-start gap-2.5">
                {/* Severity dot */}
                <span className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${sev.dot}`} />

                <div className="flex-1 min-w-0">
                  {/* Badges row */}
                  <div className="flex items-center gap-1.5 flex-wrap mb-1">
                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider rounded border ${sev.badge}`}>
                      {finding.severity}
                    </span>
                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-bold rounded border ${
                      finding.is_reachable
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-slate-50 text-slate-400 border-slate-200'
                    }`}>
                      <span className={`w-1 h-1 rounded-full ${finding.is_reachable ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />
                      {finding.is_reachable ? 'Reachable' : 'Isolated'}
                    </span>
                    <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-400 border border-slate-200">
                      {finding.rule_id}
                    </span>
                  </div>

                  <p className="text-[12px] font-semibold text-slate-800 leading-snug">{finding.title}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">{finding.description}</p>

                  <div className="flex items-center gap-1 mt-1.5">
                    <FileCode className="w-3 h-3 text-slate-350 shrink-0" />
                    <span className="font-mono text-[10px] text-slate-400 truncate">{finding.file_path}</span>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex flex-col gap-1.5 shrink-0">
                  {finding.patch_diff && (
                    <button
                      onClick={() => setExpandedId(isOpen ? null : finding.id)}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 border border-slate-200 transition-colors"
                    >
                      <Code2 className="w-3 h-3" />
                      {isOpen ? 'Hide' : 'Patch'}
                      {isOpen ? <ChevronDown className="w-2.5 h-2.5" /> : <ChevronRight className="w-2.5 h-2.5" />}
                    </button>
                  )}

                  {prInfo?.pr_url ? (
                    <a href={prInfo.pr_url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-colors">
                      <GitPullRequest className="w-3 h-3" />
                      View PR
                      <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  ) : finding.patch_diff ? (
                    <button
                      onClick={() => handleCreateFixPR(finding.id)}
                      disabled={isPRBusy}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold text-white bg-slate-800 hover:bg-slate-700 transition-colors disabled:opacity-50"
                    >
                      <GitPullRequest className={`w-3 h-3 ${isPRBusy ? 'animate-spin' : ''}`} />
                      {isPRBusy ? '…' : 'Fix PR'}
                    </button>
                  ) : null}
                </div>
              </div>

              {/* Expanded diff */}
              {isOpen && finding.patch_diff && (
                <div className="border-t border-slate-100">
                  <div className="flex items-center justify-between px-3 py-1.5 bg-slate-50 border-b border-slate-100">
                    <span className="text-[10px] font-bold font-mono text-slate-500">Patch diff</span>
                    <span className="text-[9px] font-semibold text-emerald-600">✓ Verified safe autofix</span>
                  </div>
                  <pre className="px-3 py-2 text-[10px] font-mono leading-relaxed overflow-x-auto bg-white">
                    {finding.patch_diff.split('\n').map((line, i) => (
                      <div key={i}
                        className={
                          line.startsWith('+') ? 'text-emerald-700 bg-emerald-50'
                          : line.startsWith('-') ? 'text-rose-600 bg-rose-50'
                          : line.startsWith('@') ? 'text-blue-600'
                          : 'text-slate-600'
                        }
                      >{line || ' '}</div>
                    ))}
                  </pre>
                </div>
              )}

              {/* PR note */}
              {prResults[finding.id]?.note && (
                <div className="px-3 py-2 flex items-center gap-2 border-t border-slate-100 bg-emerald-50">
                  <Check className="w-3 h-3 text-emerald-600 shrink-0" />
                  <span className="text-[10px] font-mono text-emerald-700">{prResults[finding.id].note}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
