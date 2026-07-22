'use client';
import WaitlistModal from "@/components/WaitlistModal";
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  motion, useScroll, useTransform, AnimatePresence,
  useMotionValue, useSpring, useInView, Variants,
} from 'framer-motion';
import {
  GitBranch, Compass, BookOpen, Search, ArrowRight, CheckCircle2, X, Check, Code, Layers,
  ShieldCheck, FileText, GraduationCap, Sparkles, Play, ChevronDown, ChevronRight, ShieldAlert,
  Terminal, Radio, Zap, Globe, Users, Network, Map, FileSearch, BarChart3, GitMerge, Eye, Cpu, Star, Menu,
  MessageSquare, GitFork, Files, Boxes, Box, Columns, MoreHorizontal,
} from 'lucide-react';
import DotGrid from './DotGrid';
import ScrollVelocity from './ScrollVelocity';
import ProfileCard from './ProfileCard';
import StaggeredMenu from './StaggeredMenu';
import Stepper, { Step } from './Stepper';
import LightRays from './LightRays';
import BorderGlow from './BorderGlow';
import CardSwap, { Card } from './CardSwap';
import FlowingMenu from './FlowingMenu';


/* ═══════════════════════════════════════════════════
   TYPES
═══════════════════════════════════════════════════ */
interface MarketingLandingProps {
  session?: any;
  repoUrl: string;
  setRepoUrl: (url: string) => void;
  analyzing: boolean;
  onAnalyze: (customRepo?: string) => void;
  onLoadDemo: () => void;
  onSignIn?: () => void;
  onSignOut?: () => void;
  onOpenRepoPicker?: () => void;
}

/* ═══════════════════════════════════════════════════
   TYPING ANIMATION HOOK
═══════════════════════════════════════════════════ */
function useTypingAnimation(words: string[], speed = 80, pauseMs = 1800) {
  const [displayed, setDisplayed] = useState('');
  const [wordIdx, setWordIdx] = useState(0);
  const [charIdx, setCharIdx] = useState(0);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const current = words[wordIdx];
    let timeout: ReturnType<typeof setTimeout>;

    if (!deleting && charIdx <= current.length) {
      timeout = setTimeout(() => {
        setDisplayed(current.slice(0, charIdx));
        setCharIdx(c => c + 1);
      }, speed);
    } else if (!deleting && charIdx > current.length) {
      timeout = setTimeout(() => setDeleting(true), pauseMs);
    } else if (deleting && charIdx >= 0) {
      timeout = setTimeout(() => {
        setDisplayed(current.slice(0, charIdx));
        setCharIdx(c => c - 1);
      }, speed / 2);
    } else {
      setDeleting(false);
      setWordIdx(w => (w + 1) % words.length);
    }
    return () => clearTimeout(timeout);
  }, [charIdx, deleting, wordIdx, words, speed, pauseMs]);

  return displayed;
}

/* ═══════════════════════════════════════════════════
   DATA FLOW BACKGROUND — network for CTA section
═══════════════════════════════════════════════════ */
function DataFlowCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight; };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    interface Node { x: number; y: number; vx: number; vy: number; r: number; }
    const nodes: Node[] = Array.from({ length: 30 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.6,
      vy: (Math.random() - 0.5) * 0.6,
      r: Math.random() * 2.5 + 1,
    }));

    const CONN_DIST = 140;

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      // edges
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < CONN_DIST) {
            const alpha = (1 - dist / CONN_DIST) * 0.15;
            ctx.strokeStyle = `rgba(66,133,244,${alpha})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.stroke();
          }
        }
      }
      // nodes
      nodes.forEach(n => {
        ctx.fillStyle = 'rgba(66,133,244,0.25)';
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fill();
        n.x += n.vx; n.y += n.vy;
        if (n.x < 0 || n.x > canvas.width) n.vx *= -1;
        if (n.y < 0 || n.y > canvas.height) n.vy *= -1;
      });
      animRef.current = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(animRef.current); ro.disconnect(); };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none opacity-50" />;
}

/* ═══════════════════════════════════════════════════
   SCROLL PROGRESS BAR
═══════════════════════════════════════════════════ */
function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 100, damping: 30 });
  return <motion.div className="fixed top-0 left-0 right-0 z-[100] h-[2px] bg-neutral-950 origin-left" style={{ scaleX }} />;
}

/* ═══════════════════════════════════════════════════
   FADE-IN WRAPPER
═══════════════════════════════════════════════════ */
// easeOutExpo — premium cinematic ease matching antigravity.google
const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as [number, number, number, number];

function FadeIn({
  children, delay = 0, className = '', direction = 'up',
}: { children: React.ReactNode; delay?: number; className?: string; direction?: 'up' | 'left' | 'right' | 'none'; }) {
  const ref = useRef<HTMLDivElement>(null);
  // Earlier trigger (-100px) so animations start before element reaches viewport center
  const isInView = useInView(ref, { once: true, margin: '-60px' });
  const dirs = {
    up: { hidden: { opacity: 0, y: 28, filter: 'blur(2px)' }, visible: { opacity: 1, y: 0, filter: 'blur(0px)' } },
    left: { hidden: { opacity: 0, x: -32, filter: 'blur(2px)' }, visible: { opacity: 1, x: 0, filter: 'blur(0px)' } },
    right: { hidden: { opacity: 0, x: 32, filter: 'blur(2px)' }, visible: { opacity: 1, x: 0, filter: 'blur(0px)' } },
    none: { hidden: { opacity: 0 }, visible: { opacity: 1 } },
  };
  return (
    <motion.div ref={ref} className={className} initial="hidden"
      animate={isInView ? 'visible' : 'hidden'}
      variants={dirs[direction]}
      transition={{ duration: 0.9, delay, ease: EASE_OUT_EXPO }}>
      {children}
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════
   STAGGER
═══════════════════════════════════════════════════ */
const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.07, delayChildren: 0.15 } },
};
const staggerItem: Variants = {
  hidden: { opacity: 0, y: 22, filter: 'blur(2px)' },
  visible: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.75, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] } },
};

/* ═══════════════════════════════════════════════════
   MAGNETIC BUTTON
═══════════════════════════════════════════════════ */
function MagneticBtn({ children, className = '', onClick }: {
  children: React.ReactNode; className?: string; onClick?: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const x = useMotionValue(0); const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 280, damping: 22 });
  const sy = useSpring(y, { stiffness: 280, damping: 22 });
  return (
    <motion.button ref={ref} style={{ x: sx, y: sy }} whileTap={{ scale: 0.97 }} onClick={onClick}
      onMouseMove={e => {
        const r = ref.current?.getBoundingClientRect();
        if (r) { x.set((e.clientX - r.left - r.width / 2) * 0.25); y.set((e.clientY - r.top - r.height / 2) * 0.25); }
      }}
      onMouseLeave={() => { x.set(0); y.set(0); }}
      className={className}>
      {children}
    </motion.button>
  );
}

/* ═══════════════════════════════════════════════════
   DATA
═══════════════════════════════════════════════════ */
const TYPING_WORDS = ["Codebase", "Repository", "Dependency", "Service", "System"];

const FEATURES = [
  { icon: <Network className="w-5 h-5" />, title: 'Interactive Call Flow', desc: 'Trace function calls in real-time with live collaborator avatars highlighting active developer edits.', color: '#4285F4' },
  { icon: <BookOpen className="w-5 h-5" />, title: 'Architecture Walkthrough', desc: 'Generate dynamic narratives of codebase logic for features, files, or custom queries.', color: '#34A853' },
  { icon: <ShieldAlert className="w-5 h-5" />, title: 'Impact Analysis', desc: 'Simulate refactoring risk, counting affected files, services, and team ownership before committing code.', color: '#EA4335' },
  { icon: <Map className="w-5 h-5" />, title: 'Project Map', desc: 'Toggle between logical feature folders and directory trees, visualizing who is working in each folder.', color: '#FBBC04' },
  { icon: <FileSearch className="w-5 h-5" />, title: 'Natural Language Search', desc: 'Query your repository context to locate precise lines of code and trace downstream impacts.', color: '#9C27B0' },
];

const HOW_IT_WORKS = [
  { step: '01', title: 'Connect Your Codebase', desc: 'Install the VS Code extension or paste a GitHub URL. Indexed in seconds.', icon: <GitBranch className="w-5 h-5" /> },
  { step: '02', title: 'Automatic Analysis', desc: 'Maps every function call, dependency, and file relationship automatically.', icon: <Cpu className="w-5 h-5" /> },
  { step: '03', title: 'Explore Intelligently', desc: 'Navigate, trace, analyze, and narrate — all in one workspace.', icon: <Compass className="w-5 h-5" /> },
];

// Custom per-feature preview illustrations
function FeatureRealPreview({ activeFeature }: { activeFeature: number }) {
  const previews = [
    /* 0 — Interactive Call Flow */
    <div key="callflow" className="w-full h-full bg-slate-50 flex items-center justify-center p-1.5 relative overflow-hidden select-none">
      <img
        src="/preview-callflow.png"
        alt="Interactive Call Flow Live Dashboard"
        className="w-full h-full object-contain rounded-xl border border-neutral-200/50 shadow-sm"
      />
    </div>,

    /* 1 — AI Story Mode */
    <div key="story" className="w-full h-full bg-slate-50 flex items-center justify-center p-1.5 relative overflow-hidden select-none">
      <img
        src="/preview-story.png"
        alt="AI Story Mode Live Dashboard"
        className="w-full h-full object-contain rounded-xl border border-neutral-200/50 shadow-sm"
      />
    </div>,

    /* 2 — Impact Analysis */
    <div key="impact" className="w-full h-full bg-slate-50 flex items-center justify-center p-1.5 relative overflow-hidden select-none">
      <img
        src="/preview-impact.png"
        alt="Impact Analysis Live Dashboard"
        className="w-full h-full object-contain rounded-xl border border-neutral-200/50 shadow-sm"
      />
    </div>,

    /* 3 — Project Map */
    <div key="map" className="w-full h-full bg-[#F8FAFC] p-4 flex flex-col gap-1 overflow-hidden">
      <div className="flex items-center gap-2 mb-2">
        <Map className="w-4 h-4 text-neutral-700" />
        <span className="text-[11px] font-bold text-neutral-900">Project Map</span>
        <span className="ml-auto text-[9px] text-neutral-400">E-commerce API</span>
      </div>
      {[
        { indent: 0, icon: '📁', label: 'src/', expanded: true, count: 6 },
        { indent: 1, icon: '🔐', label: 'auth/', expanded: true, count: 3, color: '#0EA5E9' },
        { indent: 2, icon: '📄', label: 'auth.controller.ts', color: '#F97316' },
        { indent: 2, icon: '📄', label: 'auth.service.ts', color: '#6366F1' },
        { indent: 2, icon: '📄', label: 'jwt.strategy.ts', color: '#6366F1' },
        { indent: 1, icon: '🛒', label: 'checkout/', count: 2, color: '#10B981' },
        { indent: 2, icon: '📄', label: 'checkout.controller.ts', color: '#F97316' },
        { indent: 2, icon: '📄', label: 'order.service.ts', color: '#6366F1' },
        { indent: 1, icon: '💳', label: 'payments/', count: 2, color: '#8B5CF6' },
        { indent: 2, icon: '📄', label: 'payment.service.ts', color: '#6366F1' },
        { indent: 2, icon: '📄', label: 'stripe.adapter.ts', color: '#10B981' },
      ].map((item, i) => (
        <motion.div key={i} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.04, duration: 0.35 }}
          className="flex items-center gap-1.5 cursor-default group rounded-md px-1 py-0.5 hover:bg-white transition-colors"
          style={{ paddingLeft: `${item.indent * 14 + 4}px` }}
        >
          <span className="text-[11px]">{item.icon}</span>
          <span className="text-[10px] font-medium text-neutral-700 flex-1">{item.label}</span>
          {item.count && <span className="text-[8px] font-bold text-neutral-400 bg-neutral-100 px-1.5 rounded-full">{item.count}</span>}
        </motion.div>
      ))}
    </div>,

    /* 4 — Natural Language Search */
    <div key="search" className="w-full h-full bg-white p-6 flex flex-col gap-4">
      <div className="flex items-center gap-2 bg-neutral-950 rounded-xl px-4 py-3">
        <FileSearch className="w-4 h-4 text-white/40 flex-shrink-0" />
        <span className="text-[11px] text-white/70 flex-1 font-mono">How does the checkout payment flow work?</span>
        <div className="w-1.5 h-4 bg-white/60 rounded-sm animate-pulse" />
      </div>
      <div className="text-[9px] font-bold text-neutral-400 uppercase">4 results found</div>
      <div className="flex flex-col gap-2">
        {[
          { file: 'src/checkout/checkout.controller.ts', line: 54, snippet: 'async placeOrder(dto: OrderDto) {', relevance: 98 },
          { file: 'src/payments/payment.service.ts', line: 24, snippet: 'async processPayment(amount, token) {', relevance: 94 },
          { file: 'src/payments/stripe.adapter.ts', line: 8, snippet: 'const charge = await stripe.charges.create', relevance: 87 },
          { file: 'src/orders/order.service.ts', line: 32, snippet: 'async create(createOrderDto: CreateOrderDto)', relevance: 81 },
        ].map((result, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 + i * 0.07 }}
            className="border border-neutral-100 rounded-xl p-3 bg-neutral-50/50 hover:bg-white hover:border-neutral-200 transition-all cursor-pointer group"
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[9px] font-mono text-neutral-500">{result.file}<span className="text-neutral-400">:{result.line}</span></span>
              <span className="text-[8px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded-full">{result.relevance}%</span>
            </div>
            <code className="text-[10px] font-mono text-neutral-800 font-semibold">{result.snippet}</code>
          </motion.div>
        ))}
      </div>
    </div>,
  ];

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={activeFeature}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        className="w-full h-full"
      >
        {previews[activeFeature]}
      </motion.div>
    </AnimatePresence>
  );
}


const USE_CASES = [
  { title: 'For New Developers', desc: 'Reduce onboarding time by making software architecture easier to understand.', icon: <Users className="w-4 h-4" /> },
  { title: 'For Staff Engineers', desc: 'Trace function calls and visualize global dependencies before refactoring.', icon: <Network className="w-4 h-4" /> },
  { title: 'For Engineering Managers', desc: 'Track features and map domains by ownership instead of folder structures.', icon: <Map className="w-4 h-4" /> },
  { title: 'For Enterprise Teams', desc: 'Maintain automated self-documenting code descriptions across large monorepos.', icon: <Cpu className="w-4 h-4" /> },
  { title: 'For Open Source Projects', desc: 'Help new contributors orient themselves and submit code with high confidence.', icon: <CheckCircle2 className="w-4 h-4" /> },
  { title: 'For Legacy Codebases', desc: 'Extract logic flows and write self-documenting code descriptions automatically.', icon: <BookOpen className="w-4 h-4" /> },
];

const LOGO_SVG = (
  <svg viewBox="0 0 24 24" className="w-full h-full" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2L2 7l10 5 10-5-10-5z" />
    <path d="M2 17l10 5 10-5" />
    <path d="M2 12l10 5 10-5" />
  </svg>
);

/* ═══════════════════════════════════════════════════
   HERO COMPONENT (standalone for hook order safety)
   Matches Antigravity.google layout flow and spacing.
 ═══════════════════════════════════════════════════ */
interface HeroProps {
  onLoadDemo: () => void;
  setIsModalOpen: (open: boolean) => void;
  typedWord: string;
  isDarkMode?: boolean;
}

function Hero({ onLoadDemo, setIsModalOpen, typedWord, isDarkMode }: HeroProps) {
  const heroRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"]
  });

  const heroY = useTransform(scrollYProgress, [0, 1], [0, 50]);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.55], [1, 0]);

  const rawScale = useTransform(scrollYProgress, [0, 0.85], [0.96, 1.02]);
  const rawY = useTransform(scrollYProgress, [0, 0.85], [0, -40]);
  const dashboardScale = useSpring(rawScale, { stiffness: 70, damping: 20, restDelta: 0.001 });
  const dashboardY = useSpring(rawY, { stiffness: 70, damping: 20, restDelta: 0.001 });

  return (
    <section ref={heroRef} id="product" className={`relative min-h-screen flex flex-col items-center justify-center overflow-hidden pt-40 pb-32 transition-colors duration-300 ${isDarkMode ? 'bg-[#0A0C16] text-white' : 'bg-[#EEEFF4] text-neutral-900'}`}>
      <div style={{ width: '100%', height: '100%', position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none', opacity: isDarkMode ? 0.35 : 0.12 }}>
        <LightRays
          raysOrigin="top-center"
          raysColor="#3279F9"
          raysSpeed={0.7}
          lightSpread={0.6}
          rayLength={1.8}
          followMouse={true}
          mouseInfluence={0.08}
          noiseAmount={0.05}
          distortion={0.03}
          pulsating={true}
        />
      </div>
      <div style={{ width: '100%', height: '100%', position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none', opacity: isDarkMode ? 0.3 : 1 }}>
        <DotGrid
          dotSize={2.5}
          gap={15}
          baseColor={isDarkMode ? '#3b4260' : '#c0bec4'}
          activeColor={isDarkMode ? '#ffffff' : '#000000'}
          proximity={120}
          shockRadius={200}
          shockStrength={4}
          resistance={750}
          returnDuration={1.5}
        />
      </div>

      <div className="absolute inset-0 overflow-hidden pointer-events-none" style={{ zIndex: 0 }}>
        <div className="orb-1 absolute" style={{
          top: '15%', left: '8%',
          width: 480, height: 480,
          borderRadius: '50%',
          background: isDarkMode ? 'radial-gradient(circle, rgba(66,133,244,0.15) 0%, transparent 70%)' : 'radial-gradient(circle, rgba(66,133,244,0.10) 0%, transparent 70%)',
          filter: 'blur(60px)',
        }} />
        <div className="orb-2 absolute" style={{
          top: '30%', right: '6%',
          width: 360, height: 360,
          borderRadius: '50%',
          background: isDarkMode ? 'radial-gradient(circle, rgba(124,77,255,0.12) 0%, transparent 70%)' : 'radial-gradient(circle, rgba(124,77,255,0.08) 0%, transparent 70%)',
          filter: 'blur(50px)',
        }} />
        <div className="orb-3 absolute" style={{
          bottom: '20%', left: '35%',
          width: 320, height: 320,
          borderRadius: '50%',
          background: isDarkMode ? 'radial-gradient(circle, rgba(0,188,212,0.10) 0%, transparent 70%)' : 'radial-gradient(circle, rgba(0,188,212,0.07) 0%, transparent 70%)',
          filter: 'blur(55px)',
        }} />
      </div>

      <div className="absolute inset-0 pointer-events-none transition-all duration-300"
        style={{ background: isDarkMode ? 'radial-gradient(ellipse 85% 65% at 50% 40%, transparent 25%, rgba(10, 12, 22, 0.85) 100%)' : 'radial-gradient(ellipse 85% 65% at 50% 40%, transparent 25%, rgba(238,239,244,0.7) 100%)' }} />

      <motion.div style={{ y: heroY, opacity: heroOpacity }} className="relative z-10 text-center px-6 max-w-5xl mx-auto w-full">
        <motion.div initial={{ opacity: 0, y: 20, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.7, delay: 0.1, ease: EASE_OUT_EXPO }}
          className={`inline-flex items-center gap-2 border rounded-full px-4 py-1.5 mb-8 shadow-sm transition-colors duration-300 ${isDarkMode ? 'bg-slate-900/90 border-slate-800 text-slate-300' : 'bg-white/85 border-neutral-200 text-neutral-750'}`}>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[12px] font-semibold tracking-wide">AI-Powered Codebase Intelligence</span>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 32, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 1.0, delay: 0.2, ease: EASE_OUT_EXPO }}>
          <h1 className={`text-[clamp(2.6rem,7vw,6.5rem)] font-bold leading-[1.02] tracking-tight mb-6 transition-colors duration-300 ${isDarkMode ? 'text-white' : 'text-neutral-900'}`}>
            Understand Any<br />
            <span className="inline-block min-w-[2px] text-blue-600">
              {typedWord}
              <motion.span
                animate={{ opacity: [1, 0, 1] }}
                transition={{ repeat: Infinity, duration: 0.9 }}
                className="inline-block w-[3px] h-[0.85em] bg-blue-500 ml-1 align-middle rounded-sm"
              />
            </span>
          </h1>
        </motion.div>

        <motion.h2 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.85, delay: 0.38, ease: EASE_OUT_EXPO }}
          className={`text-[clamp(1rem,1.8vw,1.18rem)] font-normal leading-relaxed max-w-2xl mx-auto mb-12 transition-colors duration-300 ${isDarkMode ? 'text-slate-400' : 'text-neutral-500'}`}>
          AI-powered codebase intelligence that transforms complex software into interactive maps, call flows, and human-readable documentation.
        </motion.h2>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.52, ease: EASE_OUT_EXPO }}
          className="flex flex-col items-center justify-center">
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <MagneticBtn
              onClick={() => setIsModalOpen(true)}
              className={`btn-shimmer text-[14px] font-semibold px-8 py-3.5 rounded-full flex items-center gap-2 transition-all shadow-lg group ${isDarkMode ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-900/20' : 'bg-neutral-950 hover:bg-neutral-800 text-white shadow-neutral-900/20'}`}
            >
              Join Waitlist
              <motion.div
                className="inline-block"
                animate={{ x: [0, 3, 0] }}
                transition={{ repeat: Infinity, duration: 1.5 }}
              >
                <ArrowRight className="w-4 h-4" />
              </motion.div>
            </MagneticBtn>
          </div>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.6 }}
            className="text-xs text-neutral-400 mt-4"
          >
            {"Works with GitHub · VS Code · Any language"}
          </motion.p>
        </motion.div>
      </motion.div>

      <motion.div
        style={{ scale: dashboardScale, y: dashboardY }}
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.1, delay: 0.72, ease: EASE_OUT_EXPO }}
        className="relative z-10 w-full max-w-5xl mx-auto px-6 mt-24">
        <RealDashboardPreview onLoadDemo={onLoadDemo} />
        <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 w-2/3 h-28 blur-3xl opacity-15 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse, #4285F4, transparent)' }} />
      </motion.div>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2.0, ease: EASE_OUT_EXPO }}
        className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 z-10">
        <span className="text-[9px] text-neutral-400 font-medium tracking-widest uppercase">Scroll</span>
        <motion.div animate={{ y: [0, 6, 0] }} transition={{ repeat: Infinity, duration: 1.6, ease: 'easeInOut' }}>
          <ChevronDown className="w-4 h-4" />
        </motion.div>
      </motion.div>
    </section>
  );
}

function RealDashboardPreview({ onLoadDemo }: { onLoadDemo: () => void }) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="relative w-full group cursor-pointer"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onLoadDemo}
    >
      {/* Outer glow */}
      <motion.div
        animate={{ opacity: hovered ? 1 : 0.4 }}
        transition={{ duration: 0.4 }}
        className="absolute -inset-px rounded-2xl pointer-events-none"
        style={{ background: 'linear-gradient(135deg, rgba(66,133,244,0.3), rgba(52,168,83,0.2), rgba(234,67,53,0.15))', filter: 'blur(12px)' }}
      />

      {/* Window chrome containing the REAL dashboard image */}
      <div className="relative bg-[#F5F5F5] rounded-2xl overflow-hidden border border-black/[0.06] shadow-[0_8px_60px_rgba(0,0,0,0.12)]">
        <img 
          src="/dashboard-screenshot.png" 
          alt="Branchdeck Real Interactive Codebase Call Flow Dashboard" 
          className="w-full h-auto object-cover transform transition-transform duration-700 group-hover:scale-[1.01]"
        />
      </div>

      {/* Click overlay */}
      <motion.div
        animate={{ opacity: hovered ? 1 : 0 }}
        transition={{ duration: 0.25 }}
        className="absolute inset-0 flex items-center justify-center pointer-events-none rounded-2xl"
        style={{ background: 'rgba(0,0,0,0.06)' }}
      >
        <div className="bg-neutral-950 text-white text-[13px] font-bold px-6 py-3 rounded-full flex items-center gap-2 shadow-2xl">
          <Play className="w-4 h-4" /> Open Live Dashboard
        </div>
      </motion.div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   HERO COMPONENT (standalone for hook order safety)
   Matches Antigravity.google layout flow and spacing.
═══════════════════════════════════════════════════ */


/* ═══════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════ */
export default function MarketingLanding({
  session, repoUrl, setRepoUrl, analyzing, onAnalyze, onLoadDemo, onSignIn, onSignOut, onOpenRepoPicker,
}: MarketingLandingProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [activeFeature, setActiveFeature] = useState(0);
  const [vscodeActiveTab, setVscodeActiveTab] = useState(0);
  const [faqOpenIdx, setFaqOpenIdx] = useState<number | null>(null);
  const { scrollY, scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 100, damping: 30, restDelta: 0.001 });
  const typedWord = useTypingAnimation(TYPING_WORDS);
  const marqueeTexts = useMemo(() => ['Branchdeck ✦', 'Visual Call Flow ✦', 'Refactor Risk Analysis ✦'], []);

  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    const savedTheme = localStorage.getItem('branchdeck-theme') || 'light';
    setIsDarkMode(savedTheme === 'dark');
    document.documentElement.dataset.theme = savedTheme;
  }, []);

  const toggleDarkMode = () => {
    const nextTheme = isDarkMode ? 'light' : 'dark';
    setIsDarkMode(!isDarkMode);
    localStorage.setItem('branchdeck-theme', nextTheme);
    document.documentElement.dataset.theme = nextTheme;
  };

  useEffect(() => { const u = scrollY.on('change', v => setScrolled(v > 50)); return () => u(); }, [scrollY]);
  useEffect(() => { const t = setInterval(() => setActiveFeature(f => (f + 1) % FEATURES.length), 3500); return () => clearInterval(t); }, []);

  /* ── NAVBAR ── */
  const NavBar = () => (
    <motion.header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${scrolled
        ? isDarkMode
          ? 'bg-slate-950/95 backdrop-blur-xl border-b border-slate-800/80 shadow-[0_1px_12px_rgba(0,0,0,0.5)]'
          : 'bg-white/95 backdrop-blur-xl border-b border-neutral-200/80 shadow-[0_1px_12px_rgba(0,0,0,0.04)]'
        : 'bg-transparent'}`}
      initial={{ y: -80, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}>
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5 cursor-pointer select-none">
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-white ${isDarkMode ? 'bg-slate-800' : 'bg-neutral-950'}`}>{LOGO_SVG}</div>
          <span className={`text-[14px] font-bold tracking-tight transition-colors duration-300 ${isDarkMode ? 'text-white' : 'text-neutral-900'}`}>Branchdeck</span>
        </div>
        <nav className="hidden md:flex items-center gap-8">
          {['Product', 'Solutions', 'Features', 'VS Code', 'Docs'].map(item => (
            <a key={item} href={`#${item.toLowerCase().replace(' ', '-')}`}
              className={`text-[13px] font-medium transition-colors duration-200 relative group ${isDarkMode ? 'text-neutral-400 hover:text-white' : 'text-neutral-500 hover:text-neutral-900'}`}>
              {item}
              <span className={`absolute -bottom-0.5 left-0 right-0 h-px scale-x-0 group-hover:scale-x-100 transition-transform duration-200 origin-left ${isDarkMode ? 'bg-white' : 'bg-neutral-900'}`} />
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <span className={`hidden md:block text-[13px] font-medium ${isDarkMode ? 'text-neutral-400' : 'text-neutral-500'}`}>
            In Development
          </span>

          {session ? (
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  if (onOpenRepoPicker) onOpenRepoPicker();
                  else onAnalyze(repoUrl);
                }}
                className="text-[12px] font-bold bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-100 px-4 py-2 rounded-full transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
              >
                <span>Launch Dashboard</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
              {onSignOut && (
                <button
                  onClick={onSignOut}
                  className={`text-[12px] font-semibold transition-colors px-3 py-2 rounded-full ${isDarkMode ? 'text-neutral-400 hover:text-white' : 'text-neutral-500 hover:text-neutral-900'}`}
                >
                  Sign Out
                </button>
              )}
            </div>
          ) : (
            onSignIn && (
              <button
                onClick={onSignIn}
                className={`hidden md:block text-[13px] font-semibold transition-colors px-4 py-2 rounded-full ${isDarkMode ? 'text-neutral-300 hover:text-white hover:bg-slate-900' : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100'}`}
              >
                Sign In
              </button>
            )
          )}

          {/* Theme Toggle Switch */}
          <button
            onClick={toggleDarkMode}
            className={`relative w-12 h-7 rounded-full p-0.5 transition-colors duration-300 border flex items-center cursor-pointer ${
              isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-neutral-100 border-neutral-350'
            }`}
            aria-label="Toggle theme"
          >
            {/* Sliding knob */}
            <motion.div
              layout
              className={`w-5.5 h-5.5 rounded-full flex items-center justify-center shadow-md transition-colors ${
                isDarkMode ? 'bg-slate-800 text-yellow-400' : 'bg-white text-neutral-600'
              }`}
              animate={{ x: isDarkMode ? 20 : 0 }}
              transition={{ type: "spring", stiffness: 500, damping: 30 }}
            >
              {isDarkMode ? (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="12" cy="12" r="5"></circle>
                  <line x1="12" y1="1" x2="12" y2="3"></line>
                  <line x1="12" y1="21" x2="12" y2="23"></line>
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
                  <line x1="1" y1="12" x2="3" y2="12"></line>
                  <line x1="21" y1="12" x2="23" y2="12"></line>
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
                </svg>
              )}
            </motion.div>
          </button>

          <MagneticBtn
            onClick={() => setIsModalOpen(true)}
            className={`text-[13px] font-semibold px-5 py-2.5 rounded-full transition-all shadow-sm flex items-center gap-2 ${isDarkMode ? 'bg-blue-600 hover:bg-blue-500 text-white' : 'bg-neutral-950 hover:bg-neutral-800 text-white'}`}
          >
            Join Waitlist
          </MagneticBtn>

          {/* Mobile menu trigger is handled by StaggeredMenu */}
        </div>
      </div>
    </motion.header>
  );


  /* ── TAGLINE BAND ── */
  const TaglineBand = () => {
    const quoteWords = "Branchdeck is your AI codebase intelligence platform, letting any developer instantly understand and navigate complex software.".split(' ');
    const ref = useRef<HTMLDivElement>(null);
    const isInView = useInView(ref, { once: true, margin: '-60px' });
    return (
      <section className="bg-neutral-950 py-28 px-6">
        <div className="max-w-5xl mx-auto text-center space-y-4">
          <div ref={ref} className="text-[clamp(1.3rem,3vw,2.4rem)] font-semibold text-white leading-tight tracking-tight max-w-3xl mx-auto">
            {quoteWords.map((word, i) => (
              <span
                key={i}
                className="word-reveal inline-block mr-[0.25em]"
                style={{
                  animationDelay: isInView ? `${i * 0.045}s` : '0s',
                  animationPlayState: isInView ? 'running' : 'paused',
                  opacity: isInView ? undefined : 0,
                }}
              >
                {word}
              </span>
            ))}
          </div>
          <FadeIn delay={0.6} className="mt-12 flex items-center justify-center gap-5 flex-wrap">
            {[Network, BookOpen, ShieldAlert, Map, FileSearch, BarChart3, GitMerge, Eye, Cpu, Star, Zap, Globe].map((Icon, i) => (
              <motion.div key={i}
                whileHover={{ scale: 1.2, backgroundColor: 'rgba(255,255,255,0.15)', y: -3 }}
                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                className="w-10 h-10 rounded-full bg-white/[0.07] flex items-center justify-center border border-white/[0.06] cursor-default">
                <Icon className="w-4 h-4 text-white/50" />
              </motion.div>
            ))}
          </FadeIn>
        </div>
      </section>
    );
  };

  /* ── FEATURES ── */
  const Features = () => (
    <section id="features" className={`py-44 px-6 transition-colors duration-300 ${isDarkMode ? 'bg-[#0B0C15]' : 'bg-[#EEEFF4]'}`}>
      <div className="max-w-7xl mx-auto">
        <FadeIn className="text-center mb-24">
          <span className={`text-[11px] font-bold uppercase tracking-[0.15em] mb-4 block transition-colors ${isDarkMode ? 'text-slate-500' : 'text-neutral-400'}`}>Built for Modern Engineering Teams</span>
          <h2 className={`text-[clamp(2rem,4vw,3.2rem)] font-bold tracking-tight leading-tight transition-colors ${isDarkMode ? 'text-white' : 'text-neutral-900'}`}>Everything you need to<br />understand large codebases</h2>
          <p className={`mt-5 text-[16px] font-normal leading-relaxed max-w-2xl mx-auto transition-colors ${isDarkMode ? 'text-slate-400' : 'text-neutral-500'}`}>
            From architecture visualization to dependency tracking and AI-powered code explanations, BranchDeck gives every engineer complete context before writing code.
          </p>
        </FadeIn>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start mb-20">
          <div className="lg:col-span-4 space-y-2">
            {FEATURES.map((f, i) => (
              <motion.button key={i} onClick={() => setActiveFeature(i)}
                whileHover={{ x: activeFeature === i ? 0 : 6 }}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                className={`w-full text-left p-5 rounded-xl border transition-all duration-400 ${activeFeature === i
                  ? 'bg-neutral-950 border-neutral-950 shadow-lg text-white'
                  : isDarkMode
                    ? 'bg-slate-900/60 border-slate-800 text-slate-300 hover:border-slate-700'
                    : 'bg-white border-neutral-200 hover:border-neutral-300 hover:shadow-md text-neutral-900'
                  }`}>
                <div className="flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${activeFeature === i ? 'bg-white/15' : isDarkMode ? 'bg-slate-800 border border-slate-700' : 'bg-neutral-50 border border-neutral-200'
                    }`}
                    style={{ color: activeFeature === i ? 'white' : f.color }}>
                    {f.icon}
                  </div>
                  <div>
                    <div className={`text-[13px] font-bold mb-0.5 ${activeFeature === i ? 'text-white' : isDarkMode ? 'text-slate-200' : 'text-neutral-900'}`}>{f.title}</div>
                    <div className={`text-[11px] leading-relaxed ${activeFeature === i ? 'text-white/65' : isDarkMode ? 'text-slate-450' : 'text-neutral-400'}`}>{f.desc}</div>
                  </div>
                </div>
              </motion.button>
            ))}
          </div>

          <div className="lg:col-span-8">
            <AnimatePresence mode="wait">
              <motion.div key={activeFeature}
                initial={{ opacity: 0, y: 20, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -20, scale: 0.98 }} transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                className={`rounded-2xl overflow-hidden border h-[440px] relative shadow-xl transition-colors ${isDarkMode ? 'border-slate-800 bg-slate-900' : 'border-neutral-200 bg-white'}`}>
                {/* Title bar */}
                <div className={`flex items-center gap-2 px-4 py-3 border-b transition-colors ${isDarkMode ? 'border-slate-800 bg-slate-900' : 'border-neutral-100 bg-white'}`}>
                  <div className="flex gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-[#FF5F57]" /><div className="w-2.5 h-2.5 rounded-full bg-[#FFBD2E]" /><div className="w-2.5 h-2.5 rounded-full bg-[#28C840]" /></div>
                  <span className={`ml-2 text-[10px] font-semibold flex items-center gap-1.5 transition-colors ${isDarkMode ? 'text-slate-400' : 'text-neutral-500'}`}>
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    {FEATURES[activeFeature].title} — Live Preview
                  </span>
                </div>
                {/* Feature-specific real preview */}
                <div className="h-[calc(100%-44px)] overflow-hidden">
                  <FeatureRealPreview activeFeature={activeFeature} />
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        <motion.div variants={staggerContainer} initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-80px' }}
          className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-5">
          {FEATURES.map((f, i) => (
            <motion.div key={i} variants={staggerItem}
              whileHover={{ y: -5, scale: 1.02 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              onClick={() => setActiveFeature(i)}
              className="cursor-pointer">
              <BorderGlow backgroundColor={isDarkMode ? '#0d111a' : '#ffffff'} glowColor={isDarkMode ? '60 140 250' : '60 120 240'} glowIntensity={0.9} borderRadius={16}>
                <div className="p-5">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-4 border shadow-sm transition-colors ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-neutral-50 border border-neutral-200'}`} style={{ color: f.color }}>
                    {f.icon}
                  </div>
                  <div className={`text-[12px] font-bold mb-1.5 transition-colors ${isDarkMode ? 'text-white' : 'text-neutral-900'}`}>{f.title}</div>
                  <div className={`text-[11px] leading-relaxed transition-colors ${isDarkMode ? 'text-slate-450' : 'text-neutral-500'}`}>{f.desc.slice(0, 58)}...</div>
                  <div className={`mt-4 flex items-center gap-1 text-[11px] font-semibold transition-colors ${isDarkMode ? 'text-slate-400' : 'text-neutral-400'}`}>
                    Learn more <ArrowRight className="w-3 h-3" />
                  </div>
                </div>
              </BorderGlow>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
  /* ── PERFECT FOR ── */
  const PerfectFor = () => (
    <section className={`py-24 px-6 border-t border-b transition-colors duration-300 ${isDarkMode ? 'bg-[#070913] border-slate-900' : 'bg-white border-neutral-200/50'}`}>
      <div className="max-w-6xl mx-auto">
        <FadeIn className="text-center mb-16">
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-widest mb-4 border transition-colors ${
            isDarkMode 
              ? 'bg-blue-950/60 border-blue-800/80 text-blue-400' 
              : 'bg-blue-50 border-blue-200/80 text-blue-600 shadow-sm'
          }`}>
            FEATURES
          </span>
          <h2 className={`text-[clamp(2.2rem,4vw,3.2rem)] font-extrabold tracking-tight transition-colors ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
            Perfect For
          </h2>
          <p className={`mt-3 text-[15px] font-medium max-w-xl mx-auto leading-relaxed transition-colors ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
            BranchDeck adapts to the way every engineering team works.
          </p>
        </FadeIn>

        {/* Row 1: 4 Cards */}
        <motion.div 
          variants={staggerContainer} 
          initial="hidden" 
          whileInView="visible" 
          viewport={{ once: true }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
        >
          {[
            { icon: <Code className="w-4 h-4" />, title: "Software Engineering Teams", desc: "Understand and onboard faster with complete codebase context." },
            { icon: <Layers className="w-4 h-4" />, title: "DevOps & SRE Teams", desc: "Visualize dependencies and streamline system operations." },
            { icon: <ShieldCheck className="w-4 h-4" />, title: "Product Engineering", desc: "Make informed decisions with clarity across the stack." },
            { icon: <Users className="w-4 h-4" />, title: "New Team Members", desc: "Onboard in minutes and become productive from day one." }
          ].map((item, i) => (
            <motion.div key={i} variants={staggerItem}
              whileHover={{ y: -4, boxShadow: isDarkMode ? '0 12px 30px rgba(0,0,0,0.4)' : '0 12px 30px rgba(0,0,0,0.06)' }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className={`p-5 border rounded-2xl flex items-start gap-3.5 text-left transition-colors duration-300 ${
                isDarkMode ? 'bg-[#0E1220] border-slate-800/90 shadow-md hover:border-slate-700' : 'bg-white border-slate-200/80 shadow-[0_2px_8px_rgba(0,0,0,0.02)]'
              }`}>
              <div className={`w-9 h-9 rounded-xl border flex items-center justify-center flex-shrink-0 shadow-sm mt-0.5 ${
                isDarkMode ? 'bg-emerald-950/60 border-emerald-800/80 text-emerald-400' : 'bg-emerald-50 border-emerald-200/60 text-emerald-600'
              }`}>
                {item.icon}
              </div>
              <div>
                <h3 className={`text-[13px] font-bold tracking-tight mb-1 transition-colors ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>{item.title}</h3>
                <p className={`text-[11px] leading-relaxed transition-colors ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>{item.desc}</p>
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* Row 2: 3 Centered Cards */}
        <motion.div 
          variants={staggerContainer} 
          initial="hidden" 
          whileInView="visible" 
          viewport={{ once: true }}
          className="flex flex-wrap justify-center gap-4 mt-4"
        >
          {[
            { icon: <Search className="w-4 h-4" />, title: "Technical Leads", desc: "Get deep insights and trace complex logic quickly." },
            { icon: <FileText className="w-4 h-4" />, title: "Engineering Managers", desc: "Track progress, reduce risk and improve team efficiency." },
            { icon: <GraduationCap className="w-4 h-4" />, title: "Students & Educators", desc: "Learn, explore and understand real-world codebases." }
          ].map((item, i) => (
            <motion.div key={i} variants={staggerItem}
              whileHover={{ y: -4, boxShadow: isDarkMode ? '0 12px 30px rgba(0,0,0,0.4)' : '0 12px 30px rgba(0,0,0,0.06)' }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className={`p-5 border rounded-2xl flex items-start gap-3.5 text-left w-full sm:w-[calc(50%-8px)] lg:w-[360px] transition-colors duration-300 ${
                isDarkMode ? 'bg-[#0E1220] border-slate-800/90 shadow-md hover:border-slate-700' : 'bg-white border-slate-200/80 shadow-[0_2px_8px_rgba(0,0,0,0.02)]'
              }`}>
              <div className={`w-9 h-9 rounded-xl border flex items-center justify-center flex-shrink-0 shadow-sm mt-0.5 ${
                isDarkMode ? 'bg-emerald-950/60 border-emerald-800/80 text-emerald-400' : 'bg-emerald-50 border-emerald-200/60 text-emerald-600'
              }`}>
                {item.icon}
              </div>
              <div>
                <h3 className={`text-[13px] font-bold tracking-tight mb-1 transition-colors ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>{item.title}</h3>
                <p className={`text-[11px] leading-relaxed transition-colors ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>{item.desc}</p>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );

  /* ── COMPARISON SECTION ── */
  const ComparisonSection = () => (
    <section className={`py-32 px-6 border-t border-b transition-colors duration-300 ${isDarkMode ? 'bg-[#070913] border-slate-900' : 'bg-white border-neutral-200/50'}`}>
      <div className="max-w-4xl mx-auto">
        <FadeIn className="text-center mb-16">
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-widest mb-4 border transition-colors ${
            isDarkMode 
              ? 'bg-blue-950/60 border-blue-800/80 text-blue-400' 
              : 'bg-blue-50 border-blue-200/80 text-blue-600 shadow-sm'
          }`}>
            WHY BRANCHDECK?
          </span>
          <h2 className={`text-[clamp(2.2rem,4vw,3.2rem)] font-extrabold tracking-tight transition-colors ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
            Why BranchDeck?
          </h2>
          <p className={`mt-3 text-[15px] font-medium max-w-xl mx-auto leading-relaxed transition-colors ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
            We combine powerful code intelligence with an intuitive experience.
          </p>
        </FadeIn>

        {/* Comparison Table Container */}
        <FadeIn className={`rounded-3xl overflow-hidden border shadow-[0_8px_30px_rgba(0,0,0,0.04)] relative transition-colors duration-300 ${
          isDarkMode ? 'bg-[#0E1220] border-slate-800/90 shadow-black/40' : 'bg-white border-slate-200/90'
        }`}>
          {/* Header Row */}
          <div className="grid grid-cols-2 relative">
            <div className="bg-slate-950 text-white py-4 px-6 flex items-center justify-center gap-2 text-xs font-bold font-mono tracking-wide border-r border-slate-800">
              <Layers className="w-4 h-4 text-white" />
              <span>With BranchDeck</span>
            </div>

            {/* Center VS Circle */}
            <div className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full border shadow-md flex items-center justify-center text-[10px] font-extrabold tracking-wider ${
              isDarkMode ? 'bg-[#0E1220] border-slate-700 text-blue-400' : 'bg-white border-slate-200 text-blue-600'
            }`}>
              VS
            </div>

            <div className={`py-4 px-6 flex items-center justify-center text-xs font-bold font-mono tracking-wide ${
              isDarkMode ? 'bg-slate-900/90 text-slate-300' : 'bg-slate-100/90 text-slate-700'
            }`}>
              Without BranchDeck
            </div>
          </div>

          {/* Comparison Rows */}
          <div className={`divide-y ${isDarkMode ? 'divide-slate-800/80' : 'divide-slate-100'}`}>
            {[
              {
                with: "Visualize the entire codebase in seconds",
                without: "Spend hours reading through files and docs"
              },
              {
                with: "AI explains complex logic in simple terms",
                without: "Struggle to understand unfamiliar code"
              },
              {
                with: "Instant impact analysis before making changes",
                without: "Risk unexpected bugs and broken dependencies"
              },
              {
                with: "Powerful search across code, docs & architecture",
                without: "Juggle multiple tools and lose context"
              },
              {
                with: "Everything in one place, beautifully organized",
                without: "Scattered information across drives and docs"
              }
            ].map((row, idx) => (
              <div key={idx} className="grid grid-cols-2 text-xs">
                {/* With BranchDeck */}
                <div className={`py-4 px-6 flex items-center gap-3 font-semibold border-r transition-colors ${
                  isDarkMode ? 'bg-emerald-950/20 text-emerald-300 border-slate-800/80' : 'bg-emerald-50/20 text-slate-800 border-slate-100'
                }`}>
                  <div className={`w-5 h-5 rounded-full border flex items-center justify-center flex-shrink-0 ${
                    isDarkMode ? 'bg-emerald-950 border-emerald-700/60' : 'bg-emerald-100 border-emerald-200'
                  }`}>
                    <Check className={`w-3.5 h-3.5 stroke-[3] ${isDarkMode ? 'text-emerald-400' : 'text-emerald-600'}`} />
                  </div>
                  <span>{row.with}</span>
                </div>

                {/* Without BranchDeck */}
                <div className={`py-4 px-6 flex items-center gap-3 font-normal transition-colors ${
                  isDarkMode ? 'bg-rose-950/20 text-rose-300' : 'bg-rose-50/40 text-slate-600'
                }`}>
                  <div className={`w-5 h-5 rounded-full border flex items-center justify-center flex-shrink-0 ${
                    isDarkMode ? 'bg-rose-950 border-rose-800/60' : 'bg-rose-100 border-rose-200'
                  }`}>
                    <X className={`w-3.5 h-3.5 stroke-[3] ${isDarkMode ? 'text-rose-400' : 'text-rose-500'}`} />
                  </div>
                  <span>{row.without}</span>
                </div>
              </div>
            ))}
          </div>
        </FadeIn>

        {/* Bottom CTA Card */}
        <FadeIn delay={0.2} className="mt-10">
          <div className={`max-w-2xl mx-auto border p-2.5 pl-6 rounded-full shadow-[0_4px_20px_rgba(0,0,0,0.03)] flex items-center justify-between gap-4 transition-colors ${
            isDarkMode ? 'bg-[#0E1220] border-slate-800 shadow-black/30' : 'bg-white border-slate-200/90'
          }`}>
            <div className="flex items-center gap-3">
              <Sparkles className="w-4 h-4 text-blue-500" />
              <span className={`text-xs font-bold transition-colors ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>
                Experience the clarity. Ship better software.
              </span>
            </div>
            <button
              onClick={onLoadDemo}
              className={`text-xs font-bold px-5 py-2.5 rounded-full transition-all shadow-sm flex items-center gap-1.5 cursor-pointer hover:gap-2 ${
                isDarkMode ? 'bg-blue-600 hover:bg-blue-500 text-white' : 'bg-slate-950 hover:bg-slate-850 text-white'
              }`}
            >
              <span>Join Waitlist</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </FadeIn>
      </div>
    </section>
  );

  /* ── HOW IT WORKS ── */
  const HowItWorks = () => (
    <section className={`py-36 px-6 transition-colors duration-300 ${isDarkMode ? 'bg-[#0B0C15]' : 'bg-[#FAFAFB]'}`}>
      <div className="max-w-5xl mx-auto">
        <FadeIn className="text-center mb-20">
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-widest mb-4 border transition-colors ${
            isDarkMode 
              ? 'bg-blue-950/60 border-blue-800/80 text-blue-400' 
              : 'bg-blue-50 border-blue-200/80 text-blue-600 shadow-sm'
          }`}>
            SIMPLE SETUP
          </span>
          <h2 className={`text-[clamp(2.2rem,4vw,3.2rem)] font-extrabold tracking-tight transition-colors ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
            How Branchdeck works
          </h2>
          <p className={`mt-3 text-[15px] font-medium max-w-xl mx-auto leading-relaxed transition-colors ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
            Zero config. Works with your existing tools. Ready in 60 seconds.
          </p>
        </FadeIn>
        <div className="relative">
          <div className={`hidden md:block absolute top-10 left-[16.66%] right-[16.66%] h-px transition-colors duration-300 ${isDarkMode ? 'bg-gradient-to-r from-transparent via-slate-800 to-transparent' : 'bg-gradient-to-r from-transparent via-slate-200 to-transparent'}`} />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            {HOW_IT_WORKS.map((step, i) => (
              <FadeIn key={i} delay={i * 0.12} className="relative text-center">
                <motion.div
                  whileHover={{ scale: 1.08, rotate: -2, boxShadow: '0 20px 50px rgba(0,0,0,0.12)' }}
                  transition={{ type: 'spring', stiffness: 280, damping: 20 }}
                  className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-md cursor-default transition-colors duration-300 ${isDarkMode ? 'bg-blue-600 text-white shadow-blue-900/20' : 'bg-slate-950 text-white shadow-slate-900/15'}`}>
                  {step.icon}
                </motion.div>
                <div className={`text-[11px] font-extrabold uppercase tracking-widest mb-2 transition-colors ${isDarkMode ? 'text-slate-400' : 'text-blue-600'}`}>{step.step}</div>
                <h3 className={`text-[17px] font-extrabold mb-3 transition-colors ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{step.title}</h3>
                <p className={`text-[13px] leading-relaxed transition-colors ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>{step.desc}</p>
              </FadeIn>
            ))}
          </div>
        </div>
      </div>
    </section>
  );

  /* ── USE CASES ── */
  const UseCases = () => (
    <section id="solutions" className={`py-36 px-6 transition-colors duration-300 ${isDarkMode ? 'bg-[#0B0C15]' : 'bg-white'}`}>
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-16 items-center">
          <FadeIn direction="left" className="lg:col-span-4 space-y-6">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-widest border transition-colors ${
              isDarkMode 
                ? 'bg-blue-950/60 border-blue-800/80 text-blue-400' 
                : 'bg-blue-50 border-blue-200/80 text-blue-600 shadow-sm'
            }`}>
              SOLUTIONS MATRIX
            </span>
            <h2 className={`text-[clamp(2.2rem,3.8vw,3rem)] font-extrabold tracking-tight leading-tight transition-colors ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
              See the whole picture.<br />Dive into the details.
            </h2>
            <p className={`text-[14px] leading-relaxed transition-colors ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
              BranchDeck transforms complex repositories into interactive architecture maps, AI-generated code walkthroughs, dependency graphs, and impact analysis—helping engineering teams understand software faster.
            </p>
            <div className="pt-2 space-y-3.5">
              {[
                'Visual software architecture maps',
                'Interactive software dependency graphs',
                'Trace function call flows',
                'Understand legacy code monorepos',
                'Self-documenting code walkthroughs'
              ].map((item, i) => (
                <motion.div key={i} className={`flex items-center gap-3 text-[13px] font-medium transition-colors duration-300 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}
                  initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }} transition={{ delay: i * 0.08, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}>
                  <CheckCircle2 className={`w-4 h-4 flex-shrink-0 transition-colors ${isDarkMode ? 'text-emerald-500' : 'text-emerald-600'}`} /> {item}
                </motion.div>
              ))}
            </div>
          </FadeIn>
          <FadeIn direction="right" delay={0.2} className="lg:col-span-8">
            <motion.div variants={staggerContainer} initial="hidden" whileInView="visible" viewport={{ once: true }}
              className="grid grid-cols-2 md:grid-cols-3 gap-5">
              {USE_CASES.map((uc, i) => (
                <motion.div key={i} variants={staggerItem}
                  whileHover={{ y: -6, boxShadow: '0 16px 36px rgba(0,0,0,0.06)' }}
                  transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                  className={`border rounded-2xl p-6 space-y-3.5 cursor-default transition-all duration-300 ${
                    isDarkMode ? 'bg-slate-900/60 border-slate-800' : 'bg-white border-slate-200/90 shadow-sm hover:border-slate-300'
                  }`}>
                  <motion.div
                    whileHover={{ scale: 1.1, rotate: -5 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 18 }}
                    className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors duration-300 ${isDarkMode ? 'bg-slate-800 text-blue-400' : 'bg-slate-950 text-white'}`}>
                    {uc.icon}
                  </motion.div>
                  <h3 className={`text-[13px] font-bold tracking-tight transition-colors ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{uc.title}</h3>
                  <p className={`text-[11px] leading-relaxed transition-colors ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>{uc.desc}</p>
                </motion.div>
              ))}
            </motion.div>
          </FadeIn>
        </div>
      </div>
    </section>
  );

  /* ── VS CODE SECTION ── */
  const VsCodeSection = () => {
    const EXTENSION_FEATURES = [
      {
        icon: <MessageSquare className="w-5 h-5 text-indigo-400" />,
        title: "Codebase Chat",
        subtitle: "Ask anything about your code."
      },
      {
        icon: <FileSearch className="w-5 h-5 text-slate-400" />,
        title: "Go to Definition",
        subtitle: "Jump to any function or file."
      },
      {
        icon: <GitFork className="w-5 h-5 text-slate-400" />,
        title: "Impact Analysis",
        subtitle: "See what changes break."
      },
      {
        icon: <Sparkles className="w-5 h-5 text-slate-400" />,
        title: "Smart Context",
        subtitle: "AI that understands your project."
      }
    ];

    return (
      <section className={`py-32 px-6 overflow-hidden border-t border-b transition-colors duration-300 ${
        isDarkMode ? 'bg-[#070913] border-white/5 text-white' : 'bg-[#FAFAFB] border-slate-200/60 text-slate-900'
      }`}>
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center">
          {/* Left Column */}
          <FadeIn direction="left" className="lg:col-span-5 space-y-6">
            <div>
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-widest mb-3 border transition-colors ${
                isDarkMode 
                  ? 'bg-indigo-950/60 border-indigo-800/80 text-indigo-400' 
                  : 'bg-blue-50 border-blue-200/80 text-blue-600 shadow-sm'
              }`}>
                VS CODE EXTENSION
              </span>
              <h2 className={`text-[clamp(2.4rem,4.5vw,3.5rem)] font-extrabold tracking-tight leading-[1.1] transition-colors ${
                isDarkMode ? 'text-white' : 'text-slate-900'
              }`}>
                Works inside<br />your editor<span className="text-blue-600">.</span>
              </h2>
              <p className={`text-[14px] font-normal leading-relaxed mt-4 max-w-md transition-colors ${
                isDarkMode ? 'text-slate-400' : 'text-slate-600'
              }`}>
                Install the Branchdeck VS Code extension and get AI-powered codebase intelligence without ever leaving your editor.<br />
                Zero context switching.
              </p>
            </div>

            {/* Vertical Stack Cards */}
            <div className="space-y-3 pt-2">
              {EXTENSION_FEATURES.map((feat, idx) => {
                const isActive = vscodeActiveTab === idx;
                return (
                  <motion.div
                    key={idx}
                    onClick={() => setVscodeActiveTab(idx)}
                    whileHover={{ scale: 1.01 }}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                      isActive
                        ? isDarkMode
                          ? 'bg-[#121629] border-indigo-500/50 shadow-lg shadow-indigo-950/30 text-white'
                          : 'bg-slate-900 border-slate-900 shadow-md text-white'
                        : isDarkMode
                          ? 'bg-white/[0.02] border-white/5 text-slate-400 hover:border-white/10 hover:bg-white/[0.05]'
                          : 'bg-white border-slate-200/90 text-slate-700 hover:border-slate-300 hover:bg-slate-50/80 shadow-sm'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`p-2.5 rounded-xl border transition-colors ${
                        isActive
                          ? 'bg-indigo-950/80 border-indigo-500/40 text-indigo-400'
                          : isDarkMode
                            ? 'bg-white/[0.04] border-white/5 text-slate-400'
                            : 'bg-slate-100 border-slate-200 text-slate-600'
                      }`}>
                        {feat.icon}
                      </div>
                      <div>
                        <div className={`text-xs font-bold ${
                          isActive 
                            ? 'text-white' 
                            : isDarkMode 
                              ? 'text-slate-200' 
                              : 'text-slate-900'
                        }`}>
                          {feat.title}
                        </div>
                        <div className={`text-[11px] mt-0.5 font-normal ${
                          isActive 
                            ? 'text-slate-300' 
                            : isDarkMode 
                              ? 'text-slate-400' 
                              : 'text-slate-500'
                        }`}>
                          {feat.subtitle}
                        </div>
                      </div>
                    </div>

                    {isActive && (
                      <ArrowRight className={`w-4 h-4 mr-2 ${isDarkMode ? 'text-indigo-400' : 'text-blue-400'}`} />
                    )}
                  </motion.div>
                );
              })}
            </div>
          </FadeIn>

          {/* Right Column: VS Code Window Mockup */}
          <FadeIn direction="right" delay={0.2} className="lg:col-span-7">
            <div className="bg-[#0B0D18] border border-white/10 rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.6)] overflow-hidden flex flex-col font-mono text-xs">
              
              {/* Inner Layout Container */}
              <div className="flex min-h-[460px]">
                {/* Left VS Code Activity Bar */}
                <div className="w-12 bg-[#070912] border-r border-white/5 flex flex-col items-center py-4 gap-5 text-slate-500 flex-shrink-0 select-none">
                  <Files className="w-4 h-4 opacity-50 hover:opacity-100 cursor-pointer" />
                  <Search className="w-4 h-4 opacity-50 hover:opacity-100 cursor-pointer" />
                  <GitBranch className="w-4 h-4 opacity-50 hover:opacity-100 cursor-pointer" />
                  <Play className="w-4 h-4 opacity-50 hover:opacity-100 cursor-pointer" />
                  <Boxes className="w-4 h-4 opacity-50 hover:opacity-100 cursor-pointer" />

                  {/* Active Branchdeck Extension Icon */}
                  <div className="mt-2 w-8 h-8 rounded-lg bg-indigo-950/90 border border-indigo-500/50 flex items-center justify-center text-indigo-400 shadow-md">
                    <Box className="w-4.5 h-4.5" />
                  </div>
                </div>

                {/* Main Code Editor Area */}
                <div className="flex-1 flex flex-col bg-[#0B0D18] overflow-hidden">
                  {/* Top Editor Tab Bar */}
                  <div className="flex items-center justify-between border-b border-white/5 px-4 py-2 bg-[#070912] text-xs select-none">
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-2 bg-[#0B0D18] border-t-2 border-indigo-500 px-3.5 py-1.5 rounded-t text-white text-xs font-mono">
                        <span className="text-[9px] font-extrabold px-1 rounded bg-blue-500/30 text-blue-400">TS</span>
                        <span>auth.service.ts</span>
                        <X className="w-3 h-3 text-slate-400 ml-2 hover:text-white cursor-pointer" />
                      </div>
                      {vscodeActiveTab === 1 && (
                        <div className="flex items-center gap-2 bg-[#070912] border-t-2 border-slate-700 px-3.5 py-1.5 rounded-t text-slate-400 text-xs font-mono">
                          <span className="text-[9px] font-extrabold px-1 rounded bg-emerald-500/30 text-emerald-400">TS</span>
                          <span>user.repository.ts</span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-slate-500">
                      <Columns className="w-3.5 h-3.5 hover:text-slate-300 cursor-pointer" />
                      <MoreHorizontal className="w-3.5 h-3.5 hover:text-slate-300 cursor-pointer" />
                    </div>
                  </div>

                  {/* Editor Code View */}
                  <div className="p-5 text-xs leading-6 font-mono text-slate-300 overflow-x-auto flex-1 select-none relative">
                    <div className="flex gap-4">
                      {/* Line Numbers */}
                      <div className="text-slate-600 select-none text-right font-mono w-4 space-y-1">
                        <div>1</div><div>2</div><div>3</div><div>4</div><div>5</div><div>6</div><div>7</div><div>8</div><div>9</div><div>10</div><div>11</div><div>12</div><div>13</div><div>14</div><div>15</div><div>17</div><div>19</div>
                      </div>
                      
                      {/* Code Content */}
                      <div className="space-y-1 flex-1">
                        <div><span className="text-purple-400 font-semibold">export class</span> <span className="text-yellow-300 font-semibold">AuthService</span> {'{'}</div>
                        <div className="pl-4"><span className="text-blue-400">constructor</span>(<span className="text-purple-300">private</span> <span className="text-slate-300">userRepo</span>: <span className="text-emerald-400">UserRepository</span>) {'{}'}</div>
                        <div className="h-2" />
                        <div className="pl-4"><span className="text-purple-400 font-semibold">async</span> <span className="text-blue-400 font-semibold">login</span>(<span className="text-slate-300">email</span>: <span className="text-emerald-400">string</span>, <span className="text-slate-300">password</span>: <span className="text-emerald-400">string</span>) {'{'}</div>
                        
                        {/* Highlighted Line 5 for Go To Definition */}
                        <div className={`pl-8 transition-colors ${vscodeActiveTab === 1 ? 'bg-indigo-950/60 -mx-4 px-4 py-0.5 border-l-2 border-indigo-400' : ''}`}>
                          <span className="text-purple-400">const</span> <span className="text-slate-200">user</span> = <span className="text-purple-400">await</span> <span className="text-purple-300">this</span>.userRepo.<span className="text-yellow-300 font-bold underline decoration-indigo-400 underline-offset-4">findByEmail</span>(email);
                        </div>

                        <div className="pl-8"><span className="text-purple-400">if</span> (!user) <span className="text-purple-400">throw new</span> <span className="text-emerald-400">Error</span>(<span className="text-amber-300">&apos;User not found&apos;</span>);</div>
                        <div className="h-2" />
                        <div className="pl-8"><span className="text-purple-400">const</span> <span className="text-slate-200">isValid</span> = <span className="text-purple-400 font-semibold">await</span> <span className="text-purple-300">this</span>.<span className="text-yellow-300">validatePassword</span>(</div>
                        <div className="pl-12 text-slate-300">password,</div>
                        <div className="pl-12 text-slate-300">user.passwordHash</div>
                        <div className="pl-8">);</div>
                        <div className="pl-8"><span className="text-purple-400">if</span> (!isValid) <span className="text-purple-400">throw new</span> <span className="text-emerald-400">Error</span>(<span className="text-amber-300">&apos;Invalid credentials&apos;</span>);</div>
                        <div className="h-2" />
                        <div className="pl-8"><span className="text-purple-400">const</span> <span className="text-slate-200">token</span> = <span className="text-purple-300">this</span>.<span className="text-yellow-300">generateToken</span>(user.id);</div>
                        <div className="pl-8"><span className="text-purple-400">return</span> {'{'} user, token {'}'};</div>
                        <div className="pl-4">{'}'}</div>
                        <div>{'}'}</div>
                      </div>
                    </div>

                    {/* DYNAMIC FEATURE OVERLAYS FOR THE 4 CARDS */}
                    <AnimatePresence mode="wait">
                      {vscodeActiveTab === 0 && (
                        <motion.div key="chat" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                          className="mt-4 bg-[#111425] border border-indigo-500/40 rounded-xl p-3.5 text-xs shadow-lg space-y-2 font-sans">
                          <div className="flex items-center justify-between">
                            <span className="text-indigo-400 font-bold text-[11px] flex items-center gap-1.5">
                              <MessageSquare className="w-3.5 h-3.5" /> AI Codebase Assistant
                            </span>
                            <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 text-[9px] font-bold">Live AI Answer</span>
                          </div>
                          <div className="text-slate-300 text-[11px] leading-relaxed">
                            <div className="text-slate-400 font-mono mb-1">&gt; How is authentication handled in this service?</div>
                            <span className="text-white font-semibold">AuthService</span> queries <code className="text-amber-300 font-mono">UserRepository.findByEmail</code>, verifies password hash, and issues signed JWT tokens via <code className="text-yellow-300 font-mono">generateToken(user.id)</code>.
                          </div>
                        </motion.div>
                      )}

                      {vscodeActiveTab === 1 && (
                        <motion.div key="definition" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                          className="mt-4 bg-indigo-950/90 border border-indigo-500/60 rounded-xl p-3.5 text-xs shadow-lg font-sans">
                          <div className="text-indigo-300 font-bold text-[11px] flex items-center gap-1.5 mb-1.5">
                            <FileSearch className="w-3.5 h-3.5 text-indigo-400" /> Go To Definition · Symbol Found
                          </div>
                          <div className="text-slate-200 text-[11px] font-mono leading-relaxed">
                            <span className="text-slate-400">Target:</span> <span className="text-emerald-400 font-bold">src/repositories/user.repository.ts:L42</span><br />
                            <span className="text-purple-300">async</span> <span className="text-yellow-300">findByEmail</span>(email: <span className="text-emerald-300">string</span>): <span className="text-emerald-300">Promise&lt;User | null&gt;</span>
                          </div>
                        </motion.div>
                      )}

                      {vscodeActiveTab === 2 && (
                        <motion.div key="impact" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                          className="mt-4 bg-[#1A1224] border border-rose-500/40 rounded-xl p-3.5 text-xs shadow-lg space-y-2 font-sans">
                          <div className="flex items-center justify-between">
                            <span className="text-rose-400 font-bold text-[11px] flex items-center gap-1.5">
                              <GitFork className="w-3.5 h-3.5" /> Impact Analysis: AuthService.login
                            </span>
                            <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 text-[9px] font-bold">High Risk (3 Callers)</span>
                          </div>
                          <div className="text-[11px] text-slate-300 space-y-1 font-mono">
                            <div className="flex items-center justify-between">
                              <span>&bull; <span className="text-amber-300">POST /api/v1/auth/login</span></span>
                              <span className="text-[9px] text-slate-500">routes/auth.ts:24</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span>&bull; <span className="text-amber-300">SSOAdapter.authenticate</span></span>
                              <span className="text-[9px] text-slate-500">lib/sso.ts:18</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span>&bull; <span className="text-amber-300">AuthMiddleware.verifySession</span></span>
                              <span className="text-[9px] text-slate-500">middleware/auth.ts:31</span>
                            </div>
                          </div>
                        </motion.div>
                      )}

                      {vscodeActiveTab === 3 && (
                        <motion.div key="context" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                          className="mt-4 bg-[#0D1B2A] border border-blue-500/50 rounded-xl p-3.5 text-xs shadow-lg space-y-2 font-sans">
                          <div className="flex items-center justify-between">
                            <span className="text-blue-400 font-bold text-[11px] flex items-center gap-1.5">
                              <Sparkles className="w-3.5 h-3.5" /> Smart Architecture Walkthrough
                            </span>
                            <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 text-[9px] font-bold">AI Verified Context</span>
                          </div>
                          <div className="text-[11px] text-slate-300 leading-relaxed">
                            <span className="text-blue-300 font-semibold">Auth Subsystem Architecture:</span> Client requests pass through API Router &rarr; AuthController &rarr; AuthService &rarr; UserRepository. Password hashes verified via BCrypt with RS256 JWT key signing.
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* VS Code Bottom Status Bar */}
                  <div className="px-4 py-1.5 bg-[#070912] border-t border-white/5 flex items-center justify-between text-[10px] text-slate-500 font-mono select-none">
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1"><GitBranch className="w-3 h-3 text-slate-400" /> main*</span>
                      <span>0 🛈 0 ⚠</span>
                    </div>
                    <span>Ln 12, Col 25 &nbsp; Spaces: 2 &nbsp; UTF-8 &nbsp; LF &nbsp; TypeScript</span>
                  </div>

                  {/* Bottom AI Codebase Query Box inside Editor */}
                  <div className="p-3 bg-[#070912]/90 border-t border-white/5">
                    <div className="flex items-center justify-between bg-[#131627] border border-indigo-500/30 rounded-xl px-4 py-2.5 shadow-inner">
                      <div className="flex items-center gap-3 flex-1">
                        <Sparkles className="w-4 h-4 text-indigo-400 flex-shrink-0 animate-pulse" />
                        <input
                          type="text"
                          readOnly
                          value={
                            vscodeActiveTab === 0 ? "Ask anything about your code..." :
                            vscodeActiveTab === 1 ? "Jump to any function or file..." :
                            vscodeActiveTab === 2 ? "Analyze change impact for AuthService.login..." :
                            "AI architecture context loaded."
                          }
                          className="bg-transparent text-xs text-slate-300 outline-none w-full cursor-pointer font-sans"
                        />
                      </div>
                      <button className="w-7 h-7 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center shadow-md transition-all">
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </FadeIn>
        </div>
      </section>
    );
  };

  /* ── FOUNDER SECTION ── */
  const FounderSection = () => (
    <section className={`py-44 px-6 overflow-hidden border-t border-b transition-colors duration-300 ${isDarkMode ? 'bg-[#0A0C16] border-slate-900' : 'bg-white border-neutral-200/50'}`}>
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-20 items-center">
        <FadeIn direction="left" className="lg:col-span-7 space-y-7">
          <span className={`text-[11px] font-bold uppercase tracking-[0.15em] block transition-colors ${isDarkMode ? 'text-slate-500' : 'text-neutral-400'}`}>Behind the Code</span>
          <h2 className={`text-[clamp(2.2rem,3.5vw,2.8rem)] font-bold tracking-tight leading-tight transition-colors ${isDarkMode ? 'text-white' : 'text-neutral-900'}`}>
            Built by developers,<br />for developers.
          </h2>
          <p className={`text-[15px] leading-relaxed max-w-xl transition-colors ${isDarkMode ? 'text-slate-400' : 'text-neutral-500'}`}>
            We built BranchDeck after spending countless hours navigating unfamiliar repositories, tracing dependencies, and trying to understand legacy systems.
          </p>
          <p className={`text-[15px] leading-relaxed max-w-xl transition-colors ${isDarkMode ? 'text-slate-400' : 'text-neutral-500'}`}>
            Our goal is simple: make every codebase understandable in minutes, not weeks. BranchDeck acts as a living, self-documenting intelligence layer for engineering teams around the world.
          </p>
          <div className="pt-2">
            <motion.button
              whileHover={{ scale: 1.02, boxShadow: '0 8px 30px rgba(0,0,0,0.1)' }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setIsModalOpen(true)}
              className={`btn-shimmer text-[13px] font-semibold px-7 py-3.5 rounded-full transition-all shadow-sm ${isDarkMode ? 'bg-blue-600 hover:bg-blue-500 text-white' : 'bg-neutral-950 hover:bg-neutral-800 text-white'}`}>
              Join the Beta
            </motion.button>
          </div>
        </FadeIn>
        <FadeIn direction="right" delay={0.2} className="lg:col-span-5 flex justify-center w-full">
          <ProfileCard
            name="Adel Muhammed"
            title="AI Engineer & Full Stack Developer"
            handle="adel"
            status="Building Branchdeck"
            contactText="Get in touch"
            contactUrl="https://linkedin.com/in/adel"
            linkedinUrl="https://linkedin.com/in/adel"
            showLinkedinIcon={true}
            avatarUrl="/adel.jpg"
            miniAvatarUrl="/adel-avatar.jpg"
            showUserInfo={true}
            enableTilt={true}
            enableMobileTilt={false}
            behindGlowEnabled={true}
            behindGlowColor="rgba(34, 211, 238, 0.4)"
            innerGradient={isDarkMode ? 'linear-gradient(145deg, #0E1630 0%, #060914 100%)' : 'linear-gradient(145deg, #0A1028 0%, #040816 100%)'}
          />
        </FadeIn>
      </div>
    </section>
  );

  /* ── FAQ SECTION ── */
  const FaqSection = () => {
    const faqs = [
      { q: "Does BranchDeck support any programming language?", a: "Yes! BranchDeck is language-agnostic. It parses AST structures for TypeScript, JavaScript, Python, Go, Rust, Java, C++, Ruby, PHP, and more to map function scopes and import paths." },
      { q: "How does BranchDeck analyze a repository?", a: "BranchDeck runs local or secure cloud-based static analysis to trace imports, call patterns, references, and symbol paths. No compilation is required, allowing it to instantly generate software architecture maps." },
      { q: "Does BranchDeck work with monorepos?", a: "Absolutely. BranchDeck indexes package workspaces, workspaces directories, and cross-package dependencies. It tracks downstream risks across your entire monorepo workspace." },
      { q: "Can I use BranchDeck inside VS Code?", a: "Yes. In addition to our web interface, our native VS Code extension brings codebase maps, dependency graphs, and AI narrative tools directly into your editor panel." },
      { q: "Is my source code uploaded?", a: "No. All analysis can be run entirely locally or using end-to-end encrypted indexing. Your source code is never stored on our servers nor used to train public LLM models." },
      { q: "Can teams collaborate?", a: "Yes. Teams can share interactive maps, logic narratives, and PR dependency reviews, enabling engineers to sync context instantly and debug codebase paths collectively." }
    ];

    return (
      <section className={`py-36 px-6 border-t transition-colors duration-300 ${isDarkMode ? 'bg-[#0B0C15] border-slate-900' : 'bg-[#EEEFF4] border-neutral-200/50'}`}>
        <div className="max-w-3xl mx-auto">
          <FadeIn className="text-center mb-20">
            <span className={`text-[11px] font-bold uppercase tracking-[0.15em] mb-4 block transition-colors ${isDarkMode ? 'text-slate-500' : 'text-neutral-400'}`}>Frequently Asked Questions</span>
            <h2 className={`text-[clamp(2rem,3.5vw,2.8rem)] font-bold tracking-tight transition-colors ${isDarkMode ? 'text-white' : 'text-neutral-900'}`}>FAQ</h2>
            <p className={`mt-4 text-[15px] max-w-xl mx-auto leading-relaxed transition-colors ${isDarkMode ? 'text-slate-400' : 'text-neutral-500'}`}>Everything you need to know about Branchdeck codebase intelligence.</p>
          </FadeIn>

          <div className="space-y-4">
            {faqs.map((faq, idx) => (
              <FadeIn key={idx} delay={idx * 0.05}>
                <div className={`border rounded-2xl overflow-hidden transition-all duration-300 ${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-neutral-200'}`}>
                  <button
                    onClick={() => setFaqOpenIdx(faqOpenIdx === idx ? null : idx)}
                    className={`w-full text-left p-6 flex justify-between items-center gap-4 cursor-pointer transition-colors ${isDarkMode ? 'hover:bg-slate-850/40' : 'hover:bg-neutral-50/50'}`}
                  >
                    <span className={`text-[13px] font-bold transition-colors ${isDarkMode ? 'text-white' : 'text-neutral-900'}`}>{faq.q}</span>
                    <motion.div
                      animate={{ rotate: faqOpenIdx === idx ? 180 : 0 }}
                      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                    >
                      <ChevronDown className="w-4 h-4 text-neutral-400" />
                    </motion.div>
                  </button>
                  <AnimatePresence initial={false}>
                    {faqOpenIdx === idx && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                      >
                        <div className={`px-6 pb-6 pt-1 text-[12px] leading-relaxed border-t transition-colors ${isDarkMode ? 'text-slate-400 border-slate-800/80' : 'text-neutral-500 border-neutral-100/60'}`}>
                          {faq.a}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>
    );
  };

  /* ── CTA ── */
  const CTASection = () => (
    <section className={`py-44 px-6 relative overflow-hidden transition-colors duration-300 ${isDarkMode ? 'bg-[#0B0C15]' : 'bg-[#EEEFF4]'}`}>
      {/* Data flow background */}
      <DataFlowCanvas />
      <div className="relative z-10 max-w-3xl mx-auto text-center space-y-10">
        <FadeIn>
          <h2 className={`text-[clamp(2.2rem,5vw,4rem)] font-bold tracking-tight leading-tight transition-colors ${isDarkMode ? 'text-white' : 'text-neutral-900'}`}>
            Ready to understand<br />your codebase?
          </h2>
        </FadeIn>
        <FadeIn delay={0.15}>
          <p className={`text-[16px] font-normal leading-relaxed transition-colors ${isDarkMode ? 'text-slate-400' : 'text-neutral-500'}`}>
            Connect your VS Code workspace or paste a GitHub URL. Branchdeck indexes everything in seconds.
          </p>
        </FadeIn>
        <FadeIn delay={0.25} className="flex items-center justify-center gap-4 flex-wrap">
          <MagneticBtn onClick={() => setIsModalOpen(true)}
            className={`btn-shimmer text-[15px] font-semibold px-10 py-4 rounded-full flex items-center gap-2 transition-all shadow-xl group ${isDarkMode ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-900/20' : 'bg-neutral-950 hover:bg-neutral-800 text-white shadow-neutral-900/20'}`}>
            Get Started Free
            <motion.div animate={{ x: [0, 4, 0] }} transition={{ repeat: Infinity, duration: 1.5 }}>
              <ArrowRight className="w-4 h-4" />
            </motion.div>
          </MagneticBtn>
          <motion.button
            whileHover={{ scale: 1.02, boxShadow: '0 8px 30px rgba(0,0,0,0.07)' }}
            onClick={onLoadDemo}
            className={`text-[15px] font-semibold px-10 py-4 rounded-full border transition-all shadow-sm flex items-center gap-2 ${isDarkMode ? 'bg-slate-900 border-slate-800 text-white hover:bg-slate-800/80 hover:border-slate-700' : 'bg-white border-neutral-200 text-neutral-900 hover:border-neutral-400 hover:bg-neutral-50'}`}>
            <Play className="w-4 h-4" /> Live Demo
          </motion.button>
        </FadeIn>
        <FadeIn delay={0.4} className="flex justify-center gap-8 text-[10px] font-bold text-neutral-400 uppercase tracking-widest">
          <span>No credit card</span><span>·</span><span>Works in VS Code</span><span>·</span><span>Any language</span>
        </FadeIn>
      </div>
    </section>
  );

  /* ── FOOTER ── */
  const Footer = () => (
    <footer className={`transition-colors duration-300 border-t pt-16 pb-12 ${isDarkMode ? 'bg-[#06080E] border-slate-900' : 'bg-[#EEEFF4] border-neutral-200'}`}>
      {/* Links grid */}
      <div className="max-w-7xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-12 text-[13px] mb-16">
        <div className="col-span-2 md:col-span-1 space-y-4">
          <div className="flex items-center gap-2.5">
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-white ${isDarkMode ? 'bg-slate-800' : 'bg-neutral-950'}`}>{LOGO_SVG}</div>
            <span className={`font-bold text-[14px] transition-colors ${isDarkMode ? 'text-white' : 'text-neutral-900'}`}>Branchdeck</span>
          </div>
          <p className={`text-[12px] leading-relaxed max-w-xs transition-colors ${isDarkMode ? 'text-slate-450' : 'text-neutral-500'}`}>AI-powered codebase intelligence for modern engineering teams.</p>
          <div className="flex items-center gap-3 text-neutral-400">
            <a href="#" aria-label="GitHub" className={`hover:scale-110 transition-all ${isDarkMode ? 'hover:text-white' : 'hover:text-neutral-700'}`}>
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
              </svg>
            </a>
            <a href="#" aria-label="Twitter" className={`hover:scale-110 transition-all ${isDarkMode ? 'hover:text-white' : 'hover:text-neutral-700'}`}>
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            </a>
          </div>
        </div>
        {[
          { heading: 'Product', links: ['Features', 'VS Code Extension', 'Integrations', 'Changelog'] },
          { heading: 'Resources', links: ['Documentation', 'Blog', 'Guides', 'API Reference'] },
          { heading: 'Company', links: ['About', 'Careers', 'Privacy', 'Terms'] },
        ].map(col => (
          <div key={col.heading} className="space-y-3">
            <div className={`text-[10px] font-bold uppercase tracking-widest transition-colors ${isDarkMode ? 'text-slate-500' : 'text-neutral-400'}`}>{col.heading}</div>
            {col.links.map(link => (
              <a key={link} href="#" className={`block text-[13px] transition-colors relative group w-fit ${isDarkMode ? 'text-slate-400 hover:text-white' : 'text-neutral-500 hover:text-neutral-900'}`}>
                {link}
                <span className={`absolute -bottom-0.5 left-0 right-0 h-px scale-x-0 group-hover:scale-x-100 transition-transform duration-200 origin-left ${isDarkMode ? 'bg-white' : 'bg-neutral-900'}`} />
              </a>
            ))}
          </div>
        ))}
      </div>

      {/* Antigravity-style massive wordmark */}
      <div className="max-w-7xl mx-auto px-6 overflow-hidden">
        <motion.div
          initial={{ opacity: 0, y: 25 }} whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.01 }} transition={{ duration: 0.8, ease: "easeOut" }}
          className="select-none mb-12" style={{ lineHeight: 0.82 }}>
          <span
            className={`font-black tracking-tighter transition-colors duration-300 ${isDarkMode ? 'text-[#12151D]' : 'text-[#0A0A0A]'}`}
            style={{ fontSize: 'clamp(4rem,13.5vw,13.5rem)' }}>
            Branchdeck
          </span>
        </motion.div>

        {/* Bottom row: Brand name & privacy links */}
        <div className={`flex items-center justify-between text-[11px] pt-6 border-t transition-colors duration-300 ${isDarkMode ? 'text-slate-500 border-slate-900' : 'text-neutral-400 border-neutral-200/60 bg-[#EEEFF4]'}`}>
          <div className="flex items-center gap-2">
            <div className={`w-5 h-5 rounded-md flex items-center justify-center text-white p-0.5 ${isDarkMode ? 'bg-slate-800' : 'bg-neutral-950'}`}>{LOGO_SVG}</div>
            <span className={`font-bold transition-colors ${isDarkMode ? 'text-white/80' : 'text-neutral-700'}`}>Branchdeck</span>
          </div>
          <div className="flex gap-6">
            <a href="#" className={`transition-colors ${isDarkMode ? 'hover:text-white' : 'hover:text-neutral-900'}`}>Privacy</a>
            <a href="#" className={`transition-colors ${isDarkMode ? 'hover:text-white' : 'hover:text-neutral-900'}`}>Terms</a>
            <span>© 2026 Branchdeck. All rights reserved.</span>
          </div>
        </div>
      </div>
    </footer>
  );

  const GetStartedModal = () => (
    <WaitlistModal
      isOpen={isModalOpen}
      onClose={() => setIsModalOpen(false)}
    />
  );

  /* ── CARD SWAP PREVIEW SECTION ── */
  const PreviewCardsSection = () => (
    <section className="py-32 px-6 bg-neutral-950 relative overflow-hidden">
      {/* LightRays for premium dark section feel */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none', opacity: 0.35 }}>
        <LightRays raysOrigin="top-center" raysColor="#3279F9" raysSpeed={0.6} lightSpread={0.9} rayLength={1.4} followMouse={true} mouseInfluence={0.06} pulsating={true} />
      </div>
      <div className="relative z-10 max-w-7xl mx-auto">
        <FadeIn className="text-center mb-16">
          <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-blue-400 mb-4 block">Live Product Previews</span>
          <h2 className="text-[clamp(2rem,4vw,3rem)] font-bold text-white tracking-tight">See it in action</h2>
          <p className="mt-4 text-[15px] text-white/50 max-w-xl mx-auto leading-relaxed">Real screenshots from the Branchdeck dashboard — no mockups.</p>
        </FadeIn>
        <div className="flex justify-center" style={{ height: 380 }}>
          <CardSwap width={520} height={340} cardDistance={60} verticalDistance={65} delay={4000} easing="elastic">
            <Card>
              <div className="w-full h-full bg-gradient-to-br from-slate-900 to-slate-800 flex flex-col">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06]">
                  <div className="flex gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-[#FF5F57]" /><div className="w-2.5 h-2.5 rounded-full bg-[#FFBD2E]" /><div className="w-2.5 h-2.5 rounded-full bg-[#28C840]" /></div>
                  <span className="ml-2 text-[10px] text-white/50 font-semibold">Interactive Call Flow</span>
                </div>
                <div className="flex-1 flex items-center justify-center p-6">
                  <img src="/preview-callflow.png" alt="Call Flow Preview" className="w-full h-full object-contain rounded-lg opacity-90" />
                </div>
              </div>
            </Card>
            <Card>
              <div className="w-full h-full bg-gradient-to-br from-slate-900 to-indigo-950 flex flex-col">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06]">
                  <div className="flex gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-[#FF5F57]" /><div className="w-2.5 h-2.5 rounded-full bg-[#FFBD2E]" /><div className="w-2.5 h-2.5 rounded-full bg-[#28C840]" /></div>
                  <span className="ml-2 text-[10px] text-white/50 font-semibold">Architecture Walkthrough</span>
                </div>
                <div className="flex-1 flex items-center justify-center p-6">
                  <img src="/preview-story.png" alt="Architecture Walkthrough Preview" className="w-full h-full object-contain rounded-lg opacity-90" />
                </div>
              </div>
            </Card>
            <Card>
              <div className="w-full h-full bg-gradient-to-br from-slate-900 to-rose-950 flex flex-col">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06]">
                  <div className="flex gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-[#FF5F57]" /><div className="w-2.5 h-2.5 rounded-full bg-[#FFBD2E]" /><div className="w-2.5 h-2.5 rounded-full bg-[#28C840]" /></div>
                  <span className="ml-2 text-[10px] text-white/50 font-semibold">Impact Analysis</span>
                </div>
                <div className="flex-1 flex items-center justify-center p-6">
                  <img src="/preview-impact.png" alt="Impact Analysis Preview" className="w-full h-full object-contain rounded-lg opacity-90" />
                </div>
              </div>
            </Card>
          </CardSwap>
        </div>
      </div>
    </section>
  );



  return (
    <div className={`min-h-screen selection:bg-blue-600 selection:text-white relative transition-colors duration-300 ${isDarkMode ? 'bg-[#070913] text-white' : 'bg-white text-slate-900'}`}>
      <motion.div style={{ scaleX }} className="fixed top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-blue-600 via-indigo-500 to-emerald-500 origin-left z-[100] pointer-events-none" />
      {NavBar()}
      <main>
        <Hero 
          onLoadDemo={onLoadDemo} 
          setIsModalOpen={setIsModalOpen} 
          typedWord={typedWord} 
          isDarkMode={isDarkMode}
        />
        {TaglineBand()}
        <div className={`py-8 overflow-hidden border-b transition-colors duration-300 ${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-[#FAFBFD] border-neutral-200'}`}>
          <ScrollVelocity
            texts={marqueeTexts}
            velocity={80}
            className={`text-[clamp(1.4rem,4vw,2.8rem)] font-black uppercase tracking-tighter font-sans transition-colors duration-300 ${isDarkMode ? 'text-slate-200' : 'text-neutral-800'}`}
            numCopies={6}
            damping={50}
            stiffness={400}
          />
        </div>
        {Features()}
        {PerfectFor()}
        {ComparisonSection()}
        {HowItWorks()}
        {UseCases()}
        {PreviewCardsSection()}
        <section style={{ height: 360 }} className={`overflow-hidden border-t border-b transition-colors duration-300 ${isDarkMode ? 'border-slate-800' : 'border-neutral-200'}`}>
          <FlowingMenu
            items={[
              { link: '#features', text: 'Call Flow Graphs', image: '/preview-callflow.png' },
              { link: '#features', text: 'AI Story Mode', image: '/preview-story.png' },
              { link: '#features', text: 'Impact Analysis', image: '/preview-impact.png' },
              { link: '#solutions', text: 'Team Onboarding', image: '/preview-callflow.png' },
              { link: '#solutions', text: 'Refactor Safety', image: '/preview-impact.png' },
            ]}
            speed={18}
            textColor={isDarkMode ? '#ffffff' : '#0a0b0f'}
            bgColor={isDarkMode ? '#0a0b0f' : '#f4f5f9'}
            marqueeBgColor="#3279F9"
            marqueeTextColor="#ffffff"
          />
        </section>
        {VsCodeSection()}
        {FounderSection()}
        {FaqSection()}
        {CTASection()}
      </main>
      {Footer()}
      {GetStartedModal()}
    </div>
  );
}