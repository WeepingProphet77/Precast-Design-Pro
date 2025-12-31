
import React, { useState, useEffect } from "react";
import { Stage, Layer, Rect, Circle, Text, Group, Line } from "react-konva";
import { useProject } from "@/lib/store";
import { Panel, ConnectionNode } from "@/lib/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { calculateLoadCombinations } from "@/lib/calculations";
import { Plus, Trash2, Maximize, Save, ArrowRight, ZoomIn, ZoomOut } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function PanelDesigner() {
  const { project, updatePanel, addPanel, deletePanel, updateConnection, addConnection, deleteConnection } = useProject();
  const [activePanelId, setActivePanelId] = useState<string>(project.panels[0]?.id || "");
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const [scale, setScale] = useState(3);
  
  const activePanel = project.panels.find(p => p.id === activePanelId);
  
  useEffect(() => {
    if (!activePanel && project.panels.length > 0) {
      setActivePanelId(project.panels[0].id);
    }
  }, [project.panels, activePanel]);

  const handleDragEnd = (e: any, connectionId: string) => {
    if (!activePanel) return;
    
    // Convert canvas coords back to panel inches
    const x = Math.round(e.target.x() / scale);
    const y = Math.round(e.target.y() / scale);
    
    const conn = activePanel.connections.find(c => c.id === connectionId);
    if (conn) {
      updateConnection(activePanel.id, { ...conn, x, y });
    }
  };

  const activeConnection = activePanel?.connections.find(c => c.id === selectedConnectionId);

  const canvasPadding = 50;

  if (!activePanel) return <div className="p-8">No panels created. Create one to start. <Button onClick={addPanel}>Create Panel</Button></div>;

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="h-14 border-b bg-card flex items-center px-4 gap-4 justify-between shrink-0">
        <div className="flex items-center gap-2">
            <Select value={activePanelId} onValueChange={setActivePanelId}>
                <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Select Panel" />
                </SelectTrigger>
                <SelectContent>
                    {project.panels.map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={addPanel} title="New Panel">
                <Plus className="w-4 h-4" />
            </Button>
             <Button variant="outline" size="icon" onClick={() => deletePanel(activePanelId)} title="Delete Panel">
                <Trash2 className="w-4 h-4 text-destructive" />
            </Button>
        </div>
        <div className="flex items-center gap-4">
            <div className="flex items-center gap-1 bg-muted rounded-md p-1">
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setScale(Math.max(1, scale - 0.5))}>
                    <ZoomOut className="w-3 h-3" />
                </Button>
                <span className="text-xs font-mono min-w-[30px] text-center">{Math.round(scale * 100 / 3)}%</span>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setScale(Math.min(6, scale + 0.5))}>
                    <ZoomIn className="w-3 h-3" />
                </Button>
            </div>
            <div className="text-sm text-muted-foreground font-mono border-l pl-4">
                W: {activePanel.width}" x H: {activePanel.height}"
            </div>
            <Button size="sm" onClick={() => {
                const id = crypto.randomUUID();
                addConnection(activePanel.id, {
                    id,
                    label: `C-${activePanel.connections.length + 1}`,
                    type: "A",
                    x: 10,
                    y: 10,
                    forces: { D: {x:0,y:0,z:0}, L: {x:0,y:0,z:0}, W: {x:0,y:0,z:0}, E: {x:0,y:0,z:0} }
                });
                setSelectedConnectionId(id);
            }}>
                <Plus className="w-4 h-4 mr-2" /> Add Connection
            </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Canvas Area */}
        <div className="flex-1 bg-slate-100 relative overflow-auto grid-bg flex items-center justify-center p-8">
             <div className="shadow-lg bg-white relative">
                 <Stage 
                    width={activePanel.width * scale + canvasPadding * 2} 
                    height={activePanel.height * scale + canvasPadding * 2}
                 >
                    <Layer>
                        <Group x={canvasPadding} y={canvasPadding}>
                            {/* Panel Outline */}
                            <Rect
                                width={activePanel.width * scale}
                                height={activePanel.height * scale}
                                stroke="#2C3E50"
                                strokeWidth={2}
                                fill="#ECF0F1"
                            />
                            
                            {/* Grid Lines within Panel (optional visual aid) */}
                            {Array.from({ length: Math.floor(activePanel.width / 12) }).map((_, i) => (
                                <Line
                                    key={`v-${i}`}
                                    points={[(i + 1) * 12 * scale, 0, (i + 1) * 12 * scale, activePanel.height * scale]}
                                    stroke="#BDC3C7"
                                    strokeWidth={1}
                                    dash={[5, 5]}
                                    opacity={0.5}
                                />
                            ))}
                            
                            {/* Connections */}
                            {activePanel.connections.map(conn => (
                                <Group
                                    key={conn.id}
                                    x={conn.x * scale}
                                    y={conn.y * scale}
                                    draggable
                                    onDragEnd={(e) => handleDragEnd(e, conn.id)}
                                    onClick={() => setSelectedConnectionId(conn.id)}
                                >
                                    <Circle 
                                        radius={12}
                                        fill={selectedConnectionId === conn.id ? "#3498DB" : "white"}
                                        stroke="#2C3E50"
                                        strokeWidth={2}
                                    />
                                    {/* Crosshair inside circle */}
                                    <Line points={[-6, 0, 6, 0]} stroke={selectedConnectionId === conn.id ? "white" : "#2C3E50"} strokeWidth={1} />
                                    <Line points={[0, -6, 0, 6]} stroke={selectedConnectionId === conn.id ? "white" : "#2C3E50"} strokeWidth={1} />

                                    {/* Label Tag */}
                                    <Group y={-20}>
                                        <Rect
                                            x={-20}
                                            y={-14}
                                            width={40}
                                            height={18}
                                            fill="#2C3E50"
                                            cornerRadius={4}
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
                        </Group>
                    </Layer>
                 </Stage>
             </div>
        </div>

        {/* Properties Panel */}
        <div className="w-[400px] border-l bg-card flex flex-col shrink-0">
             {selectedConnectionId && activeConnection ? (
                 <Tabs defaultValue="forces" className="flex-1 flex flex-col">
                    <div className="p-4 border-b bg-muted/20">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="font-bold text-lg text-primary">Connection Properties</h3>
                            <Button variant="ghost" size="sm" onClick={() => deleteConnection(activePanel.id, activeConnection.id)}>
                                <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label>Label</Label>
                                <Input 
                                    value={activeConnection.label} 
                                    onChange={(e) => updateConnection(activePanel.id, {...activeConnection, label: e.target.value})}
                                    className="font-mono"
                                />
                            </div>
                            <div>
                                <Label>Type</Label>
                                <Select 
                                    value={activeConnection.type} 
                                    onValueChange={(val) => updateConnection(activePanel.id, {...activeConnection, type: val})}
                                >
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {project.capacities.map(c => <SelectItem key={c.type} value={c.type}>{c.type}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4 mt-4">
                             <div>
                                <Label>X (in)</Label>
                                <Input type="number" value={activeConnection.x} readOnly className="bg-muted font-mono" />
                             </div>
                             <div>
                                <Label>Y (in)</Label>
                                <Input type="number" value={activeConnection.y} readOnly className="bg-muted font-mono" />
                             </div>
                        </div>
                    </div>

                    <TabsList className="w-full rounded-none border-b">
                        <TabsTrigger value="forces" className="flex-1">Applied Forces</TabsTrigger>
                        <TabsTrigger value="results" className="flex-1">Analysis</TabsTrigger>
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
                                                {loadType === "D" ? "Dead Load" : loadType === "L" ? "Live Load" : loadType === "W" ? "Wind Load" : "Earthquake"}
                                            </span>
                                        </div>
                                        <div className="grid grid-cols-3 gap-2">
                                            {["x", "y", "z"].map((axis) => (
                                                <div key={axis}>
                                                    <Label className="text-xs uppercase text-muted-foreground font-bold">{axis}-Axis</Label>
                                                    <Input 
                                                        type="number" 
                                                        className="h-8 font-mono text-xs" 
                                                        value={activeConnection.forces[loadType as keyof typeof activeConnection.forces]?.[axis as 'x'|'y'|'z'] || 0}
                                                        onChange={(e) => {
                                                            const val = Number(e.target.value);
                                                            const newForces = { ...activeConnection.forces };
                                                            // @ts-ignore
                                                            newForces[loadType] = { ...newForces[loadType], [axis]: val };
                                                            updateConnection(activePanel.id, { ...activeConnection, forces: newForces });
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
                            <h4 className="text-sm font-semibold mb-3">LRFD Load Combinations</h4>
                            <div className="space-y-2">
                                {calculateLoadCombinations(
                                    activeConnection, 
                                    project.capacities.find(c => c.type === activeConnection.type)
                                ).map((combo, idx) => (
                                    <div key={idx} className="bg-white border rounded p-2 text-xs shadow-sm">
                                        <div className="flex justify-between font-semibold mb-1 border-b pb-1">
                                            <span className="text-primary">{combo.comboName}</span>
                                            {combo.maxUtilization !== undefined && (
                                                <span className={cn(
                                                    "font-mono",
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
             ) : (
                 <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8 text-center bg-muted/5">
                     <ArrowRight className="w-12 h-12 mb-4 opacity-20" />
                     <p className="font-medium">No Connection Selected</p>
                     <p className="text-sm opacity-70 mt-2">Click on a connection node in the drawing view to edit its properties.</p>
                 </div>
             )}
        </div>
      </div>
    </div>
  );
}

// Utility to merge classes
import { cn } from "@/lib/utils";
