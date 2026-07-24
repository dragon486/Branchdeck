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
  useReactFlow
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { CallGraphNode, CallGraphEdge } from '@/lib/analyzer';
import { Layers, MessageSquare, Maximize2, Minimize2, RefreshCw, Search } from 'lucide-react';

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

// Custom Node component aligned with Branchdeck's light slate design system
function CustomCallNode({ data }: { data: CallGraphNode & { isTarget?: boolean; activeFileSelected?: boolean; liveUsers?: LiveCollaborator[]; isDimmed?: boolean; isHighlighted?: boolean } }) {
  const tierStyle = useMemo(() => {
    switch (data.type) {
      case 'ui': 
        return {
          topBorder: 'border-t-4 border-t-cyan-500',
          badge: 'bg-cyan-50 text-cyan-700 border-cyan-200/80',
          glow: 'hover:shadow-[0_8px_24px_rgba(6,182,212,0.15)]'
        };
      case 'api': 
        return {
          topBorder: 'border-t-4 border-t-orange-500',
          badge: 'bg-orange-50 text-orange-700 border-orange-200/80',
          glow: 'hover:shadow-[0_8px_24px_rgba(249,115,22,0.15)]'
        };
      case 'service': 
        return {
          topBorder: 'border-t-4 border-t-indigo-500',
          badge: 'bg-indigo-50 text-indigo-700 border-indigo-200/80',
          glow: 'hover:shadow-[0_8px_24px_rgba(99,102,241,0.15)]'
        };
      case 'db': 
        return {
          topBorder: 'border-t-4 border-t-emerald-600',
          badge: 'bg-emerald-50 text-emerald-800 border-emerald-200/80',
          glow: 'hover:shadow-[0_8px_24px_rgba(16,185,129,0.15)]'
        };
      case 'external': 
        return {
          topBorder: 'border-t-4 border-t-rose-500',
          badge: 'bg-rose-50 text-rose-700 border-rose-200/80',
          glow: 'hover:shadow-[0_8px_24px_rgba(244,63,94,0.15)]'
        };
      default: 
        return {
          topBorder: 'border-t-4 border-t-slate-400',
          badge: 'bg-slate-50 text-slate-700 border-slate-200/80',
          glow: 'hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)]'
        };
    }
  }, [data.type]);

  const extBadge = useMemo(() => {
    const parts = data.file.split('.');
    if (parts.length > 1) {
      return parts[parts.length - 1].toUpperCase();
    }
    return 'FILE';
  }, [data.file]);

  const devColors = useMemo(() => {
    const initials = data.developer?.avatar || '';
    if (initials === 'SC') return 'bg-rose-100 text-rose-700 border-rose-200';
    if (initials === 'AR') return 'bg-sky-100 text-sky-700 border-sky-200';
    if (initials === 'ER') return 'bg-violet-100 text-violet-700 border-violet-200';
    if (initials === 'MV') return 'bg-amber-100 text-amber-700 border-amber-200';
    return 'bg-slate-100 text-slate-700 border-slate-200';
  }, [data.developer]);

  const liveUsers = useMemo(() => data.liveUsers || [], [data.liveUsers]);

  return (
    <div className={`p-3.5 rounded-xl border bg-white shadow-[0_4px_12px_rgba(0,0,0,0.04)] min-w-[250px] max-w-[290px] transition-all duration-300 relative ${tierStyle.topBorder} ${tierStyle.glow} ${
      data.isDimmed ? 'opacity-20 grayscale-[50%]' : 'opacity-100'
    } ${
      data.isHighlighted
        ? 'border-slate-900 ring-4 ring-sky-500/25 shadow-[0_8px_24px_rgba(2,132,199,0.25)]'
        : data.activeFileSelected
          ? 'border-slate-900 ring-4 ring-slate-950/10'
          : data.isTarget 
            ? 'border-slate-900 ring-2 ring-slate-950/20' 
            : 'border-slate-200/90 hover:border-slate-400'
    }`}>
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
          <span className="text-xs font-extrabold text-slate-800 truncate" title={data.label}>{data.label}</span>
          <div className="flex items-center gap-1.5">
            <span className="text-[8px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200/70">
              {extBadge}
            </span>
            <span className={`text-[8px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${tierStyle.badge}`}>
              {data.type}
            </span>
          </div>
        </div>

        <div className="text-[10px] text-slate-400 font-mono truncate" title={data.file}>{data.file}</div>

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

const nodeTypes = {
  customCall: CustomCallNode
};

function CallFlowGraphInner({ 
  nodes, 
  edges, 
  onSelectNode, 
  selectedFile, 
  selectedFolder, 
  isFullscreen, 
  onToggleFullscreen,
  members, 
  onResetFocus
}: CallFlowGraphProps) {
  const { fitView } = useReactFlow();
  const [activeTier, setActiveTier] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const draggedPositionsRef = useRef<Record<string, { x: number; y: number }>>({});
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  const validNodeIds = useMemo(() => new Set(nodes.map(n => n.id)), [nodes]);

  // Full view camera fit & manual position reset
  const handleFullViewReset = useCallback(() => {
    draggedPositionsRef.current = {};
    fitView({ padding: 0.15, duration: 400 });
    if (onResetFocus) {
      onResetFocus();
    }
  }, [fitView, onResetFocus]);

  // Complete Upstream & Downstream Data Flow Subgraph Resolution for Hover and Search
  const connectedInfo = useMemo(() => {
    const activeId = hoveredNodeId;
    const filterSearch = searchQuery.trim().toLowerCase();

    // Case 1: Hovered Node (1-hop immediate connection)
    if (activeId && validNodeIds.has(activeId)) {
      const connNodes = new Set<string>([activeId]);
      const connEdges = new Set<string>();

      edges.forEach(e => {
        if (e.from === activeId || e.to === activeId) {
          connEdges.add(`edge-${e.from}-${e.to}`);
          connNodes.add(e.from);
          connNodes.add(e.to);
        }
      });

      return { connectedNodes: connNodes, connectedEdges: connEdges };
    }

    // Case 2: Full Data Flow Search Traversal (Multi-hop BFS for complete call graph trace)
    if (filterSearch !== '') {
      const seedNodes = nodes.filter(n => 
        n.label.toLowerCase().includes(filterSearch) || 
        n.file.toLowerCase().includes(filterSearch)
      );

      if (seedNodes.length === 0) {
        return { connectedNodes: new Set<string>(), connectedEdges: new Set<string>() };
      }

      const connNodes = new Set<string>();
      const connEdges = new Set<string>();

      const outgoing: Record<string, string[]> = {};
      const incoming: Record<string, string[]> = {};
      nodes.forEach(n => { outgoing[n.id] = []; incoming[n.id] = []; });

      edges.forEach(e => {
        if (outgoing[e.from] && validNodeIds.has(e.to)) outgoing[e.from].push(e.to);
        if (incoming[e.to] && validNodeIds.has(e.from)) incoming[e.to].push(e.from);
      });

      seedNodes.forEach(seed => {
        connNodes.add(seed.id);

        // Downstream BFS (Services & DBs called by this seed)
        const downQueue = [seed.id];
        const visitedDown = new Set<string>([seed.id]);
        while (downQueue.length > 0) {
          const curr = downQueue.shift()!;
          (outgoing[curr] || []).forEach(next => {
            connEdges.add(`edge-${curr}-${next}`);
            connNodes.add(next);
            if (!visitedDown.has(next)) {
              visitedDown.add(next);
              downQueue.push(next);
            }
          });
        }

        // Upstream BFS (Pages & UI components calling this seed)
        const upQueue = [seed.id];
        const visitedUp = new Set<string>([seed.id]);
        while (upQueue.length > 0) {
          const curr = upQueue.shift()!;
          (incoming[curr] || []).forEach(prev => {
            connEdges.add(`edge-${prev}-${curr}`);
            connNodes.add(prev);
            if (!visitedUp.has(prev)) {
              visitedUp.add(prev);
              upQueue.push(prev);
            }
          });
        }
      });

      return { connectedNodes: connNodes, connectedEdges: connEdges };
    }

    return { connectedNodes: new Set<string>(), connectedEdges: new Set<string>() };
  }, [hoveredNodeId, searchQuery, nodes, edges, validNodeIds]);

  // Vertically centered layout positioning around y = 0
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
    const levelHeight = 200;
    const nodeWidth = 320;
    const totalLevels = Object.keys(nodesByLevel).length;
    const startY = -((totalLevels - 1) * levelHeight) / 2;

    Object.entries(nodesByLevel).forEach(([levelStr, nodeIds]) => {
      const level = parseInt(levelStr, 10);
      const totalInLevel = nodeIds.length;
      const startX = -((totalInLevel - 1) * nodeWidth) / 2;
      
      nodeIds.forEach((id, index) => {
        computedPositions[id] = {
          x: startX + index * nodeWidth,
          y: startY + level * levelHeight
        };
      });
    });

    const filterSearch = searchQuery.trim().toLowerCase();

    return nodes.map((node, index) => {
      const initialPos = computedPositions[node.id] || { 
        x: (index % 2 === 0 ? -160 : 160), 
        y: index * 200 
      };
      const pos = draggedPositionsRef.current[node.id] || initialPos;

      let isCurrentFileActive = false;
      if (selectedFile) {
        const clickedFilename = selectedFile.split('/').pop() || '';
        if (node.file.includes(clickedFilename)) {
          isCurrentFileActive = true;
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

      const norm = (p: string) => p.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/$/, '');
      const isInsideFolder = (file: string, folder: string) => {
        const normFile = norm(file);
        const normFolder = norm(folder);
        return normFile.startsWith(`${normFolder}/`) || normFile.includes(`/${normFolder}/`) || normFile === normFolder;
      };

      const isNodeActive = selectedFile 
        ? node.file === selectedFile 
        : (selectedFolder ? isInsideFolder(node.file, selectedFolder) : false);

      // Non-destructive tier & search highlight logic
      let matchesFilter = true;
      if (activeTier !== 'all' && node.type !== activeTier) {
        matchesFilter = false;
      }

      const isSearchConnected = filterSearch !== '' ? connectedInfo.connectedNodes.has(node.id) : true;
      const isHoverConnected = hoveredNodeId ? connectedInfo.connectedNodes.has(node.id) : true;

      const isHighlighted = (hoveredNodeId && isHoverConnected) || (filterSearch !== '' && isSearchConnected) || (activeTier !== 'all' && matchesFilter);
      const isDimmed = !matchesFilter || (filterSearch !== '' && !isSearchConnected) || (hoveredNodeId && !isHoverConnected);

      return {
        id: node.id,
        type: 'customCall',
        position: pos,
        data: {
          ...node,
          isTarget: isNodeActive,
          activeFileSelected: isCurrentFileActive,
          liveUsers: nodeLiveUsers,
          isHighlighted,
          isDimmed
        }
      };
    });
  }, [nodes, edges, selectedFile, selectedFolder, members, validNodeIds, hoveredNodeId, connectedInfo, activeTier, searchQuery]);

  // Edges with interactive path styling matching Branchdeck theme
  const computedEdges = useMemo(() => {
    const validEdges = edges.filter(edge => validNodeIds.has(edge.from) && validNodeIds.has(edge.to));
    
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

    const filterSearch = searchQuery.trim().toLowerCase();

    return uniqueEdges.map((edge) => {
      const edgeId = `edge-${edge.from}-${edge.to}`;
      const isConnected = (hoveredNodeId || filterSearch !== '') ? connectedInfo.connectedEdges.has(edgeId) : false;
      const isDimmed = (hoveredNodeId || filterSearch !== '') ? !isConnected : false;

      const combinedLabel = edge.labels.length > 0 ? edge.labels.slice(0, 2).join(' / ') : undefined;

      return {
        id: edgeId,
        source: edge.from,
        target: edge.to,
        type: 'default',
        label: combinedLabel,
        animated: isConnected,
        style: {
          stroke: isConnected ? '#0284c7' : '#64748b',
          strokeWidth: isConnected ? 2.5 : 1.2,
          opacity: isDimmed ? 0.15 : (isConnected ? 1 : 0.75),
          strokeDasharray: isConnected ? undefined : '4,4'
        },
        labelStyle: { fill: isConnected ? '#0284c7' : '#334155', fontSize: 9, fontWeight: 600, fontFamily: 'monospace' },
        labelBgPadding: [5, 3] as [number, number],
        labelBgBorderRadius: 4,
        labelBgStyle: { fill: '#ffffff', color: '#0f172a', stroke: isConnected ? '#0284c7' : '#cbd5e1', strokeWidth: isConnected ? 1 : 0.5 }
      };
    });
  }, [edges, validNodeIds, hoveredNodeId, connectedInfo, searchQuery]);

  const [flowNodes, setFlowNodes, onNodesChange] = useNodesState<Node>(computedNodes);
  const [flowEdges, setFlowEdges, onEdgesChange] = useEdgesState<Edge>(computedEdges);

  const handleNodesChange = useCallback((changes: any) => {
    changes.forEach((change: any) => {
      if (change.type === 'position' && change.position) {
        draggedPositionsRef.current[change.id] = change.position;
      }
    });
    onNodesChange(changes);
  }, [onNodesChange]);

  useEffect(() => {
    setFlowNodes(prevNodes => {
      return computedNodes.map(cn => {
        const dragged = draggedPositionsRef.current[cn.id];
        if (dragged) {
          return { ...cn, position: dragged };
        }
        const existing = prevNodes.find(pn => pn.id === cn.id);
        if (existing) {
          return { ...cn, position: existing.position };
        }
        return cn;
      });
    });
    setFlowEdges(computedEdges);
  }, [computedNodes, computedEdges, setFlowNodes, setFlowEdges]);

  // Fast single-pass camera adjustment on mount/node changes
  useEffect(() => {
    if (computedNodes.length > 0) {
      const timer = setTimeout(() => {
        fitView({ padding: 0.15, duration: 0 });
      }, 80);
      return () => clearTimeout(timer);
    }
  }, [computedNodes.length, fitView, isFullscreen]);

  // Auto-fit camera to search result data flow trace
  useEffect(() => {
    if (searchQuery.trim() !== '') {
      const timer = setTimeout(() => {
        fitView({ padding: 0.2, duration: 400 });
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [searchQuery, fitView]);

  return (
    <div className="w-full h-full relative">
      {/* Top Header Control Toolbar */}
      <div className="absolute top-3 left-3 right-3 z-20 flex items-center justify-between pointer-events-none gap-2">
        <div className="bg-white/95 backdrop-blur border border-slate-200 px-3 py-1.5 rounded-lg shadow-sm flex items-center gap-2 pointer-events-auto">
          <Layers className="w-4 h-4 text-slate-800" />
          <span className="text-xs font-extrabold text-slate-800">Call Flow Diagram</span>
          
          <button
            onClick={handleFullViewReset}
            className="ml-1 bg-slate-900 hover:bg-slate-800 text-white text-[10px] font-bold px-2.5 py-1 rounded-md transition-all flex items-center gap-1 shadow-xs"
            title="Reset position and fit view to all graph nodes"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Full View</span>
          </button>
        </div>

        {/* Search & Tier Filters — ONLY rendered when in Fullscreen mode */}
        <div className="flex items-center gap-2 pointer-events-auto">
          {isFullscreen && (
            <>
              <div className="bg-white/95 backdrop-blur border border-slate-200 rounded-lg p-1 shadow-sm flex items-center gap-1">
                <Search className="w-3.5 h-3.5 text-slate-400 ml-1.5" />
                <input
                  type="text"
                  placeholder="Search graph nodes..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="text-xs bg-transparent border-none outline-none w-36 placeholder:text-slate-400 font-medium text-slate-800"
                />
              </div>

              <div className="bg-white/95 backdrop-blur border border-slate-200 rounded-lg p-1 shadow-sm flex items-center gap-0.5">
                {(['all', 'ui', 'api', 'service', 'db'] as const).map(tier => (
                  <button
                    key={tier}
                    onClick={() => setActiveTier(tier)}
                    className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all ${
                      activeTier === tier
                        ? 'bg-slate-900 text-white shadow-xs'
                        : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
                    }`}
                  >
                    {tier}
                  </button>
                ))}
              </div>
            </>
          )}

          {onToggleFullscreen && (
            <button
              onClick={onToggleFullscreen}
              className="bg-white/95 backdrop-blur border border-slate-200 hover:border-slate-300 p-1.5 px-2.5 rounded-lg shadow-sm hover:bg-slate-50 text-slate-700 transition-all flex items-center gap-1.5 text-xs font-bold"
              title={isFullscreen ? "Exit Fullscreen" : "Fullscreen Mode"}
            >
              {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              <span>{isFullscreen ? "Exit Fullscreen" : "Fullscreen"}</span>
            </button>
          )}
        </div>
      </div>

      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={(_, node) => onSelectNode(node.data as unknown as CallGraphNode)}
        onNodeMouseEnter={(_, node) => setHoveredNodeId(node.id)}
        onNodeMouseLeave={() => setHoveredNodeId(null)}
        minZoom={0.15}
        maxZoom={1.5}
        onlyRenderVisibleElements={true}
        nodesDraggable={true}
        nodesConnectable={false}
        className="w-full h-full bg-[#f8fafc]"
      >
        <Background color="rgba(148, 163, 184, 0.3)" gap={18} size={1} />
        <Controls showInteractive={false} className="!bg-white !border-slate-200/80 !shadow-sm !rounded-lg" />
      </ReactFlow>
    </div>
  );
}

export default function CallFlowGraph({ isFullscreen, onToggleFullscreen, onResetFocus, isFocused, ...props }: CallFlowGraphProps) {
  const containerClasses = isFullscreen
    ? "fixed inset-0 z-50 bg-[#f8fafc] p-4 flex flex-col w-screen h-screen font-sans select-none"
    : "w-full flex-grow flex flex-col bg-[#f8fafc] rounded-xl overflow-hidden border border-slate-200/80 relative shadow-sm font-sans";

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
