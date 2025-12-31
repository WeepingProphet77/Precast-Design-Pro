
import { ConnectionNode, FactoredLoad, Vector3, ConnectionCapacity } from "./types";

// Helper to scale vector
const scale = (v: Vector3 | undefined, factor: number): Vector3 => {
  if (!v) return { x: 0, y: 0, z: 0 };
  return {
    x: v.x * factor,
    y: v.y * factor,
    z: v.z * factor,
  };
};

// Helper to add vectors
const add = (...vectors: Vector3[]): Vector3 => {
  return vectors.reduce(
    (acc, v) => ({
      x: acc.x + v.x,
      y: acc.y + v.y,
      z: acc.z + v.z,
    }),
    { x: 0, y: 0, z: 0 }
  );
};

// ASCE 7-16 LRFD Combinations
// 1. 1.4D
// 2. 1.2D + 1.6L + 0.5(Lr or S or R) -> Simplified to 1.2D + 1.6L for this demo
// 3. 1.2D + 1.0W + L + 0.5(Lr or S or R) -> Simplified to 1.2D + 1.0W + 1.0L
// 4. 0.9D + 1.0W
// 5. 1.2D + 1.0E + L + 0.2S -> Simplified to 1.2D + 1.0E + 1.0L
// 6. 0.9D + 1.0E

export const calculateLoadCombinations = (
  connection: ConnectionNode,
  capacity?: ConnectionCapacity
): FactoredLoad[] => {
  const { D, L, W, E } = connection.forces;

  const combinations = [
    {
      name: "1. 1.4D",
      force: scale(D, 1.4),
    },
    {
      name: "2. 1.2D + 1.6L",
      force: add(scale(D, 1.2), scale(L, 1.6)),
    },
    {
      name: "3. 1.2D + 1.0W + 1.0L",
      force: add(scale(D, 1.2), scale(W, 1.0), scale(L, 1.0)),
    },
    {
      name: "4. 0.9D + 1.0W",
      force: add(scale(D, 0.9), scale(W, 1.0)),
    },
    {
      name: "5. 1.2D + 1.0E + 1.0L",
      force: add(scale(D, 1.2), scale(E, 1.0), scale(L, 1.0)),
    },
    {
      name: "6. 0.9D + 1.0E",
      force: add(scale(D, 0.9), scale(E, 1.0)),
    },
  ];

  return combinations.map((combo) => {
    const result: FactoredLoad = {
      comboName: combo.name,
      fx: Math.round(combo.force.x),
      fy: Math.round(combo.force.y),
      fz: Math.round(combo.force.z),
    };

    if (capacity) {
      result.utilizationX = Math.abs(result.fx / capacity.capacityX);
      result.utilizationY = Math.abs(result.fy / capacity.capacityY);
      result.utilizationZ = Math.abs(result.fz / capacity.capacityZ);
      result.maxUtilization = Math.max(
        result.utilizationX,
        result.utilizationY,
        result.utilizationZ
      );
    }

    return result;
  });
};
