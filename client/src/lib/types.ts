
import { z } from "zod";

export type Vector3 = {
  x: number;
  y: number;
  z: number;
};

export type LoadType = "D" | "L" | "Lr" | "S" | "R" | "W" | "E";

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
  type: string; // e.g., "A", "B", "C"
  x: number; // inches
  y: number; // inches
  forces: ConnectionForces;
}

export interface Panel {
  id: string;
  name: string; // e.g., "P-1"
  description?: string;
  width: number; // inches
  height: number; // inches
  thickness: number; // inches
  weight?: number; // lbs
  connections: ConnectionNode[];
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
  date: string;
}

export interface ProjectData {
  info: ProjectInfo;
  panels: Panel[];
  capacities: ConnectionCapacity[];
}

// Initial Data Factory
export const createDefaultProject = (): ProjectData => ({
  info: {
    jobName: "New Project",
    jobNumber: "25-001",
    engineer: "",
    location: "",
    date: new Date().toISOString().split("T")[0],
  },
  panels: [
    {
      id: "1",
      name: "P-01",
      description: "Standard Cladding Panel",
      width: 120,
      height: 180,
      thickness: 6,
      connections: [
        {
          id: "c1",
          label: "TL",
          type: "A",
          x: 12,
          y: 168,
          forces: {
            D: { x: 0, y: 1500, z: 0 },
            L: { x: 0, y: 0, z: 0 },
            W: { x: 0, y: 0, z: 800 },
            E: { x: 500, y: 0, z: 200 },
          },
        },
        {
          id: "c2",
          label: "TR",
          type: "A",
          x: 108,
          y: 168,
          forces: {
            D: { x: 0, y: 1500, z: 0 },
            L: { x: 0, y: 0, z: 0 },
            W: { x: 0, y: 0, z: 800 },
            E: { x: 500, y: 0, z: 200 },
          },
        },
      ],
    },
  ],
  capacities: [
    { type: "A", capacityX: 5000, capacityY: 10000, capacityZ: 5000 },
    { type: "B", capacityX: 8000, capacityY: 15000, capacityZ: 8000 },
  ],
});
