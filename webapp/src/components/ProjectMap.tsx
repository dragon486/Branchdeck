'use client';

import React, { useState, useMemo } from 'react';
import { FeatureNode } from '@/lib/analyzer';
import { Folder, FolderOpen, FileText, ChevronRight, ChevronDown, ChevronLeft, RotateCcw } from 'lucide-react';

interface ProjectMapProps {
  features: FeatureNode[];
  onSelectFile: (file: string) => void;
  selectedFile: string | null;
  onCollapse?: () => void;
  onSelectFolder?: (folder: string | null) => void;
  selectedFolder?: string | null;
}

interface FolderTreeNode {
  name: string;
  path: string;
  isDir: boolean;
  children: Record<string, FolderTreeNode>;
}

function formatPathForDisplay(filePath: string, maxSegments: number = 3): string {
  if (!filePath) return '';
  const parts = filePath.replace(/\\/g, '/').split('/').filter(Boolean);
  if (parts.length <= maxSegments) {
    return parts.join('/');
  }
  return `.../${parts.slice(-maxSegments).join('/')}`;
}

export default function ProjectMap({
  features,
  onSelectFile,
  selectedFile,
  onCollapse,
  onSelectFolder,
  selectedFolder
}: ProjectMapProps) {
  const [viewType, setViewType] = useState<'features' | 'folders'>('features');
  
  const [expandedFeatures, setExpandedFeatures] = useState<Record<string, boolean>>({
    auth: true,
    checkout: true,
    orders: true,
    payments: true,
    core: true,
    data: true,
    utils: true,
    ui: true,
    api: true
  });

  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({
    'src': true,
    '': true
  });

  const toggleFeature = (id: string) => {
    setExpandedFeatures(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleFolder = (path: string) => {
    setExpandedFolders(prev => ({ ...prev, [path]: !prev[path] }));
  };

  // Extract unique sorted files from features list
  const allFiles = useMemo(() => {
    const fileSet = new Set<string>();
    features.forEach(feat => {
      feat.files.forEach(file => {
        fileSet.add(file);
      });
    });
    return Array.from(fileSet).sort();
  }, [features]);

  // Build recursive directory tree from unique files list
  const folderTree = useMemo(() => {
    const root: FolderTreeNode = { name: 'root', path: '', isDir: true, children: {} };

    allFiles.forEach(file => {
      const parts = file.split('/');
      let current = root;
      let runningPath = '';

      parts.forEach((part, index) => {
        runningPath = runningPath ? `${runningPath}/${part}` : part;
        const isLast = index === parts.length - 1;

        if (!current.children[part]) {
          current.children[part] = {
            name: part,
            path: runningPath,
            isDir: !isLast,
            children: {}
          };
        }
        current = current.children[part];
      });
    });

    return root;
  }, [allFiles]);

  // Recursively render directory folder nodes
  const renderFolderNode = (node: FolderTreeNode, depth = 0) => {
    const isExpanded = expandedFolders[node.path];
    const sortedChildren = Object.values(node.children).sort((a, b) => {
      // Folders/directories first, then files
      if (a.isDir && !b.isDir) return -1;
      if (!a.isDir && b.isDir) return 1;
      return a.name.localeCompare(b.name);
    });

    if (node.path === '') {
      // Top-level root render
      return (
        <div key="root-folder-nodes" className="space-y-1.5 font-mono text-xs select-none">
          {sortedChildren.map(child => renderFolderNode(child, 0))}
        </div>
      );
    }

    if (node.isDir) {
      const isSelected = selectedFolder === node.path;
      return (
        <div key={node.path} className="space-y-1">
          <div
            style={{ paddingLeft: `${depth * 8}px` }}
            className={`flex items-center justify-between group rounded-lg hover:bg-slate-100/70 py-1 px-2 transition-all cursor-pointer ${
              isSelected ? 'bg-slate-100 border-l-2 border-slate-900 pl-2' : ''
            }`}
            onClick={(e) => {
              e.stopPropagation();
              if (onSelectFolder) {
                onSelectFolder(isSelected ? null : node.path);
              }
              // Auto-expand folder if clicked and not expanded
              if (!isExpanded) {
                toggleFolder(node.path);
              }
            }}
          >
            <div className="flex items-center gap-1.5 text-slate-600 group-hover:text-slate-800">
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFolder(node.path);
                }}
                className="p-0.5 rounded hover:bg-slate-200"
              >
                {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              </span>
              {isExpanded ? <FolderOpen className="w-3.5 h-3.5 text-slate-700" /> : <Folder className="w-3.5 h-3.5 text-slate-500" />}
              <span className="truncate max-w-[155px] font-medium">{node.name}/</span>
            </div>
            {isSelected && (
              <span className="text-[8px] bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded-full font-bold uppercase">
                Focused
              </span>
            )}
          </div>
          {isExpanded && (
            <div className="border-l border-slate-200/60 ml-3.5 space-y-1">
              {sortedChildren.map(child => renderFolderNode(child, depth + 1))}
            </div>
          )}
        </div>
      );
    } else {
      const isSelected = selectedFile === node.path;
      return (
        <button
          key={node.path}
          style={{ paddingLeft: `${(depth + 1.2) * 8}px` }}
          onClick={(e) => {
            e.stopPropagation();
            onSelectFile(node.path);
          }}
          className={`w-full flex items-center gap-2 py-1 px-2 rounded-lg text-left transition-colors font-mono text-[11px] ${
            isSelected
              ? 'text-slate-950 bg-slate-100 font-bold border-l-2 border-slate-900 pl-2.5'
              : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
          }`}
        >
          <FileText className="w-3.5 h-3.5 opacity-70" />
          <span className="truncate">{node.name}</span>
        </button>
      );
    }
  };

  return (
    <div className="flex flex-col h-full bg-white border border-slate-200/80 rounded-xl overflow-hidden shadow-sm">
      {/* Header Tabs */}
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 bg-slate-50/50">
        <div className="flex items-center gap-1.5">
          {onCollapse && (
            <button
              onClick={onCollapse}
              className="p-1 rounded hover:bg-slate-200/60 text-slate-400 hover:text-slate-700 transition-colors mr-0.5"
              title="Collapse Sidebar"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
          )}
          <span className="text-xs font-bold tracking-wider text-slate-500 uppercase">Project Structure</span>
        </div>
        <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200/65">
          <button
            onClick={() => setViewType('features')}
            className={`px-3 py-1 text-xs rounded-md font-semibold transition-all ${
              viewType === 'features'
                ? 'bg-white text-slate-900 shadow-sm border border-slate-200/30'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Features
          </button>
          <button
            onClick={() => setViewType('folders')}
            className={`px-3 py-1 text-xs rounded-md font-semibold transition-all ${
              viewType === 'folders'
                ? 'bg-white text-slate-900 shadow-sm border border-slate-200/30'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Folders
          </button>
        </div>
      </div>

      {/* Explorer List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {selectedFolder && (
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-2 flex items-center justify-between mb-2">
            <div className="text-[10px] text-slate-500 font-bold truncate max-w-[160px]">
              Focused: <span className="font-mono text-slate-800">{selectedFolder}/</span>
            </div>
            <button
              onClick={() => onSelectFolder && onSelectFolder(null)}
              className="p-1 rounded hover:bg-slate-200 text-slate-500 hover:text-slate-800 transition-colors"
              title="Clear Folder Focus"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {viewType === 'features' ? (
          <div className="space-y-2">
            {features.map(feat => {
              const isOpen = expandedFeatures[feat.id];
              return (
                <div key={feat.id} className="border border-slate-100 bg-white rounded-lg overflow-hidden transition-all hover:border-slate-200 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                  <button
                    onClick={() => toggleFeature(feat.id)}
                    className="w-full flex items-center justify-between p-3 text-left transition-colors hover:bg-slate-50/40"
                  >
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: feat.color, boxShadow: `0 0 6px ${feat.color}` }}
                      />
                      <div>
                        <div className="text-sm font-bold text-slate-700">{feat.name}</div>
                        <div className="text-[10px] text-slate-400 font-medium line-clamp-1">{feat.description}</div>
                      </div>
                    </div>
                    {isOpen ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                  </button>

                  {isOpen && (
                    <div className="pl-6 pr-3 pb-3 pt-1 border-t border-slate-100 bg-slate-50/30 space-y-1">
                      {feat.files.map(file => {
                        const formattedPath = formatPathForDisplay(file, 3);
                        return (
                          <button
                            key={file}
                            onClick={() => onSelectFile(file)}
                            title={file}
                            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-left font-mono transition-all ${
                              selectedFile === file
                                ? 'bg-slate-100 text-slate-950 border-l-2 border-slate-900 pl-3 font-semibold'
                                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100/50'
                            }`}
                          >
                            <FileText className="w-3.5 h-3.5 opacity-70 shrink-0" />
                            <span className="truncate" title={file}>{formattedPath}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          /* Folders mode: fully interactive and dynamic directory explorer */
          renderFolderNode(folderTree)
        )}
      </div>
    </div>
  );
}
