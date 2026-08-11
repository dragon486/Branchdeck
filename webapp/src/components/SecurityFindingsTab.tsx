'use client';

import React, { useState, useEffect } from 'react';
import { 
  ShieldAlert, 
  ShieldCheck, 
  GitPullRequest, 
  AlertTriangle, 
  CheckCircle2, 
  ChevronDown, 
  ChevronRight, 
  Code2, 
  ExternalLink, 
  Filter, 
  RefreshCw,
  Zap,
  Lock,
  FileCode,
  Check
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

export default function SecurityFindingsTab({ commitSha, sessionToken }: SecurityFindingsTabProps) {
  const [findings, setFindings] = useState<SecurityFindingItem[]>([]);
  const [tags, setTags] = useState<SecurityTagItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedDiffs, setExpandedDiffs] = useState<Record<string, boolean>>({});
  const [creatingPR, setCreatingPR] = useState<Record<string, boolean>>({});
  const [prResults, setPRResults] = useState<Record<string, { pr_url?: string; branch?: string; note?: string }>>({});
  const [filterSeverity, setFilterSeverity] = useState<string>('ALL');
  const [filterReachable, setFilterReachable] = useState<boolean | null>(null);

  const fetchFindings = async () => {
    setLoading(true);
    setError(null);
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (sessionToken) {
        headers['Authorization'] = `Bearer ${sessionToken}`;
      } else {
        headers['Authorization'] = 'Bearer local';
      }

      const url = `/api/security/findings${commitSha ? `?commitSha=${encodeURIComponent(commitSha)}` : ''}`;
      const res = await fetch(url, { headers });
      const data = await res.json();

      if (data.success) {
        setFindings(data.findings || []);
        setTags(data.tags || []);
      } else {
        setError(data.error || 'Failed to load security findings.');
      }
    } catch (err: any) {
      setError(err.message || 'Network error fetching security findings.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFindings();
  }, [commitSha, sessionToken]);

  const toggleDiff = (id: string) => {
    setExpandedDiffs((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleCreateFixPR = async (findingId: string) => {
    setCreatingPR((prev) => ({ ...prev, [findingId]: true }));
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (sessionToken) {
        headers['Authorization'] = `Bearer ${sessionToken}`;
      } else {
        headers['Authorization'] = 'Bearer local';
      }

      const res = await fetch('/api/security/fix-pr', {
        method: 'POST',
        headers,
        body: JSON.stringify({ findingId }),
      });

      const data = await res.json();
      if (data.success) {
        setPRResults((prev) => ({
          ...prev,
          [findingId]: {
            pr_url: data.pr_url,
            branch: data.branch,
            note: data.note,
          },
        }));
        // Update local finding PR URL
        setFindings((prev) =>
          prev.map((f) => (f.id === findingId ? { ...f, pr_url: data.pr_url } : f))
        );
      } else {
        alert(`Failed to create fix PR: ${data.error || 'Unknown error'}`);
      }
    } catch (err: any) {
      alert(`Error creating fix PR: ${err.message}`);
    } finally {
      setCreatingPR((prev) => ({ ...prev, [findingId]: false }));
    }
  };

  const filteredFindings = findings.filter((f) => {
    if (filterSeverity !== 'ALL' && f.severity !== filterSeverity) return false;
    if (filterReachable !== null && f.is_reachable !== filterReachable) return false;
    return true;
  });

  const reachableCount = findings.filter((f) => f.is_reachable).length;
  const highSevCount = findings.filter((f) => f.severity === 'HIGH' || f.severity === 'CRITICAL').length;
  const patchableCount = findings.filter((f) => Boolean(f.patch_diff)).length;

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100 rounded-xl overflow-hidden border border-slate-800 shadow-2xl">
      {/* Header Bar */}
      <div className="flex items-center justify-between px-6 py-4 bg-slate-900/80 border-b border-slate-800 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-400">
            <ShieldAlert className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-white tracking-tight">MCP Security Findings & Remediation</h2>
              <span className="px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-full">
                Active Module
              </span>
            </div>
            <p className="text-xs text-slate-400">
              AST call-graph reachability verification & automated patch remediation pass
            </p>
          </div>
        </div>

        <button
          onClick={fetchFindings}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Metrics Summary Strip */}
      <div className="grid grid-cols-4 gap-4 px-6 py-4 bg-slate-900/40 border-b border-slate-800">
        <div className="p-3 bg-slate-900/80 border border-slate-800/80 rounded-lg">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Findings</div>
          <div className="text-2xl font-black text-white mt-1">{findings.length}</div>
        </div>

        <div className="p-3 bg-slate-900/80 border border-slate-800/80 rounded-lg">
          <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">Confirmed Reachable</div>
          <div className="text-2xl font-black text-emerald-400 mt-1">{reachableCount}</div>
        </div>

        <div className="p-3 bg-slate-900/80 border border-slate-800/80 rounded-lg">
          <div className="text-[10px] font-bold uppercase tracking-wider text-rose-400">High / Critical</div>
          <div className="text-2xl font-black text-rose-400 mt-1">{highSevCount}</div>
        </div>

        <div className="p-3 bg-slate-900/80 border border-slate-800/80 rounded-lg">
          <div className="text-[10px] font-bold uppercase tracking-wider text-cyan-400">Auto-Patchable</div>
          <div className="text-2xl font-black text-cyan-400 mt-1">{patchableCount}</div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="flex items-center justify-between px-6 py-3 bg-slate-900/20 border-b border-slate-800/60 text-xs">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 font-semibold text-slate-400">
            <Filter className="w-3.5 h-3.5" /> Severity:
          </span>
          {['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((sev) => (
            <button
              key={sev}
              onClick={() => setFilterSeverity(sev)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${
                filterSeverity === sev
                  ? 'bg-emerald-500 text-slate-950 font-extrabold shadow-sm'
                  : 'bg-slate-800/60 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              {sev}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setFilterReachable(filterReachable === true ? null : true)}
            className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${
              filterReachable === true
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : 'bg-slate-800/60 text-slate-400 hover:bg-slate-800'
            }`}
          >
            Reachable Only
          </button>
        </div>
      </div>

      {/* Main Content List */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {loading && (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
            <RefreshCw className="w-8 h-8 animate-spin text-emerald-400" />
            <span className="text-xs font-semibold">Evaluating call-graph rules & reachability...</span>
          </div>
        )}

        {error && (
          <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-lg text-rose-300 text-xs flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {!loading && !error && filteredFindings.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 border border-dashed border-slate-800 rounded-xl bg-slate-900/30 text-slate-400">
            <ShieldCheck className="w-12 h-12 text-emerald-400 mb-3" />
            <h3 className="text-sm font-bold text-slate-200">No Security Findings Detected</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm text-center">
              All MCP tool endpoints, OAuth scopes, and filesystem parameters passed reachability and sanitizer checks.
            </p>
          </div>
        )}

        {!loading &&
          !error &&
          filteredFindings.map((finding) => {
            const isDiffExpanded = Boolean(expandedDiffs[finding.id]);
            const isPRLoading = Boolean(creatingPR[finding.id]);
            const prInfo = prResults[finding.id] || (finding.pr_url ? { pr_url: finding.pr_url } : null);

            return (
              <div
                key={finding.id}
                className="bg-slate-900/90 border border-slate-800 rounded-xl overflow-hidden hover:border-slate-700 transition-all shadow-lg"
              >
                {/* Finding Header */}
                <div className="p-4 flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1">
                    <div className="mt-1">
                      {finding.severity === 'CRITICAL' || finding.severity === 'HIGH' ? (
                        <ShieldAlert className="w-5 h-5 text-rose-400" />
                      ) : (
                        <AlertTriangle className="w-5 h-5 text-amber-400" />
                      )}
                    </div>

                    <div className="space-y-1.5 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* Severity Badge */}
                        <span
                          className={`px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider rounded ${
                            finding.severity === 'CRITICAL' || finding.severity === 'HIGH'
                              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                              : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          }`}
                        >
                          {finding.severity}
                        </span>

                        {/* Reachability Badge */}
                        <span
                          className={`flex items-center gap-1 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider rounded ${
                            finding.is_reachable
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : 'bg-slate-800 text-slate-400 border border-slate-700'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              finding.is_reachable ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'
                            }`}
                          />
                          {finding.is_reachable ? 'Reachable Path' : 'Dead Code / Isolated'}
                        </span>

                        {/* Rule ID Tag */}
                        <span className="font-mono text-[10px] text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700">
                          {finding.rule_id}
                        </span>
                      </div>

                      <h3 className="text-sm font-bold text-white">{finding.title}</h3>
                      <p className="text-xs text-slate-300 leading-relaxed">{finding.description}</p>

                      <div className="flex items-center gap-3 text-[11px] text-slate-400 pt-1 font-mono">
                        <span className="flex items-center gap-1">
                          <FileCode className="w-3.5 h-3.5 text-slate-400" />
                          {finding.file_path}
                        </span>
                        {finding.details?.doc_url && (
                          <a
                            href={finding.details.doc_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-emerald-400 hover:underline"
                          >
                            Rule Doc <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    {finding.patch_diff && (
                      <button
                        onClick={() => toggleDiff(finding.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors"
                      >
                        <Code2 className="w-3.5 h-3.5" />
                        {isDiffExpanded ? 'Hide Patch' : 'View Patch'}
                        {isDiffExpanded ? (
                          <ChevronDown className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5" />
                        )}
                      </button>
                    )}

                    {prInfo?.pr_url ? (
                      <a
                        href={prInfo.pr_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded-lg hover:bg-emerald-500/30 transition-colors"
                      >
                        <GitPullRequest className="w-3.5 h-3.5" />
                        View Fix PR <ExternalLink className="w-3 h-3" />
                      </a>
                    ) : (
                      finding.patch_diff && (
                        <button
                          onClick={() => handleCreateFixPR(finding.id)}
                          disabled={isPRLoading}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-lg shadow-md transition-all disabled:opacity-50"
                        >
                          <GitPullRequest className={`w-3.5 h-3.5 ${isPRLoading ? 'animate-spin' : ''}`} />
                          {isPRLoading ? 'Opening PR...' : 'Create Fix PR'}
                        </button>
                      )
                    )}
                  </div>
                </div>

                {/* Expanded Diff Preview */}
                {isDiffExpanded && finding.patch_diff && (
                  <div className="border-t border-slate-800 bg-slate-950/90 p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] font-bold text-slate-400 font-mono">Automated Patch Diff</span>
                      <span className="text-[10px] text-emerald-400 font-semibold">Verified Safe Autofix</span>
                    </div>
                    <pre className="font-mono text-xs bg-slate-900 border border-slate-800 rounded-lg p-3 overflow-x-auto text-slate-200 leading-relaxed">
                      {finding.patch_diff}
                    </pre>
                  </div>
                )}

                {/* PR Note / Success Notification */}
                {prInfo?.note && (
                  <div className="px-4 py-2 bg-emerald-500/10 border-t border-slate-800 text-[11px] text-emerald-300 flex items-center gap-2 font-mono">
                    <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>{prInfo.note}</span>
                  </div>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
}
