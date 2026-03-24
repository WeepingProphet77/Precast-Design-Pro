
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

export const calculateLoadCombinations = (
  connection: ConnectionNode,
  capacity?: ConnectionCapacity,
  designMethod: "LRFD" | "ASD" = "LRFD",
  designStandard: "ASCE7-16" | "ASCE7-22" = "ASCE7-16"
): FactoredLoad[] => {
  const { D, L, W, E } = connection.forces;
  const stdLabel = designStandard === "ASCE7-22" ? "7-22" : "7-16";

  const lrfdCombinations = [
    { name: `1. 1.4D (ASCE ${stdLabel} §2.3)`, force: scale(D, 1.4) },
    { name: `2. 1.2D + 1.6L (ASCE ${stdLabel} §2.3)`, force: add(scale(D, 1.2), scale(L, 1.6)) },
    { name: `3. 1.2D + 1.0W + 1.0L (ASCE ${stdLabel} §2.3)`, force: add(scale(D, 1.2), scale(W, 1.0), scale(L, 1.0)) },
    { name: `4. 0.9D + 1.0W (ASCE ${stdLabel} §2.3)`, force: add(scale(D, 0.9), scale(W, 1.0)) },
    { name: `5. 1.2D + 1.0E + 1.0L (ASCE ${stdLabel} §2.3)`, force: add(scale(D, 1.2), scale(E, 1.0), scale(L, 1.0)) },
    { name: `6. 0.9D + 1.0E (ASCE ${stdLabel} §2.3)`, force: add(scale(D, 0.9), scale(E, 1.0)) },
  ];

  const asdCombinations = [
    { name: `1. D (ASCE ${stdLabel} §2.4)`, force: scale(D, 1.0) },
    { name: `2. D + L (ASCE ${stdLabel} §2.4)`, force: add(scale(D, 1.0), scale(L, 1.0)) },
    { name: `3. D + 0.75L + 0.75(0.6W) (ASCE ${stdLabel} §2.4)`, force: add(scale(D, 1.0), scale(L, 0.75), scale(W, 0.45)) },
    { name: `4. D + 0.6W (ASCE ${stdLabel} §2.4)`, force: add(scale(D, 1.0), scale(W, 0.6)) },
    { name: `5. 0.6D + 0.6W (ASCE ${stdLabel} §2.4)`, force: add(scale(D, 0.6), scale(W, 0.6)) },
    { name: `6. D + 0.7E (ASCE ${stdLabel} §2.4)`, force: add(scale(D, 1.0), scale(E, 0.7)) },
    { name: `7. D + 0.75L + 0.75(0.7E) (ASCE ${stdLabel} §2.4)`, force: add(scale(D, 1.0), scale(L, 0.75), scale(E, 0.525)) },
    { name: `8. 0.6D + 0.7E (ASCE ${stdLabel} §2.4)`, force: add(scale(D, 0.6), scale(E, 0.7)) },
  ];

  const combinations = designMethod === "ASD" ? asdCombinations : lrfdCombinations;

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
