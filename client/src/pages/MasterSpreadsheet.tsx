
import React, { useState } from "react";
import { useProject } from "@/lib/store";
import { calculateLoadCombinations } from "@/lib/calculations";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { ArrowUpDown, Download } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function MasterSpreadsheet() {
  const { project } = useProject();
  const [filterPanel, setFilterPanel] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");

  // Flatten all connections
  const allData = project.panels.flatMap(panel => 
    panel.connections.map(conn => {
      const capacity = project.capacities.find(c => c.type === conn.type);
      const loads = calculateLoadCombinations(conn, capacity);
      // Find governing case (max utilization, or max force magnitude if no capacity)
      // For simplicity, let's take the one with highest UC, or just the first one if undefined
      const governing = loads.reduce((prev, current) => 
        (current.maxUtilization || 0) > (prev.maxUtilization || 0) ? current : prev
      , loads[0]);

      return {
        panelName: panel.name,
        connLabel: conn.label,
        connType: conn.type,
        combo: governing.comboName,
        fx: governing.fx,
        fy: governing.fy,
        fz: governing.fz,
        utilization: governing.maxUtilization
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
               <p className="text-muted-foreground">Aggregated analysis results for all project connections.</p>
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
                   {project.capacities.map(c => <SelectItem key={c.type} value={c.type}>Type {c.type}</SelectItem>)}
               </SelectContent>
           </Select>
       </div>

       <div className="border rounded-md bg-white overflow-hidden flex-1">
           <div className="overflow-auto h-full">
               <Table>
                   <TableHeader className="bg-muted/50 sticky top-0 z-10">
                       <TableRow>
                           <TableHead>Panel</TableHead>
                           <TableHead>Connection</TableHead>
                           <TableHead>Type</TableHead>
                           <TableHead>Governing Combo</TableHead>
                           <TableHead className="text-right">Fx (lbs)</TableHead>
                           <TableHead className="text-right">Fy (lbs)</TableHead>
                           <TableHead className="text-right">Fz (lbs)</TableHead>
                           <TableHead className="text-right">Utilization</TableHead>
                       </TableRow>
                   </TableHeader>
                   <TableBody>
                       {filteredData.length === 0 ? (
                           <TableRow>
                               <TableCell colSpan={8} className="text-center h-24 text-muted-foreground">
                                   No connections found matching filters.
                               </TableCell>
                           </TableRow>
                       ) : filteredData.map((row, i) => (
                           <TableRow key={i}>
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
                                   {row.utilization !== undefined ? (
                                       <span className={cn(
                                           "font-bold",
                                           row.utilization > 1.0 ? "text-destructive" : 
                                           row.utilization > 0.9 ? "text-warning" : "text-success"
                                       )}>
                                           {(row.utilization * 100).toFixed(1)}%
                                       </span>
                                   ) : "N/A"}
                               </TableCell>
                           </TableRow>
                       ))}
                   </TableBody>
               </Table>
           </div>
       </div>
    </div>
  );
}

// Utility to merge classes
import { cn } from "@/lib/utils";
