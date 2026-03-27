
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
  // Negative direction cases for reversible loads (wind suction, seismic reverse)
  // If not provided, defaults to negation of W and E respectively
  Wneg?: Vector3;
  Eneg?: Vector3;
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

// Computed result per axis per direction
export interface DirectionalDemand {
  demand: number;           // factored force in lbs (signed)
  controllingCombo: string; // e.g., "LC 6: 0.9D + 1.0W"
  dcr: number;              // |demand| / capacity
}

// Full directional result for a connection
export interface ConnectionDirectionalResult {
  xPositive: DirectionalDemand;
  xNegative: DirectionalDemand;
  yPositive: DirectionalDemand;
  yNegative: DirectionalDemand;
  zPositive: DirectionalDemand;
  zNegative: DirectionalDemand;
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
  dimensions?: DimensionAnnotation[];
  userLines?: UserDrawnLine[];
  loadAnnotations?: LoadAnnotation[];
  textAnnotations?: TextAnnotation[];
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

export type DimensionSnapRef =
  | { kind: "vertex"; vertexId: string }
  | { kind: "connection"; connectionId: string }
  | { kind: "centroid" }
  | { kind: "viewCentroid"; viewId: string }
  | { kind: "dimension"; dimensionId: string; endpoint: "start" | "end" }
  | { kind: "free" };

export interface DimensionAnnotation {
  id: string;
  startX: number;
  startY: number;
  startRef: DimensionSnapRef;
  endX: number;
  endY: number;
  endRef: DimensionSnapRef;
  offset: number; // perpendicular offset for dimension line placement
}

export interface UserDrawnLine {
  id: string;
  x1: number;
  y1: number;
  startRef: DimensionSnapRef;
  x2: number;
  y2: number;
  endRef: DimensionSnapRef;
  lineType: "solid" | "hidden";
}

export type LoadAnnotationType = "line_load" | "point_vertical" | "point_horizontal" | "point_out_of_plane";

export interface LoadAnnotation {
  id: string;
  type: LoadAnnotationType;
  // For line loads: start/end points
  startX: number;
  startY: number;
  startRef: DimensionSnapRef;
  endX: number;
  endY: number;
  endRef: DimensionSnapRef;
  // For point loads: direction
  direction?: "up" | "down" | "left" | "right" | "positive" | "negative";
  label: string;
}

export interface TextAnnotation {
  id: string;
  x: number;
  y: number;
  width: number;   // CAD units (inches)
  height: number;  // CAD units (inches)
  text: string;
  showBorder: boolean;
}

export interface ConnectionCapacity {
  type: string;
  capacityX: number;
  capacityY: number;
  capacityZ: number;
  // Directional capacities (positive and negative per axis)
  // +X = rightward, -X = leftward
  capacityXPositive?: number;
  capacityXNegative?: number;
  // +Y = compression/bearing, -Y = tension/uplift
  capacityYPositive?: number;
  capacityYNegative?: number;
  // +Z = pressure (toward panel face), -Z = suction (away from panel face)
  capacityZPositive?: number;
  capacityZNegative?: number;
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
    { type: "A", capacityX: 5000, capacityY: 10000, capacityZ: 5000,
      capacityXPositive: 5000, capacityXNegative: 5000,
      capacityYPositive: 10000, capacityYNegative: 0,
      capacityZPositive: 5000, capacityZNegative: 5000 },
    { type: "B", capacityX: 8000, capacityY: 15000, capacityZ: 8000,
      capacityXPositive: 8000, capacityXNegative: 8000,
      capacityYPositive: 15000, capacityYNegative: 8000,
      capacityZPositive: 8000, capacityZNegative: 8000 },
  ],
});
