
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
 * A "load term" in a combination: a load type key and its factor.
 * We track the key so we can substitute +/- variants.
 */
interface LoadTerm {
  key: "D" | "L" | "W" | "E" | "Lr" | "S" | "R";
  factor: number;
}

/** A base combination template before directional expansion. */
interface BaseCombo {
  label: string;
  terms: LoadTerm[];
}

/**
 * Given a base combination and the +/- force vectors for each load type,
 * generate all directional variants. D, L, W, E each have a positive and
 * negative case; Lr, S, R do not (they are environmental loads with a single
 * direction). For each reversible load present in the combo, we branch into
 * 2 variants, producing 2^n total variants where n = number of reversible
 * loads in the combo.
 */
function expandDirectionalVariants(
  base: BaseCombo,
  forces: Record<string, Vector3>
): Array<{ name: string; force: Vector3 }> {
  // Reversible load keys: those that have a "neg" counterpart in forces
  const reversibleKeys = new Set(["D", "L", "W", "E"]);

  // Find which reversible keys appear in this combo's terms
  const reversibleTermIndices: number[] = [];
  for (let i = 0; i < base.terms.length; i++) {
    if (reversibleKeys.has(base.terms[i].key)) {
      reversibleTermIndices.push(i);
    }
  }

  const n = reversibleTermIndices.length;
  const results: Array<{ name: string; force: Vector3 }> = [];

  // Iterate over all 2^n combinations of +/- for the reversible terms
  for (let mask = 0; mask < (1 << n); mask++) {
    const parts: string[] = [];
    const vectors: Vector3[] = [];
    let allPositive = true;

    for (let i = 0; i < base.terms.length; i++) {
      const term = base.terms[i];
      const revIdx = reversibleTermIndices.indexOf(i);
      const isNeg = revIdx >= 0 && (mask & (1 << revIdx)) !== 0;
      if (isNeg) allPositive = false;

      const forceKey = isNeg ? `${term.key}neg` : term.key;
      const vec = forces[forceKey] || { x: 0, y: 0, z: 0 };
      vectors.push(scale(vec, term.factor));
    }

    // Build a descriptive suffix showing which loads are in negative direction
    const dirParts: string[] = [];
    for (let j = 0; j < n; j++) {
      const termIdx = reversibleTermIndices[j];
      const term = base.terms[termIdx];
      const isNeg = (mask & (1 << j)) !== 0;
      if (isNeg) dirParts.push(`${term.key}-`);
    }

    const suffix = dirParts.length === 0 ? "" : ` [${dirParts.join(",")}]`;
    results.push({
      name: `${base.label}${suffix}`,
      force: add(...vectors),
    });
  }

  return results;
}

/**
 * Build all load combinations, evaluating D, L, W, and E in both positive
 * and negative directions for all combinations.
 * Returns an array of { name, force } for every combination variant.
 */
function buildAllCombinations(
  connection: ConnectionNode,
  designMethod: "LRFD" | "ASD"
): Array<{ name: string; force: Vector3 }> {
  const f = connection.forces;

  // Build the complete forces map with positive and negative variants
  const forces: Record<string, Vector3> = {
    D: f.D,
    Dneg: f.Dneg || negate(f.D),
    L: f.L,
    Lneg: f.Lneg || negate(f.L),
    W: f.W,
    Wneg: f.Wneg || negate(f.W),
    E: f.E,
    Eneg: f.Eneg || negate(f.E),
    Lr: f.Lr || { x: 0, y: 0, z: 0 },
    S: f.S || { x: 0, y: 0, z: 0 },
    R: f.R || { x: 0, y: 0, z: 0 },
  };

  const baseCombos: BaseCombo[] = [];

  if (designMethod === "LRFD") {
    // 1. 1.4D
    baseCombos.push({ label: "1. 1.4D", terms: [{ key: "D", factor: 1.4 }] });

    // 2. 1.2D + 1.6L + 0.5(Lr or S or R)
    for (const env of ["Lr", "S", "R"] as const) {
      baseCombos.push({
        label: `2. 1.2D+1.6L+0.5${env}`,
        terms: [{ key: "D", factor: 1.2 }, { key: "L", factor: 1.6 }, { key: env, factor: 0.5 }],
      });
    }

    // 3. 1.2D + 1.6(Lr or S or R) + (L or 0.5W)
    for (const env of ["Lr", "S", "R"] as const) {
      // With L
      baseCombos.push({
        label: `3. 1.2D+1.6${env}+L`,
        terms: [{ key: "D", factor: 1.2 }, { key: env, factor: 1.6 }, { key: "L", factor: 1.0 }],
      });
      // With 0.5W
      baseCombos.push({
        label: `3. 1.2D+1.6${env}+0.5W`,
        terms: [{ key: "D", factor: 1.2 }, { key: env, factor: 1.6 }, { key: "W", factor: 0.5 }],
      });
    }

    // 4. 1.2D + 1.0W + L + 0.5(Lr or S or R)
    for (const env of ["Lr", "S", "R"] as const) {
      baseCombos.push({
        label: `4. 1.2D+W+L+0.5${env}`,
        terms: [{ key: "D", factor: 1.2 }, { key: "W", factor: 1.0 }, { key: "L", factor: 1.0 }, { key: env, factor: 0.5 }],
      });
    }

    // 5. 1.2D + 1.0E + L + 0.2S
    baseCombos.push({
      label: "5. 1.2D+E+L+0.2S",
      terms: [{ key: "D", factor: 1.2 }, { key: "E", factor: 1.0 }, { key: "L", factor: 1.0 }, { key: "S", factor: 0.2 }],
    });

    // 6. 0.9D + 1.0W
    baseCombos.push({
      label: "6. 0.9D+W",
      terms: [{ key: "D", factor: 0.9 }, { key: "W", factor: 1.0 }],
    });

    // 7. 0.9D + 1.0E
    baseCombos.push({
      label: "7. 0.9D+E",
      terms: [{ key: "D", factor: 0.9 }, { key: "E", factor: 1.0 }],
    });
  } else {
    // ASD Combinations per ASCE 7 Section 2.4
    // 1. D
    baseCombos.push({ label: "1. D", terms: [{ key: "D", factor: 1.0 }] });

    // 2. D + L
    baseCombos.push({ label: "2. D+L", terms: [{ key: "D", factor: 1.0 }, { key: "L", factor: 1.0 }] });

    // 3. D + 0.75L + 0.75(0.6W)
    baseCombos.push({
      label: "3. D+0.75L+0.45W",
      terms: [{ key: "D", factor: 1.0 }, { key: "L", factor: 0.75 }, { key: "W", factor: 0.45 }],
    });

    // 4. D + 0.6W
    baseCombos.push({
      label: "4. D+0.6W",
      terms: [{ key: "D", factor: 1.0 }, { key: "W", factor: 0.6 }],
    });

    // 5. 0.6D + 0.6W
    baseCombos.push({
      label: "5. 0.6D+0.6W",
      terms: [{ key: "D", factor: 0.6 }, { key: "W", factor: 0.6 }],
    });

    // 6. D + 0.7E
    baseCombos.push({
      label: "6. D+0.7E",
      terms: [{ key: "D", factor: 1.0 }, { key: "E", factor: 0.7 }],
    });

    // 7. D + 0.75L + 0.75(0.7E)
    baseCombos.push({
      label: "7. D+0.75L+0.525E",
      terms: [{ key: "D", factor: 1.0 }, { key: "L", factor: 0.75 }, { key: "E", factor: 0.525 }],
    });

    // 8. 0.6D + 0.7E
    baseCombos.push({
      label: "8. 0.6D+0.7E",
      terms: [{ key: "D", factor: 0.6 }, { key: "E", factor: 0.7 }],
    });
  }

  // Expand all base combos into directional variants
  const results: Array<{ name: string; force: Vector3 }> = [];
  for (const base of baseCombos) {
    results.push(...expandDirectionalVariants(base, forces));
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
