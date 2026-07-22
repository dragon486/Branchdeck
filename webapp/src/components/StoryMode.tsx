'use client';

import React from 'react';
import { BookOpen, AlertCircle } from 'lucide-react';

interface StoryModeProps {
  loading: boolean;
  story: { title: string; steps: string[]; provenance?: string } | null;
}

export default function StoryMode({ loading, story }: StoryModeProps) {
  return (
    <div className="flex flex-col h-full bg-white border border-slate-200/80 rounded-xl overflow-hidden shadow-sm">
      <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3 bg-slate-50/50">
        <BookOpen className="w-4 h-4 text-slate-800" />
        <span className="text-xs font-bold tracking-wider text-slate-500 uppercase">Architecture Walkthrough</span>
      </div>

      <div className="p-4 flex-1 overflow-y-auto">
        {loading && (
          <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-3">
            <div className="w-6 h-6 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs font-medium">Translating call stack to plain English...</span>
          </div>
        )}

        {!loading && !story && (
          <div className="text-center py-12 text-slate-400 text-xs">
            <AlertCircle className="w-8 h-8 mx-auto mb-2 text-slate-300 opacity-80" />
            Select a feature from the left Project Map, or enter a workflow query to tell the system narrative.
          </div>
        )}

        {!loading && story && (
          <div className="space-y-4 animate-fadeIn">
            <div className="flex items-center justify-between gap-2 border-l-2 border-slate-800 pl-2">
              <h3 className="text-sm font-bold text-slate-700">
                {story.title}
              </h3>
              {story.provenance === 'database-llm' && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                  AI Verified
                </span>
              )}
              {story.provenance && story.provenance.includes('rules') && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                  Degraded: Local Rules
                </span>
              )}
            </div>
            
            <div className="space-y-3 relative before:absolute before:left-3.5 before:top-2 before:bottom-2 before:w-[1px] before:bg-slate-200/85">
              {story.steps.map((step, idx) => (
                <div key={idx} className="flex gap-3 relative">
                  <div className="w-7 h-7 rounded-full bg-white border border-slate-200/80 flex items-center justify-center text-xs font-bold text-slate-800 z-10 shadow-sm">
                    {idx + 1}
                  </div>
                  <div className="flex-1 bg-slate-50/30 border border-slate-100/80 p-3 rounded-lg text-xs text-slate-600 leading-relaxed shadow-sm">
                    {step}
                  </div>
                </div>
              ))}
            </div>

            <p className="text-[10px] text-slate-450 italic mt-6 text-center">
              Generated dynamically via codebase graph walkthrough narration.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
