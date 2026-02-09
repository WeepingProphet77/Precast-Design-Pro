import React, { useState, useEffect, useRef, useCallback } from "react";
import { Stage, Layer, Rect, Circle, Text, Group, Line, Shape } from "react-konva";
import { useProject } from "@/lib/store";
import { Panel, ConnectionNode, Vertex, Opening } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { calculateLoadCombinations } from "@/lib/calculations";
import { parseDxfFile } from "@/lib/dxfParser";
import {
  Plus, Trash2, ZoomIn, ZoomOut, MousePointer2, Upload, Square,
  ArrowUpRight, Crosshair, RotateCcw
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

export default function PanelDesigner() {
  const { project, updatePanel, addPanel, updateConnection, addConnection, deleteConnection } = useProject();
  const stageRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const [activePanelId, setActivePanelId] = useState<string>(project.panels[0]?.id || "");
  const [activePanel, setActivePanel] = useState<Panel | undefined>(undefined);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const [scale, setScale] = useState(3);
  const [tool, setTool] = useState<"select" | "connection">("select");
  const [currentMousePos, setCurrentMousePos] = useState<{ x: number; y: number } | null>(null);
  const [snapIndicator, setSnapIndicator] = useState<{ x: number; y: number } | null>(null);

  const [rectDialogOpen, setRectDialogOpen] = useState(false);
  const [rectWidth, setRectWidth] = useState(120);
  const [rectHeight, setRectHeight] = useState(180);

  const [coordDialogOpen, setCoordDialogOpen] = useState(false);
  const [coordX, setCoordX] = useState(0);
  const [coordY, setCoordY] = useState(0);

  const SNAP_TOLERANCE = 10;
  const GRID_SPACING = 12;
  const DATUM_SIZE = 30;

  useEffect(() => {
    const p = project.panels.find(p => p.id === activePanelId);
    if (p) setActivePanel(p);
    else if (project.panels.length > 0) setActivePanelId(project.panels[0].id);
  }, [project.panels, activePanelId]);

  const getSnapPoints = useCallback((): { x: number; y: number }[] => {
    if (!activePanel) return [];
    const pts: { x: number; y: number }[] = [];
    activePanel.perimeter.forEach(v => pts.push({ x: v.x, y: v.y }));
    activePanel.openings.forEach(op => {
      if (op.vertices) {
        op.vertices.forEach(v => pts.push({ x: v.x, y: v.y }));
      } else {
        pts.push({ x: op.x, y: op.y });
        pts.push({ x: op.x + op.width, y: op.y });
        pts.push({ x: op.x, y: op.y + op.height });
        pts.push({ x: op.x + op.width, y: op.y + op.height });
      }
    });
    activePanel.sketchLines?.forEach(l => {
      pts.push({ x: l.x1, y: l.y1 });
      pts.push({ x: l.x2, y: l.y2 });
    });
    (activePanel.importedNodes || []).forEach(n => pts.push(n));
    return pts;
  }, [activePanel]);

  const snapToPoint = useCallback((x: number, y: number): { x: number; y: number; snapped: boolean } => {
    const pts = getSnapPoints();
    let closest = { x, y };
    let minDist = SNAP_TOLERANCE;
    let snapped = false;
    for (const pt of pts) {
      const dist = Math.sqrt((pt.x - x) ** 2 + (pt.y - y) ** 2);
      if (dist < minDist) {
        minDist = dist;
        closest = pt;
        snapped = true;
      }
    }
    return { ...closest, snapped };
  }, [getSnapPoints]);

  const cadFromScreen = (screenX: number, screenY: number): { x: number; y: number } => {
    if (!activePanel) return { x: 0, y: 0 };
    return {
      x: Math.round(screenX / scale * 100) / 100,
      y: Math.round((activePanel.height - screenY / scale) * 100) / 100,
    };
  };

  const screenFromCad = (cadX: number, cadY: number): { x: number; y: number } => {
    if (!activePanel) return { x: 0, y: 0 };
    return {
      x: cadX * scale,
      y: (activePanel.height - cadY) * scale,
    };
  };

  const handleDxfImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    try {
      const result = parseDxfFile(text);
      if (result.perimeter.length < 3) {
        toast({ title: "Import Warning", description: "No valid closed polyline found in the DXF file. Please ensure the file contains closed polylines.", variant: "destructive" });
        return;
      }

      if (activePanel) {
        updatePanel({
          ...activePanel,
          width: result.width,
          height: result.height,
          perimeter: result.perimeter,
          openings: result.openings,
          sketchLines: result.sketchLines.map(l => ({ id: crypto.randomUUID(), ...l })),
          importedNodes: result.nodes,
        });
        toast({ title: "DXF Imported", description: `Panel geometry updated: ${result.perimeter.length} vertices, ${result.openings.length} openings, ${result.nodes.length} snap points.` });
      }
    } catch (err) {
      toast({ title: "Import Error", description: "Failed to parse DXF file. Please check the file format.", variant: "destructive" });
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const applyRectTemplate = () => {
    if (!activePanel) return;
    const w = rectWidth;
    const h = rectHeight;
    updatePanel({
      ...activePanel,
      width: w,
      height: h,
      perimeter: [
        { id: crypto.randomUUID(), x: 0, y: 0 },
        { id: crypto.randomUUID(), x: w, y: 0 },
        { id: crypto.randomUUID(), x: w, y: h },
        { id: crypto.randomUUID(), x: 0, y: h },
      ],
      openings: [],
      sketchLines: [],
      importedNodes: [],
    });
    setRectDialogOpen(false);
    toast({ title: "Rectangle Template", description: `Panel set to ${w}" × ${h}" rectangle.` });
  };

  const addConnectionByCoordinates = () => {
    if (!activePanel) return;
    const id = crypto.randomUUID();
    const conn: ConnectionNode = {
      id,
      label: `C-${activePanel.connections.length + 1}`,
      type: "A",
      x: coordX,
      y: coordY,
      forces: { D: { x: 0, y: 0, z: 0 }, L: { x: 0, y: 0, z: 0 }, W: { x: 0, y: 0, z: 0 }, E: { x: 0, y: 0, z: 0 } },
    };
    addConnection(activePanel.id, conn);
    setSelectedConnectionId(id);
    setCoordDialogOpen(false);
    toast({ title: "Connection Added", description: `Connection ${conn.label} placed at (${coordX}, ${coordY}).` });
  };

  const handleStageMouseMove = (e: any) => {
    const stage = e.target.getStage();
    if (!stage) return;
    const pos = stage.getPointerPosition();
    const s = stage.scaleX();
    const p = stage.position();
    if (!pos) return;
    const screenX = (pos.x - p.x) / s;
    const screenY = (pos.y - p.y) / s;
    const cad = cadFromScreen(screenX - 80, screenY - 40);
    setCurrentMousePos(cad);

    if (tool === "connection") {
      const snap = snapToPoint(cad.x, cad.y);
      setSnapIndicator(snap.snapped ? snap : null);
    } else {
      setSnapIndicator(null);
    }
  };

  const handleStageClick = (e: any) => {
    const stage = e.target.getStage();
    if (!stage) return;
    const pos = stage.getPointerPosition();
    const s = stage.scaleX();
    const p = stage.position();
    if (!pos) return;
    const screenX = (pos.x - p.x) / s;
    const screenY = (pos.y - p.y) / s;
    const cad = cadFromScreen(screenX - 80, screenY - 40);

    if (tool === "select") {
      if (e.target === stage) {
        setSelectedConnectionId(null);
      }
      return;
    }

    if (tool === "connection" && activePanel) {
      const snap = snapToPoint(cad.x, cad.y);
      const finalX = snap.snapped ? snap.x : Math.round(cad.x);
      const finalY = snap.snapped ? snap.y : Math.round(cad.y);
      const id = crypto.randomUUID();
      const conn: ConnectionNode = {
        id,
        label: `C-${activePanel.connections.length + 1}`,
        type: "A",
        x: finalX,
        y: finalY,
        forces: { D: { x: 0, y: 0, z: 0 }, L: { x: 0, y: 0, z: 0 }, W: { x: 0, y: 0, z: 0 }, E: { x: 0, y: 0, z: 0 } },
      };
      addConnection(activePanel.id, conn);
      setSelectedConnectionId(id);
      return;
    }
  };

  const onWheel = (e: any) => {
    if (e.evt) e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;
    const oldScale = stage.scaleX();
    const ptr = stage.getPointerPosition();
    if (!ptr) return;
    const pt = { x: (ptr.x - stage.x()) / oldScale, y: (ptr.y - stage.y()) / oldScale };
    const delta = e.evt ? e.evt.deltaY : 0;
    const newScale = delta < 0 ? oldScale * 1.1 : oldScale / 1.1;
    stage.scale({ x: newScale, y: newScale });
    stage.position({ x: ptr.x - pt.x * newScale, y: ptr.y - pt.y * newScale });
    stage.batchDraw();
  };

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setTool("select"); }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  if (!activePanel) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-100" data-testid="empty-state">
        <div className="text-center space-y-4">
          <p className="text-muted-foreground">No panels yet. Create one to get started.</p>
          <Button onClick={addPanel} data-testid="button-create-panel"><Plus className="w-4 h-4 mr-2" /> Create Panel</Button>
        </div>
      </div>
    );
  }

  const hasGeometry = activePanel.perimeter.length >= 3;
  const canvasW = Math.max(activePanel.width * scale + 160, 800);
  const canvasH = Math.max(activePanel.height * scale + 160, 600);

  const gridLines: React.ReactElement[] = [];
  if (hasGeometry) {
    const gridW = activePanel.width;
    const gridH = activePanel.height;
    for (let gx = 0; gx <= gridW; gx += GRID_SPACING) {
      gridLines.push(
        <Line key={`gv-${gx}`} points={[gx * scale, 0, gx * scale, gridH * scale]} stroke="#e2e8f0" strokeWidth={0.5} />
      );
    }
    for (let gy = 0; gy <= gridH; gy += GRID_SPACING) {
      gridLines.push(
        <Line key={`gh-${gy}`} points={[0, gy * scale, gridW * scale, gy * scale]} stroke="#e2e8f0" strokeWidth={0.5} />
      );
    }
  }

  const perimeterPoints = activePanel.perimeter.flatMap(v => {
    const s = screenFromCad(v.x, v.y);
    return [s.x, s.y];
  });

  return (
    <div className="flex h-full flex-col" data-testid="panel-designer">
      <div className="h-14 border-b bg-card flex items-center px-4 gap-3 justify-between shrink-0 shadow-sm z-10">
        <div className="flex items-center gap-3">
          <Select value={activePanelId} onValueChange={setActivePanelId}>
            <SelectTrigger className="w-[160px] h-9" data-testid="select-panel">
              <SelectValue placeholder="Select Panel" />
            </SelectTrigger>
            <SelectContent>
              {project.panels.map(p => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={addPanel} className="h-9" data-testid="button-new-panel">
            <Plus className="w-4 h-4 mr-1" /> New
          </Button>
        </div>

        <Separator orientation="vertical" className="h-6" />

        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".dxf"
            className="hidden"
            onChange={handleDxfImport}
            data-testid="input-dxf-file"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            className="h-9"
            data-testid="button-import-dxf"
          >
            <Upload className="w-4 h-4 mr-1" /> Import DXF
          </Button>

          <Dialog open={rectDialogOpen} onOpenChange={setRectDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="h-9" data-testid="button-rect-template">
                <Square className="w-4 h-4 mr-1" /> Rectangle
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[380px]">
              <DialogHeader>
                <DialogTitle>Rectangle Template</DialogTitle>
                <DialogDescription>
                  Create a simple rectangular panel by specifying width and height in inches.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="rect-w" className="text-right">Width (in)</Label>
                  <Input id="rect-w" type="number" value={rectWidth} onChange={e => setRectWidth(Number(e.target.value))} className="col-span-3" data-testid="input-rect-width" />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="rect-h" className="text-right">Height (in)</Label>
                  <Input id="rect-h" type="number" value={rectHeight} onChange={e => setRectHeight(Number(e.target.value))} className="col-span-3" data-testid="input-rect-height" />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={applyRectTemplate} data-testid="button-apply-rect">Apply</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <Separator orientation="vertical" className="h-6" />

        <div className="flex items-center gap-2">
          <Button
            variant={tool === "select" ? "default" : "outline"}
            size="sm"
            onClick={() => setTool("select")}
            className="h-9"
            data-testid="button-tool-select"
          >
            <MousePointer2 className="w-4 h-4 mr-1" /> Select
          </Button>
          <Button
            variant={tool === "connection" ? "default" : "outline"}
            size="sm"
            onClick={() => setTool("connection")}
            className="h-9"
            data-testid="button-tool-connection"
          >
            <Crosshair className="w-4 h-4 mr-1" /> Place Connection
          </Button>

          <Dialog open={coordDialogOpen} onOpenChange={setCoordDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="h-9" data-testid="button-add-by-coord">
                <ArrowUpRight className="w-4 h-4 mr-1" /> By Coordinates
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[380px]">
              <DialogHeader>
                <DialogTitle>Add Connection by Coordinates</DialogTitle>
                <DialogDescription>Enter X and Y coordinates (inches) relative to the panel origin (lower-left corner).</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="cx" className="text-right">X (in)</Label>
                  <Input id="cx" type="number" value={coordX} onChange={e => setCoordX(Number(e.target.value))} className="col-span-3" data-testid="input-coord-x" />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="cy" className="text-right">Y (in)</Label>
                  <Input id="cy" type="number" value={coordY} onChange={e => setCoordY(Number(e.target.value))} className="col-span-3" data-testid="input-coord-y" />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={addConnectionByCoordinates} data-testid="button-place-connection">Place Connection</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => setScale(s => Math.min(s * 1.2, 20))} data-testid="button-zoom-in"><ZoomIn className="w-4 h-4" /></Button>
          <span className="text-xs text-muted-foreground font-mono w-12 text-center">{Math.round(scale * 100 / 3)}%</span>
          <Button variant="ghost" size="icon" onClick={() => setScale(s => Math.max(s / 1.2, 0.5))} data-testid="button-zoom-out"><ZoomOut className="w-4 h-4" /></Button>
          <Button variant="ghost" size="icon" onClick={() => { setScale(3); if (stageRef.current) { stageRef.current.scale({ x: 1, y: 1 }); stageRef.current.position({ x: 0, y: 0 }); } }} data-testid="button-zoom-reset"><RotateCcw className="w-4 h-4" /></Button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex flex-col min-w-0 bg-slate-100 relative">
          <div className="absolute top-3 left-3 z-10 bg-background/90 backdrop-blur-sm border rounded-md px-3 py-1.5 shadow-sm text-xs font-mono" data-testid="text-coordinates">
            X: {currentMousePos?.x?.toFixed(1) ?? "—"}" &nbsp; Y: {currentMousePos?.y?.toFixed(1) ?? "—"}"
          </div>

          {tool === "connection" && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 bg-primary text-primary-foreground rounded-md px-4 py-1.5 shadow-sm text-xs font-medium">
              Click on the canvas to place a connection. Snap to geometry points. Press Escape to cancel.
            </div>
          )}

          {!hasGeometry && (
            <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
              <div className="bg-background/90 border rounded-lg p-8 text-center space-y-3 pointer-events-auto shadow-lg">
                <Upload className="w-10 h-10 mx-auto text-muted-foreground" />
                <h3 className="font-semibold text-lg">No Panel Geometry</h3>
                <p className="text-sm text-muted-foreground max-w-xs">
                  Import a DXF file or use the Rectangle template to define panel geometry.
                </p>
                <div className="flex gap-2 justify-center pt-2">
                  <Button size="sm" onClick={() => fileInputRef.current?.click()} data-testid="button-import-dxf-empty">
                    <Upload className="w-4 h-4 mr-1" /> Import DXF
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setRectDialogOpen(true)} data-testid="button-rect-empty">
                    <Square className="w-4 h-4 mr-1" /> Rectangle
                  </Button>
                </div>
              </div>
            </div>
          )}

          <div className={`flex-1 overflow-hidden ${tool === "connection" ? "cursor-crosshair" : "cursor-default"}`}>
            <Stage
              ref={stageRef}
              width={window.innerWidth}
              height={window.innerHeight - 56}
              draggable
              onClick={handleStageClick}
              onMouseMove={handleStageMouseMove}
              onWheel={onWheel}
            >
              <Layer>
                <Group x={80} y={40}>
                  {gridLines}

                  {hasGeometry && (
                    <Shape
                      sceneFunc={(context, shape) => {
                        const ctx = context._context;
                        ctx.beginPath();
                        const pVerts = activePanel.perimeter;
                        if (pVerts.length > 0) {
                          const first = screenFromCad(pVerts[0].x, pVerts[0].y);
                          ctx.moveTo(first.x, first.y);
                          for (let i = 1; i < pVerts.length; i++) {
                            const pt = screenFromCad(pVerts[i].x, pVerts[i].y);
                            ctx.lineTo(pt.x, pt.y);
                          }
                          ctx.closePath();
                        }

                        activePanel.openings.forEach(op => {
                          if (op.type === "polygon" && op.vertices && op.vertices.length >= 3) {
                            const first = screenFromCad(op.vertices[0].x, op.vertices[0].y);
                            ctx.moveTo(first.x, first.y);
                            for (let i = 1; i < op.vertices.length; i++) {
                              const pt = screenFromCad(op.vertices[i].x, op.vertices[i].y);
                              ctx.lineTo(pt.x, pt.y);
                            }
                            ctx.closePath();
                          } else if (op.type === "rect") {
                            const tl = screenFromCad(op.x, op.y + op.height);
                            const w = op.width * scale;
                            const h = op.height * scale;
                            ctx.moveTo(tl.x, tl.y);
                            ctx.lineTo(tl.x + w, tl.y);
                            ctx.lineTo(tl.x + w, tl.y + h);
                            ctx.lineTo(tl.x, tl.y + h);
                            ctx.closePath();
                          } else if (op.type === "circle") {
                            const center = screenFromCad(op.x + op.width / 2, op.y + op.height / 2);
                            const radius = (op.width / 2) * scale;
                            ctx.moveTo(center.x + radius, center.y);
                            ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
                            ctx.closePath();
                          }
                        });

                        ctx.fillStyle = "#dbeafe";
                        ctx.fill("evenodd");
                        ctx.strokeStyle = "#1e40af";
                        ctx.lineWidth = 2;
                        ctx.stroke();
                      }}
                    />
                  )}

                  {activePanel.openings.map(op => {
                    if (op.type === "polygon" && op.vertices && op.vertices.length >= 3) {
                      const pts = op.vertices.flatMap(v => {
                        const s = screenFromCad(v.x, v.y);
                        return [s.x, s.y];
                      });
                      return <Line key={op.id} points={pts} closed stroke="#dc2626" strokeWidth={1.5} dash={[4, 4]} />;
                    } else if (op.type === "rect") {
                      const tl = screenFromCad(op.x, op.y + op.height);
                      return <Rect key={op.id} x={tl.x} y={tl.y} width={op.width * scale} height={op.height * scale} stroke="#dc2626" strokeWidth={1.5} dash={[4, 4]} />;
                    } else if (op.type === "circle") {
                      const center = screenFromCad(op.x + op.width / 2, op.y + op.height / 2);
                      return <Circle key={op.id} x={center.x} y={center.y} radius={(op.width / 2) * scale} stroke="#dc2626" strokeWidth={1.5} dash={[4, 4]} />;
                    }
                    return null;
                  })}

                  {activePanel.sketchLines?.map(l => {
                    const s1 = screenFromCad(l.x1, l.y1);
                    const s2 = screenFromCad(l.x2, l.y2);
                    return <Line key={l.id} points={[s1.x, s1.y, s2.x, s2.y]} stroke="#475569" strokeWidth={1} />;
                  })}

                  {hasGeometry && (
                    <Group>
                      {/* Datum at origin (lower-left) */}
                      {(() => {
                        const origin = screenFromCad(0, 0);
                        return (
                          <Group x={origin.x} y={origin.y}>
                            <Line points={[0, 0, DATUM_SIZE, 0]} stroke="#dc2626" strokeWidth={2} />
                            <Line points={[DATUM_SIZE - 6, -4, DATUM_SIZE, 0, DATUM_SIZE - 6, 4]} stroke="#dc2626" strokeWidth={2} />
                            <Text text="X" x={DATUM_SIZE + 4} y={-6} fontSize={11} fill="#dc2626" fontStyle="bold" />

                            <Line points={[0, 0, 0, -DATUM_SIZE]} stroke="#16a34a" strokeWidth={2} />
                            <Line points={[-4, -DATUM_SIZE + 6, 0, -DATUM_SIZE, 4, -DATUM_SIZE + 6]} stroke="#16a34a" strokeWidth={2} />
                            <Text text="Y" x={-6} y={-DATUM_SIZE - 16} fontSize={11} fill="#16a34a" fontStyle="bold" />

                            <Circle x={0} y={0} radius={3} fill="#2563eb" />
                            <Text text="0,0" x={6} y={4} fontSize={10} fill="#64748b" />
                          </Group>
                        );
                      })()}
                    </Group>
                  )}

                  {(activePanel.importedNodes || []).map((n, i) => {
                    const s = screenFromCad(n.x, n.y);
                    return (
                      <Group key={`node-${i}`} x={s.x} y={s.y}>
                        <Line points={[-4, -4, 4, 4]} stroke="#f59e0b" strokeWidth={1.5} />
                        <Line points={[-4, 4, 4, -4]} stroke="#f59e0b" strokeWidth={1.5} />
                      </Group>
                    );
                  })}

                  {activePanel.connections.map(c => {
                    const s = screenFromCad(c.x, c.y);
                    return (
                      <Group
                        key={c.id}
                        x={s.x}
                        y={s.y}
                        draggable
                        onDragEnd={(e) => {
                          const newScreenX = e.target.x();
                          const newScreenY = e.target.y();
                          const newCad = cadFromScreen(newScreenX, newScreenY);
                          updateConnection(activePanel.id, { ...c, x: Math.round(newCad.x * 10) / 10, y: Math.round(newCad.y * 10) / 10 });
                          e.target.position({ x: newScreenX, y: newScreenY });
                        }}
                        onClick={(e) => {
                          e.cancelBubble = true;
                          setSelectedConnectionId(c.id);
                        }}
                      >
                        <Rect
                          x={-6} y={-6} width={12} height={12}
                          fill={selectedConnectionId === c.id ? "#dc2626" : "#22c55e"}
                          stroke={selectedConnectionId === c.id ? "#991b1b" : "#15803d"}
                          strokeWidth={1}
                          rotation={45}
                          offsetX={0}
                          offsetY={0}
                        />
                        <Text text={c.label} x={10} y={-14} fontSize={11} fontStyle="bold" fill="#1e293b" />
                        <Text text={`(${c.x.toFixed(1)}, ${c.y.toFixed(1)})`} x={10} y={0} fontSize={9} fill="#64748b" />
                      </Group>
                    );
                  })}

                  {snapIndicator && (() => {
                    const s = screenFromCad(snapIndicator.x, snapIndicator.y);
                    return (
                      <Group x={s.x} y={s.y}>
                        <Circle radius={8} stroke="#f59e0b" strokeWidth={2} />
                        <Circle radius={2} fill="#f59e0b" />
                      </Group>
                    );
                  })()}
                </Group>
              </Layer>
            </Stage>
          </div>

          <div className="absolute bottom-3 left-3 z-10 bg-background/90 backdrop-blur-sm border rounded-md px-3 py-1.5 shadow-sm text-xs text-muted-foreground" data-testid="text-panel-info">
            {hasGeometry
              ? `${activePanel.name} — ${activePanel.width.toFixed(1)}" × ${activePanel.height.toFixed(1)}" — ${activePanel.connections.length} connections`
              : `${activePanel.name} — No geometry defined`
            }
          </div>
        </div>

        <div className="w-[340px] border-l bg-card flex flex-col shrink-0 shadow-sm z-10">
          {selectedConnectionId ? (
            <ConnectionProperties panelId={activePanel.id} connectionId={selectedConnectionId} onDeselect={() => setSelectedConnectionId(null)} />
          ) : (
            <div className="p-6 flex flex-col items-center justify-center text-center opacity-50 flex-1">
              <MousePointer2 className="w-10 h-10 mb-3" />
              <p className="text-sm text-muted-foreground">Select a connection to view properties</p>
              <p className="text-xs text-muted-foreground mt-1">or use "Place Connection" to add one</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ConnectionProperties({ panelId, connectionId, onDeselect }: { panelId: string; connectionId: string; onDeselect: () => void }) {
  const { project, updateConnection, deleteConnection } = useProject();
  const panel = project.panels.find(p => p.id === panelId);
  const connection = panel?.connections.find(c => c.id === connectionId);
  if (!connection) return null;

  return (
    <Tabs defaultValue="forces" className="flex-1 flex flex-col">
      <div className="p-4 border-b bg-muted/20">
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-bold text-base text-primary" data-testid="text-connection-title">Connection: {connection.label}</h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              deleteConnection(panelId, connectionId);
              onDeselect();
            }}
            data-testid="button-delete-connection"
          >
            <Trash2 className="w-4 h-4 text-destructive" />
          </Button>
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-[10px] uppercase">Label</Label>
              <Input
                value={connection.label}
                onChange={e => updateConnection(panelId, { ...connection, label: e.target.value })}
                data-testid="input-connection-label"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] uppercase">Type</Label>
              <Select value={connection.type} onValueChange={val => updateConnection(panelId, { ...connection, type: val })}>
                <SelectTrigger data-testid="select-connection-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="A">Type A</SelectItem>
                  <SelectItem value="B">Type B</SelectItem>
                  <SelectItem value="C">Type C</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-[10px] uppercase">X (in)</Label>
              <Input
                type="number"
                value={connection.x}
                onChange={e => updateConnection(panelId, { ...connection, x: Number(e.target.value) })}
                className="h-8 text-xs font-mono"
                data-testid="input-connection-x"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] uppercase">Y (in)</Label>
              <Input
                type="number"
                value={connection.y}
                onChange={e => updateConnection(panelId, { ...connection, y: Number(e.target.value) })}
                className="h-8 text-xs font-mono"
                data-testid="input-connection-y"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="border-b bg-muted/10">
        <TabsList className="w-full justify-start rounded-none h-10 bg-transparent border-none">
          <TabsTrigger value="forces" className="flex-1">Forces</TabsTrigger>
          <TabsTrigger value="load_combos" className="flex-1">LRFD</TabsTrigger>
        </TabsList>
      </div>

      <ScrollArea className="flex-1">
        <TabsContent value="forces" className="p-4 m-0">
          <div className="space-y-4">
            {Object.entries(connection.forces).map(([caseKey, forces]) => (
              <div key={caseKey} className="space-y-2 p-3 bg-muted/20 rounded border border-border/50">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">{caseKey}</div>
                  <span className="text-xs font-bold uppercase tracking-wider">{caseKey === "D" ? "Dead" : caseKey === "L" ? "Live" : caseKey === "W" ? "Wind" : "Seismic"}</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {["x", "y", "z"].map(axis => (
                    <div key={axis} className="space-y-1">
                      <Label className="text-[10px] uppercase">F{axis}</Label>
                      <Input
                        type="number"
                        className="h-7 text-xs font-mono"
                        value={forces[axis as keyof typeof forces]}
                        onChange={e => {
                          const val = Number(e.target.value);
                          updateConnection(panelId, {
                            ...connection,
                            forces: { ...connection.forces, [caseKey]: { ...forces, [axis]: val } },
                          });
                        }}
                        data-testid={`input-force-${caseKey}-${axis}`}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="load_combos" className="p-4 m-0">
          <div className="space-y-3">
            {(() => {
              const results = calculateLoadCombinations(connection as any);
              return results.map((result: any, i) => (
                <div key={i} className="p-3 bg-muted/20 rounded border border-border/50 space-y-2">
                  <div className="text-[10px] font-mono text-muted-foreground truncate">{result.comboName}</div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="text-center">
                      <div className="text-[10px] uppercase text-muted-foreground">Pu,x</div>
                      <div className="text-sm font-mono font-bold">{result.fx.toFixed(1)}</div>
                    </div>
                    <div className="text-center border-x">
                      <div className="text-[10px] uppercase text-muted-foreground">Pu,y</div>
                      <div className="text-sm font-mono font-bold">{result.fy.toFixed(1)}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-[10px] uppercase text-muted-foreground">Pu,z</div>
                      <div className="text-sm font-mono font-bold">{result.fz.toFixed(1)}</div>
                    </div>
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
