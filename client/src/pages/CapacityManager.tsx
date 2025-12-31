
import React from "react";
import { useProject } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2 } from "lucide-react";
import { ConnectionCapacity } from "@/lib/types";

export default function CapacityManager() {
  const { project, updateCapacity, addCapacity } = useProject();

  const handleUpdate = (type: string, field: keyof ConnectionCapacity, value: string) => {
    const capacity = project.capacities.find(c => c.type === type);
    if (!capacity) return;
    
    updateCapacity({
        ...capacity,
        [field]: Number(value)
    });
  };

  return (
    <div className="p-8 max-w-5xl mx-auto">
        <div className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight text-primary">Connection Capacities</h1>
            <p className="text-muted-foreground mt-2">Define allowable strength limits for each connection type to calculate utilization ratios.</p>
        </div>

        <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <div>
                    <CardTitle>Capacity Limits (LRFD)</CardTitle>
                    <CardDescription>Enter design capacities in lbs.</CardDescription>
                </div>
                <Button onClick={() => {
                    // Find next available letter
                    const existingTypes = project.capacities.map(c => c.type);
                    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
                    const nextType = alphabet.split("").find(char => !existingTypes.includes(char)) || "Z";
                    
                    addCapacity({
                        type: nextType,
                        capacityX: 5000,
                        capacityY: 5000,
                        capacityZ: 5000
                    });
                }}>
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
                            <TableRow key={cap.type}>
                                <TableCell className="font-bold text-lg">{cap.type}</TableCell>
                                <TableCell>
                                    <Input 
                                        type="number" 
                                        value={cap.capacityX} 
                                        onChange={(e) => handleUpdate(cap.type, 'capacityX', e.target.value)}
                                        className="font-mono max-w-[150px]"
                                    />
                                </TableCell>
                                <TableCell>
                                    <Input 
                                        type="number" 
                                        value={cap.capacityY} 
                                        onChange={(e) => handleUpdate(cap.type, 'capacityY', e.target.value)}
                                        className="font-mono max-w-[150px]"
                                    />
                                </TableCell>
                                <TableCell>
                                    <Input 
                                        type="number" 
                                        value={cap.capacityZ} 
                                        onChange={(e) => handleUpdate(cap.type, 'capacityZ', e.target.value)}
                                        className="font-mono max-w-[150px]"
                                    />
                                </TableCell>
                                <TableCell>
                                    {/* Prevent deleting if in use? For now just allow it but maybe warn in real app */}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    </div>
  );
}
