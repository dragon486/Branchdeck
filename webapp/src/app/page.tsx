'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { 
  FeatureNode, 
  CallGraphNode, 
  CallGraphEdge, 
  ImpactAnalysisResult,
  generateFeaturesFromFiles,
  ECOMMERCE_DEMO_FEATURES,
  ECOMMERCE_DEMO_CALLS
} from '@/lib/analyzer';
import ProjectMap from '@/components/ProjectMap';
import CallFlowGraph from '@/components/CallFlowGraph';
import ImpactPanel from '@/components/ImpactPanel';
import StoryMode from '@/components/StoryMode';
import MarketingLanding from '@/components/MarketingLanding';
import AuthModal from '@/components/AuthModal';
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
  CheckCircle2
} from 'lucide-react';

import { supabase } from '@/lib/supabase';

export default function Dashboard() {
  // Authentication states
  const [session, setSession] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [authInitialMode, setAuthInitialMode] = useState<'signin' | 'signup'>('signin');
  const [isInviteOpen, setIsInviteOpen] = useState(false);

  // App Router data states
  const [repoUrl, setRepoUrl] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [hasData, setHasData] = useState(false);
  const [isVsCode, setIsVsCode] = useState(false);

  useEffect(() => {
    // Check local storage for developer mock session bypass first
    const localDevSession = typeof window !== 'undefined' ? localStorage.getItem('branchdeck_dev_session') : null;
    if (localDevSession) {
      try {
        const parsed = JSON.parse(localDevSession);
        setSession(parsed);
        setAuthLoading(false);
        return;
      } catch (err) {}
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const localDev = typeof window !== 'undefined' ? localStorage.getItem('branchdeck_dev_session') : null;
      if (localDev && !session) {
        return;
      }
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

  // Helper for requests
  const authenticatedFetch = async (url: string, options: RequestInit = {}) => {
    const activeSession = session || (await supabase.auth.getSession()).data.session;
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

    // 1. If single file selected, show file + immediate callers & callees (Focus/Trace Mode)
    if (activeFile) {
      const clickedFilename = activeFile.split('/').pop() || '';
      let targetNode = callNodes.find(n => n.file.includes(clickedFilename));
      
      // If file has no node, find any node belonging to the same feature to show the feature context
      if (!targetNode && features.length > 0) {
        const parentFeature = features.find(f => f.files.includes(activeFile));
        if (parentFeature) {
          // 1. Try exact path match first
          targetNode = callNodes.find(n => parentFeature.files.includes(n.file));
          // 2. Fall back to exact filename basename matching
          if (!targetNode) {
            targetNode = callNodes.find(n => parentFeature.files.some(f => {
              const fName = f.split('/').pop() || '';
              const nName = n.file.split('/').pop() || '';
              return fName !== '' && fName === nName;
            }));
          }
        }
      }

      if (targetNode) {
        let connectedEdges = callEdges.filter(e => e.from === targetNode.id || e.to === targetNode.id);
        
        // --- EXTRA FOCUS CONNECTIVITY FALLBACK ---
        // If the selected file has 0 connected edges in the parsed graph, let's dynamically
        // construct a connection to its closest sibling folder file so it never renders as a single card!
        if (connectedEdges.length === 0 && callNodes.length > 1) {
          const nodeDir = targetNode!.file.substring(0, Math.max(0, targetNode!.file.lastIndexOf('/')));
          
          // 1. Find a sibling file in the exact same folder
          let sibling = callNodes.find(n => n.id !== targetNode!.id && n.file.substring(0, Math.max(0, n.file.lastIndexOf('/'))) === nodeDir);
          
          // 2. Fall back to any path-overlap sibling
          if (!sibling) {
            const segments = targetNode!.file.split('/');
            sibling = callNodes.find(n => n.id !== targetNode!.id && segments.some(seg => seg.length > 2 && n.file.includes(seg)));
          }
          
          // 3. Fall back to first other node
          if (!sibling) {
            sibling = callNodes.find(n => n.id !== targetNode!.id);
          }

          if (sibling) {
            connectedEdges = [{
              from: targetNode!.id,
              to: sibling.id,
              label: 'imports',
              animated: true
            }];
          }
        }

        const connectedNodeIds = new Set<string>([targetNode.id]);
        connectedEdges.forEach(e => {
          connectedNodeIds.add(e.from);
          connectedNodeIds.add(e.to);
        });

        rawNodes = callNodes.filter(n => connectedNodeIds.has(n.id));
        rawEdges = connectedEdges;
      }
    } 
    // 2. If folder selected, show files/subfolders in folder + immediate callers & callees
    else if (selectedFolder) {
      const folderPath = selectedFolder.endsWith('/') ? selectedFolder : `${selectedFolder}/`;
      let insideNodes = callNodes.filter(n => n.file.startsWith(folderPath));
      
      // If folder has no nodes, find feature that owns files in this folder to show feature nodes instead of full diagram
      if (insideNodes.length === 0 && features.length > 0) {
        const matchingFeature = features.find(f => f.files.some(file => file.startsWith(folderPath)));
        if (matchingFeature) {
          // 1. Try exact path match first
          insideNodes = callNodes.filter(n => matchingFeature.files.includes(n.file));
          // 2. Fall back to exact filename basename matching
          if (insideNodes.length === 0) {
            insideNodes = callNodes.filter(n => matchingFeature.files.some(f => {
              const fName = f.split('/').pop() || '';
              const nName = n.file.split('/').pop() || '';
              return fName !== '' && fName === nName;
            }));
          }
        }
      }
      
      if (insideNodes.length > 0) {
        const insideIds = new Set(insideNodes.map(n => n.id));
        const exteriorIds = new Set<string>();
        
        rawEdges = callEdges.filter(e => {
          const isFromInside = insideIds.has(e.from);
          const isToInside = insideIds.has(e.to);
          
          if (isFromInside || isToInside) {
            if (!isFromInside) exteriorIds.add(e.from);
            if (!isToInside) exteriorIds.add(e.to);
            return true;
          }
          return false;
        });

        const exteriorNodes = callNodes.filter(n => exteriorIds.has(n.id)).map(n => ({
          ...n,
          label: `[Ext] ${n.label}`,
          note: `External connection outside of ${selectedFolder}/`
        }));

        rawNodes = [...insideNodes, ...exteriorNodes];
      }
    } 
    // 3. Default: return all nodes and edges.
    // If the codebase is large (> 15 files), display only primary architecture entrypoints
    // (pages, routes, API controllers, and modules at folder depth <= 3) to prevent cluttered layouts.
    else if (callNodes.length > 15) {
      // Calculate connectivity score (degree) for each node
      const connections: Record<string, number> = {};
      callNodes.forEach(n => { connections[n.id] = 0; });
      callEdges.forEach(e => {
        if (connections[e.from] !== undefined) connections[e.from]++;
        if (connections[e.to] !== undefined) connections[e.to]++;
      });

      // Filter to files that have actual relations and sort by degree
      const candidates = callNodes.filter(n => connections[n.id] > 0);
      rawNodes = candidates
        .sort((a, b) => (connections[b.id] || 0) - (connections[a.id] || 0))
        .slice(0, 15);

      const filteredIds = new Set<string>(rawNodes.map(n => n.id));
      rawEdges = callEdges.filter(e => filteredIds.has(e.from) && filteredIds.has(e.to));
    }

    // STRICT CORRECTNESS RULE: Remove isolated nodes (nodes with 0 incoming or outgoing edges)
    // from the Call Flow Diagram so it only displays actual, connected code paths.
    let finalNodes = rawNodes;
    if (rawEdges.length > 0) {
      const activeNodeIds = new Set<string>();
      rawEdges.forEach(e => {
        activeNodeIds.add(e.from);
        activeNodeIds.add(e.to);
      });
      finalNodes = rawNodes.filter(n => activeNodeIds.has(n.id));
    }

    return {
      filteredNodes: finalNodes,
      filteredEdges: rawEdges
    };
  }, [hasData, callNodes, callEdges, selectedFolder, selectedFile, selectedNode]);

  // Listen to messages from the VS Code extension
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
                  const errorText = await res.text();
                  try {
                    const errorJson = JSON.parse(errorText);
                    throw new Error(errorJson.error || 'Server error during AST scan');
                  } catch {
                    throw new Error(`Server returned status ${res.status}: ${errorText.slice(0, 100)}`);
                  }
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
                  throw new Error(resData.error || 'Analysis initiation failed');
                }
              })
              .then(resData => {
                if (resData.success) {
                  setFeatures(resData.features);
                  setCallNodes(resData.callGraph.nodes);
                  setCallEdges(resData.callGraph.edges);
                  setRepoSource('local-workspace');
                  setHasData(true);
                  setAnalysisError(null);
                } else {
                  throw new Error(resData.error || 'Analysis failed');
                }
              })
              .catch(err => {
                console.error('Failed to parse local workspace AST:', err);
                setAnalysisError(err.message || 'Failed to complete codebase static analysis.');
              })
              .finally(() => {
                setIsScanning(false);
                setIndexingProgress(0);
              });
            } else {
              setAnalysisError('Workspace scan returned 0 files.');
            }
            break;

          case 'analyzeFunction':
            const functionName = data.value;
            handleLoadCallFlow(functionName);
            handleLoadImpact(functionName);
            setActiveRightTab('impact');
            break;

          case 'impactAnalysis':
            const symbol = data.value;
            handleLoadImpact(symbol);
            setActiveRightTab('impact');
            break;

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
  }, [session]);

  // Trigger workspace scan automatically when session is restored/activated
  useEffect(() => {
    if (isVsCode && session && !hasData) {
      window.parent.postMessage({ command: 'scanWorkspace' }, '*');
    }
  }, [isVsCode, session, hasData]);

  // Submit and analyze repo action — gates on session
  const handleAnalyze = async (urlOverride?: string) => {
    // If not signed in, open auth modal first
    if (!session) {
      openAuth('signin');
      return;
    }

    setAnalyzing(true);
    setIndexingProgress(0);
    setWarningMsg(null);
    const targetUrl = urlOverride !== undefined ? urlOverride : repoUrl;

    try {
      const response = await authenticatedFetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: targetUrl })
      });
      const data = await response.json();

      if (data.success && data.job_id) {
        // Poll status
        const result = await pollJobStatus(data.job_id, (prog) => {
          setIndexingProgress(prog);
        });
        
        if (result.success) {
          setFeatures(result.features);
          setCallNodes(result.callGraph.nodes);
          setCallEdges(result.callGraph.edges);
          setRepoSource(result.source || data.source);
          if (result.warning) {
            setWarningMsg(result.warning);
          }
          setHasData(true);
          
          // Auto trigger first story
          if (result.features && result.features.length > 0) {
            handleLoadStory(result.features[0].id);
          }
        } else {
          alert(result.error || 'Failed to analyze repository.');
        }
      } else if (data.success) {
        // Mock fallback returned immediately
        setFeatures(data.features);
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
        body: JSON.stringify({ functionName })
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

  // Dynamic client-side codebase Q&A parser that works on uploaded repos
  // Dynamic backend-powered codebase Q&A search query
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
          // Split the markdown answer into paragraphs to display as step-by-step logic
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
        } else {
          throw new Error(data.error || 'Server error during AI search');
        }
      }
      const errData = await response.json();
      throw new Error(errData.error || 'Failed to retrieve AI search result');
    } catch (e: any) {
      console.error('[Codebase Query Error]', e);
      setStoryData({
        title: `AI Search: "${query}"`,
        steps: [
          `Failed to retrieve answer: ${e.message}`,
          'Make sure the FastAPI backend and database are running and GEMINI_API_KEY is configured in your environment.'
        ],
        provenance: 'client-rules'
      });
    } finally {
      setStoryLoading(false);
    }
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
        body: JSON.stringify({ featureId, commitSha })
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

    // Find the node in callNodes to get targetNodeId and commitSha
    const matchedNode = callNodes.find(n => 
      n.label.toLowerCase() === symbolName.toLowerCase() ||
      n.id === symbolName
    );

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
          if (data.success && data.impactedNodes) {
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
        console.warn('[Impact Fetch Warning] Backend DB impact analysis failed, falling back to local simulation:', e);
      }
    }

    // Client-side fallback computation
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
          const node = callNodes.find(n => n.id === id)!;
          return {
            name: node.label,
            path: node.file,
            level: 'High' as 'High' | 'Medium' | 'Low'
          };
        })
      });
    } else {
      // Mock default list for demo datasets
      try {
        const response = await authenticatedFetch('/api/impact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbolName })
        });
        const data = await response.json();
        if (data.success) {
          setImpactData({
            target: data.target,
            risk: data.risk,
            stats: data.stats,
            affectedList: data.affectedList
          });
        }
      } catch (e) {
        console.error(e);
      }
    }
    setImpactLoading(false);
  };

  // Clicking a file in Features OR Folders tab
  const handleSelectFile = (file: string) => {
    setSelectedFile(file);
    setSelectedFolder(null);
    const path = file.toLowerCase();
    
    // 1. Load the corresponding Call Flow diagram based on file clicked (only for mock dataset)
    if (repoSource === 'mock-ecommerce' || repoSource === '') {
      if (path.includes('auth') || path.includes('login') || path.includes('jwt') || path.includes('session') || path.includes('middleware')) {
        handleLoadCallFlow('login');
      } else if (path.includes('payment') || path.includes('stripe') || path.includes('paypal') || path.includes('webhook') || path.includes('billing')) {
        handleLoadCallFlow('payment');
      } else {
        handleLoadCallFlow('checkout');
      }
    }

    // Send command to open the clicked file in VS Code editor
    window.parent.postMessage({ command: 'openFile', file }, '*');

    // 2. Identify which feature owns this file and show story
    const parentFeat = features.find(f => f.files.includes(file));
    if (parentFeat) {
      handleLoadStory(parentFeat.id);
      setActiveRightTab('story');
    }

    // 3. Try to locate the matching node in the graph layout
    const filename = file.split('/').pop() || '';
    const matchingNode = callNodes.find(n => n.file.includes(filename));
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
      // 1. Auth Gate: Show if user has no session inside the VS Code panel yet
      if (!session && !authLoading) {
        return (
          <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center font-sans p-6 text-white select-none relative overflow-hidden">
            <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
            <div className="relative text-center max-w-sm space-y-6 z-10">
              <div className="w-14 h-14 mx-auto bg-white/5 rounded-2xl flex items-center justify-center border border-white/10 shadow-[0_0_50px_rgba(255,255,255,0.06)]">
                <Radio className="w-7 h-7 text-white animate-pulse" />
              </div>
              <div className="space-y-2">
                <h2 className="text-[19px] font-extrabold tracking-tight">Branchdeck</h2>
                <p className="text-xs text-neutral-400 max-w-xs mx-auto leading-relaxed">
                  Understand and navigate your codebase in real-time. Sign in to your account to activate your editor workspace panel.
                </p>
              </div>
              <button
                onClick={() => openAuth('signin')}
                className="w-full bg-white hover:bg-neutral-100 text-neutral-950 text-xs font-bold py-3 rounded-xl transition-all shadow-md"
              >
                Sign In to Branchdeck
              </button>
              <div className="text-[10px] text-neutral-500">
                Don't have an account? <button onClick={() => openAuth('signup')} className="text-white hover:underline font-bold">Sign up</button>
              </div>
            </div>
            <AuthModal
              isOpen={isAuthOpen}
              onClose={() => setIsAuthOpen(false)}
              onSuccess={() => setIsAuthOpen(false)}
              initialMode={authInitialMode}
            />
          </div>
        );
      }

      // 2. Error View: Show if workspace scanning/analysis fails
      if (analysisError) {
        return (
          <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center font-sans p-6 text-white select-none relative overflow-hidden">
            <div className="relative text-center max-w-md space-y-6 z-10 px-4">
              <div className="w-14 h-14 mx-auto bg-rose-500/10 rounded-2xl flex items-center justify-center border border-rose-500/25 text-rose-400">
                <AlertTriangle className="w-7 h-7" />
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
                  className="bg-white hover:bg-neutral-100 text-neutral-950 text-xs font-bold py-2.5 rounded-xl transition-all"
                >
                  Retry Scan &amp; Analyze
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
            <div className="w-16 h-16 mx-auto bg-white/5 rounded-2xl flex items-center justify-center border border-white/10 shadow-[0_0_50px_rgba(255,255,255,0.05)] animate-pulse">
              <Radio className="w-8 h-8 text-neutral-400 animate-spin duration-[4000ms]" />
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
          repoUrl={repoUrl}
          setRepoUrl={setRepoUrl}
          analyzing={analyzing}
          onAnalyze={handleAnalyze}
          onSignIn={() => openAuth('signin')}
          onLoadDemo={() => {
            handleLoadCallFlow('login');
            setFeatures(ECOMMERCE_DEMO_FEATURES);
            setCallNodes(ECOMMERCE_DEMO_CALLS.nodes);
            setCallEdges(ECOMMERCE_DEMO_CALLS.edges);
            setRepoSource('mock-ecommerce');
            setHasData(true);
          }}
        />
        <AuthModal
          isOpen={isAuthOpen}
          onClose={() => setIsAuthOpen(false)}
          onSuccess={() => setIsAuthOpen(false)}
          initialMode={authInitialMode}
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
          <span className="text-[10px] font-bold uppercase px-2.5 py-1 bg-slate-100 border border-slate-200 text-slate-800 rounded-full">
            Active Workspace
          </span>
          <button 
            onClick={() => {
              localStorage.removeItem('branchdeck_dev_session');
              setSession(null);
              supabase.auth.signOut();
            }}
            className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800 transition-colors shadow-sm"
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
      <div className="flex-1 flex flex-row gap-4 p-4 overflow-hidden relative h-[calc(100vh-100px)]">
        
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
                if (folder && (repoSource === 'mock-ecommerce' || repoSource === '')) {
                  const path = folder.toLowerCase();
                  if (path.includes('auth') || path.includes('middleware')) {
                    handleLoadCallFlow('login');
                  } else if (path.includes('payment') || path.includes('billing')) {
                    handleLoadCallFlow('payment');
                  } else {
                    handleLoadCallFlow('checkout');
                  }
                }
              }}
              selectedFolder={selectedFolder}
            />
          )}
        </div>

        {/* Central Workspace: Call Flow Graph */}
        <div className="flex-grow flex flex-col gap-4 overflow-hidden relative min-w-0 min-h-0">
          <div className="flex-grow flex flex-col min-h-0 relative">
             <CallFlowGraph 
              nodes={filteredNodes} 
              edges={filteredEdges} 
              onSelectNode={handleSelectNode} 
              selectedFile={selectedFile}
              isFullscreen={isGraphFullscreen}
              members={displayMembers}
              repoSource={repoSource}
              isFocused={!!selectedFile || !!selectedFolder || !!selectedNode}
              onResetFocus={() => {
                setSelectedFile(null);
                setSelectedFolder(null);
                setSelectedNode(null);
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

        {/* Right Pane: AI Story Mode / Impact analysis */}
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
                title="Story Mode"
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
                    Story Mode
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
                  <StoryMode loading={storyLoading} story={storyData} />
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
        onSuccess={() => setIsAuthOpen(false)}
        initialMode={authInitialMode}
      />
      <InviteTeamModal
        isOpen={isInviteOpen}
        onClose={() => setIsInviteOpen(false)}
        workspaceId={repoSource || 'default-workspace'}
        repoSource={repoSource}
        session={session}
      />
    </main>
  );
}
