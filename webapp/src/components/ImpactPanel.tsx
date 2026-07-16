'use client';

import React, { useState } from 'react';
import { AlertCircle, ShieldAlert } from 'lucide-react';
import { ImpactAnalysisResult } from '@/lib/analyzer';

interface ImpactPanelProps {
  onAnalyzeImpact: (symbolName: string) => void;
  impactResult: ImpactAnalysisResult | null;
  loading: boolean;
}

export default function ImpactPanel({ onAnalyzeImpact, impactResult, loading }: ImpactPanelProps) {
  const [query, setQuery] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    onAnalyzeImpact(query.trim());
  };

  return (
    <div className="flex flex-col h-full bg-white border border-slate-200/80 rounded-xl overflow-hidden shadow-sm">
      <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3 bg-slate-50/50">
        <ShieldAlert className="w-4 h-4 text-rose-500" />
        <span className="text-xs font-bold tracking-wider text-slate-500 uppercase">Impact Analysis</span>
      </div>

      <div className="p-4 flex-1 overflow-y-auto space-y-4">
        {/* Search bar trigger */}
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. login() or charge()"
            className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 placeholder-slate-450 focus:border-slate-900 focus:outline-none focus:bg-white transition-colors"
          />
          <button
            type="submit"
            disabled={loading}
            className="bg-slate-900 hover:bg-slate-800 text-white px-3 py-2 rounded-lg text-xs font-semibold transition-colors shadow-sm disabled:opacity-50"
          >
            {loading ? 'Analyzing...' : 'Analyze'}
          </button>
        </form>

        {loading && (
          <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-3">
            <div className="w-6 h-6 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs font-medium">Running DFS call graph traversal...</span>
          </div>
        )}

        {!loading && !impactResult && (
          <div className="text-center py-12 text-slate-400 text-xs">
            <AlertCircle className="w-8 h-8 mx-auto mb-2 text-slate-300 opacity-80" />
            Enter a function name above to simulate impact risks. Try <code className="text-slate-900 bg-slate-100 px-1 py-0.5 rounded font-bold">login()</code> or <code className="text-slate-900 bg-slate-100 px-1 py-0.5 rounded font-bold">charge()</code>.
          </div>
        )}

        {!loading && impactResult && (
          <div className="space-y-4 animate-fadeIn">
            {/* Risk header */}
            <div className="flex items-center justify-between bg-slate-50/50 border border-slate-200 p-3 rounded-lg">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400">Target Symbol</span>
                <div className="text-sm font-bold text-slate-700 font-mono">{impactResult.target}</div>
              </div>
              <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                impactResult.risk === 'High' 
                  ? 'bg-rose-50 text-rose-700 border border-rose-200' 
                  : 'bg-amber-50 text-amber-700 border border-amber-200'
              }`}>
                <span className="w-1.5 h-1.5 rounded-full bg-current" />
                {impactResult.risk} Risk
              </div>
            </div>

            {/* Impact Metric counters */}
            <div className="grid grid-cols-4 gap-2">
              <div className="bg-slate-50/80 border border-slate-100 p-2 rounded-lg text-center shadow-[0_1px_2px_rgba(0,0,0,0.01)]">
                <div className="text-lg font-extrabold text-slate-800">{impactResult.stats.files}</div>
                <div className="text-[9px] text-slate-400 font-bold uppercase">Files</div>
              </div>
              <div className="bg-slate-50/80 border border-slate-100 p-2 rounded-lg text-center shadow-[0_1px_2px_rgba(0,0,0,0.01)]">
                <div className="text-lg font-extrabold text-slate-800">{impactResult.stats.apis}</div>
                <div className="text-[9px] text-slate-400 font-bold uppercase">APIs</div>
              </div>
              <div className="bg-slate-50/80 border border-slate-100 p-2 rounded-lg text-center shadow-[0_1px_2px_rgba(0,0,0,0.01)]">
                <div className="text-lg font-extrabold text-slate-800">{impactResult.stats.services}</div>
                <div className="text-[9px] text-slate-400 font-bold uppercase">Services</div>
              </div>
              <div className="bg-slate-50/80 border border-slate-100 p-2 rounded-lg text-center shadow-[0_1px_2px_rgba(0,0,0,0.01)]">
                <div className="text-lg font-extrabold text-slate-800">{impactResult.stats.screens}</div>
                <div className="text-[9px] text-slate-400 font-bold uppercase">Screens</div>
              </div>
            </div>

            {/* Affected files details list */}
            <div>
              <div className="text-[10px] font-bold uppercase text-slate-400 mb-2">Affected References ({impactResult.affectedList.length})</div>
              <div className="space-y-2">
                {impactResult.affectedList.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between bg-white border border-slate-100 p-2.5 rounded-lg text-xs shadow-sm">
                    <div className="truncate pr-2">
                      <div className="font-mono font-semibold text-slate-700 truncate">{item.name}</div>
                      <div className="text-[9px] text-slate-400 font-mono mt-0.5">{item.path}</div>
                    </div>
                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded ${
                      item.level === 'High' 
                        ? 'bg-rose-50 text-rose-700 border border-rose-100' 
                        : item.level === 'Medium'
                          ? 'bg-amber-50 text-amber-700 border border-amber-100'
                          : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                    }`}>
                      {item.level}
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
