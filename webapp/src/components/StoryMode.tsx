'use client';

import React, { useMemo } from 'react';
import { BookOpen, AlertCircle, GitCommit, CheckCircle2, Clock, Code2, Zap, GitBranch, Database, Layers, Cpu } from 'lucide-react';

/* ─── Types ─────────────────────────────────────────────────────────────── */

interface StoryStep {
  text: string;
  author?: string;
  role?: string;
  avatar?: string;
  avatarColor?: string;
  avatarUrl?: string;
  date?: string | null;
  sha?: string;
  file?: string;
  stepType?: string;
  verified?: boolean;
}

interface StoryModeProps {
  loading: boolean;
  story: {
    title: string;
    steps: (string | StoryStep)[];
    provenance?: string;
  } | null;
  onHoverStep?: (index: number | null) => void;
  onSelectStep?: (index: number) => void;
  activeStepIndex?: number | null;
}

/* ─── Step type config ───────────────────────────────────────────────────── */

const STEP_TYPE_CONFIG: Record<string, { icon: React.ReactNode; color: string; bg: string; border: string; label: string }> = {
  initialization: { icon: <Zap className="w-3 h-3" />,      color: 'text-amber-700',  bg: 'bg-amber-50',   border: 'border-amber-200', label: 'Init'       },
  routing:        { icon: <GitBranch className="w-3 h-3" />, color: 'text-blue-700',   bg: 'bg-blue-50',    border: 'border-blue-200',  label: 'Route'      },
  logic:          { icon: <Cpu className="w-3 h-3" />,       color: 'text-violet-700', bg: 'bg-violet-50',  border: 'border-violet-200',label: 'Logic'      },
  integration:    { icon: <Layers className="w-3 h-3" />,    color: 'text-teal-700',   bg: 'bg-teal-50',    border: 'border-teal-200',  label: 'Integrate'  },
  validation:     { icon: <CheckCircle2 className="w-3 h-3" />, color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', label: 'Verify' },
  optimization:   { icon: <Zap className="w-3 h-3" />,       color: 'text-orange-700', bg: 'bg-orange-50',  border: 'border-orange-200',label: 'Optimize'   },
  deployment:     { icon: <Database className="w-3 h-3" />,  color: 'text-indigo-700', bg: 'bg-indigo-50',  border: 'border-indigo-200',label: 'Deploy'     },
  default:        { icon: <Code2 className="w-3 h-3" />,     color: 'text-slate-600',  bg: 'bg-slate-50',   border: 'border-slate-200', label: 'Step'       },
};

const PROVENANCE_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  'github-commits': { label: 'Live GitHub Commits', color: 'text-emerald-700', bg: 'bg-emerald-50',  border: 'border-emerald-200' },
  'database':       { label: 'AST Verified',         color: 'text-sky-700',     bg: 'bg-sky-50',      border: 'border-sky-200'     },
  'database-llm':   { label: 'AI + AST',             color: 'text-violet-700',  bg: 'bg-violet-50',   border: 'border-violet-200'  },
  'synthetic':      { label: 'Code Analysis',        color: 'text-slate-600',   bg: 'bg-slate-100',   border: 'border-slate-200'   },
  'client-rules':   { label: 'Local Analysis',       color: 'text-slate-600',   bg: 'bg-slate-100',   border: 'border-slate-200'   },
};

/* ─── Helpers ───────────────────────────────────────────────────────────── */

function normalizeStep(raw: string | StoryStep, idx: number): StoryStep {
  if (typeof raw === 'string') {
    // Try to parse old "Author implemented: msg" format
    const match = raw.match(/^(.+?)\s+implemented:\s+"(.+)"$/);
    if (match) {
      return { text: match[2], author: match[1], stepType: 'default', verified: false };
    }
    return { text: raw, stepType: 'default', verified: false };
  }
  return raw;
}

/* ─── Avatar ────────────────────────────────────────────────────────────── */

function Avatar({ step }: { step: StoryStep }) {
  const initials = step.avatar || (step.author ? step.author.slice(0, 2).toUpperCase() : '??');
  const color = step.avatarColor || '#64748b';

  if (step.avatarUrl) {
    return (
      <img
        src={step.avatarUrl}
        alt={step.author || 'Developer'}
        className="w-7 h-7 rounded-full ring-2 ring-white shadow-sm object-cover flex-shrink-0"
      />
    );
  }
  return (
    <div
      className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black text-white ring-2 ring-white shadow-sm flex-shrink-0"
      style={{ backgroundColor: color }}
      title={step.author}
    >
      {initials}
    </div>
  );
}

/* ─── Step Card ─────────────────────────────────────────────────────────── */

function StepCard({
  step,
  idx,
  isActive,
  onHover,
  onSelect,
}: {
  step: StoryStep;
  idx: number;
  isActive: boolean;
  onHover: (i: number | null) => void;
  onSelect: (i: number) => void;
}) {
  const typeKey = step.stepType || 'default';
  const typeCfg = STEP_TYPE_CONFIG[typeKey] || STEP_TYPE_CONFIG.default;
  const fileName = step.file?.split('/').pop() || '';

  return (
    <div
      onMouseEnter={() => onHover(idx)}
      onMouseLeave={() => onHover(null)}
      onClick={() => onSelect(idx)}
      className={`
        group relative flex gap-3 cursor-pointer transition-all duration-200
        ${isActive ? 'scale-[1.01]' : ''}
      `}
    >
      {/* Timeline spine + step number */}
      <div className="flex flex-col items-center flex-shrink-0">
        <div className={`
          w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black z-10 shadow-sm
          transition-all duration-200 border-2
          ${isActive
            ? 'bg-slate-900 text-white border-slate-900 ring-4 ring-sky-400/25'
            : 'bg-white text-slate-600 border-slate-200 group-hover:border-slate-400 group-hover:text-slate-900'
          }
        `}>
          {idx + 1}
        </div>
        {/* Connector line — hidden for last item (handled by parent) */}
        <div className="w-px flex-1 bg-slate-100 mt-1 min-h-[8px]" />
      </div>

      {/* Card body */}
      <div className={`
        flex-1 mb-3 rounded-xl border transition-all duration-200 overflow-hidden
        ${isActive
          ? 'bg-sky-50/80 border-sky-200 shadow-sm shadow-sky-100'
          : 'bg-white border-slate-100/90 group-hover:border-slate-200 group-hover:shadow-sm'
        }
      `}>
        {/* Step type header */}
        <div className={`flex items-center justify-between gap-2 px-3 py-1.5 border-b ${isActive ? 'border-sky-100' : 'border-slate-50'}`}>
          <div className={`flex items-center gap-1.5 text-[9.5px] font-bold uppercase tracking-wide ${typeCfg.color}`}>
            {typeCfg.icon}
            <span>{typeCfg.label}</span>
          </div>
          <div className="flex items-center gap-1.5">
            {step.sha && (
              <span className="flex items-center gap-1 text-[9px] font-mono text-slate-400">
                <GitCommit className="w-2.5 h-2.5" />
                {step.sha}
              </span>
            )}
            {step.verified && (
              <span className="flex items-center gap-0.5 text-[9px] font-bold text-emerald-600">
                <CheckCircle2 className="w-2.5 h-2.5" />
                Verified
              </span>
            )}
          </div>
        </div>

        {/* Step description */}
        <p className={`px-3 py-2 text-xs leading-relaxed font-medium ${isActive ? 'text-slate-900' : 'text-slate-600'}`}>
          {step.text}
        </p>

        {/* Footer: developer attribution */}
        {step.author && (
          <div className={`flex items-center justify-between gap-2 px-3 pb-2.5 pt-0.5`}>
            <div className="flex items-center gap-2">
              <Avatar step={step} />
              <div>
                <div className="text-[10px] font-bold text-slate-800 leading-tight">{step.author}</div>
                {step.role && (
                  <div className="text-[9px] text-slate-400 font-medium">{step.role}</div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {fileName && (
                <span className="text-[9px] font-mono text-slate-400 bg-slate-50 border border-slate-100 px-1.5 py-0.5 rounded truncate max-w-[100px]">
                  {fileName}
                </span>
              )}
              {step.date && (
                <span className="flex items-center gap-0.5 text-[9px] text-slate-400">
                  <Clock className="w-2.5 h-2.5" />
                  {step.date}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Main Component ─────────────────────────────────────────────────────── */

export default function StoryMode({ loading, story, onHoverStep, onSelectStep, activeStepIndex }: StoryModeProps) {
  const normalizedSteps = useMemo(() => {
    if (!story?.steps) return [];
    return story.steps.map((s, i) => normalizeStep(s, i));
  }, [story]);

  const provCfg = story?.provenance ? (PROVENANCE_CONFIG[story.provenance] || PROVENANCE_CONFIG['client-rules']) : null;

  const uniqueAuthors = useMemo(() => {
    const seen = new Set<string>();
    return normalizedSteps.filter(s => s.author && !seen.has(s.author) && seen.add(s.author));
  }, [normalizedSteps]);

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden font-sans">
      {/* ─── Panel header ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-slate-100 bg-slate-50/60 flex-shrink-0">
        <div className="w-6 h-6 rounded-lg bg-slate-900 text-white flex items-center justify-center flex-shrink-0">
          <BookOpen className="w-3.5 h-3.5" />
        </div>
        <span className="text-[11px] font-black uppercase tracking-widest text-slate-700">Architecture Walkthrough</span>
        {provCfg && (
          <span className={`ml-auto text-[9px] font-bold px-2 py-0.5 rounded-full border ${provCfg.color} ${provCfg.bg} ${provCfg.border}`}>
            {provCfg.label}
          </span>
        )}
      </div>

      {/* ─── Content area ─────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-4 space-y-1">

        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-400">
            <div className="w-6 h-6 border-2 border-slate-300 border-t-slate-800 rounded-full animate-spin" />
            <span className="text-xs font-medium">Generating architecture narrative...</span>
          </div>
        )}

        {/* Empty */}
        {!loading && !story && (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <div className="w-12 h-12 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center">
              <AlertCircle className="w-5 h-5 text-slate-300" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 mb-1">No story selected</p>
              <p className="text-[10px] text-slate-400 max-w-[200px] leading-relaxed">
                Click a feature in the left panel to generate the architecture walkthrough.
              </p>
            </div>
          </div>
        )}

        {/* Story content */}
        {!loading && story && (
          <div className="space-y-1">
            {/* Story title + contributor row */}
            <div className="mb-4">
              <div className="flex items-start justify-between gap-2 mb-2">
                <h3 className="text-sm font-black text-slate-900 leading-snug">{story.title}</h3>
              </div>

              {/* Contributors summary row */}
              {uniqueAuthors.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[9.5px] font-bold text-slate-400 uppercase tracking-wider">Implemented by</span>
                  <div className="flex -space-x-1.5">
                    {uniqueAuthors.slice(0, 5).map((s, i) => (
                      <div
                        key={i}
                        className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-black text-white ring-1.5 ring-white flex-shrink-0"
                        style={{ backgroundColor: s.avatarColor || '#64748b' }}
                        title={s.author}
                      >
                        {s.avatarUrl ? (
                          <img src={s.avatarUrl} alt={s.author} className="w-full h-full rounded-full object-cover" />
                        ) : s.avatar}
                      </div>
                    ))}
                  </div>
                  <span className="text-[9.5px] text-slate-500 font-medium">
                    {uniqueAuthors.map(a => a.author).join(', ')}
                  </span>
                </div>
              )}
            </div>

            {/* Step list */}
            <div className="relative">
              {normalizedSteps.map((step, idx) => (
                <StepCard
                  key={idx}
                  step={step}
                  idx={idx}
                  isActive={activeStepIndex === idx}
                  onHover={i => onHoverStep?.(i)}
                  onSelect={i => onSelectStep?.(i)}
                />
              ))}
            </div>

            {/* Footer */}
            <p className="text-[9.5px] text-slate-400 text-center pt-2 italic">
              {story.provenance === 'github-commits'
                ? 'Sourced from real GitHub commit history.'
                : story.provenance === 'database'
                ? 'Generated from AST-indexed codebase graph.'
                : 'Generated by static code analysis and AI reasoning.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
