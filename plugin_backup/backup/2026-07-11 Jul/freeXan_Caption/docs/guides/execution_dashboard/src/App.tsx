import React, { useState, useCallback, useMemo, useEffect } from 'react';
import ReactFlow, {
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  MarkerType,
  Handle,
  Position,
} from 'reactflow';
import type { NodeProps, Edge, Node } from 'reactflow';
import 'reactflow/dist/style.css';
import './App.css';
import { Search, ChevronLeft, ChevronRight, RotateCcw, MousePointer2, Info, X } from 'lucide-react';
import { CONTAINERS, NODES_DEF, BRANCHES } from './data';
import type { NodeDef, Branch } from './data';

// --- Custom Node Components ---
const FunctionNode = ({ data, selected }: NodeProps) => {
  return (
    <div className={`custom-node ${data.isHighlighted ? 'highlighted' : ''} ${selected ? 'selected' : ''}`}>
      <Handle type="target" position={Position.Left} />
      <div className="node-content">
        <div className="node-label">{data.label}</div>
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
};

const nodeTypes = {
  function: FunctionNode,
};

// --- App Component ---
export default function App() {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [search, setSearch] = useState('');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [activeBranchIds, setActiveBranchIds] = useState<string[]>([]);
  const [selectedNode, setSelectedNode] = useState<NodeDef | null>(null);

  // Initialize nodes and edges
  useEffect(() => {
    const initialNodes: Node[] = [];
    const initialEdges: Edge[] = [];

    // Calculate layout
    const COL_WIDTH = 500;
    const ROW_HEIGHT = 70;
    const CONTAINER_PADDING = 80;
    
    const containerOffsets: Record<string, number> = {};
    let currentY = 0;
    
    // Group nodes by container to determine height
    const containerNodeMap: Record<string, NodeDef[]> = {};
    NODES_DEF.forEach(n => {
      if (!containerNodeMap[n.container]) containerNodeMap[n.container] = [];
      containerNodeMap[n.container].push(n);
    });

    // Create container groups and their child nodes
    const columns: Record<number, string[]> = {};
    CONTAINERS.forEach(c => {
      if (!columns[c.column]) columns[c.column] = [];
      columns[c.column].push(c.id);
    });

    Object.keys(columns).forEach(colStr => {
      const col = parseInt(colStr);
      let colY = 50;
      
      columns[col].forEach(cid => {
        const container = CONTAINERS.find(c => c.id === cid)!;
        const nodesInContainer = containerNodeMap[cid] || [];
        const containerHeight = nodesInContainer.length * ROW_HEIGHT + 60;
        
        // Add container group node
        initialNodes.push({
          id: `group-${cid}`,
          type: 'group',
          data: { label: container.label },
          position: { x: col * COL_WIDTH, y: colY },
          style: {
            width: 400,
            height: containerHeight,
            backgroundColor: 'rgba(20, 20, 35, 0.4)',
            border: `2px solid ${container.accent}`,
            borderRadius: 16,
            zIndex: -1,
          },
        });

        // Add header label for group
        initialNodes.push({
          id: `label-${cid}`,
          data: { label: container.label },
          position: { x: 15, y: 10 },
          parentId: `group-${cid}`,
          draggable: false,
          selectable: false,
          style: {
            background: 'none',
            border: 'none',
            color: '#fff',
            fontWeight: 'bold',
            fontSize: 14,
            pointerEvents: 'none',
          },
        });

        // Add function nodes
        nodesInContainer.forEach((n, i) => {
          initialNodes.push({
            id: n.id,
            type: 'function',
            data: { label: n.label, detail: n.detail, isHighlighted: false },
            position: { x: 20, y: 50 + i * ROW_HEIGHT },
            parentId: `group-${cid}`,
            extent: 'parent',
          });
        });

        colY += containerHeight + CONTAINER_PADDING;
      });
    });

    setNodes(initialNodes);
  }, [setNodes]);

  // Update edges and node highlights when active branches change
  useEffect(() => {
    if (activeBranchIds.length === 0) {
      setEdges([]);
      setNodes(prev => prev.map(n => ({
        ...n,
        data: { ...n.data, isHighlighted: false }
      })));
      return;
    }

    const newEdges: Edge[] = [];
    const highlightedNodeIds = new Set<string>();

    activeBranchIds.forEach(bid => {
      const branch = BRANCHES.find(b => b.id === bid);
      if (!branch) return;

      branch.steps.forEach(sid => highlightedNodeIds.add(sid));

      for (let i = 0; i < branch.steps.length - 1; i++) {
        const source = branch.steps[i];
        const target = branch.steps[i + 1];
        
        // Check if edge already exists to avoid duplication
        const edgeId = `edge-${bid}-${source}-${target}`;
        newEdges.push({
          id: edgeId,
          source,
          target,
          animated: true,
          style: { stroke: branch.color, strokeWidth: activeBranchIds.length > 1 ? 2 : 4 },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: branch.color,
          },
        });
      }
    });

    setEdges(newEdges);
    setNodes(prev => prev.map(n => ({
      ...n,
      data: {
        ...n.data,
        isHighlighted: highlightedNodeIds.has(n.id)
      }
    })));
  }, [activeBranchIds, setEdges, setNodes]);

  const [clickCount, setClickCount] = useState(0);
  const [lastClickTime, setLastClickTime] = useState(0);
  const [relatedBranches, setRelatedBranches] = useState<Branch[]>([]);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    const now = Date.now();
    const isTriple = now - lastClickTime < 500 && clickCount === 2;
    
    if (isTriple) {
      // Triple click logic
      const branches = BRANCHES.filter(b => b.steps.includes(node.id));
      setRelatedBranches(branches);
      setClickCount(0);
      setLastClickTime(0);
    } else {
      // Single/Double click tracking
      if (now - lastClickTime < 300) {
        setClickCount(prev => prev + 1);
      } else {
        setClickCount(1);
      }
      setLastClickTime(now);

      const def = NODES_DEF.find(n => n.id === node.id);
      if (def) {
        setSelectedNode(def);
      } else {
        setSelectedNode(null);
      }
    }
  }, [lastClickTime, clickCount]);

  const filteredBranches = useMemo(() => {
    return BRANCHES.filter(b => b.label.toLowerCase().includes(search.toLowerCase()));
  }, [search]);

  const resetView = () => {
    setActiveBranchIds([]);
    setSelectedNode(null);
  };

  return (
    <div className="dashboard-container">
      {/* Sidebar */}
      <aside className={`sidebar ${isSidebarCollapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-header">
          {!isSidebarCollapsed && <h2>Execution Flows</h2>}
          <button 
            className="btn-icon" 
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          >
            {isSidebarCollapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
          </button>
        </div>

        {!isSidebarCollapsed && (
          <div className="sidebar-content">
            <div className="search-container">
              <input
                type="text"
                className="search-input"
                placeholder="Search branches..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="branch-list">
              {filteredBranches.map(branch => (
                <div
                  key={branch.id}
                  className={`branch-item ${activeBranchIds.includes(branch.id) ? 'active' : ''}`}
                  onClick={() => {
                    setActiveBranchIds(prev => 
                      prev.includes(branch.id) 
                        ? prev.filter(id => id !== branch.id) 
                        : [...prev, branch.id]
                    );
                  }}
                >
                  <div className="branch-dot" style={{ backgroundColor: branch.color }} />
                  <span className="branch-label">{branch.label}</span>
                  <div className={`branch-toggle ${activeBranchIds.includes(branch.id) ? 'on' : ''}`} />
                </div>
              ))}
            </div>
          </div>
        )}
      </aside>

      {/* Main Flow Area */}
      <main className="main-area">
        <div className="toolbar">
          <h1>SubMachine Intelligence Flow</h1>
          <div className="toolbar-controls">
            <button className="btn" onClick={resetView}>
              <RotateCcw size={14} style={{ marginRight: 8 }} />
              Reset View
            </button>
            <button 
              className="btn btn-primary"
              onClick={() => setSelectedNode(null)}
            >
              <MousePointer2 size={14} style={{ marginRight: 8 }} />
              Clear Selection
            </button>
          </div>
        </div>

        <div style={{ flex: 1 }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            nodeTypes={nodeTypes}
            fitView
            minZoom={0.2}
            maxZoom={2}
          >
            <Background color="#1e1e2e" gap={20} />
            <Controls />
          </ReactFlow>
        </div>

        {/* Related Branches Overlay (Triple Click Result) */}
        {relatedBranches.length > 0 && (
          <div className="branches-overlay">
            <div className="overlay-header">
              <h3>Participating Branches</h3>
              <button className="btn-icon" onClick={() => setRelatedBranches([])}>
                <X size={18} />
              </button>
            </div>
            <div className="overlay-content">
              {relatedBranches.map(b => (
                <div 
                  key={b.id} 
                  className="overlay-item"
                  onClick={() => {
                    setActiveBranchIds(prev => 
                      prev.includes(b.id) ? prev : [...prev, b.id]
                    );
                    setRelatedBranches([]);
                  }}
                >
                  <div className="branch-dot" style={{ backgroundColor: b.color }} />
                  <span>{b.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Node Inspector */}
        <div className={`inspector ${selectedNode ? '' : 'hidden'}`}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 15 }}>
            <div style={{ padding: 6, background: 'rgba(153, 153, 204, 0.2)', borderRadius: 6 }}>
              <Info size={16} color="#9999cc" />
            </div>
            <h3 style={{ margin: 0 }}>Node Details</h3>
          </div>
          <h3>{selectedNode?.label}</h3>
          <p>{selectedNode?.detail}</p>
          <div style={{ marginTop: 15, fontSize: 11, color: '#666' }}>
            ID: {selectedNode?.id} | Container: {selectedNode?.container}
          </div>
        </div>
      </main>
    </div>
  );
}
