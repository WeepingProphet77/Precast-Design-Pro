
import { ConnectionNode, FactoredLoad, Vector3, ConnectionCapacity, ConnectionDirectionalResult, DirectionalDemand } from "./types";

// Helper to scale vector
const scale = (v: Vector3 | undefined, factor: number): Vector3 => {
  if (!v) return { x: 0, y: 0, z: 0 };
  return {
    x: v.x * factor,
    y: v.y * factor,
    z: v.z * factor,
  };
};

// Helper to negate vector
const negate = (v: Vector3): Vector3 => ({ x: -v.x, y: -v.y, z: -v.z });

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

// Get the effective directional capacity for a given axis direction
function getDirectionalCapacity(
  capacity: ConnectionCapacity,
  axis: "x" | "y" | "z",
  direction: "positive" | "negative"
): number {
  if (axis === "x") {
    if (direction === "positive") return capacity.capacityXPositive ?? capacity.capacityX;
    return capacity.capacityXNegative ?? capacity.capacityX;
  }
  if (axis === "y") {
    if (direction === "positive") return capacity.capacityYPositive ?? capacity.capacityY;
    return capacity.capacityYNegative ?? capacity.capacityY;
  }
  // z
  if (direction === "positive") return capacity.capacityZPositive ?? capacity.capacityZ;
  return capacity.capacityZNegative ?? capacity.capacityZ;
}

/**
 * Build all load combinations, evaluating W and E in both positive and negative
 * directions for combinations that include them.
 * Returns an array of { name, force } for every combination variant.
 */
function buildAllCombinations(
  connection: ConnectionNode,
  designMethod: "LRFD" | "ASD"
): Array<{ name: string; force: Vector3 }> {
  const { D, L, W, E } = connection.forces;
  // Negative direction cases: use explicit Wneg/Eneg if provided, otherwise negate W/E
  const Wneg = connection.forces.Wneg || negate(W);
  const Eneg = connection.forces.Eneg || negate(E);

  const Lr = connection.forces.Lr || { x: 0, y: 0, z: 0 };
  const S = connection.forces.S || { x: 0, y: 0, z: 0 };
  const R = connection.forces.R || { x: 0, y: 0, z: 0 };

  const results: Array<{ name: string; force: Vector3 }> = [];

  if (designMethod === "LRFD") {
    // 1. 1.4D (no W or E)
    results.push({ name: "1. 1.4D", force: scale(D, 1.4) });

    // 2. 1.2D + 1.6L + 0.5(Lr or S or R) — pick worst of Lr, S, R
    for (const [envLabel, envForce] of [["Lr", Lr], ["S", S], ["R", R]] as const) {
      results.push({
        name: `2. 1.2D + 1.6L + 0.5${envLabel}`,
        force: add(scale(D, 1.2), scale(L, 1.6), scale(envForce as Vector3, 0.5)),
      });
    }

    // 3. 1.2D + 1.6(Lr or S or R) + (L or 0.5W)
    for (const [envLabel, envForce] of [["Lr", Lr], ["S", S], ["R", R]] as const) {
      // With L
      results.push({
        name: `3a. 1.2D + 1.6${envLabel} + 1.0L`,
        force: add(scale(D, 1.2), scale(envForce as Vector3, 1.6), scale(L, 1.0)),
      });
      // With 0.5W (positive)
      results.push({
        name: `3b. 1.2D + 1.6${envLabel} + 0.5W(+)`,
        force: add(scale(D, 1.2), scale(envForce as Vector3, 1.6), scale(W, 0.5)),
      });
      // With 0.5W (negative)
      results.push({
        name: `3c. 1.2D + 1.6${envLabel} + 0.5W(-)`,
        force: add(scale(D, 1.2), scale(envForce as Vector3, 1.6), scale(Wneg, 0.5)),
      });
    }

    // 4. 1.2D + 1.0W + L + 0.5(Lr or S or R)
    for (const [envLabel, envForce] of [["Lr", Lr], ["S", S], ["R", R]] as const) {
      // W positive
      results.push({
        name: `4a. 1.2D + 1.0W(+) + L + 0.5${envLabel}`,
        force: add(scale(D, 1.2), scale(W, 1.0), scale(L, 1.0), scale(envForce as Vector3, 0.5)),
      });
      // W negative
      results.push({
        name: `4b. 1.2D + 1.0W(-) + L + 0.5${envLabel}`,
        force: add(scale(D, 1.2), scale(Wneg, 1.0), scale(L, 1.0), scale(envForce as Vector3, 0.5)),
      });
    }

    // 5. 1.2D + 1.0E + L + 0.2S
    // E positive
    results.push({
      name: "5a. 1.2D + 1.0E(+) + L + 0.2S",
      force: add(scale(D, 1.2), scale(E, 1.0), scale(L, 1.0), scale(S, 0.2)),
    });
    // E negative
    results.push({
      name: "5b. 1.2D + 1.0E(-) + L + 0.2S",
      force: add(scale(D, 1.2), scale(Eneg, 1.0), scale(L, 1.0), scale(S, 0.2)),
    });

    // 6. 0.9D + 1.0W
    results.push({
      name: "6a. 0.9D + 1.0W(+)",
      force: add(scale(D, 0.9), scale(W, 1.0)),
    });
    results.push({
      name: "6b. 0.9D + 1.0W(-)",
      force: add(scale(D, 0.9), scale(Wneg, 1.0)),
    });

    // 7. 0.9D + 1.0E
    results.push({
      name: "7a. 0.9D + 1.0E(+)",
      force: add(scale(D, 0.9), scale(E, 1.0)),
    });
    results.push({
      name: "7b. 0.9D + 1.0E(-)",
      force: add(scale(D, 0.9), scale(Eneg, 1.0)),
    });
  } else {
    // ASD Combinations per ASCE 7 Section 2.4
    // 1. D
    results.push({ name: "1. D", force: scale(D, 1.0) });

    // 2. D + L
    results.push({ name: "2. D + L", force: add(scale(D, 1.0), scale(L, 1.0)) });

    // 3. D + 0.75L + 0.75(0.6W)
    results.push({
      name: "3a. D + 0.75L + 0.45W(+)",
      force: add(scale(D, 1.0), scale(L, 0.75), scale(W, 0.45)),
    });
    results.push({
      name: "3b. D + 0.75L + 0.45W(-)",
      force: add(scale(D, 1.0), scale(L, 0.75), scale(Wneg, 0.45)),
    });

    // 4. D + 0.6W
    results.push({
      name: "4a. D + 0.6W(+)",
      force: add(scale(D, 1.0), scale(W, 0.6)),
    });
    results.push({
      name: "4b. D + 0.6W(-)",
      force: add(scale(D, 1.0), scale(Wneg, 0.6)),
    });

    // 5. 0.6D + 0.6W
    results.push({
      name: "5a. 0.6D + 0.6W(+)",
      force: add(scale(D, 0.6), scale(W, 0.6)),
    });
    results.push({
      name: "5b. 0.6D + 0.6W(-)",
      force: add(scale(D, 0.6), scale(Wneg, 0.6)),
    });

    // 6. D + 0.7E
    results.push({
      name: "6a. D + 0.7E(+)",
      force: add(scale(D, 1.0), scale(E, 0.7)),
    });
    results.push({
      name: "6b. D + 0.7E(-)",
      force: add(scale(D, 1.0), scale(Eneg, 0.7)),
    });

    // 7. D + 0.75L + 0.75(0.7E)
    results.push({
      name: "7a. D + 0.75L + 0.525E(+)",
      force: add(scale(D, 1.0), scale(L, 0.75), scale(E, 0.525)),
    });
    results.push({
      name: "7b. D + 0.75L + 0.525E(-)",
      force: add(scale(D, 1.0), scale(L, 0.75), scale(Eneg, 0.525)),
    });

    // 8. 0.6D + 0.7E
    results.push({
      name: "8a. 0.6D + 0.7E(+)",
      force: add(scale(D, 0.6), scale(E, 0.7)),
    });
    results.push({
      name: "8b. 0.6D + 0.7E(-)",
      force: add(scale(D, 0.6), scale(Eneg, 0.7)),
    });
  }

  return results;
}

export const calculateLoadCombinations = (
  connection: ConnectionNode,
  capacity?: ConnectionCapacity,
  designMethod: "LRFD" | "ASD" = "LRFD",
  designStandard: "ASCE7-16" | "ASCE7-22" = "ASCE7-16"
): FactoredLoad[] => {
  const combinations = buildAllCombinations(connection, designMethod);

  return combinations.map((combo) => {
    const result: FactoredLoad = {
      comboName: combo.name,
      fx: Math.round(combo.force.x),
      fy: Math.round(combo.force.y),
      fz: Math.round(combo.force.z),
    };

    if (capacity) {
      const safeDiv = (force: number, cap: number): number => {
        if (cap === 0) return force === 0 ? 0 : Infinity;
        return Math.abs(force / cap);
      };

      // Use directional capacities: pick the capacity matching the sign of the force
      const capXPos = capacity.capacityXPositive ?? capacity.capacityX;
      const capXNeg = capacity.capacityXNegative ?? capacity.capacityX;
      const capYPos = capacity.capacityYPositive ?? capacity.capacityY;
      const capYNeg = capacity.capacityYNegative ?? capacity.capacityY;
      const capZPos = capacity.capacityZPositive ?? capacity.capacityZ;
      const capZNeg = capacity.capacityZNegative ?? capacity.capacityZ;

      result.utilizationX = safeDiv(result.fx, result.fx >= 0 ? capXPos : capXNeg);
      result.utilizationY = safeDiv(result.fy, result.fy >= 0 ? capYPos : capYNeg);
      result.utilizationZ = safeDiv(result.fz, result.fz >= 0 ? capZPos : capZNeg);
      result.maxUtilization = Math.max(
        result.utilizationX,
        result.utilizationY,
        result.utilizationZ
      );
    }

    return result;
  });
};

/**
 * Calculate the directional demand summary for a connection.
 * For each axis, finds the maximum positive and maximum negative factored demand
 * across all load combinations and computes DCR against directional capacities.
 */
export const calculateDirectionalResult = (
  connection: ConnectionNode,
  capacity: ConnectionCapacity,
  designMethod: "LRFD" | "ASD" = "LRFD",
  designStandard: "ASCE7-16" | "ASCE7-22" = "ASCE7-16"
): ConnectionDirectionalResult => {
  const combinations = buildAllCombinations(connection, designMethod);

  const axes = ["x", "y", "z"] as const;

  // Track max positive and max negative demand per axis
  const best: Record<string, { positive: { demand: number; combo: string }; negative: { demand: number; combo: string } }> = {};
  for (const axis of axes) {
    best[axis] = {
      positive: { demand: 0, combo: "—" },
      negative: { demand: 0, combo: "—" },
    };
  }

  for (const combo of combinations) {
    const rounded = {
      x: Math.round(combo.force.x),
      y: Math.round(combo.force.y),
      z: Math.round(combo.force.z),
    };
    for (const axis of axes) {
      const val = rounded[axis];
      if (val > best[axis].positive.demand) {
        best[axis].positive = { demand: val, combo: combo.name };
      }
      if (val < best[axis].negative.demand) {
        best[axis].negative = { demand: val, combo: combo.name };
      }
    }
  }

  const safeDiv = (force: number, cap: number): number => {
    if (cap === 0) return force === 0 ? 0 : Infinity;
    return Math.abs(force / cap);
  };

  const makeDemand = (axis: "x" | "y" | "z", direction: "positive" | "negative"): DirectionalDemand => {
    const { demand, combo } = best[axis][direction];
    const cap = getDirectionalCapacity(capacity, axis, direction);
    return { demand, controllingCombo: combo, dcr: safeDiv(demand, cap) };
  };

  return {
    xPositive: makeDemand("x", "positive"),
    xNegative: makeDemand("x", "negative"),
    yPositive: makeDemand("y", "positive"),
    yNegative: makeDemand("y", "negative"),
    zPositive: makeDemand("z", "positive"),
    zNegative: makeDemand("z", "negative"),
  };
};
