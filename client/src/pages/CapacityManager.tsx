
import React, { useState } from "react";
import { useProject } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2 } from "lucide-react";
import { ConnectionCapacity } from "@/lib/types";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function CapacityManager() {
  const { project, updateCapacity, addCapacity, deleteCapacity } = useProject();
  const [warningOpen, setWarningOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{ type: string; panelNames: string[] } | null>(null);

  const handleUpdate = (type: string, field: keyof ConnectionCapacity, value: string) => {
    const capacity = project.capacities.find(c => c.type === type);
    if (!capacity) return;
    
    updateCapacity({
        ...capacity,
        [field]: Number(value)
    });
  };

  const handleDelete = (type: string) => {
    const panelsUsing = project.panels.filter(p =>
      p.connections.some(c => c.type === type)
    );

    if (panelsUsing.length > 0) {
      setPendingDelete({ type, panelNames: panelsUsing.map(p => p.name) });
      setWarningOpen(true);
    } else {
      deleteCapacity(type);
    }
  };

  return (
    <div className="p-8 max-w-5xl mx-auto">
        <div className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight text-primary" data-testid="text-capacity-title">Connection Capacities</h1>
            <p className="text-muted-foreground mt-2">Define allowable strength limits for each connection type to calculate utilization ratios.</p>
        </div>

        <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <div>
                    <CardTitle>Capacity Limits (LRFD)</CardTitle>
                    <CardDescription>Enter design capacities in lbs.</CardDescription>
                </div>
                <Button onClick={() => {
                    const existingTypes = project.capacities.map(c => c.type);
                    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
                    const nextType = alphabet.split("").find(char => !existingTypes.includes(char)) || "Z";
                    
                    addCapacity({
                        type: nextType,
                        capacityX: 5000,
                        capacityY: 5000,
                        capacityZ: 5000
                    });
                }} data-testid="button-add-capacity">
                    <Plus className="w-4 h-4 mr-2" /> Add Type
                </Button>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[100px]">Type</TableHead>
                            <TableHead>X-Capacity (Shear/Normal)</TableHead>
                            <TableHead>Y-Capacity (Gravity)</TableHead>
                            <TableHead>Z-Capacity (Tie-back)</TableHead>
                            <TableHead className="w-[50px]"></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {project.capacities.map((cap) => (
                            <TableRow key={cap.type} data-testid={`row-capacity-${cap.type}`}>
                                <TableCell className="font-bold text-lg">{cap.type}</TableCell>
                                <TableCell>
                                    <Input 
                                        type="number" 
                                        value={cap.capacityX} 
                                        onChange={(e) => handleUpdate(cap.type, 'capacityX', e.target.value)}
                                        className="font-mono max-w-[150px]"
                                        data-testid={`input-capacity-x-${cap.type}`}
                                    />
                                </TableCell>
                                <TableCell>
                                    <Input 
                                        type="number" 
                                        value={cap.capacityY} 
                                        onChange={(e) => handleUpdate(cap.type, 'capacityY', e.target.value)}
                                        className="font-mono max-w-[150px]"
                                        data-testid={`input-capacity-y-${cap.type}`}
                                    />
                                </TableCell>
                                <TableCell>
                                    <Input 
                                        type="number" 
                                        value={cap.capacityZ} 
                                        onChange={(e) => handleUpdate(cap.type, 'capacityZ', e.target.value)}
                                        className="font-mono max-w-[150px]"
                                        data-testid={`input-capacity-z-${cap.type}`}
                                    />
                                </TableCell>
                                <TableCell>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => handleDelete(cap.type)}
                                      data-testid={`button-delete-capacity-${cap.type}`}
                                    >
                                      <Trash2 className="w-4 h-4 text-destructive" />
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>

        <AlertDialog open={warningOpen} onOpenChange={setWarningOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Cannot Delete Connection Type</AlertDialogTitle>
              <AlertDialogDescription>
                Type <span className="font-bold">{pendingDelete?.type}</span> is currently assigned to connections on the following panel(s):
                <span className="block mt-2 font-semibold text-foreground">
                  {pendingDelete?.panelNames.join(", ")}
                </span>
                <span className="block mt-2">
                  Please reassign or remove those connections before deleting this capacity type.
                </span>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogAction onClick={() => { setWarningOpen(false); setPendingDelete(null); }} data-testid="button-warning-ok">
                OK
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
    </div>
  );
}
