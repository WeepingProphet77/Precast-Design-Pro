
import React, { useState } from "react";
import { useProject } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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

    if (field === "type") {
      updateCapacity({ ...capacity, type: value }, type);
    } else {
      updateCapacity({ ...capacity, [field]: Number(value) });
    }
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

  const getNextTypeId = (): string => {
    const existingTypes = project.capacities.map(c => c.type);
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const nextLetter = alphabet.split("").find(char => !existingTypes.includes(char));
    if (nextLetter) return nextLetter;
    let i = 1;
    while (existingTypes.includes(String(i))) i++;
    return String(i);
  };

  return (
    <div className="p-8 max-w-6xl mx-auto">
        <div className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight text-primary" data-testid="text-capacity-title">Connection Capacities</h1>
            <p className="text-muted-foreground mt-2">Define allowable strength limits for each connection type. Specify positive and negative capacities per axis for directional checks.</p>
        </div>

        <div className="flex items-center justify-between mb-4">
            <div className="text-sm text-muted-foreground">
              Design Method: <span className="font-semibold text-foreground">{project.info.designMethod === "ASD" ? "ASD" : "LRFD"}</span>
            </div>
            <Button onClick={() => {
                const nextType = getNextTypeId();
                addCapacity({
                    type: nextType,
                    capacityX: 5000, capacityY: 5000, capacityZ: 5000,
                    capacityXPositive: 5000, capacityXNegative: 5000,
                    capacityYPositive: 5000, capacityYNegative: 5000,
                    capacityZPositive: 5000, capacityZNegative: 5000,
                });
            }} data-testid="button-add-capacity">
                <Plus className="w-4 h-4 mr-2" /> Add Type
            </Button>
        </div>

        <div className="space-y-4">
          {project.capacities.map((cap, idx) => (
            <Card key={idx} data-testid={`row-capacity-${cap.type}`}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Label className="text-xs uppercase text-muted-foreground">Type</Label>
                    <Input
                      type="text"
                      value={cap.type}
                      onChange={(e) => handleUpdate(cap.type, 'type', e.target.value)}
                      className="font-bold text-lg max-w-[120px] font-mono"
                      data-testid={`input-capacity-type-${cap.type}`}
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(cap.type)}
                    data-testid={`button-delete-capacity-${cap.type}`}
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4">
                  {/* X-Axis */}
                  <div className="space-y-2 p-3 bg-muted/20 rounded border border-border/50">
                    <div className="text-xs font-bold uppercase tracking-wider text-center mb-2">X-Axis (Horizontal/Lateral)</div>
                    <div className="space-y-2">
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">+X Right (lbs)</Label>
                        <Input
                          type="number"
                          value={cap.capacityXPositive ?? cap.capacityX}
                          onChange={(e) => handleUpdate(cap.type, 'capacityXPositive', e.target.value)}
                          className="h-8 text-xs font-mono"
                          data-testid={`input-capacity-xpos-${cap.type}`}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">-X Left (lbs)</Label>
                        <Input
                          type="number"
                          value={cap.capacityXNegative ?? cap.capacityX}
                          onChange={(e) => handleUpdate(cap.type, 'capacityXNegative', e.target.value)}
                          className="h-8 text-xs font-mono"
                          data-testid={`input-capacity-xneg-${cap.type}`}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Y-Axis */}
                  <div className="space-y-2 p-3 bg-muted/20 rounded border border-border/50">
                    <div className="text-xs font-bold uppercase tracking-wider text-center mb-2">Y-Axis (Vertical)</div>
                    <div className="space-y-2">
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">+Y Compression (lbs)</Label>
                        <Input
                          type="number"
                          value={cap.capacityYPositive ?? cap.capacityY}
                          onChange={(e) => handleUpdate(cap.type, 'capacityYPositive', e.target.value)}
                          className="h-8 text-xs font-mono"
                          data-testid={`input-capacity-ypos-${cap.type}`}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">-Y Tension (lbs)</Label>
                        <Input
                          type="number"
                          value={cap.capacityYNegative ?? cap.capacityY}
                          onChange={(e) => handleUpdate(cap.type, 'capacityYNegative', e.target.value)}
                          className="h-8 text-xs font-mono"
                          data-testid={`input-capacity-yneg-${cap.type}`}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Z-Axis */}
                  <div className="space-y-2 p-3 bg-muted/20 rounded border border-border/50">
                    <div className="text-xs font-bold uppercase tracking-wider text-center mb-2">Z-Axis (Out-of-Plane)</div>
                    <div className="space-y-2">
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">+Z Pressure (lbs)</Label>
                        <Input
                          type="number"
                          value={cap.capacityZPositive ?? cap.capacityZ}
                          onChange={(e) => handleUpdate(cap.type, 'capacityZPositive', e.target.value)}
                          className="h-8 text-xs font-mono"
                          data-testid={`input-capacity-zpos-${cap.type}`}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">-Z Suction (lbs)</Label>
                        <Input
                          type="number"
                          value={cap.capacityZNegative ?? cap.capacityZ}
                          onChange={(e) => handleUpdate(cap.type, 'capacityZNegative', e.target.value)}
                          className="h-8 text-xs font-mono"
                          data-testid={`input-capacity-zneg-${cap.type}`}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

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
