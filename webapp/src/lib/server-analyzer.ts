import { Project, SyntaxKind } from 'ts-morph';
import * as path from 'path';
import * as fs from 'fs';
import { CallGraphNode, CallGraphEdge, generateCallGraphFromFiles } from './analyzer';

// Builds a true AST-parsed static call and dependency graph from local files
export function generateCallGraphFromAST(workspacePath: string, files: string[]): { nodes: CallGraphNode[]; edges: CallGraphEdge[] } {
  const project = new Project({
    compilerOptions: {
      allowJs: true,
      resolveJsonModule: true
    }
  });
  
  // Clean slashes for windows
  const cleanWorkspace = workspacePath.replace(/\\/g, '/');
  
  // Filter for TS/JS source files and build absolute paths
  const absoluteFiles = files
    .filter(f => f.endsWith('.ts') || f.endsWith('.tsx') || f.endsWith('.js') || f.endsWith('.jsx'))
    .map(f => path.join(cleanWorkspace, f).replace(/\\/g, '/'));
  
  // Load source files into compiler AST project
  absoluteFiles.forEach(absPath => {
    if (fs.existsSync(absPath)) {
      try {
        project.addSourceFileAtPath(absPath);
      } catch (e) {
        console.error('[AST Parser] Failed to add source file:', absPath, e);
      }
    }
  });

  const nodes: CallGraphNode[] = [];
  const edges: CallGraphEdge[] = [];
  const fileToNodeId = new Map<string, string>();
  const cleanWorkspaceName = cleanWorkspace.split('/').pop() || 'local-repo';
  const repoId = `repo-${cleanWorkspaceName}`;
  const commitSha = 'local-commit';

  // Create code graph nodes representing files
  files.forEach((file, idx) => {
    const filename = file.split('/').pop() || file;
    const cleanName = filename.replace(/\.[^/.]+$/, "");
    let type: 'ui' | 'api' | 'service' | 'db' | 'external' | 'worker' = 'service';
    const pathLower = file.toLowerCase();

    if (pathLower.includes('page') || pathLower.includes('layout') || pathLower.includes('view') || pathLower.endsWith('.css') || pathLower.includes('screen') || pathLower.includes('component') || pathLower.includes('components/')) {
      type = 'ui';
    } else if (pathLower.includes('controller') || pathLower.includes('route') || pathLower.includes('api/')) {
      type = 'api';
    } else if (pathLower.includes('db/') || pathLower.includes('model') || pathLower.includes('entity') || pathLower.includes('repository') || pathLower.includes('schema') || pathLower.includes('db-') || pathLower.includes('database')) {
      type = 'db';
    } else if (pathLower.includes('cron') || pathLower.includes('worker') || pathLower.includes('job') || pathLower.includes('task')) {
      type = 'worker';
    } else if (pathLower.includes('adapter') || pathLower.includes('external') || pathLower.includes('client') || pathLower.includes('sdk')) {
      type = 'external';
    }

    const devRoster = [
      { name: 'Sarah Chen', role: 'Frontend Lead', avatar: 'SC' },
      { name: 'Alex River', role: 'API Lead', avatar: 'AR' },
      { name: 'Dave Miller', role: 'Logistics Dev', avatar: 'DM' },
      { name: 'Marcus Vance', role: 'Payment Specialist', avatar: 'MV' },
      { name: 'Elena Rostova', role: 'Backend Staff', avatar: 'ER' }
    ];
    const developer = devRoster[idx % devRoster.length];

    const nodeId = `${repoId}:${commitSha}:${file}`;
    fileToNodeId.set(file.replace(/\\/g, '/'), nodeId);

    nodes.push({
      id: nodeId,
      label: cleanName,
      file,
      type,
      developer,
      note: `Parsed AST module: ${cleanName}.`
    });
  });

  // Map imports and call expressions using compiler-resolved targets
  project.getSourceFiles().forEach(sourceFile => {
    const sourceRelativePath = path.relative(cleanWorkspace, sourceFile.getFilePath()).replace(/\\/g, '/');
    const sourceNodeId = fileToNodeId.get(sourceRelativePath);
    if (!sourceNodeId) return;

    // Scan all import declarations in the file
    sourceFile.getImportDeclarations().forEach(imp => {
      try {
        // Use ts-morph native compiler resolution to resolve alias paths and index imports
        const targetSourceFile = imp.getModuleSpecifierSourceFile();
        if (targetSourceFile) {
          const targetRelativePath = path.relative(cleanWorkspace, targetSourceFile.getFilePath()).replace(/\\/g, '/');
          const targetNodeId = fileToNodeId.get(targetRelativePath);
          
          if (targetNodeId && sourceNodeId !== targetNodeId) {
            // Draw import relationship edge
            const exists = edges.some(e => e.from === sourceNodeId && e.to === targetNodeId);
            if (!exists) {
              edges.push({
                from: sourceNodeId,
                to: targetNodeId,
                label: 'imports',
                animated: true
              });
            }

            // Trace named imports to verify actual function call invocations
            const importedNames = new Set<string>();
            imp.getNamedImports().forEach(named => {
              importedNames.add(named.getName());
            });
            const defaultImport = imp.getDefaultImport();
            if (defaultImport) {
              importedNames.add(defaultImport.getText());
            }

            if (importedNames.size > 0) {
              sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression).forEach(callExpr => {
                const expr = callExpr.getExpression();
                const exprText = expr.getText();
                
                // If it's a direct call (e.g. 'login()') or property access call (e.g. 'auth.login()')
                for (const imported of importedNames) {
                  if (exprText === imported || exprText.startsWith(imported + '.')) {
                    // Update edge label to show actual function call connection
                    const edgeIndex = edges.findIndex(e => e.from === sourceNodeId && e.to === targetNodeId);
                    if (edgeIndex !== -1) {
                      edges[edgeIndex].label = `calls ${exprText.split('.').pop()}()`;
                    }
                  }
                }
              });
            }
          }
        }
      } catch (e) {
        console.error('[AST Parser] Failed to parse import relation:', e);
      }
    });
  });



  return { nodes, edges };
}
