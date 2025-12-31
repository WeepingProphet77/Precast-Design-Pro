
import React, { useState, useEffect, useRef } from "react";
import { Stage, Layer, Rect, Circle, Text, Group, Line, Path, Transformer } from "react-konva";
import { useProject } from "@/lib/store";
import { Panel, ConnectionNode, Vertex, Opening, SketchLine } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { calculateLoadCombinations } from "@/lib/calculations";
import { 
  Plus, Trash2, ZoomIn, ZoomOut, MousePointer2, PenTool, 
  Square, Circle as CircleIcon, CornerUpLeft, GripHorizontal,
  BoxSelect, Move, Ruler
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Separator } from "@/components/ui/separator";

// Helper to generate path for rounded polygon
const getRoundedPolygonPath = (vertices: Vertex[]) => {
  if (vertices.length < 3) return "";

  let path = "";
  const len = vertices.length;

  for (let i = 0; i < len; i++) {
    const prev = vertices[(i - 1 + len) % len];
    const curr = vertices[i];
    const next = vertices[(i + 1) % len];

    const r = curr.radius || 0;

    if (i === 0) {
       path += `M ${curr.x} ${curr.y} `;
    } else {
       path += `L ${curr.x} ${curr.y} `;
    }
  }
  path += "Z";
  return path;
};

// Advanced Path Generator with Fillets
const getAdvancedPath = (vertices: Vertex[]) => {
  if (vertices.length < 3) return "";
  
  let d = "";
  const len = vertices.length;

  for (let i = 0; i < len; i++) {
    const curr = vertices[i];
    const next = vertices[(i + 1) % len];
    
    // Vector curr -> next
    // For now, straight lines.
    if (i === 0) d += `M ${curr.x} ${curr.y}`;
    else d += ` L ${curr.x} ${curr.y}`;
  }
  d += " Z";
  return d;
}

export default function PanelDesigner() {
  const { project, updatePanel, addPanel, deletePanel, updateConnection, addConnection, deleteConnection } = useProject();
  const [activePanelId, setActivePanelId] = useState<string>(project.panels[0]?.id || "");
  const [activePanel, setActivePanel] = useState<Panel | undefined>(undefined);
  
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const [selectedVertexId, setSelectedVertexId] = useState<string | null>(null);
  const [selectedOpeningId, setSelectedOpeningId] = useState<string | null>(null);
  const [selectedSketchLineId, setSelectedSketchLineId] = useState<string | null>(null);
  
  const [scale, setScale] = useState(3);
  const [tool, setTool] = useState<"select" | "vertex" | "rect_opening" | "circle_opening" | "connection" | "sketch_line">("select");
  const [isDragging, setIsDragging] = useState(false);
  
  // Sketching State
  const [isDrawingLine, setIsDrawingLine] = useState(false);
  const [currentLineStart, setCurrentLineStart] = useState<{x: number, y: number} | null>(null);
  const [currentMousePos, setCurrentMousePos] = useState<{x: number, y: number} | null>(null);

  // Sync active panel state
  useEffect(() => {
    const p = project.panels.find(p => p.id === activePanelId);
    if (p) setActivePanel(p);
    else if (project.panels.length > 0) setActivePanelId(project.panels[0].id);
  }, [project.panels, activePanelId]);

  if (!activePanel) return <div className="p-8">Loading...</div>;

  const canvasPadding = 100;

  // Handlers
  const handleVertexDrag = (id: string, newX: number, newY: number) => {
    const p = activePanel.perimeter.map(v => v.id === id ? { ...v, x: newX, y: newY } : v);
    // Auto-update width/height bounds
    const xs = p.map(v => v.x);
    const ys = p.map(v => v.y);
    const width = Math.max(...xs) - Math.min(...xs);
    const height = Math.max(...ys) - Math.min(...ys);
    
    updatePanel({ ...activePanel, perimeter: p, width, height });
  };

  const addOpening = (type: "rect" | "circle") => {
    const newOpening: Opening = {
      id: crypto.randomUUID(),
      type,
      x: 24,
      y: 24,
      width: 24,
      height: 24
    };
    updatePanel({ ...activePanel, openings: [...activePanel.openings, newOpening] });
    setSelectedOpeningId(newOpening.id);
    setTool("select");
  };

  const handleStageMouseDown = (e: any) => {
      const stage = e.target.getStage();
      const pos = stage.getPointerPosition();
      const x = Math.round((pos.x - canvasPadding) / scale);
      const y = Math.round((pos.y - canvasPadding) / scale);

      if (tool === "sketch_line") {
          setIsDrawingLine(true);
          setCurrentLineStart({ x, y });
          setCurrentMousePos({ x, y });
      }
  };

  const handleStageMouseMove = (e: any) => {
      if (!isDrawingLine) return;
      const stage = e.target.getStage();
      const pos = stage.getPointerPosition();
      const x = Math.round((pos.x - canvasPadding) / scale);
      const y = Math.round((pos.y - canvasPadding) / scale);
      setCurrentMousePos({ x, y });
  };

  const handleStageMouseUp = (e: any) => {
      if (isDrawingLine && currentLineStart && currentMousePos) {
          const newLine: SketchLine = {
              id: crypto.randomUUID(),
              x1: currentLineStart.x,
              y1: currentLineStart.y,
              x2: currentMousePos.x,
              y2: currentMousePos.y
          };
          updatePanel({
              ...activePanel,
              sketchLines: [...(activePanel.sketchLines || []), newLine]
          });
          setIsDrawingLine(false);
          setCurrentLineStart(null);
          setCurrentMousePos(null);
      }
  };

  const handleStageClick = (e: any) => {
    const clickedOnEmpty = e.target === e.target.getStage();
    if (clickedOnEmpty) {
      setSelectedConnectionId(null);
      setSelectedVertexId(null);
      setSelectedOpeningId(null);
      setSelectedSketchLineId(null);
      
      if (tool === "connection") {
        // Add connection at clicked pos
        const pos = e.target.getStage().getPointerPosition();
        const stage = e.target.getStage();
        
        // We use manual scale prop on shapes, not stage
        // Local x = (stageX - groupX) / scale
        const x = Math.round((pos.x - canvasPadding) / scale);
        const y = Math.round((pos.y - canvasPadding) / scale);
        
        const id = crypto.randomUUID();
        addConnection(activePanel.id, {
            id,
            label: `C-${activePanel.connections.length + 1}`,
            type: "A",
            x,
            y,
            forces: { D: {x:0,y:0,z:0}, L: {x:0,y:0,z:0}, W: {x:0,y:0,z:0}, E: {x:0,y:0,z:0} }
        });
        setSelectedConnectionId(id);
        setTool("select");
      }
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="h-16 border-b bg-card flex items-center px-4 gap-4 justify-between shrink-0 shadow-sm z-10">
        <div className="flex items-center gap-3">
            <Select value={activePanelId} onValueChange={setActivePanelId}>
                <SelectTrigger className="w-[180px] h-9">
                    <SelectValue placeholder="Select Panel" />
                </SelectTrigger>
                <SelectContent>
                    {project.panels.map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
            <Separator orientation="vertical" className="h-8" />
            <ToggleGroup type="single" value={tool} onValueChange={(v) => v && setTool(v as any)}>
                <ToggleGroupItem value="select" aria-label="Select" title="Select / Move">
                    <MousePointer2 className="w-4 h-4" />
                </ToggleGroupItem>
                <ToggleGroupItem value="vertex" aria-label="Edit Vertices" title="Edit Vertices">
                    <GripHorizontal className="w-4 h-4" />
                </ToggleGroupItem>
                 <ToggleGroupItem value="sketch_line" aria-label="Sketch Line" title="Sketch Dimension Line">
                    <Ruler className="w-4 h-4" />
                </ToggleGroupItem>
                <ToggleGroupItem value="connection" aria-label="Add Connection" title="Add Connection">
                    <BoxSelect className="w-4 h-4" />
                </ToggleGroupItem>
            </ToggleGroup>
            
            <Separator orientation="vertical" className="h-8" />
            
            <div className="flex gap-1">
                <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => addOpening("rect")} title="Add Rect Opening">
                    <Square className="w-4 h-4" />
                </Button>
                <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => addOpening("circle")} title="Add Round Opening">
                    <CircleIcon className="w-4 h-4" />
                </Button>
            </div>
        </div>

        <div className="flex items-center gap-4">
            <div className="flex items-center gap-1 bg-muted rounded-md p-1">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setScale(Math.max(1, scale - 0.5))}>
                    <ZoomOut className="w-3 h-3" />
                </Button>
                <span className="text-xs font-mono min-w-[30px] text-center">{Math.round(scale * 100 / 3)}%</span>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setScale(Math.min(6, scale + 0.5))}>
                    <ZoomIn className="w-3 h-3" />
                </Button>
            </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Canvas Area */}
        <div className="flex-1 bg-slate-100/50 relative overflow-auto grid-bg flex items-center justify-center p-8">
             <div className="shadow-xl bg-white relative ring-1 ring-black/5">
                 <Stage 
                    width={activePanel.width * scale + canvasPadding * 2} 
                    height={activePanel.height * scale + canvasPadding * 2}
                    onClick={handleStageClick}
                    onMouseDown={handleStageMouseDown}
                    onMouseMove={handleStageMouseMove}
                    onMouseUp={handleStageMouseUp}
                 >
                    <Layer>
                        <Group x={canvasPadding} y={canvasPadding}>
                            {/* Panel Shape */}
                            <Path
                                data={getAdvancedPath(activePanel.perimeter)}
                                scale={{ x: scale, y: scale }}
                                fill="#ECF0F1"
                                stroke="#2C3E50"
                                strokeWidth={2 / scale} // visual constant width
                                lineJoin="round"
                            />

                            {/* Sketch Lines */}
                            {(activePanel.sketchLines || []).map((line) => {
                                const dx = line.x2 - line.x1;
                                const dy = line.y2 - line.y1;
                                const length = Math.sqrt(dx * dx + dy * dy).toFixed(1);
                                const midX = (line.x1 + line.x2) / 2;
                                const midY = (line.y1 + line.y2) / 2;
                                
                                return (
                                    <Group 
                                        key={line.id}
                                        onClick={(e) => {
                                            e.cancelBubble = true;
                                            setSelectedSketchLineId(line.id);
                                            setSelectedConnectionId(null);
                                            setSelectedOpeningId(null);
                                            setSelectedVertexId(null);
                                        }}
                                    >
                                        <Line
                                            points={[line.x1 * scale, line.y1 * scale, line.x2 * scale, line.y2 * scale]}
                                            stroke={selectedSketchLineId === line.id ? "#E74C3C" : "#95A5A6"}
                                            strokeWidth={2}
                                            dash={[5, 5]}
                                        />
                                        {/* Dimension Label */}
                                        <Rect
                                             x={midX * scale - 20}
                                             y={midY * scale - 10}
                                             width={40}
                                             height={20}
                                             fill="white"
                                             opacity={0.8}
                                             cornerRadius={4}
                                        />
                                        <Text
                                            x={midX * scale - 20}
                                            y={midY * scale - 5}
                                            width={40}
                                            text={`${length}"`}
                                            fontSize={12}
                                            fontFamily="Roboto Mono"
                                            fill="#2C3E50"
                                            align="center"
                                        />
                                    </Group>
                                );
                            })}
                            
                            {/* Temporary Drawing Line */}
                            {isDrawingLine && currentLineStart && currentMousePos && (
                                <Group>
                                    <Line
                                        points={[currentLineStart.x * scale, currentLineStart.y * scale, currentMousePos.x * scale, currentMousePos.y * scale]}
                                        stroke="#E74C3C"
                                        strokeWidth={2}
                                        dash={[5, 5]}
                                    />
                                     <Text
                                        x={currentMousePos.x * scale + 10}
                                        y={currentMousePos.y * scale + 10}
                                        text={`${Math.sqrt(Math.pow(currentMousePos.x - currentLineStart.x, 2) + Math.pow(currentMousePos.y - currentLineStart.y, 2)).toFixed(1)}"`}
                                        fontSize={12}
                                        fontFamily="Roboto Mono"
                                        fill="#E74C3C"
                                    />
                                </Group>
                            )}

                            {/* Openings (Visual Holes) */}
                            {activePanel.openings.map(op => (
                                <Group
                                    key={op.id}
                                    x={op.x * scale}
                                    y={op.y * scale}
                                    draggable={tool === "select"}
                                    onDragEnd={(e) => {
                                        const newX = Math.round(e.target.x() / scale);
                                        const newY = Math.round(e.target.y() / scale);
                                        const newOps = activePanel.openings.map(o => o.id === op.id ? { ...o, x: newX, y: newY } : o);
                                        updatePanel({ ...activePanel, openings: newOps });
                                    }}
                                    onClick={(e) => {
                                        e.cancelBubble = true;
                                        setSelectedOpeningId(op.id);
                                        setSelectedConnectionId(null);
                                        setSelectedSketchLineId(null);
                                    }}
                                >
                                    {op.type === "rect" ? (
                                        <Rect
                                            width={op.width * scale}
                                            height={op.height * scale}
                                            fill="#e2e8f0" // slightly darker than bg to look like hole, or white
                                            stroke={selectedOpeningId === op.id ? "#3498DB" : "#94a3b8"}
                                            strokeWidth={1}
                                            strokeDash={[4, 4]}
                                        />
                                    ) : (
                                        <Circle
                                            radius={(op.width / 2) * scale}
                                            fill="#e2e8f0"
                                            stroke={selectedOpeningId === op.id ? "#3498DB" : "#94a3b8"}
                                            strokeWidth={1}
                                            strokeDash={[4, 4]}
                                            offset={{ x: -(op.width/2)*scale, y: -(op.height/2)*scale }} // center correction for circle group pos
                                        />
                                    )}
                                    {/* Dimensions text for opening */}
                                    <Text
                                        y={-15}
                                        text={`${op.width}"x${op.height}"`}
                                        fontSize={10}
                                        fill="#64748b"
                                    />
                                </Group>
                            ))}
                            
                            {/* Connection Nodes */}
                            {activePanel.connections.map(conn => (
                                <Group
                                    key={conn.id}
                                    x={conn.x * scale}
                                    y={conn.y * scale}
                                    draggable={tool === "select"}
                                    onDragEnd={(e) => {
                                        const x = Math.round(e.target.x() / scale);
                                        const y = Math.round(e.target.y() / scale);
                                        updateConnection(activePanel.id, { ...conn, x, y });
                                    }}
                                    onClick={(e) => {
                                        e.cancelBubble = true;
                                        setSelectedConnectionId(conn.id);
                                        setSelectedOpeningId(null);
                                        setSelectedVertexId(null);
                                        setSelectedSketchLineId(null);
                                    }}
                                >
                                    <Circle 
                                        radius={10}
                                        fill={selectedConnectionId === conn.id ? "#3498DB" : "white"}
                                        stroke="#2C3E50"
                                        strokeWidth={2}
                                        shadowBlur={selectedConnectionId === conn.id ? 10 : 0}
                                        shadowColor="#3498DB"
                                    />
                                    <Line points={[-5, 0, 5, 0]} stroke={selectedConnectionId === conn.id ? "white" : "#2C3E50"} strokeWidth={1.5} />
                                    <Line points={[0, -5, 0, 5]} stroke={selectedConnectionId === conn.id ? "white" : "#2C3E50"} strokeWidth={1.5} />

                                    <Group y={-24}>
                                        <Rect
                                            x={-20}
                                            y={-14}
                                            width={40}
                                            height={18}
                                            fill="#2C3E50"
                                            cornerRadius={4}
                                            opacity={0.9}
                                        />
                                        <Text
                                            x={-20}
                                            y={-11}
                                            width={40}
                                            text={conn.label}
                                            fontSize={11}
                                            fontFamily="Roboto Mono"
                                            fill="white"
                                            align="center"
                                        />
                                    </Group>
                                </Group>
                            ))}

                            {/* Vertices Editor */}
                            {(tool === "vertex") && activePanel.perimeter.map((v, i) => (
                                <Circle
                                    key={v.id}
                                    x={v.x * scale}
                                    y={v.y * scale}
                                    radius={6}
                                    fill="white"
                                    stroke="#E74C3C"
                                    strokeWidth={2}
                                    draggable
                                    onDragMove={(e) => {
                                        // Live update visual only? No, let's update state for smoothness
                                    }}
                                    onDragEnd={(e) => {
                                        const x = Math.round(e.target.x() / scale);
                                        const y = Math.round(e.target.y() / scale);
                                        handleVertexDrag(v.id, x, y);
                                    }}
                                    onClick={(e) => {
                                        e.cancelBubble = true;
                                        setSelectedVertexId(v.id);
                                    }}
                                />
                            ))}

                        </Group>
                    </Layer>
                 </Stage>
             </div>
        </div>

        {/* Properties Panel */}
        <div className="w-[400px] border-l bg-card flex flex-col shrink-0">
             {selectedConnectionId ? (
                <ConnectionProperties panelId={activePanel.id} connectionId={selectedConnectionId} />
             ) : selectedOpeningId ? (
                <div className="p-4">
                    <h3 className="font-bold text-lg mb-4">Opening Properties</h3>
                    {(() => {
                        const op = activePanel.openings.find(o => o.id === selectedOpeningId);
                        if (!op) return null;
                        return (
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <Label>X Position</Label>
                                        <Input type="number" value={op.x} onChange={e => {
                                            const val = Number(e.target.value);
                                            const newOps = activePanel.openings.map(o => o.id === op.id ? { ...o, x: val } : o);
                                            updatePanel({...activePanel, openings: newOps});
                                        }} />
                                    </div>
                                    <div>
                                        <Label>Y Position</Label>
                                        <Input type="number" value={op.y} onChange={e => {
                                            const val = Number(e.target.value);
                                            const newOps = activePanel.openings.map(o => o.id === op.id ? { ...o, y: val } : o);
                                            updatePanel({...activePanel, openings: newOps});
                                        }} />
                                    </div>
                                    <div>
                                        <Label>Width</Label>
                                        <Input type="number" value={op.width} onChange={e => {
                                            const val = Number(e.target.value);
                                            const newOps = activePanel.openings.map(o => o.id === op.id ? { ...o, width: val } : o);
                                            updatePanel({...activePanel, openings: newOps});
                                        }} />
                                    </div>
                                    <div>
                                        <Label>Height</Label>
                                        <Input type="number" value={op.height} onChange={e => {
                                            const val = Number(e.target.value);
                                            const newOps = activePanel.openings.map(o => o.id === op.id ? { ...o, height: val } : o);
                                            updatePanel({...activePanel, openings: newOps});
                                        }} />
                                    </div>
                                </div>
                                <Button variant="destructive" className="w-full mt-4" onClick={() => {
                                    const newOps = activePanel.openings.filter(o => o.id !== op.id);
                                    updatePanel({...activePanel, openings: newOps});
                                    setSelectedOpeningId(null);
                                }}>
                                    <Trash2 className="w-4 h-4 mr-2" /> Remove Opening
                                </Button>
                            </div>
                        );
                    })()}
                </div>
             ) : selectedVertexId ? (
                <div className="p-4">
                    <h3 className="font-bold text-lg mb-4">Vertex Properties</h3>
                    {(() => {
                         const v = activePanel.perimeter.find(ver => ver.id === selectedVertexId);
                         if (!v) return null;
                         return (
                             <div className="space-y-4">
                                 <div className="grid grid-cols-2 gap-4">
                                     <div>
                                         <Label>X Position</Label>
                                         <Input type="number" value={v.x} onChange={e => handleVertexDrag(v.id, Number(e.target.value), v.y)} />
                                     </div>
                                     <div>
                                         <Label>Y Position</Label>
                                         <Input type="number" value={v.y} onChange={e => handleVertexDrag(v.id, v.x, Number(e.target.value))} />
                                     </div>
                                 </div>
                                 <div>
                                     <Label>Corner Radius (Fillet)</Label>
                                     <Input 
                                        type="number" 
                                        value={v.radius || 0} 
                                        onChange={e => {
                                            const r = Number(e.target.value);
                                            const p = activePanel.perimeter.map(ver => ver.id === v.id ? { ...ver, radius: r } : ver);
                                            updatePanel({ ...activePanel, perimeter: p });
                                        }} 
                                    />
                                    <p className="text-xs text-muted-foreground mt-1">
                                        Enter a value greater than 0 to create a rounded corner.
                                    </p>
                                 </div>
                             </div>
                         )
                    })()}
                </div>
             ) : selectedSketchLineId ? (
                <div className="p-4">
                   <h3 className="font-bold text-lg mb-4">Sketch Line Properties</h3>
                   {(() => {
                       const line = (activePanel.sketchLines || []).find(l => l.id === selectedSketchLineId);
                       if (!line) return null;
                       const length = Math.sqrt(Math.pow(line.x2 - line.x1, 2) + Math.pow(line.y2 - line.y1, 2)).toFixed(2);
                       return (
                           <div className="space-y-4">
                               <div className="p-4 bg-muted/20 rounded border">
                                   <div className="text-xs text-muted-foreground uppercase font-bold mb-1">Length</div>
                                   <div className="text-2xl font-mono">{length}"</div>
                               </div>
                               <Button variant="destructive" className="w-full" onClick={() => {
                                   const newLines = (activePanel.sketchLines || []).filter(l => l.id !== line.id);
                                   updatePanel({ ...activePanel, sketchLines: newLines });
                                   setSelectedSketchLineId(null);
                               }}>
                                   <Trash2 className="w-4 h-4 mr-2" /> Delete Line
                               </Button>
                           </div>
                       )
                   })()}
                </div>
             ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8 text-center bg-muted/5">
                     <MousePointer2 className="w-12 h-12 mb-4 opacity-20" />
                     <p className="font-medium">Selection Mode</p>
                     <p className="text-sm opacity-70 mt-2">
                        Select an element to edit properties.<br/>
                        Use toolbar to switch between Editing Vertices, Placing Connections, Adding Openings, or Sketching Lines.
                     </p>
                 </div>
             )}
        </div>
      </div>
    </div>
  );
}

// Subcomponent for Connection Properties (refactored for cleanliness)
function ConnectionProperties({ panelId, connectionId }: { panelId: string, connectionId: string }) {
    const { project, updateConnection, deleteConnection } = useProject();
    const activePanel = project.panels.find(p => p.id === panelId);
    const connection = activePanel?.connections.find(c => c.id === connectionId);

    if (!connection || !activePanel) return null;

    return (
        <Tabs defaultValue="forces" className="flex-1 flex flex-col">
            <div className="p-4 border-b bg-muted/20">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-lg text-primary">Connection Properties</h3>
                    <Button variant="ghost" size="sm" onClick={() => deleteConnection(panelId, connectionId)}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <Label>Label</Label>
                        <Input 
                            value={connection.label} 
                            onChange={(e) => updateConnection(panelId, {...connection, label: e.target.value})}
                            className="font-mono"
                        />
                    </div>
                    <div>
                        <Label>Type</Label>
                        <Select 
                            value={connection.type} 
                            onValueChange={(val) => updateConnection(panelId, {...connection, type: val})}
                        >
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                {project.capacities.map(c => <SelectItem key={c.type} value={c.type}>{c.type}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </div>

            <TabsList className="w-full rounded-none border-b">
                <TabsTrigger value="forces" className="flex-1">Forces</TabsTrigger>
                <TabsTrigger value="results" className="flex-1">Results</TabsTrigger>
            </TabsList>

            <TabsContent value="forces" className="flex-1 p-0 overflow-auto">
                <ScrollArea className="h-full p-4">
                    <div className="space-y-6">
                        {["D", "L", "W", "E"].map((loadType) => (
                            <div key={loadType} className="border rounded-md p-3 relative group">
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="font-bold w-6 h-6 rounded bg-primary text-primary-foreground flex items-center justify-center text-xs">
                                        {loadType}
                                    </span>
                                    <span className="text-sm font-medium">
                                        {loadType === "D" ? "Dead" : loadType === "L" ? "Live" : loadType === "W" ? "Wind" : "Seismic"}
                                    </span>
                                </div>
                                <div className="grid grid-cols-3 gap-2">
                                    {["x", "y", "z"].map((axis) => (
                                        <div key={axis}>
                                            <Label className="text-[10px] uppercase text-muted-foreground font-bold">{axis}-Axis</Label>
                                            <Input 
                                                type="number" 
                                                className="h-8 font-mono text-xs" 
                                                value={connection.forces[loadType as keyof typeof connection.forces]?.[axis as 'x'|'y'|'z'] || 0}
                                                onChange={(e) => {
                                                    const val = Number(e.target.value);
                                                    const newForces = { ...connection.forces };
                                                    // @ts-ignore
                                                    newForces[loadType] = { ...newForces[loadType], [axis]: val };
                                                    updateConnection(panelId, { ...connection, forces: newForces });
                                                }}
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </ScrollArea>
            </TabsContent>

            <TabsContent value="results" className="flex-1 p-0 overflow-auto bg-muted/10">
                 <div className="p-4">
                    <h4 className="text-sm font-semibold mb-3">LRFD Combinations</h4>
                    <div className="space-y-2">
                        {calculateLoadCombinations(
                            connection, 
                            project.capacities.find(c => c.type === connection.type)
                        ).map((combo, idx) => (
                            <div key={idx} className="bg-white border rounded p-2 text-xs shadow-sm">
                                <div className="flex justify-between font-semibold mb-1 border-b pb-1">
                                    <span className="text-primary truncate mr-2" title={combo.comboName}>{combo.comboName}</span>
                                    {combo.maxUtilization !== undefined && (
                                        <span className={cn(
                                            "font-mono whitespace-nowrap",
                                            combo.maxUtilization > 1 ? "text-destructive font-bold" : 
                                            combo.maxUtilization > 0.9 ? "text-warning" : "text-success"
                                        )}>
                                            UC: {combo.maxUtilization.toFixed(2)}
                                        </span>
                                    )}
                                </div>
                                <div className="grid grid-cols-3 gap-2 font-mono text-muted-foreground pt-1">
                                    <div className="flex flex-col"><span className="text-[10px] uppercase">Fx</span> <span className="text-foreground">{combo.fx}</span></div>
                                    <div className="flex flex-col"><span className="text-[10px] uppercase">Fy</span> <span className="text-foreground">{combo.fy}</span></div>
                                    <div className="flex flex-col"><span className="text-[10px] uppercase">Fz</span> <span className="text-foreground">{combo.fz}</span></div>
                                </div>
                            </div>
                        ))}
                    </div>
                 </div>
            </TabsContent>
        </Tabs>
    );
}

// Utility to merge classes
import { cn } from "@/lib/utils";
