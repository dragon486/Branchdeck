'use client';

import React from 'react';
import { BookOpen, AlertCircle } from 'lucide-react';

interface StoryModeProps {
  loading: boolean;
  story: { title: string; steps: string[]; provenance?: string } | null;
  onHoverStep?: (index: number | null) => void;
  onSelectStep?: (index: number) => void;
  activeStepIndex?: number | null;
}

export default function StoryMode({ loading, story, onHoverStep, onSelectStep, activeStepIndex }: StoryModeProps) {
  return (
    <div className="flex flex-col h-full bg-white border border-slate-200/80 rounded-xl overflow-hidden shadow-sm font-sans">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 bg-slate-50/50">
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-slate-800" />
          <span className="text-xs font-bold tracking-wider text-slate-500 uppercase">Architecture Walkthrough</span>
        </div>
      </div>

      <div className="p-4 flex-1 overflow-y-auto">
        {loading && (
          <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-3">
            <div className="w-6 h-6 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs font-medium">Translating data flow to plain English...</span>
          </div>
        )}

        {!loading && !story && (
          <div className="text-center py-12 text-slate-400 text-xs">
            <AlertCircle className="w-8 h-8 mx-auto mb-2 text-slate-300 opacity-80" />
            Select a feature from the left Project Map to tell the system architecture narrative step-by-step.
          </div>
        )}

        {!loading && story && (
          <div className="space-y-4 animate-fadeIn">
            <div className="flex items-center justify-between gap-2 border-l-2 border-slate-800 pl-2">
              <h3 className="text-sm font-extrabold text-slate-800">
                {story.title}
              </h3>
              <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                AI Verified
              </span>
            </div>
            
            <div className="space-y-3 relative before:absolute before:left-3.5 before:top-2 before:bottom-2 before:w-[1px] before:bg-slate-200/85">
              {story.steps.map((step, idx) => {
                const isActive = activeStepIndex === idx;
                return (
                  <div 
                    key={idx} 
                    onMouseEnter={() => onHoverStep?.(idx)}
                    onMouseLeave={() => onHoverStep?.(null)}
                    onClick={() => onSelectStep?.(idx)}
                    className={`flex gap-3 relative cursor-pointer group transition-all ${
                      isActive ? 'scale-[1.02]' : ''
                    }`}
                  >
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black z-10 shadow-sm transition-all ${
                      isActive 
                        ? 'bg-slate-900 text-white ring-4 ring-sky-500/30' 
                        : 'bg-white border border-slate-200 text-slate-800 group-hover:border-slate-400'
                    }`}>
                      {idx + 1}
                    </div>
                    <div className={`flex-1 p-3 rounded-xl text-xs leading-relaxed transition-all shadow-sm ${
                      isActive
                        ? 'bg-sky-50/80 border border-sky-200 text-slate-900 font-medium'
                        : 'bg-slate-50/40 border border-slate-100/90 text-slate-600 group-hover:bg-slate-50 group-hover:border-slate-200'
                    }`}>
                      {step}
                    </div>
                  </div>
                );
              })}
            </div>

            <p className="text-[10px] text-slate-400 italic mt-6 text-center">
              This data flow is generated using static code analysis and AI understanding.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
