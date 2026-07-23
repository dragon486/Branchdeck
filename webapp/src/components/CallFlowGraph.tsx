'use client';

import React, { useEffect, useMemo } from 'react';
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
  useReactFlow
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { CallGraphNode, CallGraphEdge } from '@/lib/analyzer';
import { Layers, MessageSquare, Maximize2, Minimize2, RefreshCw } from 'lucide-react';

interface CallFlowGraphProps {
  nodes: CallGraphNode[];
  edges: CallGraphEdge[];
  onSelectNode: (node: CallGraphNode) => void;
  selectedFile: string | null;
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


// Custom Node component to render cards in light theme with vertical handles, avatars, and notes
function CustomCallNode({ data }: { data: CallGraphNode & { isTarget?: boolean; activeFileSelected?: boolean; liveUsers?: LiveCollaborator[] } }) {
  const badgeColor = useMemo(() => {
    switch (data.type) {
      case 'ui': return 'bg-cyan-50 text-cyan-700 border-cyan-200';
      case 'api': return 'bg-orange-50 text-orange-700 border-orange-200';
      case 'service': return 'bg-slate-50 text-slate-800 border-slate-200';
      case 'db': return 'bg-slate-900 text-slate-100 border-slate-950';
      case 'external': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      default: return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  }, [data.type]);

  const devColors = useMemo(() => {
    const initials = data.developer?.avatar || '';
    if (initials === 'SC') return 'bg-rose-100 text-rose-700 border-rose-200';
    if (initials === 'AR') return 'bg-sky-100 text-sky-700 border-sky-200';
    if (initials === 'ER') return 'bg-violet-100 text-violet-700 border-violet-200';
    if (initials === 'MV') return 'bg-amber-100 text-amber-700 border-amber-200';
    return 'bg-slate-100 text-slate-700 border-slate-200';
  }, [data.developer]);

  const liveUsers = useMemo(() => {
    return data.liveUsers || [];
  }, [data.liveUsers]);

  return (
    <div className={`p-4 rounded-xl border bg-white shadow-[0_4px_12px_rgba(0,0,0,0.1)] min-w-[240px] max-w-[280px] transition-all duration-300 relative ${
      data.activeFileSelected
        ? 'border-slate-900 ring-4 ring-slate-950/10'
        : data.isTarget 
          ? 'border-slate-900 ring-2 ring-slate-950/20' 
          : 'border-slate-200/80 hover:border-slate-350 hover:shadow-[0_8px_24px_rgba(0,0,0,0.18)]'
    }`}>
      {/* Target/source ports laid out TOP and BOTTOM for vertical flows */}
      <Handle type="target" position={Position.Top} className="w-2 h-2 !bg-slate-900" />
      
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

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold text-slate-800 truncate">{data.label}</span>
          <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${badgeColor}`}>
            {data.type}
          </span>
        </div>

        <div className="text-[10px] text-slate-400 font-mono truncate">{data.file}</div>

        {data.developer && (
          <div className="flex items-center gap-2 border-t border-slate-100 pt-2">
            <div className={`w-5 h-5 rounded-full border flex items-center justify-center text-[9px] font-bold ${devColors}`}>
              {data.developer.avatar}
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-slate-700 leading-none">{data.developer.name}</span>
              <span className="text-[8px] text-slate-400 leading-none mt-0.5">{data.developer.role}</span>
            </div>
          </div>
        )}

        {data.note && (
          <div className="flex items-start gap-1.5 bg-slate-50 border border-slate-100 p-2 rounded-lg text-[9px] text-slate-500 leading-normal mt-1">
            <MessageSquare className="w-3 h-3 text-slate-400 flex-shrink-0 mt-0.5" />
            <span className="font-medium">{data.note}</span>
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} className="w-2 h-2 !bg-slate-900" />
    </div>
  );
}

const nodeTypes = {
  customCall: CustomCallNode
};

function CallFlowGraphInner({ nodes, edges, onSelectNode, selectedFile, isFullscreen, members, repoSource }: CallFlowGraphProps) {
  const { fitView } = useReactFlow();

  // 1. Build memoized node set for fast validation
  const validNodeIds = useMemo(() => new Set(nodes.map(n => n.id)), [nodes]);

  // 2. Compute non-overlapping layout positions
  const computedNodes = useMemo(() => {
    if (nodes.length === 0) return [];

    const adj: Record<string, string[]> = {};
    const inDegree: Record<string, number> = {};
    
    nodes.forEach(n => {
      adj[n.id] = [];
      inDegree[n.id] = 0;
    });
    
    edges.forEach(e => {
      if (adj[e.from] && validNodeIds.has(e.to)) {
        adj[e.from].push(e.to);
      }
      if (inDegree[e.to] !== undefined && validNodeIds.has(e.from)) {
        inDegree[e.to]++;
      }
    });

    // Root nodes
    const queue: string[] = nodes.filter(n => inDegree[n.id] === 0).map(n => n.id);
    if (queue.length === 0 && nodes.length > 0) {
      queue.push(nodes[0].id);
    }

    const levels: Record<string, number> = {};
    queue.forEach(id => { levels[id] = 0; });

    const visited = new Set<string>(queue);
    let qIndex = 0;
    while (qIndex < queue.length) {
      const current = queue[qIndex++];
      const currentLevel = levels[current] || 0;
      const neighbors = adj[current] || [];
      neighbors.forEach(neighbor => {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          levels[neighbor] = currentLevel + 1;
          queue.push(neighbor);
        } else {
          levels[neighbor] = Math.max(levels[neighbor] || 0, currentLevel + 1);
        }
      });
    }

    nodes.forEach(n => {
      if (levels[n.id] === undefined) levels[n.id] = 0;
    });

    const nodesByLevel: Record<number, string[]> = {};
    nodes.forEach(n => {
      const lvl = levels[n.id];
      if (!nodesByLevel[lvl]) nodesByLevel[lvl] = [];
      nodesByLevel[lvl].push(n.id);
    });

    const computedPositions: Record<string, { x: number; y: number }> = {};
    const levelHeight = 220;
    const nodeWidth = 300;

    Object.entries(nodesByLevel).forEach(([levelStr, nodeIds]) => {
      const level = parseInt(levelStr, 10);
      const totalInLevel = nodeIds.length;
      const startX = -((totalInLevel - 1) * nodeWidth) / 2;
      
      nodeIds.forEach((id, index) => {
        computedPositions[id] = {
          x: startX + index * nodeWidth,
          y: level * levelHeight
        };
      });
    });

    return nodes.map((node, index) => {
      const pos = computedPositions[node.id] || { 
        x: (index % 2 === 0 ? -150 : 150), 
        y: index * 240 
      };

      let isCurrentFileActive = false;
      if (selectedFile) {
        const clickedFilename = selectedFile.split('/').pop() || '';
        const nodeFilename = node.file.split('/').pop() || '';
        
        if (node.file.includes(clickedFilename)) {
          isCurrentFileActive = true;
        } else {
          const clickedParts = selectedFile.split('/');
          const nodeParts = node.file.split('/');
          if (clickedParts.length > 2 && nodeParts.length > 2) {
            const clickedDir = clickedParts[clickedParts.length - 2];
            const nodeDir = nodeParts[nodeParts.length - 2];
            if (clickedDir === nodeDir && clickedDir !== 'src') {
              isCurrentFileActive = true;
            }
          }
        }
      }

      let nodeLiveUsers: LiveCollaborator[] = [];
      if (members) {
        nodeLiveUsers = members
          .filter(m => {
            if (m.currentFile) {
              const mFile = m.currentFile.split('/').pop() || '';
              const nFile = node.file.split('/').pop() || '';
              return mFile !== '' && mFile === nFile;
            }
            return false;
          })
          .map(m => ({
            name: m.name,
            avatar: m.avatar,
            color: m.color,
            action: 'editing' as const
          }));
      }

      return {
        id: node.id,
        type: 'customCall',
        position: pos,
        data: {
          ...node,
          isTarget: selectedFile ? node.file === selectedFile : index === 0,
          activeFileSelected: isCurrentFileActive,
          liveUsers: nodeLiveUsers
        }
      };
    });
  }, [nodes, edges, selectedFile, members, validNodeIds]);

  // 3. Format valid, deduplicated edges with smoothstep routing
  const computedEdges = useMemo(() => {
    const validEdges = edges.filter(edge => validNodeIds.has(edge.from) && validNodeIds.has(edge.to));
    
    // Deduplicate parallel edges connecting the same source and target
    const edgeMap = new Map<string, { from: string; to: string; labels: string[] }>();
    validEdges.forEach(edge => {
      const key = `${edge.from}->${edge.to}`;
      if (!edgeMap.has(key)) {
        edgeMap.set(key, { from: edge.from, to: edge.to, labels: [] });
      }
      if (edge.label && !edgeMap.get(key)!.labels.includes(edge.label)) {
        edgeMap.get(key)!.labels.push(edge.label);
      }
    });

    const uniqueEdges = Array.from(edgeMap.values());

    return uniqueEdges.map((edge, index) => {
      const isSourceActive = selectedFile ? edge.from.includes(selectedFile) : false;
      const isTargetActive = selectedFile ? edge.to.includes(selectedFile) : false;
      const isActivePath = selectedFile ? (isSourceActive || isTargetActive) : index === 0;

      const combinedLabel = edge.labels.length > 0 ? edge.labels.slice(0, 2).join(' / ') : undefined;

      return {
        id: `edge-${edge.from}-${edge.to}`,
        source: edge.from,
        target: edge.to,
        type: 'default',
        label: combinedLabel,
        animated: isActivePath,
        style: {
          stroke: isActivePath ? '#0284c7' : '#94a3b8',
          strokeWidth: isActivePath ? 2.5 : 1.2,
          opacity: selectedFile ? (isActivePath ? 1 : 0.25) : 0.75,
          strokeDasharray: isActivePath ? undefined : '3,3'
        },
        labelStyle: { fill: isActivePath ? '#0f172a' : '#475569', fontSize: 9, fontWeight: 600, fontFamily: 'monospace' },
        labelBgPadding: [5, 3] as [number, number],
        labelBgBorderRadius: 4,
        labelBgStyle: { fill: '#ffffff', color: '#0f172a', stroke: isActivePath ? '#0284c7' : '#cbd5e1', strokeWidth: isActivePath ? 1 : 0.5 }
      };
    });
  }, [edges, validNodeIds, selectedFile]);

  const [flowNodes, setFlowNodes, onNodesChange] = useNodesState<Node>(computedNodes);
  const [flowEdges, setFlowEdges, onEdgesChange] = useEdgesState<Edge>(computedEdges);

  useEffect(() => {
    setFlowNodes(computedNodes);
    setFlowEdges(computedEdges);
  }, [computedNodes, computedEdges, setFlowNodes, setFlowEdges]);

  // Fast single-pass camera adjustment
  useEffect(() => {
    if (computedNodes.length > 0) {
      const timer = setTimeout(() => {
        fitView({ padding: 0.2, duration: 0 });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [computedNodes.length, fitView, isFullscreen]);

  return (
    <ReactFlow
      nodes={flowNodes}
      edges={flowEdges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeClick={(_, node) => onSelectNode(node.data as unknown as CallGraphNode)}
      minZoom={0.2}
      maxZoom={1.5}
      onlyRenderVisibleElements={true}
      nodesDraggable={true}
      nodesConnectable={false}
      className="w-full h-full"
    >
      <Background color="rgba(0, 0, 0, 0.12)" gap={18} size={1} />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}

export default function CallFlowGraph({ isFullscreen, onToggleFullscreen, onResetFocus, isFocused, ...props }: CallFlowGraphProps) {
  return (
    <div className="w-full flex-grow flex flex-col bg-white rounded-xl overflow-hidden border border-slate-200/80 relative shadow-sm">
      <div className="absolute top-4 left-4 z-10 bg-white/95 border border-slate-200 px-3 py-2 rounded-lg shadow-sm flex items-center gap-2">
        <Layers className="w-4 h-4 text-slate-800" />
        <span className="text-xs font-bold text-slate-700">Call Flow Diagram</span>
        {isFocused && onResetFocus && (
          <button
            onClick={onResetFocus}
            className="ml-2 bg-slate-900 hover:bg-slate-850 text-white text-[10px] font-bold px-2.5 py-1 rounded-md transition-all flex items-center gap-1 shadow-sm"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Show Full Diagram</span>
          </button>
        )}
      </div>

      {onToggleFullscreen && (
        <div className="absolute top-4 right-4 z-10">
          <button
            onClick={onToggleFullscreen}
            className="bg-white/95 border border-slate-250 hover:border-slate-350 p-2 rounded-lg shadow-sm hover:bg-slate-50 text-slate-700 transition-all flex items-center gap-1.5 text-[11px] font-bold"
            title={isFullscreen ? "Exit Fullscreen" : "Fullscreen Mode"}
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            <span>{isFullscreen ? "Exit Fullscreen" : "Fullscreen"}</span>
          </button>
        </div>
      )}

      <ReactFlowProvider>
        <CallFlowGraphInner isFullscreen={isFullscreen} onToggleFullscreen={onToggleFullscreen} {...props} />
      </ReactFlowProvider>
    </div>
  );
}
