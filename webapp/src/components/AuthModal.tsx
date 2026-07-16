'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ArrowRight, Loader2, Eye, EyeOff, GitBranch } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialMode?: 'signin' | 'signup';
}

export default function AuthModal({ isOpen, onClose, onSuccess, initialMode = 'signin' }: AuthModalProps) {
  const [mode, setMode] = useState<'signin' | 'signup'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setEmail('');
      setPassword('');
      setError('');
      setSuccessMsg('');
      setLoading(false);
    }
  }, [isOpen, initialMode]);

  // ESC to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handler);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handler);
      document.body.style.overflow = 'auto';
    };
  }, [isOpen, onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    if (!email.trim()) { setError('Please enter your email address.'); return; }
    if (!password || password.length < 6) { setError('Password must be at least 6 characters.'); return; }

    setLoading(true);

    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          setError(error.message);
        } else {
          onSuccess();
          onClose();
        }
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) {
          setError(error.message);
        } else {
          setSuccessMsg('Account created! Check your email to verify, then sign in.');
          setMode('signin');
        }
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const LOGO_SVG = (
    <svg viewBox="0 0 24 24" className="w-full h-full" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L2 7l10 5 10-5-10-5z" />
      <path d="M2 17l10 5 10-5" />
      <path d="M2 12l10 5 10-5" />
    </svg>
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[999] flex items-center justify-center p-6"
        >
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/75 backdrop-blur-xl"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, y: 28, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 28, scale: 0.96 }}
            transition={{ duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full max-w-md overflow-hidden"
          >
            {/* Glass card */}
            <div className="relative bg-[#0A0A0F] border border-white/[0.08] rounded-3xl shadow-[0_40px_100px_rgba(0,0,0,0.6)] overflow-hidden">

              {/* Ambient glow top */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-32 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

              {/* Header */}
              <div className="relative px-8 pt-8 pb-6 border-b border-white/[0.06]">
                <button
                  onClick={onClose}
                  className="absolute top-6 right-6 w-8 h-8 rounded-full bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center text-white/40 hover:text-white/80 transition-all"
                >
                  <X className="w-4 h-4" />
                </button>

                <div className="flex items-center gap-3 mb-6">
                  <div className="w-8 h-8 rounded-xl bg-white/[0.08] border border-white/[0.08] flex items-center justify-center text-white p-1.5">
                    {LOGO_SVG}
                  </div>
                  <span className="text-[13px] font-bold text-white/60 tracking-tight">Branchdeck</span>
                </div>

                <h2 className="text-[22px] font-bold text-white tracking-tight leading-tight">
                  {mode === 'signin' ? 'Welcome back' : 'Create your account'}
                </h2>
                <p className="text-[13px] text-white/40 mt-1.5 leading-relaxed">
                  {mode === 'signin'
                    ? 'Sign in to access your codebase intelligence dashboard.'
                    : 'Get started with AI-powered codebase understanding.'}
                </p>
              </div>

              {/* Form */}
              <div className="px-8 py-6 space-y-4">

                {/* Success message */}
                {successMsg && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3"
                  >
                    <p className="text-[12px] text-emerald-400 font-medium">{successMsg}</p>
                  </motion.div>
                )}

                <form onSubmit={handleSubmit} className="space-y-3">
                  {/* Email */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-white/30">
                      Email Address
                    </label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@company.com"
                      autoComplete="email"
                      className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-3 text-[13px] text-white placeholder-white/20 focus:border-white/20 focus:bg-white/[0.06] focus:outline-none transition-all"
                    />
                  </div>

                  {/* Password */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-white/30">
                      Password
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••••••"
                        autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                        className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-3 pr-12 text-[13px] text-white placeholder-white/20 focus:border-white/20 focus:bg-white/[0.06] focus:outline-none transition-all"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-white/25 hover:text-white/60 transition-colors"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Error */}
                  {error && (
                    <motion.div
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-3"
                    >
                      <p className="text-[12px] text-rose-400 font-medium">{error}</p>
                    </motion.div>
                  )}

                  {/* Submit */}
                  <motion.button
                    type="submit"
                    disabled={loading}
                    whileHover={{ scale: loading ? 1 : 1.01 }}
                    whileTap={{ scale: loading ? 1 : 0.98 }}
                    className="w-full bg-white text-neutral-950 font-bold text-[13px] py-3.5 px-4 rounded-xl hover:bg-neutral-100 transition-all shadow-lg shadow-white/10 flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed mt-1"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        {mode === 'signin' ? 'Signing in...' : 'Creating account...'}
                      </>
                    ) : (
                      <>
                        {mode === 'signin' ? 'Sign In' : 'Create Account'}
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </motion.button>
                </form>

                {/* Toggle mode */}
                <div className="text-center pt-2">
                  <button
                    onClick={() => {
                      setMode(mode === 'signin' ? 'signup' : 'signin');
                      setError('');
                      setSuccessMsg('');
                    }}
                    className="text-[12px] text-white/30 hover:text-white/60 transition-colors"
                  >
                    {mode === 'signin'
                      ? "Don't have an account? Sign up free"
                      : 'Already have an account? Sign in'}
                  </button>
                </div>
              </div>

              {/* Footer */}
              <div className="px-8 pb-6">
                <p className="text-[10px] text-white/15 text-center leading-relaxed">
                  By continuing, you agree to Branchdeck&apos;s Terms of Service and Privacy Policy.
                </p>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
