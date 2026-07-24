'use client';

import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  Node,
  Edge,
  Handle,
  Position,
  ReactFlowProvider,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { CallGraphNode, CallGraphEdge } from '@/lib/analyzer';
import { Layers, MessageSquare, Maximize2, Minimize2, RefreshCw, Search, ArrowRight, ShieldAlert, GitBranch, Database, HardDrive, Server } from 'lucide-react';

/* ──────────────────────────────────────────────────────────────────── */
/*  TYPES & UTILS                                                       */
/* ──────────────────────────────────────────────────────────────────── */

interface CallFlowGraphProps {
  nodes: CallGraphNode[];
  edges: CallGraphEdge[];
  onSelectNode: (node: CallGraphNode) => void;
  selectedFile: string | null;
  selectedFolder?: string | null;
  selectedFeature?: string | null;
  activeStepIndex?: number | null;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  members?: any[];
  repoSource?: string;
  onResetFocus?: () => void;
  isFocused?: boolean;
}

interface LiveCollaborator {
  name: string;
  avatar: string;
  color: string;
  action: 'editing' | 'viewing';
}

const norm = (p: string) =>
  p?.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/$/, '') ?? '';

/** Deduplicate nodes by canonical file path */
function dedupeNodes(nodes: CallGraphNode[]): CallGraphNode[] {
  const seen = new Map<string, CallGraphNode>();
  for (const n of nodes) {
    const key = norm(n.file);
    if (!seen.has(key)) {
      seen.set(key, n);
    } else {
      const old = seen.get(key)!;
      const oldScore = Object.values(old).filter((v) => v !== undefined && v !== '').length;
      const newScore = Object.values(n).filter((v) => v !== undefined && v !== '').length;
      if (newScore > oldScore) seen.set(key, n);
    }
  }
  return Array.from(seen.values());
}

/** Check if a file belongs to a target folder */
function isInsideFolder(file: string, folder: string): boolean {
  const f = norm(file);
  const fol = norm(folder);
  if (!fol) return true;
  return f === fol || f.startsWith(fol + '/');
}

/* ──────────────────────────────────────────────────────────────────── */
/*  BALANCED VISUAL HIERARCHY NODE CARD                                 */
/* ──────────────────────────────────────────────────────────────────── */

function CustomCallNode({
  data,
}: {
  data: CallGraphNode & {
    isTarget?: boolean;
    activeFileSelected?: boolean;
    liveUsers?: LiveCollaborator[];
    isDimmed?: boolean;
    isHighlighted?: boolean;
    stepActive?: boolean;
  };
}) {
  const isEntryPoint = data.type === 'ui' || data.type === 'api';

  const tierStyle = useMemo(() => {
    switch (data.type) {
      case 'ui':
        return {
          topBorder: 'border-t-4 border-t-cyan-500',
          badge: 'bg-cyan-50 text-cyan-700 border-cyan-200/80',
          glow: 'hover:shadow-[0_12px_28px_rgba(6,182,212,0.2)]',
        };
      case 'api':
        return {
          topBorder: 'border-t-4 border-t-orange-500',
          badge: 'bg-orange-50 text-orange-700 border-orange-200/80',
          glow: 'hover:shadow-[0_12px_28px_rgba(249,115,22,0.2)]',
        };
      case 'service':
        return {
          topBorder: 'border-t-4 border-t-indigo-500',
          badge: 'bg-indigo-50 text-indigo-700 border-indigo-200/80',
          glow: 'hover:shadow-[0_8px_24px_rgba(99,102,241,0.15)]',
        };
      case 'db':
        return {
          topBorder: 'border-t-4 border-t-emerald-600',
          badge: 'bg-emerald-50 text-emerald-800 border-emerald-200/80',
          glow: 'hover:shadow-[0_8px_24px_rgba(16,185,129,0.15)]',
        };
      case 'lib':
        return {
          topBorder: 'border-t-4 border-t-purple-500',
          badge: 'bg-purple-50 text-purple-700 border-purple-200/80',
          glow: 'hover:shadow-[0_8px_24px_rgba(168,85,247,0.15)]',
        };
      default:
        return {
          topBorder: 'border-t-4 border-t-slate-400',
          badge: 'bg-slate-50 text-slate-700 border-slate-200/80',
          glow: 'hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)]',
        };
    }
  }, [data.type]);

  const extBadge = useMemo(() => {
    const parts = data.file.split('.');
    return parts.length > 1 ? parts[parts.length - 1].toUpperCase() : 'FILE';
  }, [data.file]);

  const devColors = useMemo(() => {
    const initials = data.developer?.avatar || '';
    if (initials === 'SC') return 'bg-rose-100 text-rose-700 border-rose-200';
    if (initials === 'AR') return 'bg-sky-100 text-sky-700 border-sky-200';
    if (initials === 'ER') return 'bg-violet-100 text-violet-700 border-violet-200';
    if (initials === 'MV') return 'bg-amber-100 text-amber-700 border-amber-200';
    return 'bg-slate-100 text-slate-700 border-slate-200';
  }, [data.developer]);

  const liveUsers = data.liveUsers || [];

  return (
    <div
      className={`p-4 rounded-2xl border bg-white shadow-[0_6px_20px_rgba(0,0,0,0.05)] w-[280px] h-[130px] transition-all duration-300 relative flex flex-col justify-between ${tierStyle.topBorder} ${tierStyle.glow} ${
        data.isDimmed ? 'opacity-10 grayscale' : 'opacity-100'
      } ${
        data.stepActive
          ? 'border-slate-950 ring-4 ring-sky-500/40 shadow-[0_16px_36px_rgba(2,132,199,0.35)] scale-[1.05]'
          : data.isHighlighted
            ? 'border-slate-950 ring-4 ring-sky-500/25 shadow-[0_10px_28px_rgba(2,132,199,0.25)] scale-[1.02]'
            : data.activeFileSelected
              ? 'border-slate-950 ring-4 ring-slate-950/10'
              : data.isTarget
                ? 'border-slate-950 ring-2 ring-slate-950/20'
                : 'border-slate-200/90 hover:border-slate-400'
      }`}
    >
      <Handle type="target" position={Position.Left} className="w-3 h-3 !bg-slate-900 border-2 border-white" />

      {liveUsers.length > 0 && (
        <div className="absolute -top-3.5 -right-2 flex items-center gap-1 bg-white border border-slate-200 shadow-sm px-2 py-0.5 rounded-full z-20">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
          </span>
          <div className="flex -space-x-1">
            {liveUsers.map((user, idx) => (
              <div
                key={idx}
                className={`w-4 h-4 rounded-full flex items-center justify-center text-[7px] font-bold text-white ring-1 ring-white ${
                  user.color.startsWith('bg-') ? user.color : `bg-${user.color}`
                } cursor-default`}
                title={`${user.name} is actively ${user.action}`}
              >
                {user.avatar}
              </div>
            ))}
          </div>
          <span className="text-[7px] font-bold text-slate-400 uppercase tracking-widest">{liveUsers[0].action}</span>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        {/* Card Header: Title & Badges */}
        <div className="flex items-center justify-between gap-1.5">
          <div className="flex items-center gap-1.5 truncate">
            {data.stepNumber && (
              <span className="w-5 h-5 rounded-full bg-slate-950 text-white text-[10px] font-black flex items-center justify-center flex-shrink-0 shadow-xs">
                {data.stepNumber}
              </span>
            )}
            <span className={`font-black text-slate-900 truncate ${isEntryPoint ? 'text-xs' : 'text-[11px]'}`} title={data.label}>
              {data.label}
            </span>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <span className="text-[8px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200/70">
              {extBadge}
            </span>
            <span className={`text-[8.5px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full border ${tierStyle.badge}`}>
              {data.type}
            </span>
          </div>
        </div>

        {/* Subtitle / API Route / Table */}
        <div className="text-[9.5px] text-slate-500 font-mono font-semibold truncate bg-slate-50 px-2 py-0.5 rounded-lg border border-slate-100" title={data.subtitle || data.file}>
          {data.subtitle || data.file}
        </div>

        {/* Exported Methods / Functions List */}
        {data.methods && data.methods.length > 0 && (
          <div className="flex items-center gap-1.5 border-t border-slate-100 pt-1 font-mono text-[9px] text-slate-700">
            <span className="w-1.5 h-1.5 rounded-full bg-sky-500 flex-shrink-0" />
            <span className="font-bold truncate text-slate-800">{data.methods[0]}</span>
          </div>
        )}
      </div>

      {data.developer && (
        <div className="flex items-center gap-1.5 border-t border-slate-100 pt-1 mt-0.5">
          <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center text-[7.5px] font-bold ${devColors}`}>
            {data.developer.avatar}
          </div>
          <span className="text-[8.5px] font-bold text-slate-700 truncate">{data.developer.name}</span>
        </div>
      )}

      <Handle type="source" position={Position.Right} className="w-3 h-3 !bg-slate-900 border-2 border-white" />
    </div>
  );
}

const nodeTypes = { customCall: CustomCallNode };

/* ──────────────────────────────────────────────────────────────────── */
/*  INNER GRAPH COMPONENT                                               */
/* ──────────────────────────────────────────────────────────────────── */

function CallFlowGraphInner({
  nodes: rawNodesIn,
  edges: rawEdgesIn,
  onSelectNode,
  selectedFile,
  selectedFolder,
  selectedFeature,
  activeStepIndex,
  isFullscreen,
  onToggleFullscreen,
  members,
  onResetFocus,
}: CallFlowGraphProps) {
  const { fitView } = useReactFlow();

  const [activeViewMode, setActiveViewMode] = useState<'request' | 'data' | 'dependency'>('data');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [fitKey, setFitKey] = useState(0);
  const draggedPositionsRef = useRef<Record<string, { x: number; y: number }>>({});

  /* ── 1. Dedupe incoming nodes & edges ── */
  const { allNodes, allEdges } = useMemo(() => {
    const nodes = dedupeNodes(rawNodesIn);
    const validIds = new Set(nodes.map((n) => n.id));

    const edges = rawEdgesIn.filter((e) => validIds.has(e.from) && validIds.has(e.to) && e.from !== e.to);

    const edgeMap = new Map<string, { from: string; to: string; labels: string[] }>();
    for (const e of edges) {
      const key = `${e.from}->${e.to}`;
      if (!edgeMap.has(key)) edgeMap.set(key, { from: e.from, to: e.to, labels: [] });
      if (e.label && !edgeMap.get(key)!.labels.includes(e.label)) edgeMap.get(key)!.labels.push(e.label);
    }

    return { allNodes: nodes, allEdges: Array.from(edgeMap.values()) };
  }, [rawNodesIn, rawEdgesIn]);

  const validNodeIds = useMemo(() => new Set(allNodes.map((n) => n.id)), [allNodes]);

  /* ── 2. Capped Focus Graph Filtering (6 to 8 Nodes Max per View Mode) ── */
  const { visibleNodes, visibleEdges } = useMemo(() => {
    let nodes = allNodes;
    let edges = allEdges;

    // A. Mode Specific Filter
    if (activeViewMode === 'request') {
      nodes = nodes.filter(n => n.type === 'ui' || n.type === 'api' || n.type === 'service');
    } else if (activeViewMode === 'data') {
      nodes = nodes.filter(n => n.type === 'api' || n.type === 'service' || n.type === 'db' || n.type === 'ui');
    } else if (activeViewMode === 'dependency') {
      nodes = nodes.filter(n => n.type === 'service' || n.type === 'lib' || n.type === 'external' || n.type === 'db');
    }

    // B. Scope Drill-Down (File / Folder)
    if (selectedFile) {
      const target = allNodes.find((n) => n.file === selectedFile);
      if (target) {
        const keep = new Set<string>([target.id]);
        for (const e of edges) {
          if (e.from === target.id) keep.add(e.to);
          if (e.to === target.id) keep.add(e.from);
        }
        nodes = nodes.filter((n) => keep.has(n.id));
      }
    } else if (selectedFolder) {
      const inFolder = new Set<string>();
      for (const n of nodes) {
        if (isInsideFolder(n.file, selectedFolder)) inFolder.add(n.id);
      }
      const keep = new Set<string>(inFolder);
      for (const e of edges) {
        if (inFolder.has(e.from)) keep.add(e.to);
        if (inFolder.has(e.to)) keep.add(e.from);
      }
      nodes = nodes.filter((n) => keep.has(n.id));
    }

    // C. Search Query Filter
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      const matched = new Set(
        nodes
          .filter((n) => n.label.toLowerCase().includes(q) || n.file.toLowerCase().includes(q))
          .map((n) => n.id)
      );
      const keep = new Set<string>(matched);
      for (const e of edges) {
        if (matched.has(e.from)) keep.add(e.to);
        if (matched.has(e.to)) keep.add(e.from);
      }
      nodes = nodes.filter((n) => keep.has(n.id));
    }

    // D. Cap Focus Graph to 6 Nodes Max for 3:2 Aspect Ratio Fill
    if (nodes.length > 6) {
      const rootNode = nodes.find(n => n.type === 'ui') || nodes.find(n => n.type === 'api') || nodes[0];
      if (rootNode) {
        const cappedIds = new Set<string>([rootNode.id]);
        edges.forEach(e => {
          if (cappedIds.size < 6) {
            if (e.from === rootNode.id) cappedIds.add(e.to);
            if (e.to === rootNode.id) cappedIds.add(e.from);
          }
        });
        nodes = nodes.filter(n => cappedIds.has(n.id));
      } else {
        nodes = nodes.slice(0, 6);
      }
    }

    const nodeIds = new Set(nodes.map((n) => n.id));
    edges = edges.filter((e) => nodeIds.has(e.from) && nodeIds.has(e.to));

    return { visibleNodes: nodes, visibleEdges: edges };
  }, [allNodes, allEdges, selectedFile, selectedFolder, searchQuery, activeViewMode]);

  /* ── 3. Balanced 3x2 Matrix Layout (3:2 Aspect Ratio matching 85% viewport fill) ── */
  const layoutedNodes = useMemo(() => {
    if (visibleNodes.length === 0) return [];

    // Distribute nodes across a balanced 3-column by 2-row grid (3:2 aspect ratio)
    // Row 0 (Top): Entrypoint UI -> API Route -> Controller (y = -130px)
    // Row 1 (Bottom): Service -> Repository -> Database (y = +130px)
    const pos: Record<string, { x: number; y: number }> = {};
    const COL_W = 340;
    const ROW_H = 220;

    const uis = visibleNodes.filter(n => n.type === 'ui');
    const apis = visibleNodes.filter(n => n.type === 'api' || n.type === 'worker');
    const svcs = visibleNodes.filter(n => n.type === 'service' || n.type === 'lib');
    const dbs = visibleNodes.filter(n => n.type === 'db' || n.type === 'external');

    const orderedNodes = [...uis, ...apis, ...svcs, ...dbs];

    orderedNodes.forEach((node, idx) => {
      const col = idx % 3; // 3 columns: 0, 1, 2
      const row = Math.floor(idx / 3); // 2 rows: 0, 1

      pos[node.id] = {
        x: col * COL_W - COL_W, // Center columns around x = 0 (-340, 0, +340)
        y: row * ROW_H - ROW_H / 2 // Center rows around y = 0 (-110, +110)
      };
    });

    let stepCount = 1;
    return visibleNodes.map(node => ({
      ...node,
      stepNumber: stepCount++,
      _pos: pos[node.id] || { x: 0, y: 0 }
    }));
  }, [visibleNodes]);

  /* ── 4. Build React Flow nodes & edges ── */
  const computedNodes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    const connected = new Set<string>();
    if (hoveredNodeId && validNodeIds.has(hoveredNodeId)) {
      connected.add(hoveredNodeId);
      for (const e of visibleEdges) {
        if (e.from === hoveredNodeId || e.to === hoveredNodeId) {
          connected.add(e.from);
          connected.add(e.to);
        }
      }
    } else if (q) {
      const seeds = new Set(
        visibleNodes
          .filter((n) => n.label.toLowerCase().includes(q) || n.file.toLowerCase().includes(q))
          .map((n) => n.id)
      );
      for (const id of seeds) connected.add(id);
      for (const e of visibleEdges) {
        if (seeds.has(e.from) || seeds.has(e.to)) {
          connected.add(e.from);
          connected.add(e.to);
        }
      }
    }

    return layoutedNodes.map((node, idx) => {
      const isCurrentFileActive = selectedFile
        ? norm(node.file).endsWith(norm(selectedFile).split('/').pop() || '')
        : false;

      const nodeLiveUsers =
        members
          ?.filter((m) => {
            if (!m.currentFile) return false;
            const mf = norm(m.currentFile).split('/').pop() || '';
            const nf = norm(node.file).split('/').pop() || '';
            return mf && mf === nf;
          })
          .map((m) => ({ name: m.name, avatar: m.avatar, color: m.color, action: 'editing' as const })) ?? [];

      const isTarget = selectedFile
        ? node.file === selectedFile
        : selectedFolder
          ? isInsideFolder(node.file, selectedFolder)
          : false;

      const stepActive = activeStepIndex !== null && activeStepIndex !== undefined ? idx === activeStepIndex : false;
      const isHighlighted = (hoveredNodeId && connected.has(node.id)) || (q && connected.has(node.id)) || stepActive;
      const isDimmed = (hoveredNodeId && !connected.has(node.id)) || (q && !connected.has(node.id));

      return {
        id: node.id,
        type: 'customCall' as const,
        position: draggedPositionsRef.current[node.id] || node._pos,
        data: {
          ...node,
          isTarget,
          activeFileSelected: isCurrentFileActive,
          liveUsers: nodeLiveUsers,
          isHighlighted,
          isDimmed,
          stepActive,
        },
      };
    });
  }, [layoutedNodes, visibleEdges, selectedFile, selectedFolder, members, hoveredNodeId, searchQuery, validNodeIds, visibleNodes, activeStepIndex]);

  const computedEdges = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const active = hoveredNodeId || q;

    const connEdges = new Set<string>();
    if (hoveredNodeId) {
      for (const e of visibleEdges) {
        if (e.from === hoveredNodeId || e.to === hoveredNodeId) {
          connEdges.add(`${e.from}->${e.to}`);
        }
      }
    } else if (q) {
      const seeds = new Set(
        visibleNodes
          .filter((n) => n.label.toLowerCase().includes(q) || n.file.toLowerCase().includes(q))
          .map((n) => n.id)
      );
      for (const e of visibleEdges) {
        if (seeds.has(e.from) || seeds.has(e.to)) {
          connEdges.add(`${e.from}->${e.to}`);
        }
      }
    }

    return visibleEdges.map((edge, index) => {
      const key = `${edge.from}->${edge.to}`;
      const isConn = active ? connEdges.has(key) : false;
      const isDimmed = active ? !isConn : false;

      const numberedLabel = edge.labels.length > 0 
        ? `${index + 1}. ${edge.labels.slice(0, 2).join(' / ')}` 
        : `${index + 1}. Flow Step`;

      return {
        id: `edge-${edge.from}-${edge.to}`,
        source: edge.from,
        target: edge.to,
        type: 'default' as const,
        label: numberedLabel,
        animated: isConn,
        style: {
          stroke: isConn ? '#0284c7' : '#64748b',
          strokeWidth: isConn ? 2.5 : 1.5,
          opacity: isDimmed ? 0.15 : (isConn ? 1 : 0.8),
          strokeDasharray: isConn ? undefined : '5,4',
        },
        labelStyle: { fill: isConn ? '#0284c7' : '#1e293b', fontSize: 9.5, fontWeight: 700, fontFamily: 'sans-serif' },
        labelBgPadding: [6, 4] as [number, number],
        labelBgBorderRadius: 6,
        labelBgStyle: {
          fill: '#ffffff',
          color: '#0f172a',
          stroke: isConn ? '#0284c7' : '#cbd5e1',
          strokeWidth: isConn ? 1.5 : 1,
        },
      };
    });
  }, [visibleEdges, visibleNodes, hoveredNodeId, searchQuery]);

  /* ── 5. React Flow state & Tight Camera Auto-Fit (padding: 0.08 = 85-90% Viewport Fill) ── */
  const [flowNodes, setFlowNodes, onNodesChange] = useNodesState<Node>(computedNodes);
  const [flowEdges, setFlowEdges, onEdgesChange] = useEdgesState<Edge>(computedEdges);

  useEffect(() => {
    setFlowNodes(computedNodes);
    setFlowEdges(computedEdges);
  }, [computedNodes, computedEdges, setFlowNodes, setFlowEdges]);

  // Tight Camera Auto-Fit expanding graph to fill 85-90% of viewport
  useEffect(() => {
    if (flowNodes.length === 0) return;
    const t1 = setTimeout(() => fitView({ padding: 0.08, duration: 400 }), 80);
    const t2 = setTimeout(() => fitView({ padding: 0.08, duration: 300 }), 300);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [flowNodes.length, flowEdges.length, fitKey, activeViewMode, fitView]);

  const handleNodesChange = useCallback(
    (changes: any) => {
      for (const c of changes) {
        if (c.type === 'position' && c.position) {
          draggedPositionsRef.current[c.id] = c.position;
        }
      }
      onNodesChange(changes);
    },
    [onNodesChange]
  );

  const handleFullViewReset = useCallback(() => {
    draggedPositionsRef.current = {};
    setSearchQuery('');
    setActiveViewMode('data');
    if (onResetFocus) onResetFocus();
    setFitKey((k) => k + 1);
  }, [onResetFocus]);

  const isEmpty = flowNodes.length === 0;

  return (
    <div className="w-full h-full min-h-[400px] relative font-sans select-none">
      {/* ── Top Header Control Toolbar ── */}
      <div className="absolute top-3 left-3 right-3 z-20 flex items-center justify-between pointer-events-none gap-2 flex-wrap">
        
        {/* Left Badge: Data Flow Diagram Title & Scope */}
        <div className="bg-white/95 backdrop-blur border border-slate-200 px-3.5 py-1.5 rounded-xl shadow-sm flex items-center gap-2.5 pointer-events-auto">
          <Layers className="w-4 h-4 text-slate-950" />
          <div className="flex items-center gap-2">
            <span className="text-xs font-black text-slate-950 tracking-tight">Codebase Focus Graph</span>
            <span className="text-[9px] font-extrabold px-2 py-0.5 rounded-full bg-slate-100 text-slate-800 border border-slate-200">
              {selectedFeature ? `Feature: ${selectedFeature}` : selectedFile ? `File: ${selectedFile.split('/').pop()}` : 'Authentication Flow'}
            </span>
          </div>
          
          <button
            onClick={handleFullViewReset}
            className="ml-1 bg-slate-950 hover:bg-slate-800 text-white text-[10px] font-bold px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 shadow-xs"
            title="Reset position and fit view to all graph nodes"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Center Camera</span>
          </button>
        </div>

        {/* Right Controls: 3 View Mode Tabs + Search + Fullscreen */}
        <div className="flex items-center gap-2 pointer-events-auto flex-wrap justify-end">
          
          {/* 3 Architectural View Mode Tabs */}
          <div className="bg-white/95 backdrop-blur border border-slate-200 rounded-xl p-1 shadow-sm flex items-center gap-0.5">
            {[
              { id: 'request', label: 'Request Flow' },
              { id: 'data', label: 'Data Flow' },
              { id: 'dependency', label: 'Dependency Flow' },
            ].map((mode) => (
              <button
                key={mode.id}
                onClick={() => setActiveViewMode(mode.id as any)}
                className={`px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider rounded-lg transition-all ${
                  activeViewMode === mode.id
                    ? 'bg-slate-950 text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div className="bg-white/95 backdrop-blur border border-slate-200 rounded-xl p-1 shadow-sm flex items-center gap-1">
            <Search className="w-3.5 h-3.5 text-slate-400 ml-1.5" />
            <input
              type="text"
              placeholder="Search focus graph..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="text-xs bg-transparent border-none outline-none w-32 placeholder:text-slate-400 font-medium text-slate-800"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="text-slate-400 hover:text-slate-600 text-[10px] px-1"
              >
                ✕
              </button>
            )}
          </div>

          {onToggleFullscreen && (
            <button
              onClick={onToggleFullscreen}
              className="bg-white/95 backdrop-blur border border-slate-200 hover:border-slate-300 p-1.5 px-2.5 rounded-xl shadow-sm hover:bg-slate-50 text-slate-700 transition-all flex items-center gap-1.5 text-xs font-bold"
              title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen Mode'}
            >
              {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{isFullscreen ? 'Exit' : 'Fullscreen'}</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Compact Bottom-Right Legend Bar ── */}
      <div className="absolute bottom-3 right-3 z-20 bg-white/95 backdrop-blur border border-slate-200 px-3 py-1.5 rounded-xl shadow-sm flex items-center gap-3 text-[9px] font-bold text-slate-600 pointer-events-auto select-none">
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded bg-cyan-500" />
          <span>UI</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded bg-orange-500" />
          <span>API</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded bg-indigo-500" />
          <span>SERVICE</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded bg-emerald-600" />
          <span>DB</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded bg-purple-500" />
          <span>LIB</span>
        </div>
        <div className="h-2.5 w-px bg-slate-200" />
        <div className="flex items-center gap-1 text-slate-400 font-mono">
          <span className="text-[10px] font-bold text-slate-700">──►</span>
          <span>HTTP</span>
        </div>
        <div className="flex items-center gap-1 text-slate-400 font-mono">
          <span className="text-[10px] font-bold text-slate-700">- - ►</span>
          <span>Data Access</span>
        </div>
      </div>

      {/* ── Empty State ── */}
      {isEmpty && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center text-slate-400 bg-[#f8fafc]">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="text-slate-300 mb-3">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M3 9h18M9 21V9" />
          </svg>
          <p className="text-sm font-medium">No focus nodes match the current view.</p>
          {(selectedFile || selectedFolder || searchQuery) && (
            <button
              onClick={() => {
                setSearchQuery('');
                setActiveViewMode('data');
                if (onResetFocus) onResetFocus();
                setFitKey((k) => k + 1);
              }}
              className="mt-3 bg-slate-950 hover:bg-slate-800 text-white text-xs font-bold px-4 py-2 rounded-xl transition-all shadow-sm"
            >
              Clear filters &amp; show focus diagram
            </button>
          )}
        </div>
      )}

      {/* ── React Flow Canvas ── */}
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={(_, node) => onSelectNode(node.data as unknown as CallGraphNode)}
        onNodeMouseEnter={(_, node) => setHoveredNodeId(node.id)}
        onNodeMouseLeave={() => setHoveredNodeId(null)}
        minZoom={0.3}
        maxZoom={1.5}
        onlyRenderVisibleElements={false}
        nodesDraggable={true}
        nodesConnectable={false}
        className="w-full h-full min-h-[400px] bg-[#f8fafc]"
        fitView
        fitViewOptions={{ padding: 0.08, duration: 400 }}
      >
        <Background color="rgba(148, 163, 184, 0.3)" gap={18} size={1} />
        <Controls showInteractive={false} className="!bg-white !border-slate-200/80 !shadow-sm !rounded-xl" />
      </ReactFlow>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────── */
/*  EXPORT WRAPPER                                                      */
/* ──────────────────────────────────────────────────────────────────── */

export default function CallFlowGraph({
  isFullscreen,
  onToggleFullscreen,
  onResetFocus,
  isFocused,
  ...props
}: CallFlowGraphProps) {
  const containerClasses = isFullscreen
    ? 'fixed inset-0 z-50 bg-[#f8fafc] p-4 flex flex-col w-screen h-screen font-sans select-none'
    : 'w-full h-full min-h-[400px] flex-grow flex flex-col bg-[#f8fafc] rounded-xl overflow-hidden border border-slate-200/80 relative shadow-sm font-sans';

  return (
    <div className={containerClasses}>
      <ReactFlowProvider>
        <CallFlowGraphInner
          isFullscreen={isFullscreen}
          onToggleFullscreen={onToggleFullscreen}
          onResetFocus={onResetFocus}
          {...props}
        />
      </ReactFlowProvider>
    </div>
  );
}
