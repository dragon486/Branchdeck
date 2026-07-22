'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ArrowRight, GitBranch, Search, Sparkles, Code2, Globe } from 'lucide-react';

interface RepoPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAnalyze: (repoUrl: string) => void;
  onLoadDemo: () => void;
  analyzing?: boolean;
}

export default function RepoPickerModal({
  isOpen,
  onClose,
  onAnalyze,
  onLoadDemo,
  analyzing = false,
}: RepoPickerModalProps) {
  const [inputUrl, setInputUrl] = useState('');
  const [error, setError] = useState('');

  const PRESET_REPOS = [
    { label: 'Next.js', url: 'https://github.com/vercel/next.js', desc: 'React framework for the web' },
    { label: 'React', url: 'https://github.com/facebook/react', desc: 'UI library for web and native' },
    { label: 'Branchdeck Engine', url: 'https://github.com/dragon486/Branchdeck', desc: 'Codebase intelligence platform' },
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const cleanUrl = inputUrl.trim();
    if (!cleanUrl) {
      setError('Please enter a GitHub repository URL.');
      return;
    }
    if (!cleanUrl.includes('github.com') && !cleanUrl.includes('/')) {
      setError('Please enter a valid GitHub URL (e.g. https://github.com/owner/repo or owner/repo).');
      return;
    }
    onAnalyze(cleanUrl);
    onClose();
  };

  const handleSelectPreset = (url: string) => {
    setInputUrl(url);
    setError('');
    onAnalyze(url);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[999] flex items-center justify-center p-6 overflow-y-auto"
        >
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/80 backdrop-blur-xl"
          />

          {/* Modal Card */}
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.96 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full max-w-lg bg-[#0a0a0f] border border-white/10 rounded-3xl shadow-[0_40px_100px_rgba(0,0,0,0.7)] overflow-hidden"
          >
            {/* Header */}
            <div className="relative px-8 pt-8 pb-6 border-b border-white/10">
              <button
                onClick={onClose}
                className="absolute top-6 right-6 w-8 h-8 rounded-full bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center text-white/40 hover:text-white transition-all"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-3 mb-4">
                <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                  <GitBranch className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-blue-400">Codebase Onboarding</span>
                  <h2 className="text-xl font-bold text-white tracking-tight">Select Repository to Analyze</h2>
                </div>
              </div>
              <p className="text-xs text-white/50 leading-relaxed">
                Paste any public GitHub repository link below. Our indexing engine will parse the AST, build the call flow graph, and trace downstream refactoring impacts.
              </p>
            </div>

            {/* Content */}
            <div className="px-8 py-6 space-y-6">
              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-white/40">
                    GitHub Repository URL
                  </label>
                  <div className="relative">
                    <Search className="w-4 h-4 text-white/30 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={inputUrl}
                      onChange={(e) => setInputUrl(e.target.value)}
                      placeholder="https://github.com/owner/repository"
                      className="w-full bg-white/[0.04] border border-white/10 rounded-xl pl-10 pr-4 py-3 text-xs text-white placeholder-white/25 focus:border-blue-500 focus:bg-white/[0.06] focus:outline-none transition-all font-mono"
                    />
                  </div>
                </div>

                {error && (
                  <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-3">
                    <p className="text-xs text-rose-400 font-medium">{error}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={analyzing}
                  className="w-full bg-white hover:bg-neutral-100 text-neutral-950 font-bold text-xs py-3.5 px-4 rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  <span>{analyzing ? 'Indexing & Analyzing AST...' : 'Analyze Repository'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>

              {/* Preset Repositories */}
              <div className="space-y-2.5">
                <div className="text-[10px] font-bold uppercase tracking-wider text-white/40 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>Or Choose a Quick Preset</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {PRESET_REPOS.map((preset, i) => (
                    <button
                      key={i}
                      onClick={() => handleSelectPreset(preset.url)}
                      className="p-3 bg-white/[0.03] hover:bg-white/[0.08] border border-white/10 rounded-xl text-left transition-all group cursor-pointer"
                    >
                      <div className="text-xs font-bold text-white group-hover:text-blue-400 transition-colors flex items-center justify-between">
                        <span>{preset.label}</span>
                        <Code2 className="w-3 h-3 text-white/30" />
                      </div>
                      <div className="text-[10px] text-white/40 mt-1 line-clamp-1">{preset.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
