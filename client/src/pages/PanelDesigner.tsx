import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Stage, Layer, Rect, Circle, Text, Group, Line, Shape, RegularPolygon } from "react-konva";
import { useProject } from "@/lib/store";
import { Panel, ConnectionNode, ConnectionMarker, Vertex, Opening, DxfView, DimensionAnnotation, DimensionSnapRef, UserDrawnLine, LoadAnnotation, LoadAnnotationType, TextAnnotation } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { calculateLoadCombinations } from "@/lib/calculations";
import { calculateCentroid } from "@/lib/centroid";
import { parseDxfFile } from "@/lib/dxfParser";
import {
  Plus, Trash2, ZoomIn, ZoomOut, MousePointer2, Upload, Square as SquareIcon,
  ArrowUpRight, Crosshair, RotateCcw, Ruler, Minus, MoreHorizontal,
  ArrowDown, ArrowUp, ArrowLeft, ArrowRight, Circle as CircleIcon,
  MoveHorizontal, ChevronDown, Pencil, Type
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";

type SelectionType = { kind: "connection"; id: string } | { kind: "centroid" } | { kind: "viewCentroid"; viewId: string } | { kind: "dimension"; id: string } | { kind: "userLine"; id: string } | { kind: "loadAnnotation"; id: string } | { kind: "textAnnotation"; id: string } | null;

type ToolType = "select" | "connection" | "dimension" | "line_solid" | "line_hidden" | "load_line" | "load_point_vertical" | "load_point_horizontal" | "load_point_oop" | "textbox";

export default function PanelDesigner() {
  const { project, updatePanel, addPanel, deletePanel, updateConnection, addConnection, deleteConnection, addDimension, updateDimension, deleteDimension, addUserLine, updateUserLine, deleteUserLine, addLoadAnnotation, updateLoadAnnotation, deleteLoadAnnotation, addTextAnnotation, updateTextAnnotation, deleteTextAnnotation } = useProject();
  const stageRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const [activePanelId, setActivePanelId] = useState<string>(project.panels[0]?.id || "");
  const [activePanel, setActivePanel] = useState<Panel | undefined>(undefined);
  const [selection, setSelection] = useState<SelectionType>(null);
  const [scale, setScale] = useState(3);
  const [tool, setTool] = useState<ToolType>("select");
  const [currentMousePos, setCurrentMousePos] = useState<{ x: number; y: number } | null>(null);
  const [snapIndicator, setSnapIndicator] = useState<{ x: number; y: number } | null>(null);
  const [centroidHovered, setCentroidHovered] = useState(false);

  // Dimension tool state
  const [dimFirstPoint, setDimFirstPoint] = useState<{ x: number; y: number; ref: DimensionSnapRef } | null>(null);
  const [dimPreviewEnd, setDimPreviewEnd] = useState<{ x: number; y: number } | null>(null);
  const [shiftHeld, setShiftHeld] = useState(false);

  // User-drawn line tool state
  const [lineFirstPoint, setLineFirstPoint] = useState<{ x: number; y: number; ref: DimensionSnapRef } | null>(null);
  const [linePreviewEnd, setLinePreviewEnd] = useState<{ x: number; y: number } | null>(null);

  // Load line annotation tool state
  const [loadLineFirstPoint, setLoadLineFirstPoint] = useState<{ x: number; y: number; ref: DimensionSnapRef } | null>(null);
  const [loadLinePreviewEnd, setLoadLinePreviewEnd] = useState<{ x: number; y: number } | null>(null);

  // Orthographic drag state for connections and load annotations
  const [dragState, setDragState] = useState<{
    elementType: "connection" | "loadAnnotation";
    elementId: string;
    originalX: number;
    originalY: number;
    currentX: number;
    currentY: number;
    axis: "h" | "v" | null;
  } | null>(null);

  const [rectDialogOpen, setRectDialogOpen] = useState(false);
  const [rectWidth, setRectWidth] = useState(120);
  const [rectHeight, setRectHeight] = useState(180);

  const [coordDialogOpen, setCoordDialogOpen] = useState(false);
  const [coordX, setCoordX] = useState(0);
  const [coordY, setCoordY] = useState(0);

  const SNAP_TOLERANCE = 10;
  const GRID_SPACING = 12;
  const DATUM_SIZE = 30;
  const ARROW_KEY_INCREMENT = 0.5; // inches per arrow key press

  // Refs for arrow-key nudge (so the keydown handler always sees latest state)
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const activePanelRef = useRef(activePanel);
  activePanelRef.current = activePanel;

  useEffect(() => {
    const p = project.panels.find(p => p.id === activePanelId);
    if (p) setActivePanel(p);
    else if (project.panels.length > 0) setActivePanelId(project.panels[0].id);
  }, [project.panels, activePanelId]);

  const computedCentroid = useMemo(() => {
    if (!activePanel || activePanel.perimeter.length < 3) return null;
    return calculateCentroid(activePanel.perimeter, activePanel.openings);
  }, [activePanel?.perimeter, activePanel?.openings]);

  const centroidPos = useMemo(() => {
    if (!activePanel) return null;
    if (activePanel.centroidX !== undefined && activePanel.centroidY !== undefined) {
      return { x: activePanel.centroidX, y: activePanel.centroidY };
    }
    return computedCentroid;
  }, [activePanel?.centroidX, activePanel?.centroidY, computedCentroid]);

  const getSnapPoints = useCallback((): { x: number; y: number }[] => {
    if (!activePanel) return [];
    const pts: { x: number; y: number }[] = [];

    const addOpeningSnaps = (openings: Opening[]) => {
      openings.forEach(op => {
        if (op.vertices) {
          op.vertices.forEach(v => pts.push({ x: v.x, y: v.y }));
        } else {
          pts.push({ x: op.x, y: op.y });
          pts.push({ x: op.x + op.width, y: op.y });
          pts.push({ x: op.x, y: op.y + op.height });
          pts.push({ x: op.x + op.width, y: op.y + op.height });
        }
      });
    };

    if (activePanel.dxfViews && activePanel.dxfViews.length > 0) {
      activePanel.dxfViews.forEach(view => {
        view.polygon.forEach(v => pts.push({ x: v.x, y: v.y }));
        addOpeningSnaps(view.openings);
      });
    } else {
      activePanel.perimeter.forEach(v => pts.push({ x: v.x, y: v.y }));
      addOpeningSnaps(activePanel.openings);
    }

    activePanel.sketchLines?.forEach(l => {
      pts.push({ x: l.x1, y: l.y1 });
      pts.push({ x: l.x2, y: l.y2 });
    });
    (activePanel.importedNodes || []).forEach(n => pts.push(n));

    // Connection locations
    activePanel.connections.forEach(c => pts.push({ x: c.x, y: c.y }));

    // CG markers
    if (activePanel.centroidX !== undefined && activePanel.centroidY !== undefined) {
      pts.push({ x: activePanel.centroidX, y: activePanel.centroidY });
    }
    if (activePanel.dxfViews) {
      activePanel.dxfViews.forEach(v => {
        if (v.showCentroid) {
          const cx = v.centroidX ?? v.polygon.reduce((s, p) => s + p.x, 0) / v.polygon.length;
          const cy = v.centroidY ?? v.polygon.reduce((s, p) => s + p.y, 0) / v.polygon.length;
          pts.push({ x: cx, y: cy });
        }
      });
    }

    // Existing dimension endpoints
    (activePanel.dimensions || []).forEach(d => {
      pts.push({ x: d.startX, y: d.startY });
      pts.push({ x: d.endX, y: d.endY });
    });

    // User-drawn line endpoints
    (activePanel.userLines || []).forEach(l => {
      pts.push({ x: l.x1, y: l.y1 });
      pts.push({ x: l.x2, y: l.y2 });
    });

    // Load annotation points
    (activePanel.loadAnnotations || []).forEach(a => {
      pts.push({ x: a.startX, y: a.startY });
      if (a.type === "line_load") {
        pts.push({ x: a.endX, y: a.endY });
      }
    });

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

  const getSnapRef = useCallback((x: number, y: number): DimensionSnapRef => {
    if (!activePanel) return { kind: "free" };
    const tol = SNAP_TOLERANCE;
    const dist = (a: number, b: number, c: number, d: number) => Math.sqrt((a - c) ** 2 + (b - d) ** 2);

    // Check connections
    for (const c of activePanel.connections) {
      if (dist(x, y, c.x, c.y) < tol) return { kind: "connection", connectionId: c.id };
    }
    // Check CG
    if (activePanel.centroidX !== undefined && activePanel.centroidY !== undefined) {
      if (dist(x, y, activePanel.centroidX, activePanel.centroidY) < tol) return { kind: "centroid" };
    }
    // Check view centroids
    if (activePanel.dxfViews) {
      for (const v of activePanel.dxfViews) {
        if (v.showCentroid) {
          const cx = v.centroidX ?? v.polygon.reduce((s, p) => s + p.x, 0) / v.polygon.length;
          const cy = v.centroidY ?? v.polygon.reduce((s, p) => s + p.y, 0) / v.polygon.length;
          if (dist(x, y, cx, cy) < tol) return { kind: "viewCentroid", viewId: v.id };
        }
      }
    }
    // Check dimension endpoints
    for (const d of (activePanel.dimensions || [])) {
      if (dist(x, y, d.startX, d.startY) < tol) return { kind: "dimension", dimensionId: d.id, endpoint: "start" };
      if (dist(x, y, d.endX, d.endY) < tol) return { kind: "dimension", dimensionId: d.id, endpoint: "end" };
    }
    // Check geometry vertices
    const allVerts = activePanel.dxfViews && activePanel.dxfViews.length > 0
      ? activePanel.dxfViews.flatMap(v => v.polygon)
      : activePanel.perimeter;
    for (const v of allVerts) {
      if (dist(x, y, v.x, v.y) < tol) return { kind: "vertex", vertexId: v.id };
    }
    return { kind: "free" };
  }, [activePanel]);

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
      if (result.dxfViews.length === 0) {
        toast({ title: "Import Warning", description: "No valid closed shapes found in the DXF file.", variant: "destructive" });
        return;
      }

      if (activePanel) {
        const w = result.width;
        const h = result.height;
        const centroid = result.perimeter.length >= 3
          ? calculateCentroid(result.perimeter, result.openings)
          : { x: w / 2, y: h / 2 };
        updatePanel({
          ...activePanel,
          width: w,
          height: h,
          perimeter: result.perimeter,
          openings: result.openings,
          dxfViews: result.dxfViews,
          sketchLines: result.sketchLines.map(l => ({ id: crypto.randomUUID(), ...l })),
          importedNodes: result.nodes,
          centroidX: centroid.x,
          centroidY: centroid.y,
        });
        const viewCount = result.dxfViews.length;
        const totalOpenings = result.dxfViews.reduce((s, v) => s + v.openings.length, 0);
        toast({
          title: "DXF Imported",
          description: `Imported ${viewCount} view${viewCount > 1 ? "s" : ""} (${w.toFixed(1)}" × ${h.toFixed(1)}")${totalOpenings > 0 ? ` with ${totalOpenings} opening(s)` : ""}.`,
        });
      }
    } catch (err: any) {
      toast({ title: "Import Error", description: err.message || "Failed to parse DXF file.", variant: "destructive" });
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
      centroidX: w / 2,
      centroidY: h / 2,
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
      marker: "diamond",
      x: coordX,
      y: coordY,
      forces: { D: { x: 0, y: 0, z: 0 }, L: { x: 0, y: 0, z: 0 }, W: { x: 0, y: 0, z: 0 }, E: { x: 0, y: 0, z: 0 } },
    };
    addConnection(activePanel.id, conn);
    setSelection({ kind: "connection", id });
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

    const isDrawingTool = tool !== "select";
    if (isDrawingTool) {
      const snap = snapToPoint(cad.x, cad.y);
      setSnapIndicator(snap.snapped ? snap : null);

      if (tool === "dimension" && dimFirstPoint) {
        let endX = snap.snapped ? snap.x : cad.x;
        let endY = snap.snapped ? snap.y : cad.y;
        if (shiftHeld) {
          const dx = Math.abs(endX - dimFirstPoint.x);
          const dy = Math.abs(endY - dimFirstPoint.y);
          if (dx >= dy) endY = dimFirstPoint.y;
          else endX = dimFirstPoint.x;
        }
        setDimPreviewEnd({ x: endX, y: endY });
      }

      if ((tool === "line_solid" || tool === "line_hidden") && lineFirstPoint) {
        let endX = snap.snapped ? snap.x : cad.x;
        let endY = snap.snapped ? snap.y : cad.y;
        if (shiftHeld) {
          const dx = Math.abs(endX - lineFirstPoint.x);
          const dy = Math.abs(endY - lineFirstPoint.y);
          if (dx >= dy) endY = lineFirstPoint.y;
          else endX = lineFirstPoint.x;
        }
        setLinePreviewEnd({ x: endX, y: endY });
      }

      if (tool === "load_line" && loadLineFirstPoint) {
        let endX = snap.snapped ? snap.x : cad.x;
        let endY = snap.snapped ? snap.y : cad.y;
        if (shiftHeld) {
          const dx = Math.abs(endX - loadLineFirstPoint.x);
          const dy = Math.abs(endY - loadLineFirstPoint.y);
          if (dx >= dy) endY = loadLineFirstPoint.y;
          else endX = loadLineFirstPoint.x;
        }
        setLoadLinePreviewEnd({ x: endX, y: endY });
      }
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
        setSelection(null);
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
        marker: "diamond",
        x: finalX,
        y: finalY,
        forces: { D: { x: 0, y: 0, z: 0 }, L: { x: 0, y: 0, z: 0 }, W: { x: 0, y: 0, z: 0 }, E: { x: 0, y: 0, z: 0 } },
      };
      addConnection(activePanel.id, conn);
      setSelection({ kind: "connection", id });
      return;
    }

    if (tool === "dimension" && activePanel) {
      const snap = snapToPoint(cad.x, cad.y);
      let ptX = snap.snapped ? snap.x : Math.round(cad.x * 10) / 10;
      let ptY = snap.snapped ? snap.y : Math.round(cad.y * 10) / 10;

      if (!dimFirstPoint) {
        const ref = snap.snapped ? getSnapRef(ptX, ptY) : { kind: "free" as const };
        setDimFirstPoint({ x: ptX, y: ptY, ref });
      } else {
        if (shiftHeld) {
          const dx = Math.abs(ptX - dimFirstPoint.x);
          const dy = Math.abs(ptY - dimFirstPoint.y);
          if (dx >= dy) ptY = dimFirstPoint.y;
          else ptX = dimFirstPoint.x;
        }
        const ref = snap.snapped ? getSnapRef(ptX, ptY) : { kind: "free" as const };
        const dim: DimensionAnnotation = {
          id: crypto.randomUUID(),
          startX: dimFirstPoint.x,
          startY: dimFirstPoint.y,
          startRef: dimFirstPoint.ref,
          endX: ptX,
          endY: ptY,
          endRef: ref,
          offset: 20,
        };
        addDimension(activePanel.id, dim);
        setDimFirstPoint(null);
        setDimPreviewEnd(null);
        setSelection({ kind: "dimension", id: dim.id });
      }
      return;
    }

    if ((tool === "line_solid" || tool === "line_hidden") && activePanel) {
      const snap = snapToPoint(cad.x, cad.y);
      let ptX = snap.snapped ? snap.x : Math.round(cad.x * 10) / 10;
      let ptY = snap.snapped ? snap.y : Math.round(cad.y * 10) / 10;

      if (!lineFirstPoint) {
        const ref = snap.snapped ? getSnapRef(ptX, ptY) : { kind: "free" as const };
        setLineFirstPoint({ x: ptX, y: ptY, ref });
      } else {
        if (shiftHeld) {
          const dx = Math.abs(ptX - lineFirstPoint.x);
          const dy = Math.abs(ptY - lineFirstPoint.y);
          if (dx >= dy) ptY = lineFirstPoint.y;
          else ptX = lineFirstPoint.x;
        }
        const ref = snap.snapped ? getSnapRef(ptX, ptY) : { kind: "free" as const };
        const line: UserDrawnLine = {
          id: crypto.randomUUID(),
          x1: lineFirstPoint.x,
          y1: lineFirstPoint.y,
          startRef: lineFirstPoint.ref,
          x2: ptX,
          y2: ptY,
          endRef: ref,
          lineType: tool === "line_solid" ? "solid" : "hidden",
        };
        addUserLine(activePanel.id, line);
        setLineFirstPoint(null);
        setLinePreviewEnd(null);
        setSelection({ kind: "userLine", id: line.id });
      }
      return;
    }

    if (tool === "load_line" && activePanel) {
      const snap = snapToPoint(cad.x, cad.y);
      let ptX = snap.snapped ? snap.x : Math.round(cad.x * 10) / 10;
      let ptY = snap.snapped ? snap.y : Math.round(cad.y * 10) / 10;

      if (!loadLineFirstPoint) {
        const ref = snap.snapped ? getSnapRef(ptX, ptY) : { kind: "free" as const };
        setLoadLineFirstPoint({ x: ptX, y: ptY, ref });
      } else {
        if (shiftHeld) {
          const dx = Math.abs(ptX - loadLineFirstPoint.x);
          const dy = Math.abs(ptY - loadLineFirstPoint.y);
          if (dx >= dy) ptY = loadLineFirstPoint.y;
          else ptX = loadLineFirstPoint.x;
        }
        const ref = snap.snapped ? getSnapRef(ptX, ptY) : { kind: "free" as const };
        const annotation: LoadAnnotation = {
          id: crypto.randomUUID(),
          type: "line_load",
          startX: loadLineFirstPoint.x,
          startY: loadLineFirstPoint.y,
          startRef: loadLineFirstPoint.ref,
          endX: ptX,
          endY: ptY,
          endRef: ref,
          direction: "positive",
          label: "",
        };
        addLoadAnnotation(activePanel.id, annotation);
        setLoadLineFirstPoint(null);
        setLoadLinePreviewEnd(null);
        setSelection({ kind: "loadAnnotation", id: annotation.id });
      }
      return;
    }

    if ((tool === "load_point_vertical" || tool === "load_point_horizontal" || tool === "load_point_oop") && activePanel) {
      const snap = snapToPoint(cad.x, cad.y);
      const ptX = snap.snapped ? snap.x : Math.round(cad.x * 10) / 10;
      const ptY = snap.snapped ? snap.y : Math.round(cad.y * 10) / 10;
      const ref = snap.snapped ? getSnapRef(ptX, ptY) : { kind: "free" as const };

      const typeMap: Record<string, LoadAnnotationType> = {
        load_point_vertical: "point_vertical",
        load_point_horizontal: "point_horizontal",
        load_point_oop: "point_out_of_plane",
      };
      const directionMap: Record<string, "down" | "right" | "positive"> = {
        load_point_vertical: "down",
        load_point_horizontal: "right",
        load_point_oop: "positive",
      };

      const annotation: LoadAnnotation = {
        id: crypto.randomUUID(),
        type: typeMap[tool],
        startX: ptX,
        startY: ptY,
        startRef: ref,
        endX: ptX,
        endY: ptY,
        endRef: ref,
        direction: directionMap[tool],
        label: "",
      };
      addLoadAnnotation(activePanel.id, annotation);
      setSelection({ kind: "loadAnnotation", id: annotation.id });
      return;
    }

    if (tool === "textbox" && activePanel) {
      const snap = snapToPoint(cad.x, cad.y);
      const ptX = snap.snapped ? snap.x : Math.round(cad.x * 10) / 10;
      const ptY = snap.snapped ? snap.y : Math.round(cad.y * 10) / 10;
      const ta: TextAnnotation = {
        id: crypto.randomUUID(),
        x: ptX,
        y: ptY,
        width: 24,   // default 24" wide
        height: 12,  // default 12" tall
        text: "",
        showBorder: true,
      };
      addTextAnnotation(activePanel.id, ta);
      setSelection({ kind: "textAnnotation", id: ta.id });
      setTool("select");
      return;
    }
  };

  const onWheel = (e: any) => {
    e.evt.preventDefault();
    const stage = e.target.getStage();
    if (!stage) return;
    const oldScale = stage.scaleX();
    const pointer = stage.getPointerPosition();
    if (!pointer) return;
    const scaleBy = 1.1;
    const newScale = e.evt.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy;
    stage.scale({ x: newScale, y: newScale });
    const newPos = {
      x: pointer.x - (pointer.x - stage.x()) * (newScale / oldScale),
      y: pointer.y - (pointer.y - stage.y()) * (newScale / oldScale),
    };
    stage.position(newPos);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setTool("select");
        setDimFirstPoint(null);
        setDimPreviewEnd(null);
        setLineFirstPoint(null);
        setLinePreviewEnd(null);
        setLoadLineFirstPoint(null);
        setLoadLinePreviewEnd(null);
      }
      if (e.key === "Shift") setShiftHeld(true);

      // Arrow key nudge for selected connections and load annotations
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        const sel = selectionRef.current;
        const panel = activePanelRef.current;
        if (!sel || !panel) return;
        // Don't intercept if an input is focused
        if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA") return;
        e.preventDefault();

        const inc = ARROW_KEY_INCREMENT;
        let dx = 0, dy = 0;
        if (e.key === "ArrowLeft") dx = -inc;
        if (e.key === "ArrowRight") dx = inc;
        if (e.key === "ArrowUp") dy = inc;    // CAD Y is up
        if (e.key === "ArrowDown") dy = -inc;

        if (sel.kind === "connection") {
          const conn = panel.connections.find(c => c.id === sel.id);
          if (conn) {
            updateConnection(panel.id, {
              ...conn,
              x: Math.round((conn.x + dx) * 10) / 10,
              y: Math.round((conn.y + dy) * 10) / 10,
            });
          }
        } else if (sel.kind === "loadAnnotation") {
          const ann = panel.loadAnnotations?.find(a => a.id === sel.id);
          if (ann) {
            updateLoadAnnotation(panel.id, {
              ...ann,
              startX: Math.round((ann.startX + dx) * 10) / 10,
              startY: Math.round((ann.startY + dy) * 10) / 10,
              endX: Math.round((ann.endX + dx) * 10) / 10,
              endY: Math.round((ann.endY + dy) * 10) / 10,
            });
          }
        } else if (sel.kind === "userLine") {
          const line = panel.userLines?.find(l => l.id === sel.id);
          if (line) {
            updateUserLine(panel.id, {
              ...line,
              x1: Math.round((line.x1 + dx) * 10) / 10,
              y1: Math.round((line.y1 + dy) * 10) / 10,
              x2: Math.round((line.x2 + dx) * 10) / 10,
              y2: Math.round((line.y2 + dy) * 10) / 10,
            });
          }
        } else if (sel.kind === "dimension") {
          const dim = panel.dimensions?.find(d => d.id === sel.id);
          if (dim) {
            updateDimension(panel.id, {
              ...dim,
              startX: Math.round((dim.startX + dx) * 10) / 10,
              startY: Math.round((dim.startY + dy) * 10) / 10,
              endX: Math.round((dim.endX + dx) * 10) / 10,
              endY: Math.round((dim.endY + dy) * 10) / 10,
            });
          }
        } else if (sel.kind === "textAnnotation") {
          const ta = panel.textAnnotations?.find(t => t.id === sel.id);
          if (ta) {
            updateTextAnnotation(panel.id, {
              ...ta,
              x: Math.round((ta.x + dx) * 10) / 10,
              y: Math.round((ta.y + dy) * 10) / 10,
            });
          }
        }
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Shift") setShiftHeld(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  if (!activePanel) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-100" data-testid="empty-state">
        <div className="text-center space-y-4">
          <p className="text-muted-foreground">No panels yet. Create one to get started.</p>
          <Button onClick={() => { const id = addPanel(); setActivePanelId(id); }} data-testid="button-create-panel"><Plus className="w-4 h-4 mr-2" /> Create Panel</Button>
        </div>
      </div>
    );
  }

  const hasGeometry = activePanel.perimeter.length >= 3 || (activePanel.dxfViews && activePanel.dxfViews.length > 0);
  const hasDxfViews = !!(activePanel.dxfViews && activePanel.dxfViews.length > 0);
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

  const selectedConnectionId = selection?.kind === "connection" ? selection.id : null;
  const isCentroidSelected = selection?.kind === "centroid";

  const renderConnectionMarker = (c: ConnectionNode, isSelected: boolean) => {
    const markerType = c.marker || "diamond";
    const fill = isSelected ? "#dc2626" : "#22c55e";
    const stroke = isSelected ? "#991b1b" : "#15803d";
    const size = 16;

    switch (markerType) {
      case "triangle-down":
        return (
          <RegularPolygon
            sides={3}
            radius={size}
            fill={fill}
            stroke={stroke}
            strokeWidth={1}
            rotation={180}
          />
        );
      case "circle":
        return (
          <Circle
            radius={size - 1}
            fill={fill}
            stroke={stroke}
            strokeWidth={1}
          />
        );
      case "square":
        return (
          <Rect
            x={-size + 1}
            y={-size + 1}
            width={(size - 1) * 2}
            height={(size - 1) * 2}
            fill={fill}
            stroke={stroke}
            strokeWidth={1}
          />
        );
      case "diamond":
      default:
        return (
          <Rect
            x={-12} y={-12} width={24} height={24}
            fill={fill}
            stroke={stroke}
            strokeWidth={1}
            rotation={45}
          />
        );
    }
  };

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
          <Button variant="outline" size="sm" onClick={() => { const id = addPanel(); setActivePanelId(id); }} className="h-9" data-testid="button-new-panel">
            <Plus className="w-4 h-4 mr-1" /> New
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 text-destructive hover:text-destructive" data-testid="button-delete-panel">
                <Trash2 className="w-4 h-4 mr-1" /> Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Panel "{activePanel.name}"?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently remove the panel and all {activePanel.connections.length} connection(s) on it. Connection data will also be removed from the Master Spreadsheet. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel data-testid="button-cancel-delete-panel">Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={() => {
                    const id = activePanel.id;
                    const remaining = project.panels.filter(p => p.id !== id);
                    deletePanel(id);
                    setSelection(null);
                    if (remaining.length > 0) {
                      setActivePanelId(remaining[0].id);
                    } else {
                      setActivePanelId("");
                    }
                    toast({ title: "Panel Deleted", description: `Panel "${activePanel.name}" and its connections have been removed.` });
                  }}
                  data-testid="button-confirm-delete-panel"
                >
                  Delete Panel
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
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
                <SquareIcon className="w-4 h-4 mr-1" /> Rectangle
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

        <div className="flex items-center gap-1.5">
          <Button
            variant={tool === "select" ? "default" : "outline"}
            size="sm"
            onClick={() => setTool("select")}
            className="h-9"
            data-testid="button-tool-select"
          >
            <MousePointer2 className="w-4 h-4 mr-1" /> Select
          </Button>

          <Separator orientation="vertical" className="h-5 mx-0.5" />

          {/* Element tools */}
          <Button
            variant={tool === "connection" ? "default" : "outline"}
            size="sm"
            onClick={() => setTool("connection")}
            className="h-9"
            data-testid="button-tool-connection"
          >
            <Crosshair className="w-4 h-4 mr-1" /> Connection
          </Button>
          <Dialog open={coordDialogOpen} onOpenChange={setCoordDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="h-9" data-testid="button-add-by-coord">
                <ArrowUpRight className="w-4 h-4 mr-1" /> XY
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

          <Separator orientation="vertical" className="h-5 mx-0.5" />

          {/* Annotation tools */}
          <Button
            variant={tool === "dimension" ? "default" : "outline"}
            size="sm"
            onClick={() => { setTool("dimension"); setDimFirstPoint(null); setDimPreviewEnd(null); }}
            className="h-9"
            data-testid="button-tool-dimension"
          >
            <Ruler className="w-4 h-4 mr-1" /> Dim
          </Button>

          <Separator orientation="vertical" className="h-5 mx-0.5" />

          {/* Drawing tools */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant={(tool === "line_solid" || tool === "line_hidden") ? "default" : "outline"}
                size="sm"
                className="h-9"
                data-testid="button-tool-draw-menu"
              >
                <Pencil className="w-4 h-4 mr-1" /> Draw <ChevronDown className="w-3 h-3 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => { setTool("line_solid"); setLineFirstPoint(null); setLinePreviewEnd(null); }} data-testid="button-tool-line-solid">
                <Minus className="w-4 h-4 mr-2" /> Solid Line
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { setTool("line_hidden"); setLineFirstPoint(null); setLinePreviewEnd(null); }} data-testid="button-tool-line-hidden">
                <MoreHorizontal className="w-4 h-4 mr-2" /> Hidden Line
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Separator orientation="vertical" className="h-5 mx-0.5" />

          {/* Load annotation tools */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant={(tool === "load_line" || tool === "load_point_vertical" || tool === "load_point_horizontal" || tool === "load_point_oop") ? "default" : "outline"}
                size="sm"
                className="h-9"
                data-testid="button-tool-load-menu"
              >
                <ArrowDown className="w-4 h-4 mr-1" /> Loads <ChevronDown className="w-3 h-3 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => { setTool("load_line"); setLoadLineFirstPoint(null); setLoadLinePreviewEnd(null); }} data-testid="button-tool-load-line">
                <MoveHorizontal className="w-4 h-4 mr-2" /> Line Load
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTool("load_point_vertical")} data-testid="button-tool-load-vertical">
                <ArrowDown className="w-4 h-4 mr-2" /> Vertical Point Load
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTool("load_point_horizontal")} data-testid="button-tool-load-horizontal">
                <ArrowRight className="w-4 h-4 mr-2" /> Horizontal Point Load
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTool("load_point_oop")} data-testid="button-tool-load-oop">
                <CircleIcon className="w-4 h-4 mr-2" /> Out-of-Plane Point Load
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Separator orientation="vertical" className="h-5 mx-0.5" />

          {/* Textbox tool */}
          <Button
            variant={tool === "textbox" ? "default" : "outline"}
            size="sm"
            onClick={() => setTool("textbox")}
            className="h-9"
            data-testid="button-tool-textbox"
          >
            <Type className="w-4 h-4 mr-1" /> Text
          </Button>
        </div>

        <div className="flex-1" />

        {hasDxfViews && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/50 rounded px-2 py-1" data-testid="text-view-count">
            {activePanel.dxfViews!.length} view{activePanel.dxfViews!.length > 1 ? "s" : ""}
          </div>
        )}

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => setScale(s => Math.min(s * 1.2, 20))} data-testid="button-zoom-in"><ZoomIn className="w-4 h-4" /></Button>
          <span className="text-xs text-muted-foreground font-mono w-12 text-center">{Math.round(scale * 100 / 3)}%</span>
          <Button variant="ghost" size="icon" onClick={() => setScale(s => Math.max(s / 1.2, 0.5))} data-testid="button-zoom-out"><ZoomOut className="w-4 h-4" /></Button>
          <Button variant="ghost" size="icon" onClick={() => { setScale(3); if (stageRef.current) { stageRef.current.scale({ x: 1, y: 1 }); stageRef.current.position({ x: 0, y: 0 }); } }} data-testid="button-zoom-reset"><RotateCcw className="w-4 h-4" /></Button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex flex-col min-w-0 bg-slate-100 relative">
          <>
          <div className="absolute top-3 left-3 z-10 bg-background/90 backdrop-blur-sm border rounded-md px-3 py-1.5 shadow-sm text-xs font-mono" data-testid="text-coordinates">
            X: {currentMousePos?.x?.toFixed(1) ?? "—"}" &nbsp; Y: {currentMousePos?.y?.toFixed(1) ?? "—"}"
          </div>

          {tool === "connection" && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 bg-primary text-primary-foreground rounded-md px-4 py-1.5 shadow-sm text-xs font-medium">
              Click on the canvas to place a connection. Snap to geometry points. Press Escape to cancel.
            </div>
          )}

          {tool === "dimension" && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 bg-primary text-primary-foreground rounded-md px-4 py-1.5 shadow-sm text-xs font-medium">
              {dimFirstPoint
                ? "Click the second point to complete the dimension. Hold Shift for orthogonal constraint."
                : "Click the first point for the dimension. Snap to geometry, connections, or CG markers."
              }
            </div>
          )}

          {(tool === "line_solid" || tool === "line_hidden") && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 bg-primary text-primary-foreground rounded-md px-4 py-1.5 shadow-sm text-xs font-medium">
              {lineFirstPoint
                ? `Click the second point to complete the ${tool === "line_solid" ? "solid" : "hidden"} line. Hold Shift for orthogonal.`
                : `Click the first point for the ${tool === "line_solid" ? "solid" : "hidden (dashed)"} line.`
              }
            </div>
          )}

          {tool === "load_line" && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 bg-primary text-primary-foreground rounded-md px-4 py-1.5 shadow-sm text-xs font-medium">
              {loadLineFirstPoint
                ? "Click the second point to complete the line load. Hold Shift for orthogonal."
                : "Click the first point to define the line load extent."
              }
            </div>
          )}

          {(tool === "load_point_vertical" || tool === "load_point_horizontal" || tool === "load_point_oop") && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 bg-primary text-primary-foreground rounded-md px-4 py-1.5 shadow-sm text-xs font-medium">
              Click to place a {tool === "load_point_vertical" ? "vertical" : tool === "load_point_horizontal" ? "horizontal" : "out-of-plane"} point load. Press Escape to cancel.
            </div>
          )}

          {tool === "textbox" && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 bg-primary text-primary-foreground rounded-md px-4 py-1.5 shadow-sm text-xs font-medium">
              Click to place a text box. Press Escape to cancel.
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
                    <SquareIcon className="w-4 h-4 mr-1" /> Rectangle
                  </Button>
                </div>
              </div>
            </div>
          )}

          <div className={`flex-1 overflow-hidden ${tool !== "select" ? "cursor-crosshair" : "cursor-default"}`}>
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

                  {hasGeometry && hasDxfViews && activePanel.dxfViews!.map((view, viewIdx) => {
                    const fillColor = viewIdx === 0 ? "#dbeafe" : viewIdx === 1 ? "#dcfce7" : viewIdx === 2 ? "#fef9c3" : "#f3e8ff";
                    const strokeColor = viewIdx === 0 ? "#1e40af" : viewIdx === 1 ? "#15803d" : viewIdx === 2 ? "#854d0e" : "#6d28d9";
                    return (
                      <Shape
                        key={view.id}
                        sceneFunc={(context) => {
                          const ctx = context._context;
                          ctx.beginPath();
                          const pVerts = view.polygon;
                          if (pVerts.length > 0) {
                            const first = screenFromCad(pVerts[0].x, pVerts[0].y);
                            ctx.moveTo(first.x, first.y);
                            for (let i = 1; i < pVerts.length; i++) {
                              const pt = screenFromCad(pVerts[i].x, pVerts[i].y);
                              ctx.lineTo(pt.x, pt.y);
                            }
                            ctx.closePath();
                          }
                          view.openings.forEach(op => {
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
                              ctx.moveTo(tl.x, tl.y);
                              ctx.lineTo(tl.x + op.width * scale, tl.y);
                              ctx.lineTo(tl.x + op.width * scale, tl.y + op.height * scale);
                              ctx.lineTo(tl.x, tl.y + op.height * scale);
                              ctx.closePath();
                            } else if (op.type === "circle") {
                              const center = screenFromCad(op.x + op.width / 2, op.y + op.height / 2);
                              const radius = (op.width / 2) * scale;
                              ctx.moveTo(center.x + radius, center.y);
                              ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
                              ctx.closePath();
                            }
                          });
                          ctx.fillStyle = fillColor;
                          ctx.fill("evenodd");
                          ctx.strokeStyle = strokeColor;
                          ctx.lineWidth = 2;
                          ctx.stroke();
                        }}
                      />
                    );
                  })}

                  {hasGeometry && !hasDxfViews && (
                    <Shape
                      sceneFunc={(context) => {
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

                  {!hasDxfViews && activePanel.openings.map(op => {
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

                  {hasDxfViews && activePanel.dxfViews!.map((view, viewIdx) => {
                    if (!view.showCentroid) return null;
                    const computedAvgX = view.polygon.reduce((s, v) => s + v.x, 0) / view.polygon.length;
                    const computedAvgY = view.polygon.reduce((s, v) => s + v.y, 0) / view.polygon.length;
                    const cgX = view.centroidX ?? computedAvgX;
                    const cgY = view.centroidY ?? computedAvgY;
                    const s = screenFromCad(cgX, cgY);
                    const isViewCgSelected = selection?.kind === "viewCentroid" && selection.viewId === view.id;
                    const baseColor = viewIdx === 0 ? "#7c3aed" : viewIdx === 1 ? "#15803d" : viewIdx === 2 ? "#854d0e" : "#7c3aed";
                    const color = isViewCgSelected ? "#dc2626" : baseColor;
                    return (
                      <Group
                        key={`cg-${view.id}`}
                        x={s.x}
                        y={s.y}
                        draggable
                        onDragEnd={(e) => {
                          const newScreenX = e.target.x();
                          const newScreenY = e.target.y();
                          const newCad = cadFromScreen(newScreenX, newScreenY);
                          const updatedViews = activePanel.dxfViews!.map(v =>
                            v.id === view.id ? { ...v, centroidX: Math.round(newCad.x * 100) / 100, centroidY: Math.round(newCad.y * 100) / 100 } : v
                          );
                          updatePanel({ ...activePanel, dxfViews: updatedViews });
                          e.target.position({ x: newScreenX, y: newScreenY });
                        }}
                        onClick={(e) => {
                          e.cancelBubble = true;
                          setSelection({ kind: "viewCentroid", viewId: view.id });
                        }}
                        onMouseEnter={(e) => {
                          const container = e.target.getStage()?.container();
                          if (container) container.style.cursor = "pointer";
                        }}
                        onMouseLeave={(e) => {
                          const container = e.target.getStage()?.container();
                          if (container) container.style.cursor = tool === "connection" ? "crosshair" : "default";
                        }}
                      >
                        <Circle radius={10} stroke={color} strokeWidth={isViewCgSelected ? 2.5 : 1.5} fill={isViewCgSelected ? "rgba(124, 58, 237, 0.1)" : "transparent"} />
                        <Line points={[-10, 0, 10, 0]} stroke={color} strokeWidth={isViewCgSelected ? 2 : 1.5} />
                        <Line points={[0, -10, 0, 10]} stroke={color} strokeWidth={isViewCgSelected ? 2 : 1.5} />
                        <Text text="CG" x={12} y={-6} fontSize={10} fontStyle="bold" fill={color} />
                      </Group>
                    );
                  })}

                  {activePanel.sketchLines?.map(l => {
                    const s1 = screenFromCad(l.x1, l.y1);
                    const s2 = screenFromCad(l.x2, l.y2);
                    return <Line key={l.id} points={[s1.x, s1.y, s2.x, s2.y]} stroke="#475569" strokeWidth={1} />;
                  })}

                  {hasGeometry && (
                    <Group>
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

                            {/* Z axis at ~45deg angle (out-of-plane) */}
                            <Line points={[0, 0, DATUM_SIZE * 0.7, -DATUM_SIZE * 0.7]} stroke="#2563eb" strokeWidth={2} />
                            <Line points={[
                              DATUM_SIZE * 0.7 - 0.7 * 6 - 0.7 * 4, -DATUM_SIZE * 0.7 + 0.7 * 6 - 0.7 * 4,
                              DATUM_SIZE * 0.7, -DATUM_SIZE * 0.7,
                              DATUM_SIZE * 0.7 - 0.7 * 6 + 0.7 * 4, -DATUM_SIZE * 0.7 + 0.7 * 6 + 0.7 * 4,
                            ]} stroke="#2563eb" strokeWidth={2} />
                            <Text text="Z" x={DATUM_SIZE * 0.7 + 4} y={-DATUM_SIZE * 0.7 - 12} fontSize={11} fill="#2563eb" fontStyle="bold" />

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

                  {centroidPos && hasGeometry && !hasDxfViews && (() => {
                    const s = screenFromCad(centroidPos.x, centroidPos.y);
                    const cgColor = isCentroidSelected ? "#dc2626" : centroidHovered ? "#a855f7" : "#7c3aed";
                    const cgStrokeWidth = isCentroidSelected || centroidHovered ? 2.5 : 2;
                    return (
                      <Group
                        x={s.x}
                        y={s.y}
                        draggable
                        onDragEnd={(e) => {
                          const newScreenX = e.target.x();
                          const newScreenY = e.target.y();
                          const newCad = cadFromScreen(newScreenX, newScreenY);
                          updatePanel({
                            ...activePanel,
                            centroidX: Math.round(newCad.x * 100) / 100,
                            centroidY: Math.round(newCad.y * 100) / 100,
                          });
                          e.target.position({ x: newScreenX, y: newScreenY });
                        }}
                        onClick={(e) => {
                          e.cancelBubble = true;
                          setSelection({ kind: "centroid" });
                        }}
                        onMouseEnter={(e) => {
                          setCentroidHovered(true);
                          const container = e.target.getStage()?.container();
                          if (container) container.style.cursor = "pointer";
                        }}
                        onMouseLeave={(e) => {
                          setCentroidHovered(false);
                          const container = e.target.getStage()?.container();
                          if (container) container.style.cursor = tool === "connection" ? "crosshair" : "default";
                        }}
                      >
                        <Circle radius={10} stroke={cgColor} strokeWidth={cgStrokeWidth} fill={isCentroidSelected || centroidHovered ? "rgba(124, 58, 237, 0.1)" : "transparent"} />
                        <Line points={[-10, 0, 10, 0]} stroke={cgColor} strokeWidth={isCentroidSelected || centroidHovered ? 2 : 1.5} />
                        <Line points={[0, -10, 0, 10]} stroke={cgColor} strokeWidth={isCentroidSelected || centroidHovered ? 2 : 1.5} />
                        <Text text="CG" x={12} y={-6} fontSize={10} fontStyle="bold" fill={cgColor} />
                      </Group>
                    );
                  })()}

                  {activePanel.connections.map(c => {
                    const s = screenFromCad(c.x, c.y);
                    const isSelected = selectedConnectionId === c.id;
                    return (
                      <Group
                        key={c.id}
                        x={s.x}
                        y={s.y}
                        draggable
                        onDragStart={() => {
                          setDragState({
                            elementType: "connection",
                            elementId: c.id,
                            originalX: c.x,
                            originalY: c.y,
                            currentX: c.x,
                            currentY: c.y,
                            axis: null,
                          });
                        }}
                        onDragMove={(e) => {
                          const newScreenX = e.target.x();
                          const newScreenY = e.target.y();
                          const rawCad = cadFromScreen(newScreenX, newScreenY);

                          const dx = rawCad.x - c.x;
                          const dy = rawCad.y - c.y;
                          let axis: "h" | "v" = Math.abs(dx) >= Math.abs(dy) ? "h" : "v";

                          let snappedX: number, snappedY: number;
                          if (axis === "h") {
                            snappedX = c.x + Math.round(dx / 0.5) * 0.5;
                            snappedY = c.y;
                          } else {
                            snappedX = c.x;
                            snappedY = c.y + Math.round(dy / 0.5) * 0.5;
                          }

                          const snappedScreen = screenFromCad(snappedX, snappedY);
                          e.target.position({ x: snappedScreen.x, y: snappedScreen.y });

                          setDragState(prev => prev ? {
                            ...prev,
                            currentX: snappedX,
                            currentY: snappedY,
                            axis,
                          } : null);
                        }}
                        onDragEnd={(e) => {
                          if (dragState) {
                            updateConnection(activePanel.id, {
                              ...c,
                              x: Math.round(dragState.currentX * 10) / 10,
                              y: Math.round(dragState.currentY * 10) / 10,
                            });
                          }
                          const finalScreen = screenFromCad(
                            dragState?.currentX ?? c.x,
                            dragState?.currentY ?? c.y
                          );
                          e.target.position({ x: finalScreen.x, y: finalScreen.y });
                          setDragState(null);
                        }}
                        onClick={(e) => {
                          e.cancelBubble = true;
                          setSelection({ kind: "connection", id: c.id });
                        }}
                      >
                        {renderConnectionMarker(c, isSelected)}
                        <Text text={c.label} x={10} y={-16} fontSize={14} fontStyle="bold" fill="#1e293b" />
                        <Text text={`(${c.x.toFixed(1)}, ${c.y.toFixed(1)})`} x={10} y={2} fontSize={12} fill="#64748b" />
                      </Group>
                    );
                  })}

                  {/* User-drawn lines */}
                  {(activePanel.userLines || []).map(line => {
                    const s1 = screenFromCad(line.x1, line.y1);
                    const s2 = screenFromCad(line.x2, line.y2);
                    const isLineSelected = selection?.kind === "userLine" && selection.id === line.id;
                    const lineColor = isLineSelected ? "#dc2626" : "#334155";
                    return (
                      <Group key={line.id} draggable
                        onDragStart={() => {
                          const midX = (line.x1 + line.x2) / 2;
                          const midY = (line.y1 + line.y2) / 2;
                          setDragState({ elementType: "loadAnnotation", elementId: line.id, originalX: midX, originalY: midY, currentX: midX, currentY: midY, axis: null });
                        }}
                        onDragMove={(e) => {
                          const midX = (line.x1 + line.x2) / 2;
                          const midY = (line.y1 + line.y2) / 2;
                          const midScreen = screenFromCad(midX, midY);
                          const rawCad = cadFromScreen(midScreen.x + e.target.x(), midScreen.y + e.target.y());
                          const dxm = rawCad.x - midX;
                          const dym = rawCad.y - midY;
                          const axis: "h" | "v" = Math.abs(dxm) >= Math.abs(dym) ? "h" : "v";
                          const snapDx = axis === "h" ? Math.round(dxm / 0.5) * 0.5 : 0;
                          const snapDy = axis === "v" ? Math.round(dym / 0.5) * 0.5 : 0;
                          const snappedMidScreen = screenFromCad(midX + snapDx, midY + snapDy);
                          e.target.position({ x: snappedMidScreen.x - midScreen.x, y: snappedMidScreen.y - midScreen.y });
                          setDragState(prev => prev ? { ...prev, currentX: midX + snapDx, currentY: midY + snapDy, axis } : null);
                        }}
                        onDragEnd={(e) => {
                          if (dragState) {
                            const midX = (line.x1 + line.x2) / 2;
                            const midY = (line.y1 + line.y2) / 2;
                            const deltaX = Math.round((dragState.currentX - midX) * 10) / 10;
                            const deltaY = Math.round((dragState.currentY - midY) * 10) / 10;
                            updateUserLine(activePanel.id, {
                              ...line,
                              x1: line.x1 + deltaX, y1: line.y1 + deltaY,
                              x2: line.x2 + deltaX, y2: line.y2 + deltaY,
                            });
                          }
                          e.target.position({ x: 0, y: 0 });
                          setDragState(null);
                        }}
                        onClick={(e) => { e.cancelBubble = true; setSelection({ kind: "userLine", id: line.id }); }}
                      >
                        <Line
                          points={[s1.x, s1.y, s2.x, s2.y]}
                          stroke={lineColor}
                          strokeWidth={isLineSelected ? 2.5 : 1.8}
                          dash={line.lineType === "hidden" ? [10, 5] : undefined}
                          hitStrokeWidth={12}
                        />
                        {isLineSelected && (
                          <>
                            <Circle x={s1.x} y={s1.y} radius={5} fill="#dc2626" opacity={0.7} draggable
                              onDragEnd={(e) => {
                                const newCad = cadFromScreen(e.target.x(), e.target.y());
                                const snap = snapToPoint(newCad.x, newCad.y);
                                const nx = snap.snapped ? snap.x : Math.round(newCad.x * 10) / 10;
                                const ny = snap.snapped ? snap.y : Math.round(newCad.y * 10) / 10;
                                const ref = snap.snapped ? getSnapRef(nx, ny) : { kind: "free" as const };
                                updateUserLine(activePanel.id, { ...line, x1: nx, y1: ny, startRef: ref });
                              }}
                            />
                            <Circle x={s2.x} y={s2.y} radius={5} fill="#dc2626" opacity={0.7} draggable
                              onDragEnd={(e) => {
                                const newCad = cadFromScreen(e.target.x(), e.target.y());
                                const snap = snapToPoint(newCad.x, newCad.y);
                                const nx = snap.snapped ? snap.x : Math.round(newCad.x * 10) / 10;
                                const ny = snap.snapped ? snap.y : Math.round(newCad.y * 10) / 10;
                                const ref = snap.snapped ? getSnapRef(nx, ny) : { kind: "free" as const };
                                updateUserLine(activePanel.id, { ...line, x2: nx, y2: ny, endRef: ref });
                              }}
                            />
                          </>
                        )}
                      </Group>
                    );
                  })}

                  {/* Load annotations */}
                  {(activePanel.loadAnnotations || []).map(ann => {
                    const isAnnSelected = selection?.kind === "loadAnnotation" && selection.id === ann.id;
                    const loadColor = isAnnSelected ? "#dc2626" : "#b91c1c";

                    if (ann.type === "line_load") {
                      const s1 = screenFromCad(ann.startX, ann.startY);
                      const s2 = screenFromCad(ann.endX, ann.endY);
                      const dx = s2.x - s1.x;
                      const dy = s2.y - s1.y;
                      const len = Math.sqrt(dx * dx + dy * dy) || 1;
                      const ux = dx / len;
                      const uy = dy / len;

                      // Arrow direction based on ann.direction
                      let ax: number, ay: number;
                      const lineDir = ann.direction || "positive";
                      if (lineDir === "up") {
                        ax = 0; ay = -1;
                      } else if (lineDir === "down") {
                        ax = 0; ay = 1;
                      } else if (lineDir === "left") {
                        ax = -1; ay = 0;
                      } else if (lineDir === "right") {
                        ax = 1; ay = 0;
                      } else if (lineDir === "negative") {
                        ax = -0.7; ay = 0.7;
                      } else {
                        // Positive = toward panel face (+Z)
                        ax = 0.7; ay = -0.7;
                      }

                      const arrowLen = 18;
                      const arrowCount = Math.max(2, Math.floor(len / 30));
                      const arrows: React.ReactElement[] = [];
                      // Arrows point FROM the outer connecting line TOWARD the base line
                      // tx = tail (outer end), bx = base (arrowhead touches base line)
                      const tailPoints: number[] = [];
                      for (let i = 0; i <= arrowCount; i++) {
                        const t = arrowCount === 0 ? 0.5 : i / arrowCount;
                        const bx = s1.x + dx * t;
                        const by = s1.y + dy * t;
                        const tx = bx + ax * arrowLen;
                        const ty = by + ay * arrowLen;
                        tailPoints.push(tx, ty);
                        // Arrow shaft from tail to base
                        arrows.push(
                          <Line key={`arr-${i}`} points={[tx, ty, bx, by]} stroke={loadColor} strokeWidth={1.5} />
                        );
                        // Arrowhead at the base (touching the applied line)
                        arrows.push(
                          <Line key={`arh-${i}`} points={[bx + (ax * 4 + ux * 4), by + (ay * 4 + uy * 4), bx, by, bx + (ax * 4 - ux * 4), by + (ay * 4 - uy * 4)]} stroke={loadColor} strokeWidth={1.5} />
                        );
                      }
                      const labelX = (s1.x + s2.x) / 2 + ax * (arrowLen + 10);
                      const labelY = (s1.y + s2.y) / 2 + ay * (arrowLen + 10);
                      return (
                        <Group key={ann.id} draggable
                          onDragStart={() => {
                            const midX = (ann.startX + ann.endX) / 2;
                            const midY = (ann.startY + ann.endY) / 2;
                            setDragState({ elementType: "loadAnnotation", elementId: ann.id, originalX: midX, originalY: midY, currentX: midX, currentY: midY, axis: null });
                          }}
                          onDragMove={(e) => {
                            const midX = (ann.startX + ann.endX) / 2;
                            const midY = (ann.startY + ann.endY) / 2;
                            const midScreen = screenFromCad(midX, midY);
                            const rawCad = cadFromScreen(midScreen.x + e.target.x(), midScreen.y + e.target.y());
                            const dxm = rawCad.x - midX;
                            const dym = rawCad.y - midY;
                            const axis: "h" | "v" = Math.abs(dxm) >= Math.abs(dym) ? "h" : "v";
                            const snapDx = axis === "h" ? Math.round(dxm / 0.5) * 0.5 : 0;
                            const snapDy = axis === "v" ? Math.round(dym / 0.5) * 0.5 : 0;
                            const snappedMidScreen = screenFromCad(midX + snapDx, midY + snapDy);
                            e.target.position({ x: snappedMidScreen.x - midScreen.x, y: snappedMidScreen.y - midScreen.y });
                            setDragState(prev => prev ? { ...prev, currentX: midX + snapDx, currentY: midY + snapDy, axis } : null);
                          }}
                          onDragEnd={(e) => {
                            if (dragState) {
                              const midX = (ann.startX + ann.endX) / 2;
                              const midY = (ann.startY + ann.endY) / 2;
                              const deltaX = Math.round((dragState.currentX - midX) * 10) / 10;
                              const deltaY = Math.round((dragState.currentY - midY) * 10) / 10;
                              updateLoadAnnotation(activePanel.id, {
                                ...ann,
                                startX: ann.startX + deltaX,
                                startY: ann.startY + deltaY,
                                endX: ann.endX + deltaX,
                                endY: ann.endY + deltaY,
                              });
                            }
                            e.target.position({ x: 0, y: 0 });
                            setDragState(null);
                          }}
                          onClick={(e) => { e.cancelBubble = true; setSelection({ kind: "loadAnnotation", id: ann.id }); }}
                        >
                          {/* Connecting line along the tail ends of the arrows */}
                          {tailPoints.length >= 4 && (
                            <Line points={tailPoints} stroke={loadColor} strokeWidth={1.5} />
                          )}
                          {arrows}
                          {ann.label && <Text text={ann.label} x={labelX} y={labelY - 8} fontSize={14} fill={loadColor} fontStyle="bold" />}
                          {/* Invisible hit area along base line for click detection */}
                          <Line points={[s1.x, s1.y, s2.x, s2.y]} stroke="transparent" hitStrokeWidth={14} />
                          {isAnnSelected && (
                            <>
                              <Circle x={s1.x} y={s1.y} radius={5} fill="#dc2626" opacity={0.7} />
                              <Circle x={s2.x} y={s2.y} radius={5} fill="#dc2626" opacity={0.7} />
                            </>
                          )}
                        </Group>
                      );
                    }

                    // Point loads
                    const s = screenFromCad(ann.startX, ann.startY);
                    const arrowSize = 24;

                    if (ann.type === "point_vertical") {
                      const dir = ann.direction === "up" ? -1 : 1;
                      return (
                        <Group key={ann.id} x={s.x} y={s.y} draggable
                          onDragStart={() => {
                            setDragState({ elementType: "loadAnnotation", elementId: ann.id, originalX: ann.startX, originalY: ann.startY, currentX: ann.startX, currentY: ann.startY, axis: null });
                          }}
                          onDragMove={(e) => {
                            const rawCad = cadFromScreen(e.target.x(), e.target.y());
                            const dxm = rawCad.x - ann.startX;
                            const dym = rawCad.y - ann.startY;
                            const axis: "h" | "v" = Math.abs(dxm) >= Math.abs(dym) ? "h" : "v";
                            const snX = axis === "h" ? ann.startX + Math.round(dxm / 0.5) * 0.5 : ann.startX;
                            const snY = axis === "v" ? ann.startY + Math.round(dym / 0.5) * 0.5 : ann.startY;
                            e.target.position(screenFromCad(snX, snY));
                            setDragState(prev => prev ? { ...prev, currentX: snX, currentY: snY, axis } : null);
                          }}
                          onDragEnd={(e) => {
                            if (dragState) {
                              const fx = Math.round(dragState.currentX * 10) / 10;
                              const fy = Math.round(dragState.currentY * 10) / 10;
                              updateLoadAnnotation(activePanel.id, { ...ann, startX: fx, startY: fy, endX: fx, endY: fy });
                            }
                            e.target.position(screenFromCad(dragState?.currentX ?? ann.startX, dragState?.currentY ?? ann.startY));
                            setDragState(null);
                          }}
                          onClick={(e) => { e.cancelBubble = true; setSelection({ kind: "loadAnnotation", id: ann.id }); }}
                        >
                          <Line points={[0, 0, 0, arrowSize * dir]} stroke={loadColor} strokeWidth={2.5} />
                          <Line points={[-6, arrowSize * dir - 8 * dir, 0, arrowSize * dir, 6, arrowSize * dir - 8 * dir]} stroke={loadColor} strokeWidth={2.5} />
                          {ann.label && <Text text={ann.label} x={8} y={dir > 0 ? 4 : -16} fontSize={14} fill={loadColor} fontStyle="bold" />}
                        </Group>
                      );
                    }

                    if (ann.type === "point_horizontal") {
                      const dir = ann.direction === "left" ? -1 : 1;
                      return (
                        <Group key={ann.id} x={s.x} y={s.y} draggable
                          onDragStart={() => {
                            setDragState({ elementType: "loadAnnotation", elementId: ann.id, originalX: ann.startX, originalY: ann.startY, currentX: ann.startX, currentY: ann.startY, axis: null });
                          }}
                          onDragMove={(e) => {
                            const rawCad = cadFromScreen(e.target.x(), e.target.y());
                            const dxm = rawCad.x - ann.startX;
                            const dym = rawCad.y - ann.startY;
                            const axis: "h" | "v" = Math.abs(dxm) >= Math.abs(dym) ? "h" : "v";
                            const snX = axis === "h" ? ann.startX + Math.round(dxm / 0.5) * 0.5 : ann.startX;
                            const snY = axis === "v" ? ann.startY + Math.round(dym / 0.5) * 0.5 : ann.startY;
                            e.target.position(screenFromCad(snX, snY));
                            setDragState(prev => prev ? { ...prev, currentX: snX, currentY: snY, axis } : null);
                          }}
                          onDragEnd={(e) => {
                            if (dragState) {
                              const fx = Math.round(dragState.currentX * 10) / 10;
                              const fy = Math.round(dragState.currentY * 10) / 10;
                              updateLoadAnnotation(activePanel.id, { ...ann, startX: fx, startY: fy, endX: fx, endY: fy });
                            }
                            e.target.position(screenFromCad(dragState?.currentX ?? ann.startX, dragState?.currentY ?? ann.startY));
                            setDragState(null);
                          }}
                          onClick={(e) => { e.cancelBubble = true; setSelection({ kind: "loadAnnotation", id: ann.id }); }}
                        >
                          <Line points={[0, 0, arrowSize * dir, 0]} stroke={loadColor} strokeWidth={2.5} />
                          <Line points={[arrowSize * dir - 8 * dir, -6, arrowSize * dir, 0, arrowSize * dir - 8 * dir, 6]} stroke={loadColor} strokeWidth={2.5} />
                          {ann.label && <Text text={ann.label} x={dir > 0 ? arrowSize + 4 : -arrowSize - 40} y={-16} fontSize={14} fill={loadColor} fontStyle="bold" />}
                        </Group>
                      );
                    }

                    if (ann.type === "point_out_of_plane") {
                      // Foreshortened arrow at ~45deg angle along Z axis
                      const zDirX = 0.7;  // screen-space Z direction (up-right)
                      const zDirY = -0.7;
                      // Positive = toward panel face (along +Z), Negative = away from panel (-Z)
                      const sign = ann.direction === "negative" ? -1 : 1;
                      const tipX = sign * arrowSize * zDirX;
                      const tipY = sign * arrowSize * zDirY;
                      return (
                        <Group key={ann.id} x={s.x} y={s.y} draggable
                          onDragStart={() => {
                            setDragState({ elementType: "loadAnnotation", elementId: ann.id, originalX: ann.startX, originalY: ann.startY, currentX: ann.startX, currentY: ann.startY, axis: null });
                          }}
                          onDragMove={(e) => {
                            const rawCad = cadFromScreen(e.target.x(), e.target.y());
                            const dxm = rawCad.x - ann.startX;
                            const dym = rawCad.y - ann.startY;
                            const axis: "h" | "v" = Math.abs(dxm) >= Math.abs(dym) ? "h" : "v";
                            const snX = axis === "h" ? ann.startX + Math.round(dxm / 0.5) * 0.5 : ann.startX;
                            const snY = axis === "v" ? ann.startY + Math.round(dym / 0.5) * 0.5 : ann.startY;
                            e.target.position(screenFromCad(snX, snY));
                            setDragState(prev => prev ? { ...prev, currentX: snX, currentY: snY, axis } : null);
                          }}
                          onDragEnd={(e) => {
                            if (dragState) {
                              const fx = Math.round(dragState.currentX * 10) / 10;
                              const fy = Math.round(dragState.currentY * 10) / 10;
                              updateLoadAnnotation(activePanel.id, { ...ann, startX: fx, startY: fy, endX: fx, endY: fy });
                            }
                            e.target.position(screenFromCad(dragState?.currentX ?? ann.startX, dragState?.currentY ?? ann.startY));
                            setDragState(null);
                          }}
                          onClick={(e) => { e.cancelBubble = true; setSelection({ kind: "loadAnnotation", id: ann.id }); }}
                        >
                          <Line points={[0, 0, tipX, tipY]} stroke={loadColor} strokeWidth={2.5} />
                          {/* Arrowhead */}
                          <Line points={[
                            tipX - sign * (zDirX * 8 + zDirY * 4), tipY - sign * (zDirY * 8 - zDirX * 4),
                            tipX, tipY,
                            tipX - sign * (zDirX * 8 - zDirY * 4), tipY - sign * (zDirY * 8 + zDirX * 4),
                          ]} stroke={loadColor} strokeWidth={2.5} />
                          {ann.label && <Text text={ann.label} x={tipX + 8} y={tipY - 8} fontSize={14} fill={loadColor} fontStyle="bold" />}
                        </Group>
                      );
                    }

                    return null;
                  })}

                  {/* Text annotations */}
                  {(activePanel.textAnnotations || []).map(ta => {
                    const tl = screenFromCad(ta.x, ta.y + ta.height); // top-left in screen coords (CAD y is flipped)
                    const sw = ta.width * scale;
                    const sh = ta.height * scale;
                    const isTaSelected = selection?.kind === "textAnnotation" && selection.id === ta.id;
                    const borderColor = isTaSelected ? "#dc2626" : "#64748b";
                    return (
                      <React.Fragment key={ta.id}>
                        {/* Main text box group — draggable for moving */}
                        <Group x={tl.x} y={tl.y} draggable
                          onDragStart={() => {
                            setDragState({ elementType: "loadAnnotation", elementId: ta.id, originalX: ta.x, originalY: ta.y, currentX: ta.x, currentY: ta.y, axis: null });
                          }}
                          onDragMove={(e) => {
                            const rawCad = cadFromScreen(tl.x + e.target.x(), tl.y + e.target.y());
                            const newCadY = rawCad.y - ta.height;
                            const dxm = rawCad.x - ta.x;
                            const dym = newCadY - ta.y;
                            const snX = ta.x + Math.round(dxm / 0.5) * 0.5;
                            const snY = ta.y + Math.round(dym / 0.5) * 0.5;
                            const snTl = screenFromCad(snX, snY + ta.height);
                            e.target.position({ x: snTl.x - tl.x, y: snTl.y - tl.y });
                            const axis: "h" | "v" = Math.abs(dxm) >= Math.abs(dym) ? "h" : "v";
                            setDragState(prev => prev ? { ...prev, currentX: snX, currentY: snY, axis } : null);
                          }}
                          onDragEnd={(e) => {
                            if (dragState) {
                              updateTextAnnotation(activePanel.id, {
                                ...ta,
                                x: Math.round(dragState.currentX * 10) / 10,
                                y: Math.round(dragState.currentY * 10) / 10,
                              });
                            }
                            e.target.position({ x: 0, y: 0 });
                            setDragState(null);
                          }}
                          onClick={(e) => { e.cancelBubble = true; setSelection({ kind: "textAnnotation", id: ta.id }); }}
                        >
                          <Rect
                            width={sw} height={sh}
                            fill="rgba(255,255,255,0.85)"
                            stroke={ta.showBorder || isTaSelected ? borderColor : "transparent"}
                            strokeWidth={isTaSelected ? 2 : 1}
                            dash={!ta.showBorder && isTaSelected ? [4, 3] : undefined}
                          />
                          <Text
                            text={ta.text}
                            x={4} y={3}
                            width={sw - 8}
                            fontSize={14}
                            fill="#1e293b"
                            wrap="word"
                          />
                        </Group>
                        {/* Resize handle — separate from parent Group so dragging it doesn't move the box */}
                        {isTaSelected && (
                          <Rect
                            x={tl.x + sw - 6} y={tl.y + sh - 6}
                            width={12} height={12}
                            fill="#dc2626" opacity={0.7}
                            cornerRadius={2}
                            draggable
                            onDragMove={(e) => {
                              // Clamp: compute new size from handle position relative to text box top-left
                              const handleX = e.target.x() + 6; // center of handle
                              const handleY = e.target.y() + 6;
                              const newScreenW = Math.max(30, handleX - tl.x);
                              const newScreenH = Math.max(30, handleY - tl.y);
                              const newW = Math.max(6, Math.round((newScreenW / scale) / 0.5) * 0.5);
                              const newH = Math.max(6, Math.round((newScreenH / scale) / 0.5) * 0.5);
                              // Snap handle to the computed grid position
                              const snappedX = tl.x + newW * scale - 6;
                              const snappedY = tl.y + newH * scale - 6;
                              e.target.position({ x: snappedX, y: snappedY });
                            }}
                            onDragEnd={(e) => {
                              const handleX = e.target.x() + 6;
                              const handleY = e.target.y() + 6;
                              const newScreenW = Math.max(30, handleX - tl.x);
                              const newScreenH = Math.max(30, handleY - tl.y);
                              const newW = Math.max(6, Math.round((newScreenW / scale) / 0.5) * 0.5);
                              const newH = Math.max(6, Math.round((newScreenH / scale) / 0.5) * 0.5);
                              updateTextAnnotation(activePanel.id, { ...ta, width: newW, height: newH });
                            }}
                          />
                        )}
                      </React.Fragment>
                    );
                  })}

                  {/* Permanent dimension annotations */}
                  {(activePanel.dimensions || []).map(dim => {
                    const s1 = screenFromCad(dim.startX, dim.startY);
                    const s2 = screenFromCad(dim.endX, dim.endY);
                    const distance = Math.sqrt((dim.endX - dim.startX) ** 2 + (dim.endY - dim.startY) ** 2);
                    const isDimSelected = selection?.kind === "dimension" && selection.id === dim.id;

                    // Calculate perpendicular offset direction
                    const dx = s2.x - s1.x;
                    const dy = s2.y - s1.y;
                    const len = Math.sqrt(dx * dx + dy * dy) || 1;
                    const nx = -dy / len;
                    const ny = dx / len;
                    const off = dim.offset;

                    // Offset dimension line endpoints
                    const d1x = s1.x + nx * off;
                    const d1y = s1.y + ny * off;
                    const d2x = s2.x + nx * off;
                    const d2y = s2.y + ny * off;

                    // Extension lines
                    const ext = off > 0 ? 4 : -4;

                    const dimColor = isDimSelected ? "#dc2626" : "#0369a1";
                    const textStr = `${distance.toFixed(2)}"`;

                    // Midpoint and angle for text
                    const mx = (d1x + d2x) / 2;
                    const my = (d1y + d2y) / 2;
                    const angle = Math.atan2(d2y - d1y, d2x - d1x) * 180 / Math.PI;
                    const textAngle = angle > 90 || angle < -90 ? angle + 180 : angle;

                    return (
                      <Group key={dim.id} onClick={(e) => { e.cancelBubble = true; setSelection({ kind: "dimension", id: dim.id }); }}>
                        {/* Extension lines */}
                        <Line points={[s1.x, s1.y, d1x + nx * ext, d1y + ny * ext]} stroke={dimColor} strokeWidth={0.8} />
                        <Line points={[s2.x, s2.y, d2x + nx * ext, d2y + ny * ext]} stroke={dimColor} strokeWidth={0.8} />
                        {/* Dimension line */}
                        <Line points={[d1x, d1y, d2x, d2y]} stroke={dimColor} strokeWidth={1.2} />
                        {/* Tick marks at ends */}
                        <Line points={[d1x - nx * 4 - dx / len * 0, d1y - ny * 4, d1x + nx * 4, d1y + ny * 4]} stroke={dimColor} strokeWidth={1.5} />
                        <Line points={[d2x - nx * 4, d2y - ny * 4, d2x + nx * 4, d2y + ny * 4]} stroke={dimColor} strokeWidth={1.5} />
                        {/* Measurement text */}
                        <Text
                          text={textStr}
                          x={mx}
                          y={my}
                          offsetX={textStr.length * 3.5}
                          offsetY={14}
                          fontSize={14}
                          fontStyle="bold"
                          fill={dimColor}
                          rotation={textAngle}
                        />
                      </Group>
                    );
                  })}

                  {/* Dimension preview while placing */}
                  {tool === "dimension" && dimFirstPoint && dimPreviewEnd && (() => {
                    const s1 = screenFromCad(dimFirstPoint.x, dimFirstPoint.y);
                    const s2 = screenFromCad(dimPreviewEnd.x, dimPreviewEnd.y);
                    const distance = Math.sqrt((dimPreviewEnd.x - dimFirstPoint.x) ** 2 + (dimPreviewEnd.y - dimFirstPoint.y) ** 2);
                    const off = 20;
                    const dx = s2.x - s1.x;
                    const dy = s2.y - s1.y;
                    const len = Math.sqrt(dx * dx + dy * dy) || 1;
                    const nx = -dy / len;
                    const ny = dx / len;
                    const d1x = s1.x + nx * off;
                    const d1y = s1.y + ny * off;
                    const d2x = s2.x + nx * off;
                    const d2y = s2.y + ny * off;
                    const ext = 4;
                    const mx = (d1x + d2x) / 2;
                    const my = (d1y + d2y) / 2;
                    const angle = Math.atan2(d2y - d1y, d2x - d1x) * 180 / Math.PI;
                    const textAngle = angle > 90 || angle < -90 ? angle + 180 : angle;
                    const textStr = `${distance.toFixed(2)}"`;

                    return (
                      <Group>
                        <Line points={[s1.x, s1.y, d1x + nx * ext, d1y + ny * ext]} stroke="#0369a1" strokeWidth={0.8} opacity={0.5} />
                        <Line points={[s2.x, s2.y, d2x + nx * ext, d2y + ny * ext]} stroke="#0369a1" strokeWidth={0.8} opacity={0.5} />
                        <Line points={[d1x, d1y, d2x, d2y]} stroke="#0369a1" strokeWidth={1.2} dash={[4, 4]} opacity={0.5} />
                        <Line points={[d1x - nx * 4, d1y - ny * 4, d1x + nx * 4, d1y + ny * 4]} stroke="#0369a1" strokeWidth={1.5} opacity={0.5} />
                        <Line points={[d2x - nx * 4, d2y - ny * 4, d2x + nx * 4, d2y + ny * 4]} stroke="#0369a1" strokeWidth={1.5} opacity={0.5} />
                        <Text text={textStr} x={mx} y={my} offsetX={textStr.length * 3.5} offsetY={14} fontSize={14} fontStyle="bold" fill="#0369a1" opacity={0.6} rotation={textAngle} />
                        {/* Start point indicator */}
                        <Circle x={s1.x} y={s1.y} radius={4} fill="#0369a1" opacity={0.6} />
                      </Group>
                    );
                  })()}

                  {/* Line drawing preview */}
                  {(tool === "line_solid" || tool === "line_hidden") && lineFirstPoint && linePreviewEnd && (() => {
                    const s1 = screenFromCad(lineFirstPoint.x, lineFirstPoint.y);
                    const s2 = screenFromCad(linePreviewEnd.x, linePreviewEnd.y);
                    const distance = Math.sqrt((linePreviewEnd.x - lineFirstPoint.x) ** 2 + (linePreviewEnd.y - lineFirstPoint.y) ** 2);
                    const textStr = `${distance.toFixed(2)}"`;
                    const mx = (s1.x + s2.x) / 2;
                    const my = (s1.y + s2.y) / 2;
                    return (
                      <Group>
                        <Line
                          points={[s1.x, s1.y, s2.x, s2.y]}
                          stroke="#334155"
                          strokeWidth={1.8}
                          dash={tool === "line_hidden" ? [10, 5] : undefined}
                          opacity={0.6}
                        />
                        <Circle x={s1.x} y={s1.y} radius={4} fill="#334155" opacity={0.6} />
                        {/* Temporary dimension */}
                        <Line points={[s1.x, s1.y, s2.x, s2.y]} stroke="#f59e0b" strokeWidth={1} dash={[6, 4]} opacity={0.5} />
                        <Text text={textStr} x={mx + 6} y={my - 14} fontSize={14} fontStyle="bold" fill="#f59e0b" opacity={0.7} />
                      </Group>
                    );
                  })()}

                  {/* Load line annotation preview */}
                  {tool === "load_line" && loadLineFirstPoint && loadLinePreviewEnd && (() => {
                    const s1 = screenFromCad(loadLineFirstPoint.x, loadLineFirstPoint.y);
                    const s2 = screenFromCad(loadLinePreviewEnd.x, loadLinePreviewEnd.y);
                    const distance = Math.sqrt((loadLinePreviewEnd.x - loadLineFirstPoint.x) ** 2 + (loadLinePreviewEnd.y - loadLineFirstPoint.y) ** 2);
                    const textStr = `${distance.toFixed(2)}"`;
                    const mx = (s1.x + s2.x) / 2;
                    const my = (s1.y + s2.y) / 2;
                    return (
                      <Group>
                        <Line points={[s1.x, s1.y, s2.x, s2.y]} stroke="#b91c1c" strokeWidth={2} opacity={0.5} />
                        <Circle x={s1.x} y={s1.y} radius={4} fill="#b91c1c" opacity={0.6} />
                        <Text text={textStr} x={mx + 6} y={my - 14} fontSize={14} fontStyle="bold" fill="#f59e0b" opacity={0.7} />
                      </Group>
                    );
                  })()}

                  {/* Live dimension during connection drag */}
                  {dragState && dragState.axis && (() => {
                    const s1 = screenFromCad(dragState.originalX, dragState.originalY);
                    const s2 = screenFromCad(dragState.currentX, dragState.currentY);
                    const distance = Math.sqrt((dragState.currentX - dragState.originalX) ** 2 + (dragState.currentY - dragState.originalY) ** 2);
                    if (distance < 0.01) return null;
                    const textStr = `${distance.toFixed(2)}"`;
                    const mx = (s1.x + s2.x) / 2;
                    const my = (s1.y + s2.y) / 2;
                    const textOffY = dragState.axis === "h" ? -14 : 0;
                    const textOffX = dragState.axis === "v" ? 8 : 0;
                    return (
                      <Group>
                        <Line points={[s1.x, s1.y, s2.x, s2.y]} stroke="#f59e0b" strokeWidth={1.5} dash={[6, 4]} />
                        <Circle x={s1.x} y={s1.y} radius={3} fill="#f59e0b" opacity={0.7} />
                        <Circle x={s2.x} y={s2.y} radius={3} fill="#f59e0b" opacity={0.7} />
                        <Text text={textStr} x={mx + textOffX} y={my + textOffY} fontSize={14} fontStyle="bold" fill="#f59e0b" />
                      </Group>
                    );
                  })()}

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
              ? `${activePanel.name} — ${activePanel.connections.length} connection${activePanel.connections.length !== 1 ? "s" : ""}`
              : `${activePanel.name} — No geometry defined`
            }
          </div>
          </>
        </div>

        <div className="w-[340px] border-l bg-card flex flex-col shrink-0 shadow-sm z-10">
          {selection?.kind === "connection" ? (
            <ConnectionProperties panelId={activePanel.id} connectionId={selection.id} onDeselect={() => setSelection(null)} />
          ) : selection?.kind === "centroid" ? (
            <CentroidProperties panel={activePanel} computedCentroid={computedCentroid} onDeselect={() => setSelection(null)} />
          ) : selection?.kind === "viewCentroid" ? (
            <ViewCentroidProperties panel={activePanel} viewId={selection.viewId} onDeselect={() => setSelection(null)} />
          ) : selection?.kind === "dimension" ? (
            <DimensionProperties panelId={activePanel.id} dimensionId={selection.id} onDeselect={() => setSelection(null)} />
          ) : selection?.kind === "userLine" ? (
            <UserLineProperties panelId={activePanel.id} lineId={selection.id} onDeselect={() => setSelection(null)} />
          ) : selection?.kind === "loadAnnotation" ? (
            <LoadAnnotationProperties panelId={activePanel.id} annotationId={selection.id} onDeselect={() => setSelection(null)} />
          ) : selection?.kind === "textAnnotation" ? (
            <TextAnnotationProperties panelId={activePanel.id} annotationId={selection.id} onDeselect={() => setSelection(null)} />
          ) : (
            <PanelProperties panel={activePanel} />
          )}
        </div>
      </div>
    </div>
  );
}

function PanelProperties({ panel }: { panel: Panel }) {
  const { updatePanel } = useProject();
  const [editingViewId, setEditingViewId] = useState<string | null>(null);
  const [editingViewName, setEditingViewName] = useState("");

  const updateField = (field: keyof Panel, value: number) => {
    updatePanel({ ...panel, [field]: value });
  };

  return (
    <ScrollArea className="flex-1">
      <div className="p-4 space-y-4">
        <div>
          <h3 className="font-bold text-sm text-primary mb-3" data-testid="text-panel-props-title">Panel Properties</h3>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-[10px] uppercase">Panel Name</Label>
              <Input
                value={panel.name}
                onChange={e => updatePanel({ ...panel, name: e.target.value })}
                className="h-8 text-xs"
                data-testid="input-panel-name"
              />
            </div>
          </div>
        </div>

        {panel.dxfViews && panel.dxfViews.length > 0 && (
          <>
            <Separator />
            <div>
              <h4 className="font-semibold text-xs text-muted-foreground uppercase tracking-wider mb-3">DXF Views</h4>
              <div className="space-y-2">
                {panel.dxfViews.map((view, idx) => {
                  const colorClass = idx === 0 ? "bg-blue-100 border-blue-300 text-blue-800"
                    : idx === 1 ? "bg-green-100 border-green-300 text-green-800"
                    : idx === 2 ? "bg-yellow-100 border-yellow-300 text-yellow-800"
                    : "bg-purple-100 border-purple-300 text-purple-800";
                  return (
                    <div key={view.id} className={`flex items-center justify-between rounded px-2 py-1.5 border text-[11px] font-medium ${colorClass}`} data-testid={`view-item-${view.id}`}>
                      {editingViewId === view.id ? (
                        <input
                          autoFocus
                          className="bg-white/80 border border-current rounded px-1 py-0.5 text-[11px] font-medium w-24 outline-none"
                          value={editingViewName}
                          onChange={e => setEditingViewName(e.target.value)}
                          onBlur={() => {
                            if (editingViewName.trim()) {
                              const updatedViews = panel.dxfViews!.map(v =>
                                v.id === view.id ? { ...v, name: editingViewName.trim() } : v
                              );
                              updatePanel({ ...panel, dxfViews: updatedViews });
                            }
                            setEditingViewId(null);
                          }}
                          onKeyDown={e => {
                            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                            if (e.key === "Escape") setEditingViewId(null);
                          }}
                          data-testid={`input-view-name-${view.id}`}
                        />
                      ) : (
                        <span
                          className="cursor-pointer hover:underline"
                          title="Click to rename"
                          onClick={() => { setEditingViewId(view.id); setEditingViewName(view.name); }}
                          data-testid={`view-name-${view.id}`}
                        >{view.name}</span>
                      )}
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] opacity-70">{view.openings.length} opening{view.openings.length !== 1 ? "s" : ""}</span>
                        <button
                          title={view.showCentroid ? "Hide centroid" : "Show centroid"}
                          className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${view.showCentroid ? "bg-white/70 border-current" : "opacity-50 border-transparent"}`}
                          onClick={() => {
                            const turningOn = !view.showCentroid;
                            const updatedViews = panel.dxfViews!.map((v, i) =>
                              i === idx
                                ? {
                                    ...v,
                                    showCentroid: !v.showCentroid,
                                    // Clear manual override when toggling on, resetting to computed
                                    ...(turningOn ? { centroidX: undefined, centroidY: undefined } : {}),
                                  }
                                : v
                            );
                            updatePanel({ ...panel, dxfViews: updatedViews });
                          }}
                          data-testid={`button-centroid-toggle-${view.id}`}
                        >
                          CG
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        <Separator />

        <div>
          <h4 className="font-semibold text-xs text-muted-foreground uppercase tracking-wider mb-3">Weights & Loads</h4>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-[10px] uppercase">Panel Weight (lbs)</Label>
              <Input
                type="number"
                value={panel.panelWeight ?? 0}
                onChange={e => updateField("panelWeight", Number(e.target.value))}
                className="h-8 text-xs font-mono"
                data-testid="input-panel-weight"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] uppercase">Weight of Supported Elements (lbs)</Label>
              <Input
                type="number"
                value={panel.supportedElementsWeight ?? 0}
                onChange={e => updateField("supportedElementsWeight", Number(e.target.value))}
                className="h-8 text-xs font-mono"
                data-testid="input-supported-weight"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] uppercase">Design (+) Wind Pressure (psf)</Label>
              <Input
                type="number"
                value={panel.positiveWindPressure ?? 0}
                onChange={e => updateField("positiveWindPressure", Number(e.target.value))}
                className="h-8 text-xs font-mono"
                data-testid="input-pos-wind"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] uppercase">Design (-) Wind Pressure (psf)</Label>
              <Input
                type="number"
                value={panel.negativeWindPressure ?? 0}
                onChange={e => updateField("negativeWindPressure", Number(e.target.value))}
                className="h-8 text-xs font-mono"
                data-testid="input-neg-wind"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] uppercase">Seismic Force Fp (lbs)</Label>
              <Input
                type="number"
                value={panel.seismicForceFp ?? 0}
                onChange={e => updateField("seismicForceFp", Number(e.target.value))}
                className="h-8 text-xs font-mono"
                data-testid="input-seismic-fp"
              />
            </div>
          </div>
        </div>

        <Separator />

        <div className="text-xs text-muted-foreground">
          <p>Select a connection or centroid marker on the canvas to edit its properties.</p>
        </div>
      </div>
    </ScrollArea>
  );
}

function CentroidProperties({ panel, computedCentroid, onDeselect }: { panel: Panel; computedCentroid: { x: number; y: number } | null; onDeselect: () => void }) {
  const { updatePanel } = useProject();
  const cx = panel.centroidX ?? computedCentroid?.x ?? 0;
  const cy = panel.centroidY ?? computedCentroid?.y ?? 0;

  const resetToComputed = () => {
    if (computedCentroid) {
      updatePanel({ ...panel, centroidX: computedCentroid.x, centroidY: computedCentroid.y });
    }
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-bold text-sm text-primary" data-testid="text-centroid-title">Centroid (CG)</h3>
        <Button variant="ghost" size="sm" onClick={onDeselect} data-testid="button-deselect-centroid">
          <MousePointer2 className="w-4 h-4" />
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-[10px] uppercase">X (in)</Label>
          <Input
            type="number"
            value={cx}
            onChange={e => updatePanel({ ...panel, centroidX: Number(e.target.value) })}
            className="h-8 text-xs font-mono"
            data-testid="input-centroid-x"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] uppercase">Y (in)</Label>
          <Input
            type="number"
            value={cy}
            onChange={e => updatePanel({ ...panel, centroidY: Number(e.target.value) })}
            className="h-8 text-xs font-mono"
            data-testid="input-centroid-y"
          />
        </div>
      </div>

      {computedCentroid && (
        <div className="text-xs text-muted-foreground space-y-2">
          <p>Computed centroid: ({computedCentroid.x.toFixed(2)}, {computedCentroid.y.toFixed(2)})</p>
          <Button variant="outline" size="sm" onClick={resetToComputed} className="w-full" data-testid="button-reset-centroid">
            <RotateCcw className="w-3 h-3 mr-1" /> Reset to Computed
          </Button>
        </div>
      )}
    </div>
  );
}

function ViewCentroidProperties({ panel, viewId, onDeselect }: { panel: Panel; viewId: string; onDeselect: () => void }) {
  const { updatePanel } = useProject();
  const view = panel.dxfViews?.find(v => v.id === viewId);
  if (!view) return null;

  const computedX = view.polygon.reduce((s, v) => s + v.x, 0) / view.polygon.length;
  const computedY = view.polygon.reduce((s, v) => s + v.y, 0) / view.polygon.length;
  const cx = view.centroidX ?? computedX;
  const cy = view.centroidY ?? computedY;

  const resetToComputed = () => {
    const updatedViews = panel.dxfViews!.map(v =>
      v.id === viewId ? { ...v, centroidX: undefined, centroidY: undefined } : v
    );
    updatePanel({ ...panel, dxfViews: updatedViews });
  };

  const updateViewCentroid = (field: "centroidX" | "centroidY", value: number) => {
    const updatedViews = panel.dxfViews!.map(v =>
      v.id === viewId ? { ...v, [field]: value } : v
    );
    updatePanel({ ...panel, dxfViews: updatedViews });
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-bold text-sm text-primary" data-testid="text-view-centroid-title">CG — {view.name}</h3>
        <Button variant="ghost" size="sm" onClick={onDeselect} data-testid="button-deselect-view-centroid">
          <MousePointer2 className="w-4 h-4" />
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-[10px] uppercase">X (in)</Label>
          <Input
            type="number"
            value={cx}
            onChange={e => updateViewCentroid("centroidX", Number(e.target.value))}
            className="h-8 text-xs font-mono"
            data-testid="input-view-centroid-x"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] uppercase">Y (in)</Label>
          <Input
            type="number"
            value={cy}
            onChange={e => updateViewCentroid("centroidY", Number(e.target.value))}
            className="h-8 text-xs font-mono"
            data-testid="input-view-centroid-y"
          />
        </div>
      </div>

      <div className="text-xs text-muted-foreground space-y-2">
        <p>Computed centroid: ({computedX.toFixed(2)}, {computedY.toFixed(2)})</p>
        <Button variant="outline" size="sm" onClick={resetToComputed} className="w-full" data-testid="button-reset-view-centroid">
          <RotateCcw className="w-3 h-3 mr-1" /> Reset to Computed
        </Button>
      </div>
    </div>
  );
}

function DimensionProperties({ panelId, dimensionId, onDeselect }: { panelId: string; dimensionId: string; onDeselect: () => void }) {
  const { project, updateDimension, deleteDimension } = useProject();
  const panel = project.panels.find(p => p.id === panelId);
  const dim = panel?.dimensions?.find(d => d.id === dimensionId);
  if (!dim) return null;

  const distance = Math.sqrt((dim.endX - dim.startX) ** 2 + (dim.endY - dim.startY) ** 2);

  return (
    <div className="p-4 space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-bold text-sm text-primary" data-testid="text-dimension-title">Dimension Annotation</h3>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={onDeselect} data-testid="button-deselect-dimension">
            <MousePointer2 className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => { deleteDimension(panelId, dimensionId); onDeselect(); }} data-testid="button-delete-dimension">
            <Trash2 className="w-4 h-4 text-destructive" />
          </Button>
        </div>
      </div>

      <div className="p-3 bg-muted/20 rounded border">
        <div className="text-lg font-mono font-bold text-center">{distance.toFixed(2)}"</div>
        <div className="text-xs text-muted-foreground text-center mt-1">Measured Distance</div>
      </div>

      <div className="space-y-2">
        <div className="text-[10px] uppercase font-semibold text-muted-foreground">Start Point</div>
        <div className="text-xs font-mono">({dim.startX.toFixed(2)}, {dim.startY.toFixed(2)})</div>
      </div>
      <div className="space-y-2">
        <div className="text-[10px] uppercase font-semibold text-muted-foreground">End Point</div>
        <div className="text-xs font-mono">({dim.endX.toFixed(2)}, {dim.endY.toFixed(2)})</div>
      </div>

      <div className="space-y-1">
        <Label className="text-[10px] uppercase">Line Offset (px)</Label>
        <Input
          type="number"
          value={dim.offset}
          onChange={e => updateDimension(panelId, { ...dim, offset: Number(e.target.value) })}
          className="h-8 text-xs font-mono"
          data-testid="input-dimension-offset"
        />
      </div>
    </div>
  );
}

function UserLineProperties({ panelId, lineId, onDeselect }: { panelId: string; lineId: string; onDeselect: () => void }) {
  const { project, deleteUserLine } = useProject();
  const panel = project.panels.find(p => p.id === panelId);
  const line = panel?.userLines?.find(l => l.id === lineId);
  if (!line) return null;

  const distance = Math.sqrt((line.x2 - line.x1) ** 2 + (line.y2 - line.y1) ** 2);

  return (
    <div className="p-4 space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-bold text-sm text-primary" data-testid="text-userline-title">
          {line.lineType === "solid" ? "Solid Line" : "Hidden Line"}
        </h3>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={onDeselect} data-testid="button-deselect-userline">
            <MousePointer2 className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => { deleteUserLine(panelId, lineId); onDeselect(); }} data-testid="button-delete-userline">
            <Trash2 className="w-4 h-4 text-destructive" />
          </Button>
        </div>
      </div>

      <div className="p-3 bg-muted/20 rounded border">
        <div className="text-lg font-mono font-bold text-center">{distance.toFixed(2)}"</div>
        <div className="text-xs text-muted-foreground text-center mt-1">Line Length</div>
      </div>

      <div className="space-y-2">
        <div className="text-[10px] uppercase font-semibold text-muted-foreground">Start Point</div>
        <div className="text-xs font-mono">({line.x1.toFixed(2)}, {line.y1.toFixed(2)})</div>
      </div>
      <div className="space-y-2">
        <div className="text-[10px] uppercase font-semibold text-muted-foreground">End Point</div>
        <div className="text-xs font-mono">({line.x2.toFixed(2)}, {line.y2.toFixed(2)})</div>
      </div>
      <div className="text-xs text-muted-foreground">
        <p>Drag endpoints on canvas to adjust. Press Delete or use the trash icon to remove.</p>
      </div>
    </div>
  );
}

function LoadAnnotationProperties({ panelId, annotationId, onDeselect }: { panelId: string; annotationId: string; onDeselect: () => void }) {
  const { project, updateLoadAnnotation, deleteLoadAnnotation } = useProject();
  const panel = project.panels.find(p => p.id === panelId);
  const ann = panel?.loadAnnotations?.find(a => a.id === annotationId);
  if (!ann) return null;

  const typeLabels: Record<string, string> = {
    line_load: "Line Load",
    point_vertical: "Vertical Point Load",
    point_horizontal: "Horizontal Point Load",
    point_out_of_plane: "Out-of-Plane Point Load",
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-bold text-sm text-primary" data-testid="text-load-annotation-title">
          {typeLabels[ann.type] || "Load Annotation"}
        </h3>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={onDeselect} data-testid="button-deselect-load">
            <MousePointer2 className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => { deleteLoadAnnotation(panelId, annotationId); onDeselect(); }} data-testid="button-delete-load">
            <Trash2 className="w-4 h-4 text-destructive" />
          </Button>
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-[10px] uppercase">Label</Label>
        <Input
          value={ann.label}
          onChange={e => updateLoadAnnotation(panelId, { ...ann, label: e.target.value })}
          placeholder='e.g. "25 psf wind" or "P = 5 kips"'
          className="h-8 text-xs"
          data-testid="input-load-label"
        />
      </div>

      {ann.type === "line_load" && (
        <>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase">Arrow Direction</Label>
            <Select
              value={ann.direction || "positive"}
              onValueChange={(val) => updateLoadAnnotation(panelId, { ...ann, direction: val as any })}
            >
              <SelectTrigger className="h-8 text-xs" data-testid="select-line-load-direction">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="positive">Positive (Toward Panel)</SelectItem>
                <SelectItem value="negative">Negative (Away from Panel)</SelectItem>
                <SelectItem value="up">Up</SelectItem>
                <SelectItem value="down">Down</SelectItem>
                <SelectItem value="left">Left</SelectItem>
                <SelectItem value="right">Right</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <div className="text-[10px] uppercase font-semibold text-muted-foreground">Start Point</div>
            <div className="text-xs font-mono">({ann.startX.toFixed(2)}, {ann.startY.toFixed(2)})</div>
          </div>
          <div className="space-y-2">
            <div className="text-[10px] uppercase font-semibold text-muted-foreground">End Point</div>
            <div className="text-xs font-mono">({ann.endX.toFixed(2)}, {ann.endY.toFixed(2)})</div>
          </div>
        </>
      )}

      {ann.type !== "line_load" && (
        <>
          <div className="space-y-2">
            <div className="text-[10px] uppercase font-semibold text-muted-foreground">Location</div>
            <div className="text-xs font-mono">({ann.startX.toFixed(2)}, {ann.startY.toFixed(2)})</div>
          </div>
          {ann.direction && (
            <div className="space-y-1">
              <Label className="text-[10px] uppercase">Direction</Label>
              <Select
                value={ann.direction}
                onValueChange={(val) => updateLoadAnnotation(panelId, { ...ann, direction: val as any })}
              >
                <SelectTrigger className="h-8 text-xs" data-testid="select-load-direction">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ann.type === "point_vertical" && (
                    <>
                      <SelectItem value="down">Down</SelectItem>
                      <SelectItem value="up">Up</SelectItem>
                    </>
                  )}
                  {ann.type === "point_horizontal" && (
                    <>
                      <SelectItem value="right">Right</SelectItem>
                      <SelectItem value="left">Left</SelectItem>
                    </>
                  )}
                  {ann.type === "point_out_of_plane" && (
                    <>
                      <SelectItem value="positive">Positive (Toward Panel)</SelectItem>
                      <SelectItem value="negative">Negative (Away from Panel)</SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>
          )}
        </>
      )}

      <div className="text-xs text-muted-foreground">
        <p>Drag to reposition. Edit the label above to annotate the load.</p>
      </div>
    </div>
  );
}

function TextAnnotationProperties({ panelId, annotationId, onDeselect }: { panelId: string; annotationId: string; onDeselect: () => void }) {
  const { project, updateTextAnnotation, deleteTextAnnotation } = useProject();
  const panel = project.panels.find(p => p.id === panelId);
  const ta = panel?.textAnnotations?.find(t => t.id === annotationId);
  if (!ta) return null;

  return (
    <div className="p-4 space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-bold text-sm text-primary" data-testid="text-annotation-title">Text Box</h3>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={onDeselect} data-testid="button-deselect-text">
            <MousePointer2 className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => { deleteTextAnnotation(panelId, annotationId); onDeselect(); }} data-testid="button-delete-text">
            <Trash2 className="w-4 h-4 text-destructive" />
          </Button>
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-[10px] uppercase">Text</Label>
        <textarea
          value={ta.text}
          onChange={e => {
            const newText = e.target.value;
            // Auto-grow height: estimate lines needed at ~14px font, ~7px per char
            const charsPerLine = Math.max(1, Math.floor((ta.width * 7) / 7));
            const lines = newText.split('\n').reduce((total, line) => {
              return total + Math.max(1, Math.ceil((line.length || 1) / charsPerLine));
            }, 0);
            const neededHeight = Math.max(12, Math.ceil((lines * 2.5) / 0.5) * 0.5);
            const newHeight = Math.max(ta.height, neededHeight);
            updateTextAnnotation(panelId, { ...ta, text: newText, height: newHeight });
          }}
          placeholder="Enter text..."
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[80px] resize-y"
          data-testid="input-text-content"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-[10px] uppercase">Width (in)</Label>
          <Input
            type="number"
            value={ta.width}
            onChange={e => updateTextAnnotation(panelId, { ...ta, width: Math.max(6, Number(e.target.value)) })}
            className="h-8 text-xs font-mono"
            data-testid="input-text-width"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] uppercase">Height (in)</Label>
          <Input
            type="number"
            value={ta.height}
            onChange={e => updateTextAnnotation(panelId, { ...ta, height: Math.max(6, Number(e.target.value)) })}
            className="h-8 text-xs font-mono"
            data-testid="input-text-height"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-[10px] uppercase">X (in)</Label>
          <Input
            type="number"
            value={ta.x}
            onChange={e => updateTextAnnotation(panelId, { ...ta, x: Number(e.target.value) })}
            className="h-8 text-xs font-mono"
            data-testid="input-text-x"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] uppercase">Y (in)</Label>
          <Input
            type="number"
            value={ta.y}
            onChange={e => updateTextAnnotation(panelId, { ...ta, y: Number(e.target.value) })}
            className="h-8 text-xs font-mono"
            data-testid="input-text-y"
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="show-border"
          checked={ta.showBorder}
          onChange={e => updateTextAnnotation(panelId, { ...ta, showBorder: e.target.checked })}
          className="rounded border-gray-300"
          data-testid="input-text-border"
        />
        <Label htmlFor="show-border" className="text-xs">Show border</Label>
      </div>

      <div className="text-xs text-muted-foreground">
        <p>Drag to move. Drag the red corner handle to resize. Use arrow keys to nudge by 0.5".</p>
      </div>
    </div>
  );
}

function ConnectionProperties({ panelId, connectionId, onDeselect }: { panelId: string; connectionId: string; onDeselect: () => void }) {
  const { project, updateConnection, deleteConnection } = useProject();
  const panel = project.panels.find(p => p.id === panelId);
  const connection = panel?.connections.find(c => c.id === connectionId);
  if (!connection) return null;

  const markerOptions: { value: ConnectionMarker; label: string }[] = [
    { value: "triangle-down", label: "▼ Bearing" },
    { value: "circle", label: "● Tieback" },
    { value: "square", label: "■ Lateral" },
    { value: "diamond", label: "◆ Panel-to-Panel" },
  ];

  const loadLabels: Record<string, string> = {
    D: "Dead",
    L: "Live",
    W: "Wind",
    E: "Seismic",
  };

  return (
    <Tabs defaultValue="forces" className="flex-1 flex flex-col overflow-hidden">
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
                  {project.capacities.map(cap => (
                    <SelectItem key={cap.type} value={cap.type}>
                      {cap.type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase">Marker Icon</Label>
            <Select value={connection.marker || "diamond"} onValueChange={(val: ConnectionMarker) => updateConnection(panelId, { ...connection, marker: val })}>
              <SelectTrigger data-testid="select-connection-marker"><SelectValue /></SelectTrigger>
              <SelectContent>
                {markerOptions.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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
          <TabsTrigger value="load_combos" className="flex-1">{project.info.designMethod === "ASD" ? "ASD" : "LRFD"}</TabsTrigger>
        </TabsList>
      </div>

      <ScrollArea className="flex-1">
        <TabsContent value="forces" className="p-4 m-0">
          <div className="space-y-4">
            {(["D", "W", "E", "L"] as const).map(caseKey => {
              const forces = connection.forces[caseKey] || { x: 0, y: 0, z: 0 };
              return (
                <div key={caseKey} className="space-y-2 p-3 bg-muted/20 rounded border border-border/50">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">{caseKey}</div>
                    <span className="text-xs font-bold uppercase tracking-wider">{loadLabels[caseKey]}</span>
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
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="load_combos" className="p-4 m-0">
          <div className="space-y-3">
            {(() => {
              const results = calculateLoadCombinations(connection as any, undefined, project.info.designMethod, project.info.designStandard);
              const forcePrefix = project.info.designMethod === "ASD" ? "Pa" : "Pu";
              return results.map((result: any, i) => (
                <div key={i} className="p-3 bg-muted/20 rounded border border-border/50 space-y-2">
                  <div className="text-[10px] font-mono text-muted-foreground truncate">{result.comboName}</div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="text-center">
                      <div className="text-[10px] uppercase text-muted-foreground">{forcePrefix},x</div>
                      <div className="text-sm font-mono font-bold">{result.fx.toFixed(1)}</div>
                    </div>
                    <div className="text-center border-x">
                      <div className="text-[10px] uppercase text-muted-foreground">{forcePrefix},y</div>
                      <div className="text-sm font-mono font-bold">{result.fy.toFixed(1)}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-[10px] uppercase text-muted-foreground">{forcePrefix},z</div>
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
