
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Panel } from "@/lib/types";

interface ResizePanelDialogProps {
    panel: Panel;
    onResize: (width: number, height: number) => void;
    trigger: React.ReactNode;
}

export function ResizePanelDialog({ panel, onResize, trigger }: ResizePanelDialogProps) {
    const [width, setWidth] = useState(panel.width);
    const [height, setHeight] = useState(panel.height);
    const [open, setOpen] = useState(false);

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {trigger}
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Resize Panel</DialogTitle>
                    <DialogDescription>
                        Set the precise bounding box dimensions for this panel. This will reset the shape to a rectangle.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="width" className="text-right">
                            Width
                        </Label>
                        <Input
                            id="width"
                            type="number"
                            value={width}
                            onChange={(e) => setWidth(Number(e.target.value))}
                            className="col-span-3"
                        />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="height" className="text-right">
                            Height
                        </Label>
                        <Input
                            id="height"
                            type="number"
                            value={height}
                            onChange={(e) => setHeight(Number(e.target.value))}
                            className="col-span-3"
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button type="submit" onClick={() => {
                        onResize(width, height);
                        setOpen(false);
                    }}>Apply Size</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
