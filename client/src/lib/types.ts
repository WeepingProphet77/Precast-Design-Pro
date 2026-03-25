
import { z } from "zod";

export type Vector3 = {
  x: number;
  y: number;
  z: number;
};

export type LoadType = "D" | "L" | "Lr" | "S" | "R" | "W" | "E";

export type ConnectionMarker = "diamond" | "triangle-down" | "circle" | "square";

export interface ConnectionForces {
  D: Vector3;
  L: Vector3;
  Lr?: Vector3;
  S?: Vector3;
  R?: Vector3;
  W: Vector3;
  E: Vector3;
}

export interface FactoredLoad {
  comboName: string;
  fx: number;
  fy: number;
  fz: number;
  utilizationX?: number;
  utilizationY?: number;
  utilizationZ?: number;
  maxUtilization?: number;
}

export interface ConnectionNode {
  id: string;
  label: string;
  type: string;
  x: number;
  y: number;
  marker: ConnectionMarker;
  forces: ConnectionForces;
}

export interface Vertex {
  id: string;
  x: number;
  y: number;
  radius?: number;
}

export interface Opening {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  type: "rect" | "circle" | "polygon";
  vertices?: { x: number; y: number }[];
}

export interface DxfView {
  id: string;
  name: string;
  polygon: Vertex[];
  openings: Opening[];
  showCentroid: boolean;
  centroidX?: number;
  centroidY?: number;
}

export interface Panel {
  id: string;
  name: string;
  description?: string;
  width: number;
  height: number;
  thickness: number;
  weight?: number;
  panelWeight?: number;
  supportedElementsWeight?: number;
  positiveWindPressure?: number;
  negativeWindPressure?: number;
  seismicForceFp?: number;
  centroidX?: number;
  centroidY?: number;
  perimeter: Vertex[];
  openings: Opening[];
  sketchLines: SketchLine[];
  connections: ConnectionNode[];
  importedNodes?: { x: number; y: number }[];
  dxfViews?: DxfView[];
}

export interface SketchLine {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface ConnectionCapacity {
  type: string;
  capacityX: number;
  capacityY: number;
  capacityZ: number;
}

export interface ProjectInfo {
  jobName: string;
  jobNumber: string;
  engineer: string;
  location: string;
  date?: string;
  designStandard: "ASCE7-16" | "ASCE7-22";
  designMethod: "LRFD" | "ASD";
}

export interface ProjectData {
  info: ProjectInfo;
  panels: Panel[];
  capacities: ConnectionCapacity[];
}

export const createDefaultProject = (): ProjectData => ({
  info: {
    jobName: "New Project",
    jobNumber: "25-001",
    engineer: "",
    location: "",
    designStandard: "ASCE7-16",
    designMethod: "LRFD",
  },
  panels: [],
  capacities: [
    { type: "A", capacityX: 5000, capacityY: 10000, capacityZ: 5000 },
    { type: "B", capacityX: 8000, capacityY: 15000, capacityZ: 8000 },
  ],
});
