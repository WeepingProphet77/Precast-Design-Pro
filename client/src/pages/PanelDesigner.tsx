
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
  BoxSelect, Move, Ruler, Maximize
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

import { ResizePanelDialog } from "@/components/ResizePanelDialog";

export default function PanelDesigner() {
  const { project, updatePanel, addPanel, deletePanel, updateConnection, addConnection, deleteConnection } = useProject();
  const [activePanelId, setActivePanelId] = useState<string>(project.panels[0]?.id || "");
  const [activePanel, setActivePanel] = useState<Panel | undefined>(undefined);
  
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const [selectedVertexId, setSelectedVertexId] = useState<string | null>(null);
  const [selectedEdgeIndex, setSelectedEdgeIndex] = useState<number | null>(null);
  const [selectedOpeningId, setSelectedOpeningId] = useState<string | null>(null);
  const [selectedSketchLineId, setSelectedSketchLineId] = useState<string | null>(null);
  
  const [scale, setScale] = useState(3);
  const [tool, setTool] = useState<"select" | "vertex" | "rect_opening" | "circle_opening" | "connection" | "sketch_line">("select");
  const [isDragging, setIsDragging] = useState(false);
  
  // Drawing State (Click-Move-Click)
  const [drawingStep, setDrawingStep] = useState<0 | 1>(0);
  const [drawingStartPos, setDrawingStartPos] = useState<{x: number, y: number} | null>(null);
  const [currentMousePos, setCurrentMousePos] = useState<{x: number, y: number} | null>(null);

  // Sync active panel state
  useEffect(() => {
    const p = project.panels.find(p => p.id === activePanelId);
    if (p) setActivePanel(p);
    else if (project.panels.length > 0) setActivePanelId(project.panels[0].id);
  }, [project.panels, activePanelId]);

  // Reset drawing state when tool changes
  useEffect(() => {
    setDrawingStep(0);
    setDrawingStartPos(null);
  }, [tool]);

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

  const handleStageMouseMove = (e: any) => {
      const stage = e.target.getStage();
      const pos = stage.getPointerPosition();
      const x = Math.round((pos.x - canvasPadding) / scale);
      const y = Math.round((pos.y - canvasPadding) / scale);
      setCurrentMousePos({ x, y });
  };

  const handleStageClick = (e: any) => {
    const clickedOnEmpty = e.target === e.target.getStage();
    
    // Select Tool Logic
    if (tool === "select") {
        if (clickedOnEmpty) {
            setSelectedConnectionId(null);
            setSelectedVertexId(null);
            setSelectedEdgeIndex(null);
            setSelectedOpeningId(null);
            setSelectedSketchLineId(null);
        }
        return;
    }

    // Connection Tool Logic (Simple Click)
    if (tool === "connection") {
        const stage = e.target.getStage();
        const pos = stage.getPointerPosition();
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
        return;
    }

    // Drawing Tools (Rect, Circle, Line) - Click-Move-Click
    if (tool === "rect_opening" || tool === "circle_opening" || tool === "sketch_line") {
        const stage = e.target.getStage();
        const pos = stage.getPointerPosition();
        const x = Math.round((pos.x - canvasPadding) / scale);
        const y = Math.round((pos.y - canvasPadding) / scale);

        if (drawingStep === 0) {
            // Start Drawing
            setDrawingStep(1);
            setDrawingStartPos({ x, y });
        } else {
            // Finish Drawing
            if (!drawingStartPos) return;

            if (tool === "rect_opening") {
                 const minX = Math.min(drawingStartPos.x, x);
                 const minY = Math.min(drawingStartPos.y, y);
                 const width = Math.abs(x - drawingStartPos.x);
                 const height = Math.abs(y - drawingStartPos.y);
                 
                 if (width > 0 && height > 0) {
                     const newOpening: Opening = {
                        id: crypto.randomUUID(),
                        type: "rect",
                        x: minX,
                        y: minY,
                        width,
                        height
                     };
                     updatePanel({ ...activePanel, openings: [...activePanel.openings, newOpening] });
                 }
            } else if (tool === "circle_opening") {
                 const dx = x - drawingStartPos.x;
                 const dy = y - drawingStartPos.y;
                 const radius = Math.sqrt(dx*dx + dy*dy);
                 const diameter = radius * 2;
                 
                 if (radius > 0) {
                     const newOpening: Opening = {
                        id: crypto.randomUUID(),
                        type: "circle",
                        x: drawingStartPos.x - radius,
                        y: drawingStartPos.y - radius,
                        width: diameter,
                        height: diameter
                     };
                     updatePanel({ ...activePanel, openings: [...activePanel.openings, newOpening] });
                 }
            } else if (tool === "sketch_line") {
                 const newLine: SketchLine = {
                    id: crypto.randomUUID(),
                    x1: drawingStartPos.x,
                    y1: drawingStartPos.y,
                    x2: x,
                    y2: y
                 };
                 updatePanel({ ...activePanel, sketchLines: [...(activePanel.sketchLines || []), newLine] });
            }
            
            // Reset and stay in tool (AutoCAD style continuous command) or switch to select?
            // Usually stay in tool.
            setDrawingStep(0);
            setDrawingStartPos(null);
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
                <ToggleGroupItem value="rect_opening" aria-label="Draw Rectangle" title="Draw Rectangular Opening">
                    <Square className="w-4 h-4" />
                </ToggleGroupItem>
                <ToggleGroupItem value="circle_opening" aria-label="Draw Circle" title="Draw Round Opening">
                    <CircleIcon className="w-4 h-4" />
                </ToggleGroupItem>
                <ToggleGroupItem value="connection" aria-label="Add Connection" title="Add Connection">
                    <BoxSelect className="w-4 h-4" />
                </ToggleGroupItem>
            </ToggleGroup>
            
            <Separator orientation="vertical" className="h-8" />
            
            <div className="flex gap-1">
                <ResizePanelDialog 
                    panel={activePanel} 
                    trigger={
                        <Button variant="outline" size="sm" className="h-9 px-3 gap-2" title="Resize Panel Box">
                           <BoxSelect className="w-4 h-4" /> Resize
                        </Button>
                    }
                    onResize={(w, h) => {
                        // Reset to rectangle of size w/h
                        const newPerimeter: Vertex[] = [
                            { id: crypto.randomUUID(), x: 0, y: 0 },
                            { id: crypto.randomUUID(), x: w, y: 0 },
                            { id: crypto.randomUUID(), x: w, y: h },
                            { id: crypto.randomUUID(), x: 0, y: h },
                        ];
                        updatePanel({ ...activePanel, width: w, height: h, perimeter: newPerimeter });
                    }}
                />
            </div>
        </div>

        <div className="flex items-center gap-4">
            <div className="flex items-center gap-1 bg-muted rounded-md p-1">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setScale(Math.max(0.5, scale - 0.5))} title="Zoom Out">
                    <ZoomOut className="w-3 h-3" />
                </Button>
                <Button variant="ghost" className="h-7 px-2 text-xs font-mono min-w-[50px] text-center" onClick={() => setScale(3)} title="Reset Zoom">
                    {Math.round(scale * 100 / 3)}%
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setScale(Math.min(10, scale + 0.5))} title="Zoom In">
                    <ZoomIn className="w-3 h-3" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => {
                    // Calculate scale to fit panel in viewport (approx)
                    // Viewport width ~ screen width - 400 (sidebar) - padding
                    // Height ~ screen height - header - toolbar - padding
                    // This is rough estimation as we don't measure DOM
                    const viewportWidth = window.innerWidth - 700; 
                    const viewportHeight = window.innerHeight - 200;
                    const scaleX = viewportWidth / activePanel.width;
                    const scaleY = viewportHeight / activePanel.height;
                    const fitScale = Math.min(scaleX, scaleY) * 0.8; // 80% fit
                    setScale(Math.max(0.5, fitScale));
                }} title="Zoom to Fit">
                    <Maximize className="w-3 h-3" />
                </Button>
            </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Canvas Area */}
        <div className="flex-1 bg-slate-100/50 relative overflow-auto grid-bg flex items-center justify-center p-8">
             <div 
                className="shadow-xl bg-white relative ring-1 ring-black/5"
                onWheel={(e) => {
                    if (e.ctrlKey || e.metaKey) {
                        e.preventDefault();
                        const delta = e.deltaY > 0 ? -0.2 : 0.2;
                        setScale(s => Math.max(0.2, Math.min(10, s + delta)));
                    }
                }}
             >
                 <Stage 
                    width={activePanel.width * scale + canvasPadding * 2} 
                    height={activePanel.height * scale + canvasPadding * 2}
                    onClick={handleStageClick}
                    onMouseMove={handleStageMouseMove}
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

                            {/* Panel Shape Edges (for selection) */}
                            {tool === "select" && activePanel.perimeter.map((v, i) => {
                                const nextV = activePanel.perimeter[(i + 1) % activePanel.perimeter.length];
                                return (
                                    <Line
                                        key={`edge-${i}`}
                                        points={[v.x * scale, v.y * scale, nextV.x * scale, nextV.y * scale]}
                                        stroke={selectedEdgeIndex === i ? "#E74C3C" : "transparent"}
                                        strokeWidth={selectedEdgeIndex === i ? 4 : 10}
                                        opacity={selectedEdgeIndex === i ? 0.8 : 0}
                                        onMouseEnter={(e) => {
                                            const container = e.target.getStage()?.container();
                                            if (container) container.style.cursor = "pointer";
                                        }}
                                        onMouseLeave={(e) => {
                                            const container = e.target.getStage()?.container();
                                            if (container) container.style.cursor = "default";
                                        }}
                                        onClick={(e) => {
                                            e.cancelBubble = true;
                                            setSelectedEdgeIndex(i);
                                            setSelectedVertexId(null);
                                            setSelectedConnectionId(null);
                                            setSelectedOpeningId(null);
                                            setSelectedSketchLineId(null);
                                        }}
                                    />
                                );
                            })}

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
                            
                            {/* Ghost Drawing Shapes */}
                            {drawingStep === 1 && drawingStartPos && currentMousePos && (
                                <Group>
                                    {tool === "rect_opening" && (
                                        <Group>
                                            <Rect
                                                x={Math.min(drawingStartPos.x, currentMousePos.x) * scale}
                                                y={Math.min(drawingStartPos.y, currentMousePos.y) * scale}
                                                width={Math.abs(currentMousePos.x - drawingStartPos.x) * scale}
                                                height={Math.abs(currentMousePos.y - drawingStartPos.y) * scale}
                                                stroke="#3498DB"
                                                strokeWidth={1}
                                                dash={[5, 5]}
                                                fill="rgba(52, 152, 219, 0.2)"
                                            />
                                            {/* Dimensions */}
                                            <Text
                                                x={Math.min(drawingStartPos.x, currentMousePos.x) * scale}
                                                y={Math.min(drawingStartPos.y, currentMousePos.y) * scale - 20}
                                                text={`${Math.abs(currentMousePos.x - drawingStartPos.x).toFixed(1)}" x ${Math.abs(currentMousePos.y - drawingStartPos.y).toFixed(1)}"`}
                                                fontSize={12}
                                                fill="#3498DB"
                                            />
                                        </Group>
                                    )}
                                    {tool === "circle_opening" && (
                                        <Group>
                                            {/* Center Marker */}
                                            <Circle
                                                x={drawingStartPos.x * scale}
                                                y={drawingStartPos.y * scale}
                                                radius={3}
                                                fill="#3498DB"
                                            />
                                            {/* The Circle being drawn */}
                                            <Circle
                                                x={drawingStartPos.x * scale}
                                                y={drawingStartPos.y * scale}
                                                radius={Math.sqrt(Math.pow(currentMousePos.x - drawingStartPos.x, 2) + Math.pow(currentMousePos.y - drawingStartPos.y, 2)) * scale}
                                                stroke="#3498DB"
                                                strokeWidth={1}
                                                dash={[5, 5]}
                                                fill="rgba(52, 152, 219, 0.2)"
                                            />
                                            {/* Radius Line */}
                                            <Line 
                                                points={[drawingStartPos.x * scale, drawingStartPos.y * scale, currentMousePos.x * scale, currentMousePos.y * scale]}
                                                stroke="#3498DB"
                                                strokeWidth={1}
                                                dash={[2, 2]}
                                            />
                                            {/* Radius Text */}
                                            <Text 
                                                x={currentMousePos.x * scale + 10}
                                                y={currentMousePos.y * scale}
                                                text={`R: ${Math.sqrt(Math.pow(currentMousePos.x - drawingStartPos.x, 2) + Math.pow(currentMousePos.y - drawingStartPos.y, 2)).toFixed(1)}"`}
                                                fontSize={12}
                                                fill="#3498DB"
                                            />
                                        </Group>
                                    )}
                                    {tool === "sketch_line" && (
                                        <Group>
                                            <Line
                                                points={[drawingStartPos.x * scale, drawingStartPos.y * scale, currentMousePos.x * scale, currentMousePos.y * scale]}
                                                stroke="#E74C3C"
                                                strokeWidth={2}
                                                dash={[5, 5]}
                                            />
                                             <Text
                                                x={currentMousePos.x * scale + 10}
                                                y={currentMousePos.y * scale + 10}
                                                text={`${Math.sqrt(Math.pow(currentMousePos.x - drawingStartPos.x, 2) + Math.pow(currentMousePos.y - drawingStartPos.y, 2)).toFixed(1)}"`}
                                                fontSize={12}
                                                fontFamily="Roboto Mono"
                                                fill="#E74C3C"
                                            />
                                        </Group>
                                    )}
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
                                        setSelectedEdgeIndex(null);
                                        setSelectedVertexId(null);
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
                                        setSelectedEdgeIndex(null);
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
                                 
                                 <div className="grid grid-cols-2 gap-4">
                                    <div>
                                         <Label>Move X (+/-)</Label>
                                         <div className="flex gap-1">
                                            <Button variant="outline" size="sm" className="h-8 px-2 flex-1" onClick={() => handleVertexDrag(v.id, v.x - 1, v.y)}>-1"</Button>
                                            <Button variant="outline" size="sm" className="h-8 px-2 flex-1" onClick={() => handleVertexDrag(v.id, v.x + 1, v.y)}>+1"</Button>
                                         </div>
                                    </div>
                                    <div>
                                         <Label>Move Y (+/-)</Label>
                                         <div className="flex gap-1">
                                            <Button variant="outline" size="sm" className="h-8 px-2 flex-1" onClick={() => handleVertexDrag(v.id, v.x, v.y - 1)}>-1"</Button>
                                            <Button variant="outline" size="sm" className="h-8 px-2 flex-1" onClick={() => handleVertexDrag(v.id, v.x, v.y + 1)}>+1"</Button>
                                         </div>
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
                                 
                                 <Separator />
                                 
                                 <div className="grid grid-cols-2 gap-2">
                                     <Button size="sm" variant="secondary" onClick={() => {
                                         // Add vertex after this one (split edge)
                                         const idx = activePanel.perimeter.findIndex(vert => vert.id === v.id);
                                         if (idx === -1) return;
                                         
                                         const nextIdx = (idx + 1) % activePanel.perimeter.length;
                                         const nextV = activePanel.perimeter[nextIdx];
                                         
                                         const newV: Vertex = {
                                             id: crypto.randomUUID(),
                                             x: (v.x + nextV.x) / 2,
                                             y: (v.y + nextV.y) / 2,
                                         };
                                         
                                         const newPerimeter = [...activePanel.perimeter];
                                         newPerimeter.splice(idx + 1, 0, newV);
                                         updatePanel({ ...activePanel, perimeter: newPerimeter });
                                         setSelectedVertexId(newV.id);
                                     }}>
                                         <Plus className="w-3 h-3 mr-2" /> Split Edge
                                     </Button>
                                     <Button size="sm" variant="destructive" disabled={activePanel.perimeter.length <= 3} onClick={() => {
                                         const newPerimeter = activePanel.perimeter.filter(vert => vert.id !== v.id);
                                         updatePanel({ ...activePanel, perimeter: newPerimeter });
                                         setSelectedVertexId(null);
                                     }}>
                                         <Trash2 className="w-3 h-3 mr-2" /> Delete
                                     </Button>
                                 </div>
                             </div>
                         )
                    })()}
                </div>
             ) : selectedEdgeIndex !== null ? (
                <div className="p-4">
                    <h3 className="font-bold text-lg mb-4">Edge Properties</h3>
                    {(() => {
                        const idx = selectedEdgeIndex;
                        const v1 = activePanel.perimeter[idx];
                        const v2 = activePanel.perimeter[(idx + 1) % activePanel.perimeter.length];
                        
                        const dx = v2.x - v1.x;
                        const dy = v2.y - v1.y;
                        const length = Math.sqrt(dx * dx + dy * dy);
                        const angle = Math.atan2(dy, dx) * 180 / Math.PI;
                        
                        return (
                            <div className="space-y-4">
                                <div className="p-4 bg-muted/20 rounded border">
                                    <div className="text-xs text-muted-foreground uppercase font-bold mb-1">Length</div>
                                    <div className="text-2xl font-mono">{length.toFixed(2)}"</div>
                                </div>
                                
                                <div className="grid grid-cols-2 gap-4">
                                   <div>
                                       <Label>New Length</Label>
                                       <Input 
                                            type="number" 
                                            defaultValue={length.toFixed(2)}
                                            onBlur={(e) => {
                                                const newLen = Number(e.target.value);
                                                if (newLen <= 0 || isNaN(newLen)) return;
                                                
                                                // Adjust v2 to be at new length from v1 along the same vector
                                                const currentAngleRad = Math.atan2(dy, dx);
                                                const newX = v1.x + newLen * Math.cos(currentAngleRad);
                                                const newY = v1.y + newLen * Math.sin(currentAngleRad);
                                                
                                                const newPerimeter = [...activePanel.perimeter];
                                                newPerimeter[(idx + 1) % activePanel.perimeter.length] = { ...v2, x: newX, y: newY };
                                                updatePanel({ ...activePanel, perimeter: newPerimeter });
                                            }}
                                       />
                                   </div>
                                    <div>
                                       <Label>Angle (deg)</Label>
                                       <Input 
                                            type="number" 
                                            defaultValue={angle.toFixed(1)}
                                            onBlur={(e) => {
                                                const newAngle = Number(e.target.value);
                                                if (isNaN(newAngle)) return;
                                                
                                                const newAngleRad = newAngle * Math.PI / 180;
                                                const newX = v1.x + length * Math.cos(newAngleRad);
                                                const newY = v1.y + length * Math.sin(newAngleRad);
                                                
                                                const newPerimeter = [...activePanel.perimeter];
                                                newPerimeter[(idx + 1) % activePanel.perimeter.length] = { ...v2, x: newX, y: newY };
                                                updatePanel({ ...activePanel, perimeter: newPerimeter });
                                            }}
                                       />
                                   </div>
                                </div>
                                
                                <p className="text-xs text-muted-foreground mt-4">
                                    Editing length or angle will move the end vertex of the selected edge.
                                </p>
                            </div>
                        );
                    })()}
                </div>
             ) : selectedSketchLineId ? (
                <div className="p-4">
                   <h3 className="font-bold text-lg mb-4">Sketch Line Properties</h3>
                   {(() => {
                       const line = (activePanel.sketchLines || []).find(l => l.id === selectedSketchLineId);
                       if (!line) return null;
                       const length = Math.sqrt(Math.pow(line.x2 - line.x1, 2) + Math.pow(line.y2 - line.y1, 2));
                       return (
                           <div className="space-y-4">
                               <div className="grid grid-cols-2 gap-4">
                                   <div>
                                       <Label>Length (in)</Label>
                                       <Input 
                                            type="number" 
                                            value={length.toFixed(2)} 
                                            onChange={(e) => {
                                                const newLen = Number(e.target.value);
                                                // Adjust x2/y2 to match new length while preserving angle
                                                const currentAngle = Math.atan2(line.y2 - line.y1, line.x2 - line.x1);
                                                const newX2 = line.x1 + newLen * Math.cos(currentAngle);
                                                const newY2 = line.y1 + newLen * Math.sin(currentAngle);
                                                
                                                const newLines = (activePanel.sketchLines || []).map(l => 
                                                    l.id === line.id ? { ...l, x2: newX2, y2: newY2 } : l
                                                );
                                                updatePanel({ ...activePanel, sketchLines: newLines });
                                            }}
                                       />
                                   </div>
                                    <div>
                                       <Label>Angle (deg)</Label>
                                       <Input 
                                            type="number" 
                                            value={(Math.atan2(line.y2 - line.y1, line.x2 - line.x1) * 180 / Math.PI).toFixed(1)}
                                            onChange={(e) => {
                                                const newAngleRad = Number(e.target.value) * Math.PI / 180;
                                                // Adjust x2/y2 to match new angle while preserving length
                                                const newX2 = line.x1 + length * Math.cos(newAngleRad);
                                                const newY2 = line.y1 + length * Math.sin(newAngleRad);
                                                
                                                const newLines = (activePanel.sketchLines || []).map(l => 
                                                    l.id === line.id ? { ...l, x2: newX2, y2: newY2 } : l
                                                );
                                                updatePanel({ ...activePanel, sketchLines: newLines });
                                            }}
                                       />
                                   </div>
                                   <div>
                                       <Label>Start X</Label>
                                       <Input 
                                            type="number" 
                                            value={line.x1.toFixed(1)} 
                                            onChange={(e) => {
                                                const val = Number(e.target.value);
                                                const dx = val - line.x1;
                                                const newLines = (activePanel.sketchLines || []).map(l => 
                                                    l.id === line.id ? { ...l, x1: val, x2: l.x2 + dx } : l
                                                );
                                                updatePanel({ ...activePanel, sketchLines: newLines });
                                            }}
                                       />
                                   </div>
                                   <div>
                                       <Label>Start Y</Label>
                                       <Input 
                                            type="number" 
                                            value={line.y1.toFixed(1)} 
                                            onChange={(e) => {
                                                const val = Number(e.target.value);
                                                const dy = val - line.y1;
                                                const newLines = (activePanel.sketchLines || []).map(l => 
                                                    l.id === line.id ? { ...l, y1: val, y2: l.y2 + dy } : l
                                                );
                                                updatePanel({ ...activePanel, sketchLines: newLines });
                                            }}
                                       />
                                   </div>
                               </div>

                               <div className="p-4 bg-muted/20 rounded border mt-4">
                                   <div className="text-xs text-muted-foreground uppercase font-bold mb-1">Current Length</div>
                                   <div className="text-2xl font-mono">{length.toFixed(2)}"</div>
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
