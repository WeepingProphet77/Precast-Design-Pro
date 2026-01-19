import React, { useState, useEffect, useRef } from "react";
import { Stage, Layer, Rect, Circle, Text, Group, Line, Path } from "react-konva";
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
  Square, Circle as CircleIcon, Move, Copy, ArrowUpRight, Terminal
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Separator } from "@/components/ui/separator";
import { ResizePanelDialog } from "@/components/ResizePanelDialog";

const getRoundedPolygonPath = (vertices: Vertex[]) => {
  if (vertices.length < 3) return "";
  let path = "";
  for (let i = 0; i < vertices.length; i++) {
    const curr = vertices[i];
    path += (i === 0 ? "M " : "L ") + `${curr.x} ${curr.y} `;
  }
  return path + "Z";
};

export default function PanelDesigner() {
  const { project, updatePanel, addPanel, updateConnection, addConnection, deleteConnection } = useProject();
  const [activePanelId, setActivePanelId] = useState<string>(project.panels[0]?.id || "");
  const [activePanel, setActivePanel] = useState<Panel | undefined>(undefined);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const [selectedVertexId, setSelectedVertexId] = useState<string | null>(null);
  const [selectedEdgeIndex, setSelectedEdgeIndex] = useState<number | null>(null);
  const [selectedOpeningId, setSelectedOpeningId] = useState<string | null>(null);
  const [selectedSketchLineId, setSelectedSketchLineId] = useState<string | null>(null);
  const [scale, setScale] = useState(3);
  const [tool, setTool] = useState<"select" | "vertex" | "rect_opening" | "circle_opening" | "connection" | "sketch_line" | "line" | "arc" | "offset" | "fillet" | "move" | "copy">("select");
  const [drawingStep, setDrawingStep] = useState<number>(0);
  const [drawingPoints, setDrawingPoints] = useState<{x: number, y: number}[]>([]);
  const [currentMousePos, setCurrentMousePos] = useState<{x: number, y: number} | null>(null);
  const [commandInput, setCommandInput] = useState("");
  const [commandHistory, setCommandHistory] = useState<string[]>(["Ready. Type L, REC, C, M, CO or ESC."]);
  const commandInputRef = useRef<HTMLInputElement>(null);
  const [moveTarget, setMoveTarget] = useState<{type: 'line' | 'opening', id: string} | null>(null);
  const [basePoint, setBasePoint] = useState<{x: number, y: number} | null>(null);
  const [shiftPressed, setShiftPressed] = useState(false);
  
  const canvasSize = 800;
  const screenToCAD = (screenX: number, screenY: number) => ({ x: Math.round(screenX), y: Math.round(canvasSize - screenY) });
  
  const getAllEndpoints = () => {
    const points: {x: number, y: number}[] = [];
    (activePanel?.sketchLines || []).forEach(line => {
      points.push({ x: line.x1, y: line.y1 });
      points.push({ x: line.x2, y: line.y2 });
    });
    return points;
  };

  const snapToEndpoint = (x: number, y: number, tolerance: number = 15) => {
    const endpoints = getAllEndpoints();
    let closest = { x, y };
    let minDist = tolerance;
    for (const pt of endpoints) {
      const dist = Math.sqrt(Math.pow(pt.x - x, 2) + Math.pow(pt.y - y, 2));
      if (dist < minDist) { minDist = dist; closest = pt; }
    }
    return closest;
  };

  const snapAngle = (fromX: number, fromY: number, toX: number, toY: number) => {
    const dx = toX - fromX, dy = toY - fromY;
    const length = Math.sqrt(dx * dx + dy * dy);
    if (length === 0) return { x: toX, y: toY };
    let degrees = Math.atan2(dy, dx) * 180 / Math.PI;
    degrees = Math.round(degrees / 45) * 45;
    const rad = degrees * Math.PI / 180;
    return { x: Math.round(fromX + length * Math.cos(rad)), y: Math.round(fromY + length * Math.sin(rad)) };
  };

  const addToHistory = (msg: string) => setCommandHistory(prev => [...prev.slice(-15), msg]);

  const handleCommand = (cmd: string) => {
    const parts = cmd.trim().toUpperCase().split(/\s+/);
    const command = parts[0];
    addToHistory(`> ${cmd}`);
    setCommandInput("");
    switch(command) {
        case "L": case "LINE": setTool("line"); break;
        case "REC": case "RECTANGLE": setTool("rect_opening"); break;
        case "C": case "CIRCLE": setTool("circle_opening"); break;
        case "M": case "MOVE": setTool("move"); setDrawingStep(0); break;
        case "CO": case "COPY": setTool("copy"); setDrawingStep(0); break;
        case "ESC": setTool("select"); setDrawingStep(0); addToHistory("Cancelled."); break;
        default: addToHistory(`Unknown: ${command}`);
    }
  };

  useEffect(() => {
    const p = project.panels.find(p => p.id === activePanelId);
    if (p) setActivePanel(p);
    else if (project.panels.length > 0) setActivePanelId(project.panels[0].id);
  }, [project.panels, activePanelId]);

  useEffect(() => {
    const hkd = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setDrawingStep(0); setTool("select"); addToHistory("Cancelled."); }
      if (e.key === "Shift") setShiftPressed(true);
    };
    const hku = (e: KeyboardEvent) => { if (e.key === "Shift") setShiftPressed(false); };
    window.addEventListener("keydown", hkd); window.addEventListener("keyup", hku);
    return () => { window.removeEventListener("keydown", hkd); window.removeEventListener("keyup", hku); };
  }, []);

  if (!activePanel) return <div className="flex-1 flex items-center justify-center bg-slate-100"><Button onClick={addPanel}><Plus className="w-4 h-4 mr-2" /> Create Panel</Button></div>;

  const handleStageMouseMove = (e: any) => {
      const stage = e.target.getStage(), pos = stage.getPointerPosition(), s = stage.scaleX(), p = stage.position();
      if (!pos) return;
      setCurrentMousePos(screenToCAD((pos.x - p.x) / s / scale, (pos.y - p.y) / s / scale));
  };

  const handleStageClick = (e: any) => {
    const stage = e.target.getStage(), pos = stage.getPointerPosition(), s = stage.scaleX(), p = stage.position();
    if (!pos) return;
    const cad = screenToCAD((pos.x - p.x) / s / scale, (pos.y - p.y) / s / scale);
    const { x, y } = cad;
    
    if (tool === "select") {
        if (e.target === stage) {
            setSelectedConnectionId(null); setSelectedVertexId(null); setSelectedOpeningId(null); setSelectedSketchLineId(null);
        }
        return;
    }
    if (tool === "connection") {
        const id = crypto.randomUUID();
        addConnection(activePanel.id, { id, label: `C-${activePanel.connections.length + 1}`, type: "A", x, y, forces: { D:{x:0,y:0,z:0}, L:{x:0,y:0,z:0}, W:{x:0,y:0,z:0}, E:{x:0,y:0,z:0} } });
        setSelectedConnectionId(id); setTool("select"); return;
    }
    if (tool === "line") {
        let pt = snapToEndpoint(x, y, 15);
        if (drawingStep === 0) { setDrawingStep(1); setDrawingPoints([pt]); }
        else {
            const last = drawingPoints[drawingPoints.length - 1];
            if (shiftPressed) pt = snapAngle(last.x, last.y, pt.x, pt.y);
            updatePanel({ ...activePanel, sketchLines: [...(activePanel.sketchLines || []), { id: crypto.randomUUID(), x1: last.x, y1: last.y, x2: pt.x, y2: pt.y }] });
            setDrawingPoints([...drawingPoints, pt]);
        }
        return;
    }
    if (tool === "rect_opening") {
        if (drawingStep === 0) { setDrawingStep(1); setDrawingPoints([{ x, y }]); }
        else {
            const p1 = drawingPoints[0];
            updatePanel({ ...activePanel, openings: [...activePanel.openings, { id: crypto.randomUUID(), type: "rect", x: Math.min(p1.x, x), y: Math.min(p1.y, y), width: Math.abs(x - p1.x), height: Math.abs(y - p1.y) }] });
            setDrawingStep(0); setDrawingPoints([]);
        }
        return;
    }
    if (tool === "circle_opening") {
        if (drawingStep === 0) { setDrawingStep(1); setDrawingPoints([{ x, y }]); }
        else {
            const c = drawingPoints[0], r = Math.sqrt(Math.pow(x-c.x,2)+Math.pow(y-c.y,2));
            updatePanel({ ...activePanel, openings: [...activePanel.openings, { id: crypto.randomUUID(), type: "circle", x: c.x-r, y: c.y-r, width: r*2, height: r*2 }] });
            setDrawingStep(0); setDrawingPoints([]);
        }
        return;
    }
    if (tool === "move") {
        if (drawingStep === 1) { setBasePoint({ x, y }); setDrawingStep(2); }
        else if (drawingStep === 2 && moveTarget && basePoint) {
            const dx = x - basePoint.x, dy = y - basePoint.y;
            if (moveTarget.type === 'line') updatePanel({ ...activePanel, sketchLines: activePanel.sketchLines?.map(l => l.id === moveTarget.id ? { ...l, x1: l.x1 + dx, y1: l.y1 + dy, x2: l.x2 + dx, y2: l.y2 + dy } : l) });
            else updatePanel({ ...activePanel, openings: activePanel.openings.map(o => o.id === moveTarget.id ? { ...o, x: o.x + dx, y: o.y + dy } : o) });
            setDrawingStep(0); setMoveTarget(null); setBasePoint(null); setTool("select");
        }
        return;
    }
  };

  const onWheel = (e: any) => {
        e.evt.preventDefault(); const stage = e.target.getStage(), oldScale = stage.scaleX(), ptr = stage.getPointerPosition(); if (!ptr) return;
        const pt = { x: (ptr.x - stage.x()) / oldScale, y: (ptr.y - stage.y()) / oldScale };
        const newScale = e.evt.deltaY < 0 ? oldScale * 1.1 : oldScale / 1.1;
        stage.scale({ x: newScale, y: newScale });
        stage.position({ x: ptr.x - pt.x * newScale, y: ptr.y - pt.y * newScale });
        stage.batchDraw();
  };

  return (
    <div className="flex h-full flex-col">
      <div className="h-16 border-b bg-card flex items-center px-4 gap-4 justify-between shrink-0 shadow-sm z-10">
        <div className="flex items-center gap-3">
            <Select value={activePanelId} onValueChange={setActivePanelId}><SelectTrigger className="w-[180px] h-9"><SelectValue placeholder="Select Panel" /></SelectTrigger><SelectContent>{project.panels.map(p => (<SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>))}</SelectContent></Select>
            <ResizePanelDialog panel={activePanel} onUpdate={updatePanel} />
            <Button variant="outline" size="sm" onClick={addPanel} className="h-9"><Plus className="w-4 h-4 mr-2" /> New</Button>
        </div>
        <div className="flex items-center gap-1 bg-muted/30 p-1 rounded-md">
            <ToggleGroup type="single" value={tool} onValueChange={(val: any) => val && setTool(val)}>
                <ToggleGroupItem value="select"><MousePointer2 className="w-4 h-4" /></ToggleGroupItem>
                <Separator orientation="vertical" className="h-4 mx-1" />
                <ToggleGroupItem value="line"><PenTool className="w-4 h-4" /></ToggleGroupItem>
                <ToggleGroupItem value="rect_opening"><Square className="w-4 h-4" /></ToggleGroupItem>
                <ToggleGroupItem value="circle_opening"><CircleIcon className="w-4 h-4" /></ToggleGroupItem>
                <Separator orientation="vertical" className="h-4 mx-1" />
                <ToggleGroupItem value="move"><Move className="w-4 h-4" /></ToggleGroupItem>
                <ToggleGroupItem value="connection"><ArrowUpRight className="w-4 h-4" /></ToggleGroupItem>
            </ToggleGroup>
        </div>
        <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => setScale(s => s * 1.2)}><ZoomIn className="w-4 h-4" /></Button>
            <Button variant="ghost" size="icon" onClick={() => setScale(s => s / 1.2)}><ZoomOut className="w-4 h-4" /></Button>
        </div>
      </div>
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex flex-col min-w-0 bg-slate-50 relative">
            <div className="absolute top-4 left-4 z-10 bg-background/80 backdrop-blur-sm border rounded-md px-3 py-1.5 shadow-sm text-xs font-mono">
                X: {currentMousePos?.x ?? 0}" Y: {currentMousePos?.y ?? 0}"
            </div>
            <div className="flex-1 relative cursor-crosshair overflow-hidden" onWheel={onWheel}>
                <Stage width={window.innerWidth} height={window.innerHeight} draggable onClick={handleStageClick} onMouseMove={handleStageMouseMove}>
                    <Layer>
                        <Group x={100} y={100}>
                            <Line points={[0, 0, canvasSize * scale, 0]} stroke="#ddd" strokeWidth={1} />
                            <Path data={getRoundedPolygonPath(activePanel.perimeter)} fill="#f8fafc" stroke="#334155" strokeWidth={2} scaleX={scale} scaleY={scale} />
                            {activePanel.sketchLines?.map(l => (
                                <Line key={l.id} points={[l.x1 * scale, l.y1 * scale, l.x2 * scale, l.y2 * scale]} stroke={selectedSketchLineId === l.id ? "#E74C3C" : "#2C3E50"} strokeWidth={2} hitStrokeWidth={30} onClick={(e) => { e.cancelBubble = true; if (tool === "move" && drawingStep === 0) { setMoveTarget({ type: 'line', id: l.id }); setDrawingStep(1); } else { setSelectedSketchLineId(l.id); } }} />
                            ))}
                            {activePanel.openings.map(op => (
                                <Group key={op.id}>
                                    {op.type === "rect" ? (
                                        <Rect x={op.x * scale} y={op.y * scale} width={op.width * scale} height={op.height * scale} fill="#ecf0f1" stroke={selectedOpeningId === op.id ? "#E74C3C" : "#7f8c8d"} strokeWidth={2} onClick={(e) => { e.cancelBubble = true; if (tool === "move" && drawingStep === 0) { setMoveTarget({ type: 'opening', id: op.id }); setDrawingStep(1); } else { setSelectedOpeningId(op.id); } }} />
                                    ) : (
                                        <Circle x={(op.x + op.width/2) * scale} y={(op.y + op.height/2) * scale} radius={(op.width/2) * scale} fill="#ecf0f1" stroke={selectedOpeningId === op.id ? "#E74C3C" : "#7f8c8d"} strokeWidth={2} onClick={(e) => { e.cancelBubble = true; setSelectedOpeningId(op.id); }} />
                                    )}
                                </Group>
                            ))}
                            {activePanel.connections.map(c => (
                                <Group key={c.id} x={c.x * scale} y={c.y * scale} draggable onDragMove={(e) => { updateConnection(activePanel.id, { ...c, x: e.target.x() / scale, y: e.target.y() / scale }); }} onClick={(e) => { e.cancelBubble = true; setSelectedConnectionId(c.id); }}>
                                    <Rect x={-5} y={-5} width={10} height={10} fill={selectedConnectionId === c.id ? "#E74C3C" : "#2ECC71"} rotation={45} />
                                    <Text text={c.label} x={10} y={-15} fontSize={12} fontStyle="bold" fill="#2C3E50" />
                                </Group>
                            ))}
                            {drawingStep > 0 && currentMousePos && (
                                <Group>
                                    {tool === "line" && drawingPoints.length > 0 && (
                                        <Line points={[drawingPoints[drawingPoints.length-1].x * scale, drawingPoints[drawingPoints.length-1].y * scale, (shiftPressed ? snapAngle(drawingPoints[drawingPoints.length-1].x, drawingPoints[drawingPoints.length-1].y, currentMousePos.x, currentMousePos.y).x : currentMousePos.x) * scale, (shiftPressed ? snapAngle(drawingPoints[drawingPoints.length-1].x, drawingPoints[drawingPoints.length-1].y, currentMousePos.x, currentMousePos.y).y : currentMousePos.y) * scale]} stroke="#3498DB" strokeWidth={1} dash={[5, 5]} />
                                    )}
                                    {tool === "rect_opening" && (
                                        <Rect x={Math.min(drawingPoints[0].x, currentMousePos.x) * scale} y={Math.min(drawingPoints[0].y, currentMousePos.y) * scale} width={Math.abs(currentMousePos.x - drawingPoints[0].x) * scale} height={Math.abs(currentMousePos.y - drawingPoints[0].y) * scale} stroke="#3498DB" strokeWidth={1} dash={[5, 5]} />
                                    )}
                                </Group>
                            )}
                        </Group>
                    </Layer>
                </Stage>
                <div className="absolute bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-700 shadow-2xl z-20 flex flex-col h-48">
                    <div className="flex-1 p-2 overflow-y-auto font-mono text-xs text-slate-300">
                        {commandHistory.map((line, i) => ( <div key={i} className="mb-0.5 opacity-80">{line}</div> ))}
                        <div ref={(el) => el?.scrollIntoView({ behavior: 'smooth' })} />
                    </div>
                    <div className="h-10 bg-slate-800 border-t border-slate-700 flex items-center px-3 gap-2 shrink-0">
                        <Terminal className="w-4 h-4 text-primary" />
                        <input ref={commandInputRef} type="text" value={commandInput} onChange={(e) => setCommandInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && commandInput.trim()) handleCommand(commandInput); }} className="flex-1 bg-transparent border-none outline-none text-white font-mono text-sm" placeholder="Type command..." autoFocus />
                    </div>
                </div>
            </div>
            <div className="w-[350px] border-l bg-card flex flex-col shrink-0 shadow-sm z-10">
                 {selectedConnectionId ? (
                    <ConnectionProperties panelId={activePanel.id} connectionId={selectedConnectionId} />
                 ) : (
                    <div className="p-8 flex flex-col items-center justify-center text-center opacity-40 flex-1">
                        <MousePointer2 className="w-12 h-12 mb-4" />
                        <p className="text-slate-500">Select an object to view properties</p>
                    </div>
                 )}
            </div>
        </div>
      </div>
    </div>
  );
}

function ConnectionProperties({ panelId, connectionId }: { panelId: string, connectionId: string }) {
    const { project, updateConnection, deleteConnection } = useProject();
    const panel = project.panels.find(p => p.id === panelId);
    const connection = panel?.connections.find(c => c.id === connectionId);
    if (!connection) return null;
    return (
        <Tabs defaultValue="forces" className="flex-1 flex flex-col">
            <div className="p-4 border-b bg-muted/20">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-lg text-primary">Connection Properties</h3>
                    <Button variant="ghost" size="sm" onClick={() => deleteConnection(panelId, connectionId)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                </div>
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1"><Label className="text-[10px] uppercase">Label</Label><Input value={connection.label} onChange={e => updateConnection(panelId, { ...connection, label: e.target.value })} /></div>
                        <div className="space-y-1"><Label className="text-[10px] uppercase">Type</Label><Select value={connection.type} onValueChange={val => updateConnection(panelId, { ...connection, type: val })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="A">Type A</SelectItem><SelectItem value="B">Type B</SelectItem><SelectItem value="C">Type C</SelectItem></SelectContent></Select></div>
                    </div>
                </div>
            </div>
            <div className="border-b bg-muted/10"><TabsList className="w-full justify-start rounded-none h-10 bg-transparent border-none"><TabsTrigger value="forces" className="flex-1">Forces</TabsTrigger><TabsTrigger value="load_combos" className="flex-1">LRFD</TabsTrigger></TabsList></div>
            <ScrollArea className="flex-1">
                <TabsContent value="forces" className="p-4 m-0">
                    <div className="space-y-6">
                        {Object.entries(connection.forces).map(([caseKey, forces]) => (
                            <div key={caseKey} className="space-y-3 p-3 bg-muted/20 rounded border border-border/50">
                                <div className="flex items-center gap-2 mb-2"><div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">{caseKey}</div><span className="text-xs font-bold uppercase tracking-wider">{caseKey}</span></div>
                                <div className="grid grid-cols-3 gap-2">{['x', 'y', 'z'].map(axis => ( <div key={axis} className="space-y-1"><Label className="text-[10px] uppercase">Force {axis}</Label><Input type="number" className="h-8 text-xs font-mono" value={forces[axis as keyof typeof forces]} onChange={e => { const val = Number(e.target.value); updateConnection(panelId, { ...connection, forces: { ...connection.forces, [caseKey]: { ...forces, [axis]: val } } }); }} /></div> ))}</div>
                            </div>
                        ))}
                    </div>
                </TabsContent>
                <TabsContent value="load_combos" className="p-4 m-0">
                    <div className="space-y-4">
                        {(() => {
                            const results = calculateLoadCombinations(connection.forces);
                            return results.map((result, i) => (
                                <div key={i} className="p-3 bg-muted/20 rounded border border-border/50 space-y-2">
                                    <div className="text-[10px] font-mono text-muted-foreground truncate">{result.combination}</div>
                                    <div className="grid grid-cols-3 gap-2">
                                        <div className="text-center"><div className="text-[10px] uppercase">Pu,x</div><div className="text-sm font-mono font-bold">{result.factored.x.toFixed(1)}k</div></div>
                                        <div className="text-center border-x"><div className="text-[10px] uppercase">Pu,y</div><div className="text-sm font-mono font-bold">{result.factored.y.toFixed(1)}k</div></div>
                                        <div className="text-center"><div className="text-[10px] uppercase">Pu,z</div><div className="text-sm font-mono font-bold">{result.factored.z.toFixed(1)}k</div></div>
                                    </div>
                                </div>
                            ));
                        })()}
                    </div>
                </TabsContent>
            </ScrollArea>
        </Tabs>
    );
}
