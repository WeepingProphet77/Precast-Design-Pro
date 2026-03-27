
import React, { useState } from "react";
import { useProject } from "@/lib/store";
import { calculateLoadCombinations, calculateDirectionalResult } from "@/lib/calculations";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Download, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { ConnectionDirectionalResult } from "@/lib/types";

function formatDcr(dcr: number): string {
  if (!isFinite(dcr)) return "O/S";
  return (dcr * 100).toFixed(1) + "%";
}

function dcrColor(dcr: number): string {
  if (!isFinite(dcr)) return "text-destructive font-bold";
  if (dcr > 1.0) return "text-destructive font-bold";
  if (dcr > 0.9) return "text-warning font-bold";
  return "text-success font-bold";
}

export default function MasterSpreadsheet() {
  const { project, updateProjectInfo } = useProject();
  const [filterPanel, setFilterPanel] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const toggleExpand = (key: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Flatten all connections with directional results
  const allData = project.panels.flatMap(panel =>
    panel.connections.map(conn => {
      const capacity = project.capacities.find(c => c.type === conn.type);
      const loads = calculateLoadCombinations(conn, capacity, project.info.designMethod, project.info.designStandard);
      const directional = capacity
        ? calculateDirectionalResult(conn, capacity, project.info.designMethod, project.info.designStandard)
        : null;

      // Find governing case: highest utilization if capacities exist, otherwise highest force magnitude
      const forceMagnitude = (l: typeof loads[0]) => Math.abs(l.fx) + Math.abs(l.fy) + Math.abs(l.fz);
      const governing = loads.reduce((prev, current) => {
        const prevUtil = prev.maxUtilization;
        const curUtil = current.maxUtilization;
        if (prevUtil !== undefined && curUtil !== undefined && isFinite(prevUtil) && isFinite(curUtil)) {
          return curUtil > prevUtil ? current : prev;
        }
        return forceMagnitude(current) > forceMagnitude(prev) ? current : prev;
      }, loads[0]);

      // Max DCR across all directional demands
      const maxDcr = directional
        ? Math.max(
            directional.xPositive.dcr, directional.xNegative.dcr,
            directional.yPositive.dcr, directional.yNegative.dcr,
            directional.zPositive.dcr, directional.zNegative.dcr,
          )
        : governing.maxUtilization;

      return {
        key: `${panel.id}_${conn.id}`,
        panelName: panel.name,
        connLabel: conn.label,
        connType: conn.type,
        combo: governing.comboName,
        fx: governing.fx,
        fy: governing.fy,
        fz: governing.fz,
        utilization: maxDcr,
        directional,
      };
    })
  );

  const filteredData = allData.filter(d => {
    if (filterPanel !== "all" && d.panelName !== filterPanel) return false;
    if (filterType !== "all" && d.connType !== filterType) return false;
    return true;
  });

  return (
    <div className="p-8 h-full flex flex-col">
       <div className="flex justify-between items-end mb-6">
           <div>
               <h1 className="text-2xl font-bold tracking-tight text-primary">Master Connection Schedule</h1>
               <p className="text-muted-foreground">
                 {project.info.designStandard === "ASCE7-22" ? "ASCE 7-22" : "ASCE 7-16"}
                 {" "}&middot;{" "}
                 {project.info.designMethod === "ASD"
                   ? "Allowable Stress Design (Section 2.4)"
                   : "Strength Design (Section 2.3)"}
               </p>
           </div>
           <Button variant="outline">
               <Download className="w-4 h-4 mr-2" /> Export CSV
           </Button>
       </div>

       <div className="flex gap-4 mb-4">
           <Select value={filterPanel} onValueChange={setFilterPanel}>
               <SelectTrigger className="w-[200px]">
                   <SelectValue placeholder="Filter by Panel" />
               </SelectTrigger>
               <SelectContent>
                   <SelectItem value="all">All Panels</SelectItem>
                   {project.panels.map(p => <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>)}
               </SelectContent>
           </Select>
            <Select value={filterType} onValueChange={setFilterType}>
               <SelectTrigger className="w-[200px]">
                   <SelectValue placeholder="Filter by Type" />
               </SelectTrigger>
               <SelectContent>
                   <SelectItem value="all">All Types</SelectItem>
                   {project.capacities.map(c => <SelectItem key={c.type} value={c.type}>{c.type}</SelectItem>)}
               </SelectContent>
           </Select>
           <Select
             value={project.info.designMethod}
             onValueChange={(val) =>
               updateProjectInfo({ ...project.info, designMethod: val as "LRFD" | "ASD" })
             }
           >
               <SelectTrigger className="w-[280px]">
                   <SelectValue />
               </SelectTrigger>
               <SelectContent>
                   <SelectItem value="LRFD">Strength Design - Section 2.3</SelectItem>
                   <SelectItem value="ASD">Allowable Stress Design - Section 2.4</SelectItem>
               </SelectContent>
           </Select>
       </div>

       <div className="border rounded-md bg-white overflow-hidden flex-1">
           <div className="overflow-auto h-full">
               <Table>
                   <TableHeader className="bg-muted/50 sticky top-0 z-10">
                       <TableRow>
                           <TableHead className="w-[30px]"></TableHead>
                           <TableHead>Panel</TableHead>
                           <TableHead>Connection</TableHead>
                           <TableHead>Type</TableHead>
                           <TableHead>Governing Combo</TableHead>
                           <TableHead className="text-right">Fx (lbs)</TableHead>
                           <TableHead className="text-right">Fy (lbs)</TableHead>
                           <TableHead className="text-right">Fz (lbs)</TableHead>
                           <TableHead className="text-right">Max DCR</TableHead>
                       </TableRow>
                   </TableHeader>
                   <TableBody>
                       {filteredData.length === 0 ? (
                           <TableRow>
                               <TableCell colSpan={9} className="text-center h-24 text-muted-foreground">
                                   No connections found matching filters.
                               </TableCell>
                           </TableRow>
                       ) : filteredData.map((row) => {
                         const isExpanded = expandedRows.has(row.key);
                         return (
                           <React.Fragment key={row.key}>
                             <TableRow
                               className={cn("cursor-pointer hover:bg-muted/30", isExpanded && "bg-muted/20")}
                               onClick={() => row.directional && toggleExpand(row.key)}
                             >
                               <TableCell className="w-[30px] px-2">
                                 {row.directional && (
                                   isExpanded
                                     ? <ChevronDown className="w-4 h-4 text-muted-foreground" />
                                     : <ChevronRight className="w-4 h-4 text-muted-foreground" />
                                 )}
                               </TableCell>
                               <TableCell className="font-medium">{row.panelName}</TableCell>
                               <TableCell>{row.connLabel}</TableCell>
                               <TableCell>
                                   <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-secondary text-secondary-foreground">
                                       {row.connType}
                                   </span>
                               </TableCell>
                               <TableCell className="text-xs text-muted-foreground">{row.combo}</TableCell>
                               <TableCell className="text-right font-mono">{row.fx}</TableCell>
                               <TableCell className="text-right font-mono">{row.fy}</TableCell>
                               <TableCell className="text-right font-mono">{row.fz}</TableCell>
                               <TableCell className="text-right">
                                   {row.utilization !== undefined && isFinite(row.utilization) ? (
                                       <span className={dcrColor(row.utilization)}>
                                           {formatDcr(row.utilization)}
                                       </span>
                                   ) : row.utilization === Infinity ? (
                                       <span className="font-bold text-destructive">O/S</span>
                                   ) : "N/A"}
                               </TableCell>
                             </TableRow>
                             {isExpanded && row.directional && (
                               <TableRow className="bg-muted/10">
                                 <TableCell colSpan={9} className="p-0">
                                   <DirectionalDemandTable result={row.directional} />
                                 </TableCell>
                               </TableRow>
                             )}
                           </React.Fragment>
                         );
                       })}
                   </TableBody>
               </Table>
           </div>
       </div>
    </div>
  );
}

function DirectionalDemandTable({ result }: { result: ConnectionDirectionalResult }) {
  const axes = [
    { label: "X-Axis (Horizontal)", pos: result.xPositive, neg: result.xNegative, posLabel: "+X Right", negLabel: "-X Left" },
    { label: "Y-Axis (Vertical)", pos: result.yPositive, neg: result.yNegative, posLabel: "+Y Compression", negLabel: "-Y Tension" },
    { label: "Z-Axis (Out-of-Plane)", pos: result.zPositive, neg: result.zNegative, posLabel: "+Z Pressure", negLabel: "-Z Suction" },
  ];

  return (
    <div className="px-8 py-3">
      <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Directional Demand Summary</div>
      <div className="grid grid-cols-3 gap-3">
        {axes.map(axis => (
          <div key={axis.label} className="border rounded p-2 bg-white">
            <div className="text-[10px] font-bold uppercase tracking-wider text-center mb-2 text-muted-foreground">{axis.label}</div>
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{axis.posLabel}:</span>
                <span className="font-mono font-bold">{axis.pos.demand} lbs</span>
              </div>
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-muted-foreground truncate mr-1">{axis.pos.controllingCombo}</span>
                <span className={cn("font-mono", dcrColor(axis.pos.dcr))}>{formatDcr(axis.pos.dcr)}</span>
              </div>
              <div className="border-t my-1" />
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{axis.negLabel}:</span>
                <span className="font-mono font-bold">{axis.neg.demand} lbs</span>
              </div>
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-muted-foreground truncate mr-1">{axis.neg.controllingCombo}</span>
                <span className={cn("font-mono", dcrColor(axis.neg.dcr))}>{formatDcr(axis.neg.dcr)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
