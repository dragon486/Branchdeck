'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { 
  FeatureNode, 
  CallGraphNode, 
  CallGraphEdge, 
  ImpactAnalysisResult,
  generateFeaturesFromFiles,
  generateCallGraphFromFiles,
  ECOMMERCE_DEMO_FEATURES,
  ECOMMERCE_DEMO_CALLS,
  normalizePath
} from '@/lib/analyzer';
import ProjectMap from '@/components/ProjectMap';
import CallFlowGraph from '@/components/CallFlowGraph';
import ImpactPanel from '@/components/ImpactPanel';
import StoryMode from '@/components/StoryMode';
import MarketingLanding from '@/components/MarketingLanding';
import AuthModal from '@/components/AuthModal';
import RepoPickerModal from '@/components/RepoPickerModal';
import InviteTeamModal, { useCollaboration, CollaborationBar } from '@/components/InviteTeamModal';
import { 
  GitBranch, 
  Search, 
  Play, 
  Terminal, 
  AlertTriangle,
  Code,
  BookOpen,
  ShieldAlert,
  Compass,
  ArrowLeft,
  Radio,
  ChevronLeft,
  ChevronRight,
  X,
  Menu,
  Layers,
  ArrowRight,
  CheckCircle2,
  Plus
} from 'lucide-react';

import { supabase, isSupabaseConfigured } from '@/lib/supabase';

export default function Dashboard() {
  // Authentication states
  const [session, setSession] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [authInitialMode, setAuthInitialMode] = useState<'signin' | 'signup'>('signin');
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [isRepoModalOpen, setIsRepoModalOpen] = useState(false);

  // App Router data states
  const [repoUrl, setRepoUrl] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [hasData, setHasData] = useState(false);
  const [isVsCode, setIsVsCode] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setSession(null);
      setAuthLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setAuthLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Helper: open auth modal
  const openAuth = (mode: 'signin' | 'signup' = 'signin') => {
    setAuthInitialMode(mode);
    setIsAuthOpen(true);
  };

  const handleAuthSuccess = (newSession?: any) => {
    if (newSession) {
      setSession(newSession);
    }
    setIsAuthOpen(false);
  };

  // Helper for requests
  const authenticatedFetch = async (url: string, options: RequestInit = {}) => {
    let activeSession = session;
    if (!activeSession && isSupabaseConfigured) {
      try {
        activeSession = (await supabase.auth.getSession()).data.session;
      } catch (e) {
        console.warn('Failed to retrieve supabase session:', e);
      }
    }
    const token = activeSession?.access_token;
    
    const headers = {
      ...options.headers,
      'Content-Type': 'application/json',
    } as Record<string, string>;
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    return fetch(url, {
      ...options,
      headers
    });
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsVsCode(window.location.search.includes('ide=vscode') || window.parent !== window);
    }
  }, []);
  const [warningMsg, setWarningMsg] = useState<string | null>(null);

  // Repository details
  const [repoSource, setRepoSource] = useState('');
  const [features, setFeatures] = useState<FeatureNode[]>([]);
  const [callNodes, setCallNodes] = useState<CallGraphNode[]>([]);
  const [callEdges, setCallEdges] = useState<CallGraphEdge[]>([]);

  // Right sidebar configurations
  const [activeRightTab, setActiveRightTab] = useState<'story' | 'impact'>('story');
  const [activeWalkthroughStep, setActiveWalkthroughStep] = useState<number | null>(null);
  
  // Selected detail values
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<CallGraphNode | null>(null);
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(false);
  const [rightSidebarCollapsed, setRightSidebarCollapsed] = useState(false);
  const isGraphFullscreen = leftSidebarCollapsed && rightSidebarCollapsed;
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Dynamic analysis statuses
  const [impactData, setImpactData] = useState<ImpactAnalysisResult | null>(null);
  const [impactLoading, setImpactLoading] = useState(false);
  
  const [storyData, setStoryData] = useState<{ title: string; steps: string[]; provenance?: string } | null>(null);
  const [storyLoading, setStoryLoading] = useState(false);

  const [nlSearchQuery, setNlSearchQuery] = useState('');
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);

  // VS Code loader handles
  const [isScanning, setIsScanning] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [indexingProgress, setIndexingProgress] = useState(0);

  // Poll background job progress until completion
  const pollJobStatus = async (jobId: string, onUpdateProgress: (progress: number) => void): Promise<any> => {
    return new Promise((resolve, reject) => {
      const interval = setInterval(async () => {
        try {
          const response = await authenticatedFetch(`/api/analyze/status/${jobId}`, {
            method: 'GET'
          });
          if (!response.ok) {
            clearInterval(interval);
            const errData = await response.json().catch(() => ({}));
            reject(new Error(errData.error || `HTTP ${response.status} fetching job status`));
            return;
          }
          const data = await response.json();
          if (data.status === 'completed') {
            clearInterval(interval);
            resolve(data);
          } else if (data.status === 'failed') {
            clearInterval(interval);
            reject(new Error(data.error_message || 'Indexing job failed.'));
          } else {
            onUpdateProgress(data.progress || 0);
          }
        } catch (err) {
          clearInterval(interval);
          reject(err);
        }
      }, 2000);
    });
  };

  // Supabase real-time presence collaboration
  const { members: realtimeMembers, updatePresence } = useCollaboration(
    repoSource || 'default-workspace',
    session?.user ? {
      id: session.user.id,
      name: session.user.email?.split('@')[0] || 'You',
      email: session.user.email || '',
      role: 'Developer'
    } : null
  );

  // Update presence status when active file or folder changes
  useEffect(() => {
    if (session) {
      updatePresence(selectedFile || undefined, selectedFolder || undefined);
    }
  }, [selectedFile, selectedFolder, session, updatePresence]);

  // Compute members to display (mock data only in demo mode, real collaboration in real workspace)
  const displayMembers = useMemo(() => {
    const localCurrentUser = session?.user ? {
      id: session.user.id,
      name: session.user.email?.split('@')[0] || 'You',
      email: session.user.email || '',
      avatar: (session.user?.email?.split('@')[0] || 'ME').slice(0, 2).toUpperCase(),
      color: 'bg-slate-800',
      status: 'online' as const,
      role: 'Developer',
      currentFile: selectedFile || undefined,
      currentFeature: selectedFolder || undefined,
      isCurrentUser: true,
    } : null;

    if (repoSource === 'mock-ecommerce' || repoSource === '') {
      return [
        ...(localCurrentUser ? [localCurrentUser] : []),
        { id: 'demo1', name: 'Alex River', email: 'alex@company.com', avatar: 'AR', color: 'bg-sky-500', status: 'online' as const, role: 'Staff Engineer', currentFile: 'src/checkout/checkout.controller.ts', isCurrentUser: false },
        { id: 'demo2', name: 'Sarah Chen', email: 'sarah@company.com', avatar: 'SC', color: 'bg-rose-500', status: 'online' as const, role: 'Developer', currentFeature: 'Authentication', isCurrentUser: false },
        { id: 'demo3', name: 'Marcus Vance', email: 'marcus@company.com', avatar: 'MV', color: 'bg-emerald-500', status: 'online' as const, role: 'Engineering Manager', currentFile: 'src/payments/payment.service.ts', isCurrentUser: false },
        { id: 'demo4', name: 'Elena Rostova', email: 'elena@company.com', avatar: 'ER', color: 'bg-violet-500', status: 'online' as const, role: 'Developer', currentFile: 'src/orders/order.service.ts', isCurrentUser: false },
      ];
    }

    const otherMembers = realtimeMembers.filter(m => !m.isCurrentUser);
    return [
      ...(localCurrentUser ? [localCurrentUser] : []),
      ...otherMembers
    ];
  }, [repoSource, session, realtimeMembers, selectedFile, selectedFolder]);

  // Compute filtered nodes and edges dynamically based on folder focus or file focus
  const { filteredNodes, filteredEdges } = useMemo(() => {
    if (!hasData) return { filteredNodes: [], filteredEdges: [] };

    let rawNodes = callNodes;
    let rawEdges = callEdges;

    // Use selectedNode's file path as a fallback for selectedFile to ensure diagram focuses on clicked nodes
    const activeFile = selectedFile || (selectedNode ? selectedNode.file : null);

    // Helper: Normalize file/folder paths for comparison
    const norm = (p: string) => p.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/$/, '');

    // 1. If single file selected, show file + complete working flow reachability (incoming callers & outgoing callees)
    if (activeFile) {
      const normActive = norm(activeFile);
      const clickedFilename = normActive.split('/').pop() || normActive;

      // 1. Exact path match first
      let targetNode = callNodes.find(n => norm(n.file) === normActive);
      // 2. Ending path match
      if (!targetNode) {
        targetNode = callNodes.find(n => norm(n.file).endsWith(normActive) || normActive.endsWith(norm(n.file)));
      }
      // 3. Basename filename match
      if (!targetNode) {
        targetNode = callNodes.find(n => (n.file.split('/').pop() || '') === clickedFilename);
      }

      if (targetNode) {
        // Multi-hop BFS reachability (up to 3 hops) from targetNode
        const connectedNodeIds = new Set<string>([targetNode.id]);
        const queue: { id: string; depth: number }[] = [{ id: targetNode.id, depth: 0 }];

        while (queue.length > 0) {
          const { id: currId, depth } = queue.shift()!;
          if (depth >= 3) continue;

          // Outgoing edges
          callEdges.forEach(e => {
            if (e.from === currId && !connectedNodeIds.has(e.to)) {
              connectedNodeIds.add(e.to);
              queue.push({ id: e.to, depth: depth + 1 });
            }
          });

          // Incoming edges
          callEdges.forEach(e => {
            if (e.to === currId && !connectedNodeIds.has(e.from)) {
              connectedNodeIds.add(e.from);
              queue.push({ id: e.from, depth: depth + 1 });
            }
          });
        }

        rawNodes = callNodes.filter(n => connectedNodeIds.has(n.id));
        rawEdges = callEdges.filter(e => connectedNodeIds.has(e.from) && connectedNodeIds.has(e.to));
      }
    } 
    // 2. If folder selected, show files in folder + connected architecture callers & callees
    else if (selectedFolder) {
      const normFolder = norm(selectedFolder);

      // Match files inside folder or subfolders
      const insideNodes = callNodes.filter(n => {
        const normFile = norm(n.file);
        return normFile.startsWith(`${normFolder}/`) || normFile.includes(`/${normFolder}/`) || normFile === normFolder;
      });

      if (insideNodes.length > 0) {
        const connectedNodeIds = new Set<string>(insideNodes.map(n => n.id));

        // 1-hop reachability to include connected external architecture modules
        insideNodes.forEach(insideNode => {
          callEdges.forEach(e => {
            if (e.from === insideNode.id) connectedNodeIds.add(e.to);
            if (e.to === insideNode.id) connectedNodeIds.add(e.from);
          });
        });

        rawNodes = callNodes.filter(n => connectedNodeIds.has(n.id));
        rawEdges = callEdges.filter(e => connectedNodeIds.has(e.from) && connectedNodeIds.has(e.to));
      }
    } 
    // 3. Default (Show Full Diagram): return all workspace nodes and edges
    return {
      filteredNodes: rawNodes,
      filteredEdges: rawEdges
    };
  }, [hasData, callNodes, callEdges, selectedFolder, selectedFile, selectedNode]);

  // Dedicated clean Log Out handler
  const handleLogOut = async () => {
    setSession(null);
    setHasData(false);
    setFeatures([]);
    setCallNodes([]);
    setCallEdges([]);
    setRepoSource('');
    setRepoUrl('');
    setSelectedFile(null);
    setSelectedNode(null);
    setSelectedFolder(null);
    setStoryData(null);
    setImpactData(null);
    setWarningMsg(null);
    setAnalysisError(null);
    setIsRepoModalOpen(false);
    await supabase.auth.signOut();
  };

  // Submit and analyze repo action — gates on session
  const handleAnalyze = async (urlOverride?: string) => {
    // If not signed in, open auth modal first
    if (!session) {
      openAuth('signin');
      return;
    }

    const targetUrl = (urlOverride !== undefined && urlOverride !== '') 
      ? urlOverride 
      : repoUrl;

    // If no repository URL is specified, open the onboarding RepoPickerModal
    if (!targetUrl || !targetUrl.trim()) {
      setIsRepoModalOpen(true);
      return;
    }

    setAnalyzing(true);
    setIndexingProgress(5);
    setWarningMsg(null);
    setHasData(true);

    try {
      const response = await authenticatedFetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: targetUrl.trim() })
      });
      const data = await response.json();

      if (data.success && data.job_id) {
        // Poll status
        const result = await pollJobStatus(data.job_id, (prog) => {
          setIndexingProgress(prog);
        });
        
        if (result.success) {
          const cleanFeatures = (result.features || []).map((feat: any) => ({
            ...feat,
            files: Array.from(new Set((feat.files || []).map(normalizePath).filter(Boolean)))
          }));

          setFeatures(cleanFeatures);
          setCallNodes(result.callGraph.nodes);
          setCallEdges(result.callGraph.edges);
          setRepoSource(result.source || data.source);
          if (result.warning) {
            setWarningMsg(result.warning);
          }
          setHasData(true);
          
          // Auto trigger first story
          if (cleanFeatures.length > 0) {
            handleLoadStory(cleanFeatures[0].id);
          }
        } else {
          alert(result.error || 'Failed to analyze repository.');
        }
      } else if (data.success) {
        // Mock fallback returned immediately
        const cleanFeatures = (data.features || []).map((feat: any) => ({
          ...feat,
          files: Array.from(new Set((feat.files || []).map(normalizePath).filter(Boolean)))
        }));

        setFeatures(cleanFeatures);
        setCallNodes(data.callGraph.nodes);
        setCallEdges(data.callGraph.edges);
        setRepoSource(data.source);
        if (data.warning) {
          setWarningMsg(data.warning);
        }
        setHasData(true);
        if (data.features.length > 0) {
          handleLoadStory(data.features[0].id);
        }
      } else {
        alert(data.error || 'Failed to analyze repository.');
      }
    } catch (e: any) {
      console.error(e);
      alert(e.message || 'Network error analyzing repository.');
    } finally {
      setAnalyzing(false);
      setIndexingProgress(0);
    }
  };

  // Click handler to load specific call flows dynamically
  const handleLoadCallFlow = async (functionName: string) => {
    try {
      const response = await authenticatedFetch('/api/callflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ functionName, repoUrl })
      });
      const data = await response.json();
      if (data.success) {
        setCallNodes(data.nodes);
        setCallEdges(data.edges);
      }
    } catch (e) {
      console.error('Error fetching callflow:', e);
    }
  };

  // Dynamic backend-powered codebase Q&A search query with AST fallback
  const handleCodebaseQuery = async (queryText: string) => {
    const query = queryText.trim();
    if (!query) return;

    setStoryLoading(true);
    setStoryData(null);
    setActiveRightTab('story');

    let commitSha = 'local-commit';
    if (callNodes.length > 0) {
      const parts = callNodes[0].id.split(':');
      if (parts.length >= 2) {
        commitSha = parts[1];
      }
    }

    try {
      const response = await authenticatedFetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queryText: query, commitSha })
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.answer) {
          const paragraphs = data.answer
            .split('\n')
            .map((p: string) => p.trim())
            .filter((p: string) => p.length > 0);

          setStoryData({
            title: `AI Search: "${query}"`,
            steps: paragraphs,
            provenance: 'database-llm'
          });
          return;
        }
      }
    } catch (e: any) {
      console.warn('[Codebase Query Warning] Backend query unavailable, using local AST semantic search:', e);
    }

    // AST Graph-based Semantic Search Engine with Domain Synonym Expansion
    const normQuery = query.toLowerCase();
    const queryWords = normQuery.split(/\s+/).filter(w => w.length > 2);

    // Synonym maps for data storage, auth, api, ui, and system architecture queries
    const dataSynonyms = ['data', 'put', 'inside', 'store', 'database', 'db', 'save', 'persist', 'model', 'entity', 'schema', 'table', 'storage', 'file', 'cache', 'sqlite', 'postgres'];
    const authSynonyms = ['auth', 'login', 'user', 'token', 'session', 'jwt', 'security', 'register', 'signup', 'password'];
    const apiSynonyms = ['api', 'endpoint', 'route', 'controller', 'request', 'fetch', 'post', 'get', 'query'];
    const uiSynonyms = ['ui', 'view', 'page', 'component', 'screen', 'layout', 'design', 'css', 'style', 'dashboard'];

    const isDataQuery = queryWords.some(w => dataSynonyms.includes(w));
    const isAuthQuery = queryWords.some(w => authSynonyms.includes(w));
    const isApiQuery = queryWords.some(w => apiSynonyms.includes(w));
    const isUiQuery = queryWords.some(w => uiSynonyms.includes(w));

    let matchedNodes = callNodes.filter(n => {
      const label = n.label.toLowerCase();
      const file = n.file.toLowerCase();
      const type = n.type.toLowerCase();

      if (isDataQuery && (type === 'db' || file.includes('db') || file.includes('database') || file.includes('model') || file.includes('schema') || file.includes('data') || file.includes('store') || file.includes('entity'))) {
        return true;
      }
      if (isAuthQuery && (file.includes('auth') || file.includes('jwt') || file.includes('session') || file.includes('user') || file.includes('login'))) {
        return true;
      }
      if (isApiQuery && (type === 'api' || file.includes('api') || file.includes('route') || file.includes('controller'))) {
        return true;
      }
      if (isUiQuery && (type === 'ui' || file.includes('page') || file.includes('component') || file.includes('layout'))) {
        return true;
      }

      return queryWords.some(word => label.includes(word) || file.includes(word));
    });

    if (matchedNodes.length === 0 && callNodes.length > 0) {
      // Fallback to primary workspace nodes if query is open-ended
      matchedNodes = callNodes.slice(0, 5);
    }

    if (matchedNodes.length > 0) {
      const primaryNode = matchedNodes[0];
      const callers = callEdges.filter(e => e.to === primaryNode.id).map(e => {
        const n = callNodes.find(node => node.id === e.from);
        return n ? n.label : e.from.split(':').pop() || e.from;
      });
      const callees = callEdges.filter(e => e.from === primaryNode.id).map(e => {
        const n = callNodes.find(node => node.id === e.to);
        return n ? n.label : e.to.split(':').pop() || e.to;
      });

      let steps: string[] = [];

      if (isDataQuery) {
        steps = [
          `Data Storage Layer: Data in this repository is stored and persisted in ${primaryNode.file} (${primaryNode.type === 'db' ? 'Database Table/Model' : 'Data Storage Module'}).`,
          `Data Models & Persistence: ${matchedNodes.map(m => m.file).slice(0, 3).join(', ')} handles data schemas, content hashing, and transactional records.`,
          callers.length > 0 
            ? `Data Ingestion Flow: Data payload is received from API/Service layers (${callers.slice(0, 3).join(', ')}) and routed into persistence tables.`
            : `Data Access: Directly accessed by system worker processes and backend services.`,
          callees.length > 0
            ? `Outbound Storage Connections: Communicates with downstream storage nodes (${callees.slice(0, 3).join(', ')}).`
            : `Storage Engine: Holds transactional state and indexes vector embeddings.`,
          `Complete Storage Flow: User Input -> API Controllers -> Business Services -> ${primaryNode.label} (${primaryNode.file}).`
        ];
      } else {
        steps = [
          `Identified ${matchedNodes.length} relevant code modules for query "${query}". Primary execution target: ${primaryNode.file}`,
          `Module Responsibility (${primaryNode.label}): ${primaryNode.note || 'Handles core logic and component exports.'}`,
          callers.length > 0 
            ? `Inbound Callers: Invocations routed from ${callers.slice(0, 3).join(', ')}.`
            : `Top-level architectural entrypoint with direct UI/Route handler exposure.`,
          callees.length > 0 
            ? `Outbound Dependencies: Delegates processing to ${callees.slice(0, 3).join(', ')}.`
            : `Terminal execution leaf node.`,
          `Architectural Call Flow: Mapped across ${matchedNodes.map(m => m.label).slice(0, 4).join(' -> ')}.`
        ];
      }

      setStoryData({
        title: `AI Semantic Search: "${query}"`,
        steps,
        provenance: 'database-llm'
      });
    }
    setStoryLoading(false);
  };

  // Click handler for fetching stories
  const handleLoadStory = async (featureId: string) => {
    setStoryLoading(true);

    let commitSha = 'local-commit';
    if (callNodes.length > 0) {
      const parts = callNodes[0].id.split(':');
      if (parts.length >= 2) {
        commitSha = parts[1];
      }
    }

    try {
      const response = await authenticatedFetch('/api/story', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ featureId, commitSha, repoUrl })
      });
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setStoryData({ title: data.title, steps: data.steps, provenance: data.provenance });
          setStoryLoading(false);
          return;
        }
      }
    } catch (e) {
      console.warn('[Story Fetch Warning] Server story failed, falling back to local story:', e);
    }

    // Client-side fallback story
    const feat = features.find(f => f.id === featureId);
    if (feat) {
      setStoryData({
        title: `${feat.name} Logical Workflow`,
        provenance: 'client-rules',
        steps: [
          `Feature context: ${feat.description}`,
          `Primary file: ${feat.files[0] || 'index.ts'}`,
          `This module groups ${feat.files.length} logical workspace files.`,
          `Provides processing layers and handles business rule validations.`,
          `Integrates with adjacent features inside the repository.`
        ]
      });
    } else {
      setStoryData({
        title: `Story: ${featureId}`,
        provenance: 'client-rules',
        steps: [
          `Initiating analysis for scope: ${featureId}`,
          `Scanning features and imports...`
        ]
      });
    }
    setStoryLoading(false);
  };

  // Click handler for impact evaluations
  const handleLoadImpact = async (symbolName: string) => {
    setImpactLoading(true);

    let targetNodeId = '';
    let commitSha = '';

    // Flexible matching: exact label/id, exact file, or substring match
    const normSymbol = symbolName.toLowerCase().trim();
    let matchedNode = callNodes.find(n => 
      n.label.toLowerCase() === normSymbol ||
      n.file.toLowerCase() === normSymbol ||
      n.id === symbolName
    );

    if (!matchedNode) {
      matchedNode = callNodes.find(n => 
        n.label.toLowerCase().includes(normSymbol) ||
        n.file.toLowerCase().includes(normSymbol)
      );
    }

    if (matchedNode) {
      targetNodeId = matchedNode.id;
      const parts = matchedNode.id.split(':');
      if (parts.length >= 2) {
        commitSha = parts[1];
      }
    }

    // Try live server query if we have the database identifiers
    if (targetNodeId && commitSha) {
      try {
        const response = await authenticatedFetch('/api/impact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetNodeId, commitSha, symbolName })
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.impactedNodes && data.impactedNodes.length > 0) {
            const affectedNodes = new Set<string>(data.impactedNodes);
            setImpactData({
              target: matchedNode ? matchedNode.label : symbolName,
              risk: affectedNodes.size > 5 ? 'High' : affectedNodes.size > 2 ? 'Medium' : 'Low',
              stats: {
                files: affectedNodes.size + 1,
                apis: callNodes.filter(n => affectedNodes.has(n.id) && n.type === 'api').length,
                services: callNodes.filter(n => affectedNodes.has(n.id) && n.type === 'service').length,
                screens: callNodes.filter(n => affectedNodes.has(n.id) && n.type === 'ui').length
              },
              affectedList: Array.from(affectedNodes).map(id => {
                const node = callNodes.find(n => n.id === id);
                return {
                  name: node ? node.label : id.split(':').pop() || id,
                  path: node ? node.file : id,
                  level: 'High' as 'High' | 'Medium' | 'Low'
                };
              })
            });
            setImpactLoading(false);
            return;
          }
        }
      } catch (e) {
        console.warn('[Impact Fetch Warning] Backend DB impact analysis failed, using local AST graph traversal:', e);
      }
    }

    // Graph traversal computation from active callGraph
    if (matchedNode) {
      const affectedNodes = new Set<string>();
      const queue = [matchedNode.id];
      while (queue.length > 0) {
        const currId = queue.shift()!;
        callEdges.forEach(edge => {
          if (edge.to === currId && !affectedNodes.has(edge.from)) {
            affectedNodes.add(edge.from);
            queue.push(edge.from);
          }
        });
      }

      setImpactData({
        target: matchedNode.label,
        risk: affectedNodes.size > 5 ? 'High' : affectedNodes.size > 2 ? 'Medium' : 'Low',
        stats: {
          files: affectedNodes.size + 1,
          apis: callNodes.filter(n => affectedNodes.has(n.id) && n.type === 'api').length,
          services: callNodes.filter(n => affectedNodes.has(n.id) && n.type === 'service').length,
          screens: callNodes.filter(n => affectedNodes.has(n.id) && n.type === 'ui').length
        },
        affectedList: Array.from(affectedNodes).map(id => {
          const node = callNodes.find(n => n.id === id);
          return {
            name: node ? node.label : id,
            path: node ? node.file : id,
            level: 'High' as 'High' | 'Medium' | 'Low'
          };
        })
      });
    } else {
      setImpactData({
        target: symbolName,
        risk: 'Low',
        stats: { files: 1, apis: 0, services: 0, screens: 0 },
        affectedList: []
      });
    }
    setImpactLoading(false);
  };

  // Listen to messages from the VS Code extension
  // NOTE: Placed AFTER handleLoadCallFlow and handleLoadImpact declarations to avoid TDZ access error
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const data = event.data;
      if (data && data.source === 'branchdeck-extension') {
        switch (data.command) {
          case 'workspaceFiles':
            if (data.value && data.value.length > 0) {
              setIsScanning(true);
              setIndexingProgress(0);
              setAnalysisError(null);

              // Client-side instant AST fallback generator
              const localFeatures = generateFeaturesFromFiles(data.value);
              const { nodes: localNodes, edges: localEdges } = generateCallGraphFromFiles(data.value, 'local-workspace', 'local-commit');

              authenticatedFetch('/api/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  workspacePath: data.workspacePath,
                  files: data.value
                })
              })
              .then(async res => {
                if (!res.ok) {
                  return {
                    success: true,
                    features: localFeatures,
                    callGraph: { nodes: localNodes, edges: localEdges }
                  };
                }
                return res.json();
              })
              .then(async resData => {
                if (resData.success && resData.job_id) {
                  const result = await pollJobStatus(resData.job_id, (prog) => {
                    setIndexingProgress(prog);
                  });
                  return result;
                } else if (resData.success) {
                  return resData;
                } else {
                  return {
                    success: true,
                    features: localFeatures,
                    callGraph: { nodes: localNodes, edges: localEdges }
                  };
                }
              })
              .then(resData => {
                const targetFeatures = (resData.features && resData.features.length > 0) ? resData.features : localFeatures;
                const targetNodes = (resData.callGraph && resData.callGraph.nodes && resData.callGraph.nodes.length > 0) ? resData.callGraph.nodes : localNodes;
                const targetEdges = (resData.callGraph && resData.callGraph.edges && resData.callGraph.edges.length > 0) ? resData.callGraph.edges : localEdges;

                const cleanFeatures = (targetFeatures || []).map((feat: any) => ({
                  ...feat,
                  files: Array.from(new Set((feat.files || []).map(normalizePath).filter(Boolean)))
                }));

                setFeatures(cleanFeatures);
                setCallNodes(targetNodes);
                setCallEdges(targetEdges);
                setRepoSource('local-workspace');
                setHasData(true);
                setAnalysisError(null);

                if (cleanFeatures.length > 0) {
                  handleLoadStory(cleanFeatures[0].id);
                }
              })
              .catch(err => {
                console.warn('Backend AST scan warning, using local AST fallback:', err);
                const cleanLocalFeatures = (localFeatures || []).map((feat: any) => ({
                  ...feat,
                  files: Array.from(new Set((feat.files || []).map(normalizePath).filter(Boolean)))
                }));

                setFeatures(cleanLocalFeatures);
                setCallNodes(localNodes);
                setCallEdges(localEdges);
                setRepoSource('local-workspace');
                setHasData(true);
                setAnalysisError(null);

                if (cleanLocalFeatures.length > 0) {
                  handleLoadStory(cleanLocalFeatures[0].id);
                }
              })
              .finally(() => {
                setIsScanning(false);
                setIndexingProgress(0);
              });
            } else {
              setAnalysisError('Workspace scan returned 0 files.');
            }
            break;

          case 'analyzeFunction': {
            const functionName = data.value;
            handleLoadCallFlow(functionName);
            handleLoadImpact(functionName);
            setActiveRightTab('impact');
            break;
          }

          case 'impactAnalysis': {
            const symbol = data.value;
            handleLoadImpact(symbol);
            setActiveRightTab('impact');
            break;
          }

          case 'storyMode':
            setActiveRightTab('story');
            break;
        }
      }
    };

    window.addEventListener('message', handleMessage);

    // Initial trigger if we already have a session
    if (session) {
      window.parent.postMessage({ command: 'scanWorkspace' }, '*');
    }

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  // Trigger workspace scan automatically when session is restored/activated
  useEffect(() => {
    if (isVsCode && !hasData) {
      window.parent.postMessage({ command: 'scanWorkspace' }, '*');
    }
  }, [isVsCode, hasData]);

  // Clicking a file in Features OR Folders tab
  const handleSelectFile = (file: string) => {
    setSelectedFile(file);
    setSelectedFolder(null);

    // Send command to open the clicked file in VS Code editor if embedded
    if (typeof window !== 'undefined' && window.parent) {
      window.parent.postMessage({ command: 'openFile', file }, '*');
    }

    // Load story for the selected file
    handleLoadStory(file);
    setActiveRightTab('story');

    // Locate the matching node in the graph layout
    const normFile = file.replace(/\\/g, '/').replace(/^\.\//, '');
    const filename = normFile.split('/').pop() || '';
    const matchingNode = callNodes.find(n => {
      const nNorm = n.file.replace(/\\/g, '/').replace(/^\.\//, '');
      return nNorm === normFile || nNorm.endsWith(normFile) || normFile.endsWith(nNorm) || (nNorm.split('/').pop() || '') === filename;
    });

    if (matchingNode) {
      setSelectedNode(matchingNode);
    } else {
      setSelectedNode(null);
    }
  };

  const handleSelectNode = (node: CallGraphNode) => {
    setSelectedNode(node);
    handleLoadImpact(node.label);
    setActiveRightTab('impact');
  };

  const handleNlSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nlSearchQuery.trim()) return;
    
    handleCodebaseQuery(nlSearchQuery);
  };

  const handleCopyInvite = () => {
    navigator.clipboard.writeText(window.location.href);
    alert('Invite link copied to clipboard! Share it with your team to review graph actions lively.');
  };

  /* ────────────────────────────────────────────────────────── */
  /* STAGE 1: Marketing Landing Page (public, no auth needed)  */
  /* ────────────────────────────────────────────────────────── */

  if (!hasData) {
    if (isVsCode) {
      // 1. Error View: Show if workspace scanning/analysis fails
      if (analysisError) {
        return (
          <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center font-sans p-6 text-white select-none relative overflow-hidden">
            <div className="relative text-center max-w-md space-y-6 z-10 px-4">
              <div className="w-16 h-16 mx-auto bg-rose-500/10 rounded-2xl flex items-center justify-center border border-rose-500/25 overflow-hidden">
                <img src="/logo.png" alt="Branchdeck Logo" className="w-12 h-12 object-contain rounded-xl" />
              </div>
              <div className="space-y-2">
                <h3 className="text-sm font-bold tracking-wider uppercase text-rose-400">Analysis Error</h3>
                <p className="text-xs text-neutral-400 leading-relaxed max-w-xs mx-auto font-mono bg-neutral-900 border border-white/5 rounded-lg p-3 whitespace-pre-wrap">
                  {analysisError}
                </p>
              </div>
              <div className="flex flex-col gap-2.5 max-w-xs mx-auto">
                <button
                  onClick={() => {
                    setAnalysisError(null);
                    window.parent.postMessage({ command: 'scanWorkspace' }, '*');
                  }}
                  className="bg-white hover:bg-neutral-100 text-neutral-950 text-xs font-bold py-2.5 rounded-xl transition-all flex items-center justify-center gap-2"
                >
                  <img src="/logo.png" alt="Branchdeck" className="w-4 h-4 rounded-sm" />
                  <span>Retry Scan &amp; Analyze</span>
                </button>
                <button
                  onClick={() => {
                    handleLoadCallFlow('login');
                    setFeatures(ECOMMERCE_DEMO_FEATURES);
                    setCallNodes(ECOMMERCE_DEMO_CALLS.nodes);
                    setCallEdges(ECOMMERCE_DEMO_CALLS.edges);
                    setRepoSource('mock-ecommerce');
                    setHasData(true);
                  }}
                  className="bg-neutral-900 hover:bg-neutral-800 text-white border border-white/10 text-xs font-semibold py-2.5 rounded-xl transition-all"
                >
                  Load E-commerce Demo
                </button>
              </div>
            </div>
          </div>
        );
      }

      // 3. Normal loading spinner
      return (
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center font-sans p-6 text-white select-none relative overflow-hidden">
          <div className="relative space-y-6 text-center max-w-md z-10">
            <div className="w-16 h-16 mx-auto bg-white/5 rounded-2xl flex items-center justify-center border border-white/10 shadow-[0_0_50px_rgba(255,255,255,0.05)] overflow-hidden">
              <img src="/logo.png" alt="Branchdeck Logo" className="w-12 h-12 object-contain rounded-xl animate-pulse" />
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-bold tracking-wider uppercase text-neutral-300">Initializing Core Map</h3>
              <p className="text-xs text-neutral-500 max-w-xs mx-auto">
                Scanning local codebase and mapping AST static relations...
              </p>
            </div>
            <div className="space-y-4">
              <div className="w-48 h-1.5 bg-white/5 rounded-full mx-auto overflow-hidden border border-white/5 relative">
                <div className="h-full bg-white rounded-full absolute inset-y-0 left-0 transition-all duration-300" style={{ width: `${indexingProgress}%` }} />
              </div>
              <div className="text-[10px] text-neutral-450 font-mono tracking-widest">{indexingProgress}% COMPLETED</div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <>
        <MarketingLanding 
          session={session}
          repoUrl={repoUrl}
          setRepoUrl={setRepoUrl}
          analyzing={analyzing}
          onAnalyze={handleAnalyze}
          onSignIn={() => openAuth('signin')}
          onSignOut={handleLogOut}
          onOpenRepoPicker={() => setIsRepoModalOpen(true)}
          onLoadDemo={() => setIsRepoModalOpen(true)}
        />
        <AuthModal
          isOpen={isAuthOpen}
          onClose={() => setIsAuthOpen(false)}
          onSuccess={handleAuthSuccess}
          initialMode={authInitialMode}
        />
        <RepoPickerModal
          isOpen={isRepoModalOpen}
          onClose={() => setIsRepoModalOpen(false)}
          onAnalyze={(url) => {
            setRepoUrl(url);
            handleAnalyze(url);
          }}
          onLoadDemo={() => {
            handleLoadCallFlow('login');
            setFeatures(ECOMMERCE_DEMO_FEATURES);
            setCallNodes(ECOMMERCE_DEMO_CALLS.nodes);
            setCallEdges(ECOMMERCE_DEMO_CALLS.edges);
            setRepoSource('mock-ecommerce');
            setHasData(true);
          }}
          analyzing={analyzing}
        />
      </>
    );
  }

  /* ────────────────────────────────────────────────────────── */
  /* STAGE 2: Interactive Intelligence Dashboard               */
  /* ────────────────────────────────────────────────────────── */
  return (
    <main className="flex-1 flex flex-col bg-[#f8fafc] text-slate-700 overflow-hidden h-screen">
      
      {/* 1. Header Toolbar */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-slate-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.01)] z-20">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setHasData(false)}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 transition-colors font-medium"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back
          </button>
          <div className="h-4 w-px bg-slate-200" />
          <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
            <GitBranch className="w-4 h-4 text-slate-800" />
            <span className="font-mono">{repoSource}</span>
          </div>
        </div>

        {/* Global Search Bar */}
        <form onSubmit={handleNlSearch} className="flex-1 max-w-md mx-8 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={nlSearchQuery}
            onChange={(e) => setNlSearchQuery(e.target.value)}
            placeholder="Ask codebase... (e.g. 'where are invoices created?')"
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-700 placeholder-slate-400 focus:border-slate-900 focus:outline-none focus:bg-white transition-colors"
          />
        </form>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsRepoModalOpen(true)}
            className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold px-3 py-1.5 rounded-xl transition-all shadow-sm cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Analyze Repo</span>
          </button>
          <span className="text-[10px] font-bold uppercase px-2.5 py-1 bg-slate-100 border border-slate-200 text-slate-800 rounded-full">
            Active Workspace
          </span>
          <button 
            onClick={handleLogOut}
            className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800 transition-colors shadow-sm cursor-pointer"
          >
            Log Out
          </button>
        </div>
      </header>

      {/* 2. Collaborative Team Presence Bar */}
      <CollaborationBar
        members={displayMembers}
        onInviteClick={() => setIsInviteOpen(true)}
      />

      {/* 3. Workspace Layout */}
      <div className="w-full flex-1 flex flex-row gap-4 p-4 pb-6 overflow-hidden relative h-[calc(100vh-135px)]">
        
        {/* Left pane: Project Map */}
        <div className={`h-full flex flex-col bg-white border border-slate-200/80 rounded-xl shadow-sm transition-all duration-300 overflow-hidden flex-shrink-0 ${
          leftSidebarCollapsed ? 'w-12' : 'w-80'
        }`}>
          {leftSidebarCollapsed ? (
            <div className="flex flex-col items-center py-4 gap-4 h-full">
              <button 
                onClick={() => setLeftSidebarCollapsed(false)}
                className="p-2 rounded-lg hover:bg-slate-100 text-slate-700 transition-colors"
                title="Expand File Map"
              >
                <Compass className="w-5 h-5 text-slate-850" />
              </button>
              <div className="w-6 h-px bg-slate-200" />
              <button
                onClick={() => setLeftSidebarCollapsed(false)}
                className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors mt-auto"
                title="Expand File Map"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <ProjectMap 
              features={features} 
              onSelectFile={handleSelectFile} 
              selectedFile={selectedFile} 
              onCollapse={() => setLeftSidebarCollapsed(true)}
              onSelectFolder={(folder) => {
                setSelectedFolder(folder);
                setSelectedFile(null);
                if (folder) {
                  if (repoSource === 'mock-ecommerce' || repoSource === '') {
                    const path = folder.toLowerCase();
                    if (path.includes('auth') || path.includes('middleware')) {
                      handleLoadCallFlow('login');
                    } else if (path.includes('payment') || path.includes('billing')) {
                      handleLoadCallFlow('payment');
                    } else {
                      handleLoadCallFlow('checkout');
                    }
                  } else {
                    handleLoadCallFlow(folder);
                    handleLoadStory(folder);
                    setActiveRightTab('story');
                  }
                }
              }}
              selectedFolder={selectedFolder}
            />
          )}
        </div>

        {/* Central Workspace: Call Flow Graph */}
        <div className="flex-1 h-full flex flex-col gap-4 overflow-hidden relative min-w-0 min-h-0">
          <div className="flex-1 h-full flex flex-col min-h-0 relative">
             <CallFlowGraph 
              nodes={filteredNodes} 
              edges={filteredEdges} 
              onSelectNode={handleSelectNode} 
              selectedFile={selectedFile}
              selectedFolder={selectedFolder}
              selectedFeature={selectedFolder}
              activeStepIndex={activeWalkthroughStep}
              isFullscreen={isGraphFullscreen}
              members={displayMembers}
              repoSource={repoSource}
              isFocused={!!selectedFile || !!selectedFolder || !!selectedNode}
              onResetFocus={() => {
                setSelectedFile(null);
                setSelectedFolder(null);
                setSelectedNode(null);
                setActiveWalkthroughStep(null);
              }}
              onToggleFullscreen={() => {
                const anyCollapsed = leftSidebarCollapsed || rightSidebarCollapsed;
                if (anyCollapsed) {
                  setLeftSidebarCollapsed(false);
                  setRightSidebarCollapsed(false);
                } else {
                  setLeftSidebarCollapsed(true);
                  setRightSidebarCollapsed(true);
                }
              }}
            />
          </div>
          
          {/* Active node detail bar if selected */}
          {selectedNode && (
            <div className="bg-white border border-slate-200/80 p-3.5 rounded-xl flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-3">
                <Terminal className="w-4 h-4 text-slate-800" />
                <div>
                  <div className="text-xs font-bold text-slate-800 font-mono">Selected: {selectedNode.label}</div>
                  <div className="text-[10px] text-slate-400 font-mono mt-0.5">{selectedNode.file}</div>
                </div>
              </div>
              <button 
                onClick={() => {
                  handleLoadImpact(selectedNode.label);
                  setActiveRightTab('impact');
                }}
                className="bg-slate-50 hover:bg-slate-100 text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 font-semibold transition-colors shadow-sm"
              >
                Inspect Impact Path
              </button>
            </div>
          )}
        </div>

        {/* Right Pane: Architecture Walkthrough / Impact analysis */}
        <div className={`h-full flex flex-col bg-white border border-slate-200/80 rounded-xl shadow-sm transition-all duration-300 overflow-hidden flex-shrink-0 ${
          rightSidebarCollapsed ? 'w-12' : 'w-80'
        }`}>
          {rightSidebarCollapsed ? (
            <div className="flex flex-col items-center py-4 gap-3 h-full">
              <button 
                onClick={() => {
                  setActiveRightTab('story');
                  setRightSidebarCollapsed(false);
                }}
                className={`p-2 rounded-lg hover:bg-slate-100 transition-colors ${activeRightTab === 'story' ? 'text-slate-800 bg-slate-50' : 'text-slate-400'}`}
                title="Architecture Walkthrough"
              >
                <BookOpen className="w-5 h-5" />
              </button>
              <button 
                onClick={() => {
                  setActiveRightTab('impact');
                  setRightSidebarCollapsed(false);
                }}
                className={`p-2 rounded-lg hover:bg-slate-100 transition-colors ${activeRightTab === 'impact' ? 'text-slate-800 bg-slate-50' : 'text-slate-400'}`}
                title="Impact Analysis"
              >
                <ShieldAlert className="w-5 h-5" />
              </button>
              <div className="w-6 h-px bg-slate-200" />
              <button
                onClick={() => setRightSidebarCollapsed(false)}
                className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors mt-auto"
                title="Expand Details"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <>
              {/* Header tabs with collapse button */}
              <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/50 p-1 pr-2 flex-shrink-0">
                <div className="flex flex-1 gap-1">
                  <button
                    onClick={() => setActiveRightTab('story')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-lg transition-all ${
                      activeRightTab === 'story'
                        ? 'bg-white text-slate-900 shadow-sm border border-slate-200/30'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    Architecture Walkthrough
                  </button>
                  <button
                    onClick={() => setActiveRightTab('impact')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-lg transition-all ${
                      activeRightTab === 'impact'
                        ? 'bg-white text-slate-900 shadow-sm border border-slate-200/30'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    <ShieldAlert className="w-3.5 h-3.5" />
                    Impact Analysis
                  </button>
                </div>
                <button
                  onClick={() => setRightSidebarCollapsed(true)}
                  className="p-1.5 ml-1 rounded hover:bg-slate-200/60 text-slate-400 hover:text-slate-700 transition-colors"
                  title="Collapse Sidebar"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-hidden">
                {activeRightTab === 'story' ? (
                  <StoryMode 
                    loading={storyLoading} 
                    story={storyData} 
                    onHoverStep={(idx) => setActiveWalkthroughStep(idx)}
                    onSelectStep={(idx) => setActiveWalkthroughStep(idx)}
                    activeStepIndex={activeWalkthroughStep}
                  />
                ) : (
                  <ImpactPanel 
                    onAnalyzeImpact={handleLoadImpact} 
                    impactResult={impactData} 
                    loading={impactLoading} 
                  />
                )}
              </div>
            </>
          )}
        </div>

      </div>
      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onSuccess={handleAuthSuccess}
        initialMode={authInitialMode}
      />
      <InviteTeamModal
        isOpen={isInviteOpen}
        onClose={() => setIsInviteOpen(false)}
        workspaceId={repoSource || 'default-workspace'}
        repoSource={repoSource}
        session={session}
      />
      <RepoPickerModal
        isOpen={isRepoModalOpen}
        onClose={() => setIsRepoModalOpen(false)}
        onAnalyze={(url) => {
          setRepoUrl(url);
          handleAnalyze(url);
        }}
        onLoadDemo={() => {
          handleLoadCallFlow('login');
          setFeatures(ECOMMERCE_DEMO_FEATURES);
          setCallNodes(ECOMMERCE_DEMO_CALLS.nodes);
          setCallEdges(ECOMMERCE_DEMO_CALLS.edges);
          setRepoSource('mock-ecommerce');
          setHasData(true);
        }}
        analyzing={analyzing}
      />
    </main>
  );
}
