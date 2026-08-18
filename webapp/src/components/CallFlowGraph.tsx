'use client';

import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  useNodesState,
  useEdgesState,
  Node,
  Edge,
  Handle,
  Position,
  ReactFlowProvider,
  useReactFlow,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from '@dagrejs/dagre';
import { CallGraphNode, CallGraphEdge } from '@/lib/analyzer';
import { Layers, Maximize2, Minimize2, RefreshCw, Search, ShieldAlert, GitBranch, Database, BookOpen, FolderTree } from 'lucide-react';
import PillNav from './PillNav';
import Dock from './Dock';

/* ──────────────────────────────────────────────────────────────────── */
/*  TIER COLOUR SYSTEM                                                  */
/* ──────────────────────────────────────────────────────────────────── */

const TIER_COLOR: Record<string, string> = {
  ui:       '#0EA5B7',   // teal
  api:      '#E8641C',   // burnt orange
  service:  '#6D4FC2',   // violet
  worker:   '#6D4FC2',   // violet (same family as service)
  db:       '#1A9E6B',   // green
  lib:      '#B23A82',   // magenta
  external: '#B23A82',   // magenta (same family as lib)
};

function tierColor(type: string): string {
  return TIER_COLOR[type] ?? '#64748b';
}

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
  onToggleLeftPanel?: () => void;
  onToggleRightPanel?: () => void;
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
/*  REDESIGNED NODE CARD                                                */
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
  const color = tierColor(data.type);

  // File extension badge
  const extBadge = useMemo(() => {
    const parts = data.file.split('.');
    return parts.length > 1 ? parts[parts.length - 1].toUpperCase() : 'FILE';
  }, [data.file]);

  // File path (shorter display: last 2 segments)
  const displayPath = useMemo(() => {
    const parts = norm(data.file).split('/');
    return parts.length > 2 ? '…/' + parts.slice(-2).join('/') : data.file;
  }, [data.file]);

  const liveUsers = data.liveUsers || [];

  // Opacity
  const opacity = data.isDimmed ? 0.08 : 1;

  // Ring / border highlight state
  let ringClass = '';
  let borderColor = '#e2e8f0';
  if (data.stepActive) {
    ringClass = 'ring-4';
    borderColor = color;
  } else if (data.isHighlighted) {
    ringClass = 'ring-2';
    borderColor = color;
  } else if (data.activeFileSelected || data.isTarget) {
    borderColor = color;
  }

  return (
    <div
      style={{
        opacity,
        borderColor,
        // Left colored stripe — the signature design element
        borderLeftColor: color,
        borderLeftWidth: 4,
        '--ring-color': color,
        transition: 'opacity 0.2s, box-shadow 0.2s',
      } as React.CSSProperties}
      className={`
        relative w-[280px] bg-white border border-slate-200/80 rounded-lg
        shadow-sm hover:shadow-[0_8px_24px_rgba(0,0,0,0.10)]
        transition-all duration-200
        ${ringClass ? `ring-2` : ''}
      `}
    >
      {/* Target handle — top (TB layout) */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-2.5 !h-2.5 !border-2 !border-white"
        style={{ background: color }}
      />

      {/* Live collaborator badge */}
      {liveUsers.length > 0 && (
        <div className="absolute -top-3 -right-2 flex items-center gap-1 bg-white border border-slate-200 shadow-sm px-2 py-0.5 rounded-full z-20">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
          </span>
          <div className="flex -space-x-1">
            {liveUsers.map((user, idx) => (
              <div
                key={idx}
                className="w-4 h-4 rounded-full flex items-center justify-center text-[7px] font-bold text-white ring-1 ring-white"
                style={{ background: color }}
                title={`${user.name} is actively ${user.action}`}
              >
                {user.avatar}
              </div>
            ))}
          </div>
          <span className="text-[7px] font-bold text-slate-400 uppercase tracking-widest">
            {liveUsers[0].action}
          </span>
        </div>
      )}

      <div className="p-3 flex flex-col gap-1.5">
        {/* ── Header row: step number + filename + ext badge + tier badge ── */}
        <div className="flex items-center justify-between gap-1.5">
          <div className="flex items-center gap-1.5 min-w-0">
            {/* Step circle — tier-colored */}
            {data.stepNumber && (
              <span
                className="w-5 h-5 rounded-full text-white text-[9px] font-black flex items-center justify-center flex-shrink-0 shadow-xs"
                style={{ background: color }}
              >
                {data.stepNumber}
              </span>
            )}
            {/* Filename */}
            <span
              className="font-semibold text-[#1C2333] text-xs truncate leading-tight tracking-tight"
              title={data.label}
              style={{ letterSpacing: '-0.01em' }}
            >
              {data.label}
            </span>
          </div>

          {/* Right badges */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {/* Extension badge */}
            <span className="text-[7.5px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200/70 leading-none">
              {extBadge}
            </span>
            {/* Tier badge — filled with tier color, white text */}
            <span
              className="text-[7.5px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full text-white leading-none"
              style={{ background: color }}
            >
              {data.type}
            </span>
          </div>
        </div>

        {/* ── File path — monospace, signals "this is code" ── */}
        <div
          className="text-[9.5px] text-slate-400 truncate leading-tight px-1"
          style={{ fontFamily: "'JetBrains Mono', 'IBM Plex Mono', 'Fira Code', monospace" }}
          title={data.file}
        >
          {displayPath}
        </div>

        {/* ── Exported methods ── */}
        {data.methods && data.methods.length > 0 && (
          <div
            className="flex flex-col gap-0.5 pt-1.5 border-t border-slate-100"
            style={{ fontFamily: "'JetBrains Mono', 'IBM Plex Mono', monospace" }}
          >
            {data.methods.slice(0, 2).map((method, idx) => (
              <div key={idx} className="flex items-center gap-1.5 truncate">
                <span
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ background: color }}
                />
                <span className="text-[9px] font-medium truncate text-slate-600">{method}</span>
              </div>
            ))}
          </div>
        )}

        {/* ── Developer avatar ── */}
        {data.developer && (
          <div className="flex items-center gap-1.5 border-t border-slate-100 pt-1.5">
            <div
              className="w-4 h-4 rounded-full border-2 border-white flex items-center justify-center text-[7px] font-bold text-white shadow-xs"
              style={{ background: color }}
            >
              {data.developer.avatar}
            </div>
            <span className="text-[9px] font-medium text-slate-500 truncate">
              {data.developer.name}
            </span>
          </div>
        )}
      </div>

      {/* Source handle — bottom (TB layout) */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-2.5 !h-2.5 !border-2 !border-white"
        style={{ background: color }}
      />
    </div>
  );
}

const nodeTypes = { customCall: CustomCallNode };

/* ──────────────────────────────────────────────────────────────────── */
/*  INNER GRAPH COMPONENT                                               */
/* ──────────────────────────────────────────────────────────────────── */

function CallFlowGraphInner({
  nodes: rawNodes,
  edges: rawEdges,
  onSelectNode,
  selectedFile,
  selectedFolder,
  selectedFeature,
  activeStepIndex,
  isFullscreen,
  onToggleFullscreen,
  onToggleLeftPanel,
  onToggleRightPanel,
  members,
  repoSource,
  onResetFocus,
  isFocused,
}: CallFlowGraphProps) {
  const { fitView } = useReactFlow();

  const [activeViewMode, setActiveViewMode] = useState<'request' | 'data' | 'dependency' | 'impact'>('data');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [fitKey, setFitKey] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const draggedPositionsRef = useRef<Record<string, { x: number; y: number }>>({});

  /* ── 1. Dedupe incoming nodes & edges ── */
  const { allNodes, allEdges } = useMemo(() => {
    const nodes = dedupeNodes(rawNodes);
    const validIds = new Set(nodes.map((n) => n.id));

    const edges = rawEdges.filter(
      (e: CallGraphEdge) => validIds.has(e.from) && validIds.has(e.to) && e.from !== e.to
    );

    const edgeMap = new Map<string, { from: string; to: string; labels: string[] }>();
    for (const e of edges) {
      const key = `${e.from}->${e.to}`;
      if (!edgeMap.has(key)) edgeMap.set(key, { from: e.from, to: e.to, labels: [] });
      if (e.label && !edgeMap.get(key)!.labels.includes(e.label))
        edgeMap.get(key)!.labels.push(e.label);
    }

    return { allNodes: nodes, allEdges: Array.from(edgeMap.values()) };
  }, [rawNodes, rawEdges]);

  const validNodeIds = useMemo(() => new Set(allNodes.map((n) => n.id)), [allNodes]);

  /* ── 2. Filtered & capped focus graph ── */
  const { visibleNodes, visibleEdges } = useMemo(() => {
    let nodes = allNodes;
    let edges = allEdges;

    if (activeViewMode === 'request') {
      nodes = nodes.filter((n) => n.type === 'ui' || n.type === 'api' || n.type === 'service');
    } else if (activeViewMode === 'data') {
      nodes = nodes.filter(
        (n) => n.type === 'api' || n.type === 'service' || n.type === 'db' || n.type === 'ui'
      );
    } else if (activeViewMode === 'dependency') {
      nodes = nodes.filter(
        (n) => n.type === 'service' || n.type === 'lib' || n.type === 'external' || n.type === 'db'
      );
    }

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

    // Node cap — BFS from best root, max 20 by default
    const NODE_CAP = showAll ? Infinity : 20;
    if (nodes.length > NODE_CAP) {
      const rootNode =
        nodes.find((n) => n.type === 'ui') ||
        nodes.find((n) => n.type === 'api') ||
        nodes[0];
      if (rootNode) {
        const cappedIds = new Set<string>([rootNode.id]);
        let frontier = [rootNode.id];
        while (cappedIds.size < NODE_CAP && frontier.length > 0) {
          const next: string[] = [];
          for (const fid of frontier) {
            for (const e of edges) {
              if (cappedIds.size >= NODE_CAP) break;
              if (e.from === fid && !cappedIds.has(e.to)) { cappedIds.add(e.to); next.push(e.to); }
              if (e.to === fid && !cappedIds.has(e.from)) { cappedIds.add(e.from); next.push(e.from); }
            }
          }
          frontier = next;
        }
        nodes = nodes.filter((n) => cappedIds.has(n.id));
      } else {
        nodes = nodes.slice(0, NODE_CAP);
      }
    }

    const nodeIds = new Set(nodes.map((n) => n.id));
    edges = edges.filter((e) => nodeIds.has(e.from) && nodeIds.has(e.to));

    return { visibleNodes: nodes, visibleEdges: edges };
  }, [allNodes, allEdges, selectedFile, selectedFolder, searchQuery, activeViewMode, showAll]);

  /* ── 3. Dagre TB hierarchical layout ── */
  const layoutedNodes = useMemo(() => {
    if (visibleNodes.length === 0) return [];

    const NODE_W = 280;
    const NODE_H = 120;

    const tierRank: Record<string, number> = {
      ui: 0, api: 1, worker: 1, service: 2, lib: 2, db: 3, external: 3,
    };

    const g = new dagre.graphlib.Graph({ multigraph: false });
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({
      rankdir: 'TB',
      align: 'UL',
      nodesep: 60,
      ranksep: 100,
      edgesep: 20,
      ranker: 'tight-tree',
    });

    visibleNodes.forEach((node) => {
      g.setNode(node.id, { width: NODE_W, height: NODE_H, rank: tierRank[node.type] ?? 2 });
    });

    visibleEdges.forEach((edge) => {
      if (g.hasNode(edge.from) && g.hasNode(edge.to)) {
        g.setEdge(edge.from, edge.to);
      }
    });

    dagre.layout(g);

    const pos: Record<string, { x: number; y: number }> = {};
    g.nodes().forEach((nodeId) => {
      const n = g.node(nodeId);
      if (n) pos[nodeId] = { x: n.x - NODE_W / 2, y: n.y - NODE_H / 2 };
    });

    let stepCount = 1;
    return visibleNodes.map((node) => ({
      ...node,
      stepNumber: stepCount++,
      _pos: pos[node.id] || { x: 0, y: 0 },
    }));
  }, [visibleNodes, visibleEdges]);

  /* ── 4. Build React Flow nodes ── */
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

      const hasActiveFilter = !!(hoveredNodeId || q);
      const isInConnected = connected.has(node.id);
      const stepActive =
        activeStepIndex !== null && activeStepIndex !== undefined ? idx === activeStepIndex : false;
      const isHighlighted = isInConnected || stepActive;
      // Aggressive dimming: 8% opacity for non-connected nodes when hovering
      const isDimmed = hasActiveFilter && !isInConnected && !stepActive;

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
  }, [
    layoutedNodes,
    visibleEdges,
    selectedFile,
    selectedFolder,
    members,
    hoveredNodeId,
    searchQuery,
    validNodeIds,
    visibleNodes,
    activeStepIndex,
  ]);

  /* ── 5. Build React Flow edges — color-coded by type ── */
  const computedEdges = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const hasActiveFilter = !!(hoveredNodeId || q);

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
      const isConn = hasActiveFilter ? connEdges.has(key) : false;
      const isDimmed = hasActiveFilter && !isConn;

      const rawLabel = edge.labels?.[0] || '';
      const isContains = rawLabel === 'contains';
      const isCalls = rawLabel === 'calls';
      const label = rawLabel && rawLabel !== 'imports' && rawLabel !== 'calls' && rawLabel !== 'contains'
        ? rawLabel
        : '';

      // "contains" edges: structural, quieter — thin gray, no arrowhead
      if (isContains) {
        return {
          id: `edge-${edge.from}-${edge.to}`,
          source: edge.from,
          target: edge.to,
          type: 'default' as const,
          style: {
            stroke: isDimmed ? 'rgba(148,163,184,0.08)' : 'rgba(148,163,184,0.35)',
            strokeWidth: 1,
            strokeDasharray: '4 4',
          },
          // No arrowhead for structural edges
          markerEnd: undefined,
        };
      }

      // Flow edges (calls / imports): tier-colored, with animated highlight
      // Source node determines the edge color
      const sourceNode = visibleNodes.find((n) => n.id === edge.from);
      const edgeColor = sourceNode ? tierColor(sourceNode.type) : '#94a3b8';
      const activeColor = edgeColor;
      const restColor = '#cbd5e1';

      const strokeColor = isConn ? activeColor : restColor;
      const strokeOpacity = isDimmed ? 0.08 : 1;

      return {
        id: `edge-${edge.from}-${edge.to}`,
        source: edge.from,
        target: edge.to,
        type: 'default' as const,
        label: label || undefined,
        animated: isConn,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 12,
          height: 12,
          color: strokeColor,
        },
        style: {
          stroke: strokeColor,
          strokeWidth: isConn ? 2.5 : 1.5,
          // "calls" edges: dashed; "imports" edges: solid
          strokeDasharray: isCalls ? '6 3' : undefined,
          opacity: strokeOpacity,
          transition: 'stroke 0.15s, opacity 0.15s',
        },
        ...(label
          ? {
              labelStyle: {
                fill: isConn ? activeColor : '#64748b',
                fontSize: 9,
                fontWeight: 700,
                fontFamily: 'monospace',
              },
              labelBgPadding: [5, 3] as [number, number],
              labelBgBorderRadius: 5,
              labelBgStyle: {
                fill: '#f8fafc',
                stroke: isConn ? activeColor : '#e2e8f0',
                strokeWidth: 1,
              },
            }
          : {}),
      };
    });
  }, [visibleEdges, visibleNodes, hoveredNodeId, searchQuery]);

  /* ── 6. React Flow state ── */
  const [flowNodes, setFlowNodes, onNodesChange] = useNodesState<Node>(computedNodes);
  const [flowEdges, setFlowEdges, onEdgesChange] = useEdgesState<Edge>(computedEdges);

  useEffect(() => {
    setFlowNodes(computedNodes);
    setFlowEdges(computedEdges);
  }, [computedNodes, computedEdges, setFlowNodes, setFlowEdges]);

  // Clear stale drag overrides when node set changes
  const prevNodeSetRef = useRef<string>('');
  useEffect(() => {
    const currentSet = visibleNodes.map((n) => n.id).sort().join(',');
    if (currentSet !== prevNodeSetRef.current) {
      prevNodeSetRef.current = currentSet;
      draggedPositionsRef.current = {};
    }
  }, [visibleNodes]);

  // fitView: re-run after nodes/edges settle. Two-pass (80ms + 300ms) handles
  // the case where the layout is still being applied when the first pass fires.
  useEffect(() => {
    if (flowNodes.length === 0) return;
    const t1 = setTimeout(() => fitView({ padding: 0.20, duration: 350 }), 80);
    const t2 = setTimeout(() => fitView({ padding: 0.20, duration: 300 }), 320);
    return () => { clearTimeout(t1); clearTimeout(t2); };
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
    <div className="w-full h-full flex-1 min-h-0 relative font-sans select-none flex flex-col">

      {/* ── Floating Top Bar ── */}
      <div className="absolute top-3 left-3 right-3 z-20 pointer-events-auto flex items-center justify-between gap-3 bg-white/95 backdrop-blur-md border border-slate-200/90 p-2 rounded-2xl shadow-sm">

        {/* Left: Project Map toggle + Title */}
        <div className="flex items-center gap-2.5">
          {onToggleLeftPanel && (
            <button
              onClick={onToggleLeftPanel}
              className="flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 transition-all cursor-pointer shrink-0"
              title="Toggle Project Structure panel"
            >
              <FolderTree className="w-3.5 h-3.5 text-slate-700" />
              <span className="hidden sm:inline">Project Map</span>
            </button>
          )}

          <div className="w-7 h-7 rounded-xl bg-slate-950 text-white flex items-center justify-center shadow-xs shrink-0">
            <Layers className="w-3.5 h-3.5" />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="text-xs font-black text-slate-950 tracking-tight"
              style={{ letterSpacing: '-0.02em' }}
            >
              Codebase Focus Graph
            </span>
            <span className="text-[9px] font-extrabold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
              {selectedFeature
                ? `Feature: ${selectedFeature}`
                : selectedFile
                ? `File: ${selectedFile.split('/').pop()}`
                : 'Dependency View'}
            </span>
            <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200">
              {visibleNodes.length} nodes · {visibleEdges.length} edges
            </span>
            {allNodes.length > 20 && (
              <button
                onClick={() => setShowAll((v) => !v)}
                className="text-[9px] font-bold px-2.5 py-0.5 rounded-full border transition-colors bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100 cursor-pointer"
                title={
                  showAll
                    ? 'Collapse to focused view (20 nodes)'
                    : `Expand to full graph (${allNodes.length} nodes)`
                }
              >
                {showAll ? '⊟ Collapse' : `⊞ Expand all ${allNodes.length}`}
              </button>
            )}
          </div>
        </div>

        {/* Right: Search + Walkthrough toggle */}
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="bg-slate-100/90 border border-slate-200/80 rounded-xl px-3 py-1.5 flex items-center gap-2 focus-within:bg-white focus-within:border-slate-400 focus-within:shadow-xs transition-all duration-200 shrink-0">
            <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <input
              type="text"
              placeholder="Search focus graph..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="text-xs bg-transparent border-none outline-none w-32 focus:w-48 placeholder:text-slate-400 font-medium text-slate-800 transition-all duration-200"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="text-slate-400 hover:text-slate-600 text-[10px] px-1 shrink-0"
              >
                ✕
              </button>
            )}
          </div>

          {onToggleRightPanel && (
            <button
              onClick={onToggleRightPanel}
              className="flex items-center gap-1 text-[10px] font-bold px-2.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white transition-all shadow-xs cursor-pointer shrink-0"
              title="Toggle Architecture Walkthrough & Impact panel"
            >
              <BookOpen className="w-3.5 h-3.5 text-white" />
              <span className="hidden sm:inline">Walkthrough</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Legend bar (bottom-right) ── */}
      <div className="absolute bottom-3 right-3 z-10 hidden xl:flex bg-white/95 backdrop-blur border border-slate-200/90 px-3 py-2 rounded-xl shadow-xs items-center gap-3 text-[9px] font-extrabold text-slate-600 pointer-events-auto select-none">
        {/* Tier dots */}
        {[
          { label: 'UI', color: TIER_COLOR.ui },
          { label: 'API', color: TIER_COLOR.api },
          { label: 'SERVICE', color: TIER_COLOR.service },
          { label: 'DB', color: TIER_COLOR.db },
          { label: 'LIB', color: TIER_COLOR.lib },
        ].map(({ label, color }) => (
          <div key={label} className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full" style={{ background: color }} />
            <span style={{ color }}>{label}</span>
          </div>
        ))}
        <div className="h-3 w-px bg-slate-200 mx-1" />
        {/* Edge type legend */}
        <div className="flex items-center gap-1 text-slate-500">
          <span className="font-mono text-[10px] font-black text-slate-700">──►</span>
          <span>Imports</span>
        </div>
        <div className="flex items-center gap-1 text-slate-500">
          <span className="font-mono text-[10px] font-black text-slate-700">╌╌►</span>
          <span>Calls</span>
        </div>
        <div className="flex items-center gap-1 text-slate-400">
          <span className="font-mono text-[10px]">╌╌╌</span>
          <span>Contains</span>
        </div>
      </div>

      {/* ── Empty State ── */}
      {isEmpty && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center text-slate-400 bg-[#FAFBFC]">
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            className="text-slate-300 mb-3"
          >
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
        /* ── ZOOM FIX: minZoom 0.05 means a 280px-wide card in a 13-node
           row can shrink enough to fit even a 1280px viewport at 0.05×.
           Max 2× is sufficient for reading card details. ── */
        minZoom={0.05}
        maxZoom={2}
        onlyRenderVisibleElements={false}
        nodesDraggable={true}
        nodesConnectable={false}
        className="w-full h-full min-h-[500px] flex-1 bg-[#FAFBFC]"
        style={{ height: '100%', minHeight: '500px' }}
        fitView
        fitViewOptions={{ padding: 0.20, duration: 400 }}
      >
        {/* Subtle dot grid — keeps the canvas feeling like an infinite board */}
        <Background
          variant={BackgroundVariant.Dots}
          color="#e2e8f0"
          gap={24}
          size={1.2}
        />
        <Controls
          showInteractive={false}
          className="!bg-white !border-slate-200/80 !shadow-sm !rounded-xl"
        />
      </ReactFlow>

      {/* ── Floating Dock ── */}
      <Dock
        items={[
          {
            icon: <RefreshCw className="w-4 h-4 text-sky-600" />,
            label: 'Center Camera',
            onClick: handleFullViewReset,
          },
          {
            icon: <Layers className="w-4 h-4 text-indigo-600" />,
            label: 'Request Flow Mode',
            onClick: () => setActiveViewMode('request'),
          },
          {
            icon: <GitBranch className="w-4 h-4 text-emerald-600" />,
            label: 'Data Flow Mode',
            onClick: () => setActiveViewMode('data'),
          },
          {
            icon: <Database className="w-4 h-4 text-amber-600" />,
            label: 'Dependency Flow Mode',
            onClick: () => setActiveViewMode('dependency'),
          },
          {
            icon: isFullscreen
              ? <Minimize2 className="w-4 h-4 text-rose-600" />
              : <Maximize2 className="w-4 h-4 text-purple-600" />,
            label: isFullscreen ? 'Exit Fullscreen' : 'Toggle Fullscreen',
            onClick: onToggleFullscreen,
          },
        ]}
        panelHeight={54}
        baseItemSize={38}
        magnification={54}
      />
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────── */
/*  EXPORT WRAPPER                                                      */
/* ──────────────────────────────────────────────────────────────────── */

export default function CallFlowGraph({
  isFullscreen: externalFullscreen,
  onToggleFullscreen,
  onResetFocus,
  isFocused,
  ...props
}: CallFlowGraphProps) {
  const [internalFullscreen, setInternalFullscreen] = useState(false);
  const isFullscreen =
    externalFullscreen !== undefined ? externalFullscreen : internalFullscreen;

  const handleToggleFullscreen = () => {
    if (onToggleFullscreen) onToggleFullscreen();
    setInternalFullscreen((prev) => !prev);
  };

  const containerClasses = isFullscreen
    ? 'fixed inset-0 z-50 bg-[#FAFBFC] p-4 flex flex-col w-screen h-screen font-sans select-none'
    : 'w-full h-full flex-1 min-h-[500px] flex flex-col bg-[#FAFBFC] rounded-xl overflow-hidden border border-slate-200/80 relative shadow-sm font-sans';

  return (
    <div className={containerClasses} style={{ height: '100%', minHeight: '500px' }}>
      <ReactFlowProvider>
        <CallFlowGraphInner
          isFullscreen={isFullscreen}
          onToggleFullscreen={handleToggleFullscreen}
          onResetFocus={onResetFocus}
          {...props}
        />
      </ReactFlowProvider>
    </div>
  );
}
