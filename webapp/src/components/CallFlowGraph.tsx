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
import { Layers, MessageSquare, Maximize2, Minimize2, RefreshCw, Search } from 'lucide-react';

/* ──────────────────────────────────────────────────────────────────── */
/*  TYPES                                                               */
/* ──────────────────────────────────────────────────────────────────── */

interface CallFlowGraphProps {
  nodes: CallGraphNode[];
  edges: CallGraphEdge[];
  onSelectNode: (node: CallGraphNode) => void;
  selectedFile: string | null;
  selectedFolder?: string | null;
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

/* ──────────────────────────────────────────────────────────────────── */
/*  UTILS                                                               */
/* ──────────────────────────────────────────────────────────────────── */

const norm = (p: string) =>
  p?.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/$/, '').toLowerCase() ?? '';

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

function isInsideFolder(file: string, folder: string): boolean {
  const f = norm(file);
  const fol = norm(folder);
  if (!fol) return true;
  return f === fol || f.startsWith(fol + '/');
}

/* ──────────────────────────────────────────────────────────────────── */
/*  UNIVERSAL DUAL-STRATEGY LAYOUT ENGINE                               */
/* ──────────────────────────────────────────────────────────────────── */

function computeLayout(
  nodes: CallGraphNode[],
  edges: { from: string; to: string }[]
): Record<string, { x: number; y: number }> {
  if (nodes.length === 0) return {};

  const byType: Record<string, CallGraphNode[]> = {};
  for (const n of nodes) {
    const t = (n.type || 'FILE').toString().toUpperCase();
    if (!byType[t]) byType[t] = [];
    byType[t].push(n);
  }

  const preferredOrder = ['UI', 'API', 'SERVICE', 'DB', 'EXTERNAL', 'FILE'];
  const allDiscoveredTypes = Object.keys(byType);
  
  const presentTypes = [
    ...preferredOrder.filter(t => byType[t]?.length > 0),
    ...allDiscoveredTypes.filter(t => !preferredOrder.includes(t) && byType[t]?.length > 0)
  ];

  if (presentTypes.length <= 1) {
    return computeGridLayout(nodes);
  }

  const COL_GAP = 80;
  const NODE_W = 310;
  const NODE_H = 160;
  const MAX_PER_COL = 6;

  const positions: Record<string, { x: number; y: number }> = {};
  let currentX = 0;

  for (const type of presentTypes) {
    const typeNodes = byType[type] || [];
    const count = typeNodes.length;
    if (count === 0) continue;

    const subCols = Math.ceil(count / MAX_PER_COL);
    const colWidth = subCols * NODE_W;

    const rows = Math.min(count, MAX_PER_COL);
    const groupHeight = rows * NODE_H;
    const startY = -(groupHeight / 2) + NODE_H / 2;

    typeNodes.forEach((node, i) => {
      const subCol = Math.floor(i / MAX_PER_COL);
      const row = i % MAX_PER_COL;
      positions[node.id] = {
        x: currentX + subCol * NODE_W,
        y: startY + row * NODE_H,
      };
    });

    currentX += colWidth + COL_GAP;
  }

  nodes.forEach((node, idx) => {
    if (!positions[node.id]) {
      positions[node.id] = {
        x: (idx % 3) * 310,
        y: Math.floor(idx / 3) * 160,
      };
    }
  });

  return positions;
}

function computeGridLayout(nodes: CallGraphNode[]): Record<string, { x: number; y: number }> {
  const n = nodes.length;
  if (n === 0) return {};

  const cols = n <= 2 ? n : n <= 6 ? 2 : n <= 12 ? 3 : 4;
  const NODE_W = 310;
  const NODE_H = 160;

  const actualCols = Math.min(cols, n);
  const gridWidth = actualCols * NODE_W;
  const startX = -(gridWidth / 2) + NODE_W / 2;

  const positions: Record<string, { x: number; y: number }> = {};
  nodes.forEach((node, i) => {
    const col = i % actualCols;
    const row = Math.floor(i / actualCols);
    positions[node.id] = {
      x: startX + col * NODE_W,
      y: row * NODE_H,
    };
  });

  return positions;
}

/* ──────────────────────────────────────────────────────────────────── */
/*  CUSTOM NODE CARD                                                    */
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
  };
}) {
  const tierStyle = useMemo(() => {
    const t = (data.type || '').toString().toLowerCase();
    switch (t) {
      case 'ui':
        return {
          topBorder: 'border-t-4 border-t-cyan-500',
          badge: 'bg-cyan-50 text-cyan-700 border-cyan-200/80',
          glow: 'hover:shadow-[0_8px_24px_rgba(6,182,212,0.15)]',
        };
      case 'api':
        return {
          topBorder: 'border-t-4 border-t-orange-500',
          badge: 'bg-orange-50 text-orange-700 border-orange-200/80',
          glow: 'hover:shadow-[0_8px_24px_rgba(249,115,22,0.15)]',
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
      case 'external':
        return {
          topBorder: 'border-t-4 border-t-rose-500',
          badge: 'bg-rose-50 text-rose-700 border-rose-200/80',
          glow: 'hover:shadow-[0_8px_24px_rgba(244,63,94,0.15)]',
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
    const parts = (data.file || '').split('.');
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
      className={`p-3.5 rounded-xl border bg-white shadow-[0_4px_12px_rgba(0,0,0,0.04)] min-w-[250px] max-w-[290px] transition-all duration-300 relative ${tierStyle.topBorder} ${tierStyle.glow} ${
        data.isDimmed ? 'opacity-20 grayscale-[50%]' : 'opacity-100'
      } ${
        data.isHighlighted
          ? 'border-slate-900 ring-4 ring-sky-500/25 shadow-[0_8px_24px_rgba(2,132,199,0.25)]'
          : data.activeFileSelected
            ? 'border-slate-900 ring-4 ring-slate-950/10'
            : data.isTarget
              ? 'border-slate-900 ring-2 ring-slate-950/20'
              : 'border-slate-200/90 hover:border-slate-400'
      }`}
    >
      <Handle type="target" position={Position.Top} className="w-2.5 h-2.5 !bg-slate-800 border-2 border-white" />

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
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-extrabold text-slate-800 truncate" title={data.label}>
            {data.label}
          </span>
          <div className="flex items-center gap-1.5">
            <span className="text-[8px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200/70">
              {extBadge}
            </span>
            <span className={`text-[8px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${tierStyle.badge}`}>
              {data.type}
            </span>
          </div>
        </div>

        <div className="text-[10px] text-slate-400 font-mono truncate" title={data.file}>
          {data.file}
        </div>

        {data.developer && (
          <div className="flex items-center gap-2 border-t border-slate-100 pt-1.5 mt-0.5">
            <div className={`w-4 h-4 rounded-full border flex items-center justify-center text-[8px] font-bold ${devColors}`}>
              {data.developer.avatar}
            </div>
            <div className="flex flex-col">
              <span className="text-[9px] font-bold text-slate-700 leading-none">{data.developer.name}</span>
              <span className="text-[7.5px] text-slate-400 leading-none mt-0.5">{data.developer.role}</span>
            </div>
          </div>
        )}

        {data.note && (
          <div className="flex items-start gap-1 bg-slate-50/80 border border-slate-100 p-1.5 rounded-lg text-[8.5px] text-slate-500 leading-normal mt-0.5">
            <MessageSquare className="w-2.5 h-2.5 text-slate-400 flex-shrink-0 mt-0.5" />
            <span className="font-medium line-clamp-2">{data.note}</span>
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} className="w-2.5 h-2.5 !bg-slate-800 border-2 border-white" />
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
  isFullscreen,
  onToggleFullscreen,
  members,
  onResetFocus,
}: CallFlowGraphProps) {
  const { fitView } = useReactFlow();

  const [activeTier, setActiveTier] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [fitKey, setFitKey] = useState(0);
  const draggedPositionsRef = useRef<Record<string, { x: number; y: number }>>({});

  /* ── 1. Dedupe incoming data ── */
  const { allNodes, allEdges } = useMemo(() => {
    const nodes = dedupeNodes(rawNodesIn);
    const validIds = new Set(nodes.map((n) => n.id));
    const edges = rawEdgesIn.filter(
      (e) => validIds.has(e.from) && validIds.has(e.to) && e.from !== e.to
    );
    const edgeMap = new Map<string, { from: string; to: string; labels: string[] }>();
    for (const e of edges) {
      const key = `${e.from}->${e.to}`;
      if (!edgeMap.has(key)) edgeMap.set(key, { from: e.from, to: e.to, labels: [] });
      if (e.label && !edgeMap.get(key)!.labels.includes(e.label)) edgeMap.get(key)!.labels.push(e.label);
    }
    return { allNodes: nodes, allEdges: Array.from(edgeMap.values()) };
  }, [rawNodesIn, rawEdgesIn]);

  const validNodeIds = useMemo(() => new Set(allNodes.map((n) => n.id)), [allNodes]);

  /* ── 2. Filter ── */
  const { visibleNodes, visibleEdges } = useMemo(() => {
    let nodes = allNodes;
    let edges = allEdges;

    if (selectedFile) {
      const normSelFile = norm(selectedFile);
      const target = allNodes.find((n) => norm(n.file) === normSelFile || norm(n.file).endsWith(normSelFile.split('/').pop() || ''));
      if (target) {
        const keep = new Set<string>([target.id]);
        for (const e of edges) {
          if (e.from === target.id) keep.add(e.to);
          if (e.to === target.id) keep.add(e.from);
        }
        nodes = nodes.filter((n) => keep.has(n.id));
      }
    } 
    else if (selectedFolder) {
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

    if (activeTier !== 'all') {
      const targetTier = activeTier.toLowerCase();
      const tierIds = new Set(nodes.filter((n) => (n.type || '').toLowerCase() === targetTier).map((n) => n.id));
      const keep = new Set<string>(tierIds);
      for (const e of edges) {
        if (tierIds.has(e.from)) keep.add(e.to);
        if (tierIds.has(e.to)) keep.add(e.from);
      }
      nodes = nodes.filter((n) => keep.has(n.id));
    }

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

    const nodeIds = new Set(nodes.map((n) => n.id));
    edges = edges.filter((e) => nodeIds.has(e.from) && nodeIds.has(e.to));

    return { visibleNodes: nodes, visibleEdges: edges };
  }, [allNodes, allEdges, selectedFile, selectedFolder, activeTier, searchQuery]);

  /* ── 3. Layout calculation ── */
  const positions = useMemo(() => {
    return computeLayout(visibleNodes, visibleEdges);
  }, [visibleNodes, visibleEdges]);

  /* ── 4. Build RF Nodes ── */
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
        if (seeds.has(e.from)) connected.add(e.to);
        if (seeds.has(e.to)) connected.add(e.from);
      }
    }

    return visibleNodes.map((node) => {
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
        ? norm(node.file) === norm(selectedFile)
        : selectedFolder
          ? isInsideFolder(node.file, selectedFolder)
          : false;

      const isHighlighted =
        (hoveredNodeId && connected.has(node.id)) || (q && connected.has(node.id));
      const isDimmed =
        (hoveredNodeId && !connected.has(node.id)) || (q && !connected.has(node.id));

      const pos = draggedPositionsRef.current[node.id] || positions[node.id] || { x: 0, y: 0 };

      return {
        id: node.id,
        type: 'customCall' as const,
        position: pos,
        data: {
          ...node,
          isTarget,
          activeFileSelected: isCurrentFileActive,
          liveUsers: nodeLiveUsers,
          isHighlighted,
          isDimmed,
        },
      };
    });
  }, [visibleNodes, visibleEdges, positions, selectedFile, selectedFolder, members, hoveredNodeId, searchQuery, validNodeIds]);

  /* ── 5. Build RF Edges (Smooth Curved Dotted Connections: type: 'default') ── */
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

    return visibleEdges.map((edge) => {
      const key = `${edge.from}->${edge.to}`;
      const isConn = active ? connEdges.has(key) : false;
      const isDimmed = active ? !isConn : false;

      return {
        id: `edge-${edge.from}-${edge.to}`,
        source: edge.from,
        target: edge.to,
        type: 'default' as const,
        label: edge.labels.length > 0 ? edge.labels.slice(0, 2).join(' / ') : undefined,
        animated: isConn,
        style: {
          stroke: isConn ? '#0284c7' : '#64748b',
          strokeWidth: isConn ? 2.5 : 1.4,
          opacity: isDimmed ? 0.15 : isConn ? 1 : 0.75,
          strokeDasharray: '4,4',
        },
        labelStyle: { fill: isConn ? '#0284c7' : '#334155', fontSize: 9, fontWeight: 600, fontFamily: 'monospace' },
        labelBgPadding: [5, 3] as [number, number],
        labelBgBorderRadius: 4,
        labelBgStyle: {
          fill: '#ffffff',
          color: '#0f172a',
          stroke: isConn ? '#0284c7' : '#cbd5e1',
          strokeWidth: isConn ? 1 : 0.5,
        },
      };
    });
  }, [visibleEdges, visibleNodes, hoveredNodeId, searchQuery]);

  /* ── 6. React Flow State Synchronization ── */
  const [flowNodes, setFlowNodes, onNodesChange] = useNodesState<Node>([]);
  const [flowEdges, setFlowEdges, onEdgesChange] = useEdgesState<Edge>([]);

  useEffect(() => {
    setFlowNodes(computedNodes);
    setFlowEdges(computedEdges);
  }, [computedNodes, computedEdges, setFlowNodes, setFlowEdges]);

  /* ── Camera auto-fit trigger on mount and state changes ── */
  useEffect(() => {
    if (flowNodes.length === 0) return;
    const t1 = setTimeout(() => fitView({ padding: 0.15, duration: 500 }), 80);
    const t2 = setTimeout(() => fitView({ padding: 0.12, duration: 400 }), 350);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [flowNodes.length, flowEdges.length, fitKey, fitView]);

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
    setActiveTier('all');
    if (onResetFocus) onResetFocus();
    setFitKey((k) => k + 1);
  }, [onResetFocus]);

  const isEmpty = flowNodes.length === 0;

  return (
    <div className="w-full h-full flex-1 min-h-[450px] relative">
      {/* ── Toolbar (ALWAYS visible) ── */}
      <div className="absolute top-3 left-3 right-3 z-20 flex items-center justify-between pointer-events-none gap-2">
        <div className="bg-white/95 backdrop-blur border border-slate-200 px-3 py-1.5 rounded-lg shadow-sm flex items-center gap-2 pointer-events-auto">
          <Layers className="w-4 h-4 text-slate-800" />
          <span className="text-xs font-extrabold text-slate-800">Call Flow Diagram</span>
          <button
            onClick={handleFullViewReset}
            className="ml-1 bg-slate-900 hover:bg-slate-800 text-white text-[10px] font-bold px-2.5 py-1 rounded-md transition-all flex items-center gap-1 shadow-xs"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Full View</span>
          </button>
        </div>

        <div className="flex items-center gap-2 pointer-events-auto flex-wrap justify-end">
          <div className="bg-white/95 backdrop-blur border border-slate-200 rounded-lg p-1 shadow-sm flex items-center gap-1">
            <Search className="w-3.5 h-3.5 text-slate-400 ml-1.5" />
            <input
              type="text"
              placeholder="Search graph nodes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="text-xs bg-transparent border-none outline-none w-36 placeholder:text-slate-400 font-medium text-slate-800"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="text-slate-400 hover:text-slate-600 text-[10px] px-1">✕</button>
            )}
          </div>

          <div className="bg-white/95 backdrop-blur border border-slate-200 rounded-lg p-1 shadow-sm flex items-center gap-0.5">
            {(['all', 'ui', 'api', 'service', 'db'] as const).map((tier) => (
              <button
                key={tier}
                onClick={() => setActiveTier(tier)}
                className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all ${
                  activeTier === tier ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
                }`}
              >
                {tier}
              </button>
            ))}
          </div>

          {onToggleFullscreen && (
            <button
              onClick={onToggleFullscreen}
              className="bg-white/95 backdrop-blur border border-slate-200 hover:border-slate-300 p-1.5 px-2.5 rounded-lg shadow-sm hover:bg-slate-50 text-slate-700 transition-all flex items-center gap-1.5 text-xs font-bold"
            >
              {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{isFullscreen ? 'Exit' : 'Fullscreen'}</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Empty State ── */}
      {isEmpty && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center text-slate-400 bg-[#f8fafc]">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="text-slate-300 mb-3">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M3 9h18M9 21V9" />
          </svg>
          <p className="text-sm font-medium">No nodes match the current view.</p>
          {(selectedFile || selectedFolder || activeTier !== 'all' || searchQuery) && (
            <button
              onClick={() => {
                setSearchQuery('');
                setActiveTier('all');
                if (onResetFocus) onResetFocus();
                setFitKey((k) => k + 1);
              }}
              className="mt-3 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold px-4 py-2 rounded-md transition-all"
            >
              Clear filters &amp; show all
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
        minZoom={0.05}
        maxZoom={1.5}
        onlyRenderVisibleElements={false}
        nodesDraggable={true}
        nodesConnectable={false}
        className="w-full h-full min-h-[450px] bg-[#f8fafc]"
        fitView
        fitViewOptions={{ padding: 0.15, duration: 500 }}
      >
        <Background color="rgba(148, 163, 184, 0.25)" gap={18} size={1} />
        <Controls showInteractive={false} className="!bg-white !border-slate-200/80 !shadow-sm !rounded-lg" />
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
    : 'w-full h-full flex-1 flex flex-col min-h-[450px] bg-[#f8fafc] rounded-xl overflow-hidden border border-slate-200/80 relative shadow-sm font-sans';

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
