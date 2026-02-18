
import { Vertex, Opening, Point3D, Face3D, Solid3DData } from "./types";
import earcut from "earcut";

interface Point2D {
  x: number;
  y: number;
}

interface ParsedPolyline {
  points: Point2D[];
  closed: boolean;
}

interface Parsed3DFace {
  vertices: Point3D[];
}

interface DxfParseResult {
  perimeter: Vertex[];
  openings: Opening[];
  nodes: Point2D[];
  sketchLines: { x1: number; y1: number; x2: number; y2: number }[];
  width: number;
  height: number;
  solid3d?: Solid3DData;
}

function polygonArea(pts: Point2D[]): number {
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    area += pts[i].x * pts[j].y;
    area -= pts[j].x * pts[i].y;
  }
  return Math.abs(area / 2);
}

function pointInPolygon(pt: Point2D, polygon: Point2D[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    const intersect = ((yi > pt.y) !== (yj > pt.y)) &&
      (pt.x < (xj - xi) * (pt.y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function arcToPoints(cx: number, cy: number, r: number, startAngleDeg: number, endAngleDeg: number, segments: number = 24): Point2D[] {
  const pts: Point2D[] = [];
  let start = startAngleDeg * Math.PI / 180;
  let end = endAngleDeg * Math.PI / 180;
  if (end <= start) end += 2 * Math.PI;
  const step = (end - start) / segments;
  for (let i = 0; i <= segments; i++) {
    const angle = start + step * i;
    pts.push({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) });
  }
  return pts;
}

function ellipseToPoints(
  cx: number, cy: number,
  majorX: number, majorY: number,
  ratio: number,
  startParam: number, endParam: number,
  segments: number = 36
): Point2D[] {
  const pts: Point2D[] = [];
  const a = Math.sqrt(majorX * majorX + majorY * majorY);
  const b = a * ratio;
  const rotation = Math.atan2(majorY, majorX);
  let end = endParam;
  if (end <= startParam) end += 2 * Math.PI;
  const step = (end - startParam) / segments;
  for (let i = 0; i <= segments; i++) {
    const t = startParam + step * i;
    const lx = a * Math.cos(t);
    const ly = b * Math.sin(t);
    pts.push({
      x: cx + lx * Math.cos(rotation) - ly * Math.sin(rotation),
      y: cy + lx * Math.sin(rotation) + ly * Math.cos(rotation),
    });
  }
  return pts;
}

function evaluateBSpline(controlPoints: Point2D[], degree: number, segments: number = 48): Point2D[] {
  const n = controlPoints.length;
  if (n <= 1) return [...controlPoints];
  if (n <= degree) {
    const pts: Point2D[] = [];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const pt = deCasteljau(controlPoints, t);
      pts.push(pt);
    }
    return pts;
  }

  const m = n + degree + 1;
  const knots: number[] = [];
  for (let i = 0; i < m; i++) {
    if (i <= degree) knots.push(0);
    else if (i >= m - degree - 1) knots.push(1);
    else knots.push((i - degree) / (n - degree));
  }

  const pts: Point2D[] = [];
  for (let s = 0; s <= segments; s++) {
    let t = s / segments;
    if (t >= 1) t = 1 - 1e-10;
    const pt = bsplinePoint(t, degree, controlPoints, knots);
    pts.push(pt);
  }
  return pts;
}

function bsplinePoint(t: number, degree: number, controlPoints: Point2D[], knots: number[]): Point2D {
  const n = controlPoints.length;
  const weights = new Array(n).fill(0);

  for (let i = 0; i < n; i++) {
    weights[i] = basisFunction(i, degree, t, knots);
  }

  let x = 0, y = 0;
  for (let i = 0; i < n; i++) {
    x += weights[i] * controlPoints[i].x;
    y += weights[i] * controlPoints[i].y;
  }
  return { x, y };
}

function basisFunction(i: number, p: number, t: number, knots: number[]): number {
  if (p === 0) {
    return (t >= knots[i] && t < knots[i + 1]) ? 1 : 0;
  }

  let left = 0, right = 0;
  const denom1 = knots[i + p] - knots[i];
  if (denom1 !== 0) {
    left = ((t - knots[i]) / denom1) * basisFunction(i, p - 1, t, knots);
  }
  const denom2 = knots[i + p + 1] - knots[i + 1];
  if (denom2 !== 0) {
    right = ((knots[i + p + 1] - t) / denom2) * basisFunction(i + 1, p - 1, t, knots);
  }
  return left + right;
}

function deCasteljau(points: Point2D[], t: number): Point2D {
  if (points.length === 1) return points[0];
  const next: Point2D[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    next.push({
      x: (1 - t) * points[i].x + t * points[i + 1].x,
      y: (1 - t) * points[i].y + t * points[i + 1].y,
    });
  }
  return deCasteljau(next, t);
}

function decodeAcisLine(encoded: string): string {
  return Array.from(encoded).map(c => {
    if (c === ' ') return ' ';
    const code = c.charCodeAt(0);
    if (code >= 33 && code <= 126) {
      return String.fromCharCode(159 - code);
    }
    return c;
  }).join('');
}

function isEncodedAcis(text: string): boolean {
  const firstLine = text.split('\n')[0] || text.substring(0, 200);
  const decoded = decodeAcisLine(firstLine);
  const lower = decoded.toLowerCase();
  return /^\d+\s+\d+\s+\d+\s+\d+/.test(decoded) ||
         lower.includes('body') || lower.includes('lump') ||
         lower.includes('shell') || lower.includes('face') ||
         lower.includes('edge') || lower.includes('vertex') ||
         lower.includes('point') || lower.includes('straight') ||
         lower.includes('plane') || lower.includes('transform') ||
         lower.includes('spline') || lower.includes('cone') ||
         lower.includes('sphere') || lower.includes('torus');
}

function parseAcisSat(satText: string, extrusionHeight: number = 0): Parsed3DFace[] {
  const faces: Parsed3DFace[] = [];

  const isBinary = /^[\da-fA-F\s]+$/.test(satText.substring(0, 100));
  if (isBinary) {
    console.log("[DXF] 3DSOLID contains binary SAB data, attempting coordinate extraction");
  }

  let textToParse = satText;
  if (!isBinary && isEncodedAcis(satText)) {
    console.log("[DXF] Detected encoded ACIS data, decoding with cipher (159 - charCode)");
    const satLines = satText.split('\n');
    textToParse = satLines.map(line => decodeAcisLine(line)).join('\n');
    console.log("[DXF] Decoded first 500 chars:", textToParse.substring(0, 500));
  }

  const records: string[] = [];
  let current = "";
  for (const ch of textToParse) {
    if (ch === "#") {
      if (current.trim()) records.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) records.push(current.trim());

  console.log(`[DXF] SAT records found: ${records.length}`);
  if (records.length > 0) {
    console.log("[DXF] First SAT record:", records[0].substring(0, 200));
  }

  let entityRecords: string[] = [];
  for (let ri = 0; ri < records.length; ri++) {
    const rec = records[ri];
    const asmIdx = rec.indexOf("asmheader");
    if (asmIdx >= 0) {
      entityRecords.push(rec.substring(asmIdx).trim());
      entityRecords.push(...records.slice(ri + 1));
      break;
    }
    const bodyIdx = rec.indexOf("\nbody ");
    if (bodyIdx >= 0 || rec.trim().startsWith("body ")) {
      entityRecords = records.slice(ri);
      break;
    }
  }
  if (entityRecords.length === 0) entityRecords = records;

  interface SatEntity {
    index: number;
    type: string;
    tokens: string[];
    raw: string;
  }

  const entities: SatEntity[] = [];
  for (let ri = 0; ri < entityRecords.length; ri++) {
    const raw = entityRecords[ri].replace(/\n/g, " ").trim();
    if (!raw) continue;
    const tokens = raw.split(/\s+/).filter(t => t.length > 0);
    let entityType = "";
    for (const t of tokens) {
      const tl = t.toLowerCase();
      if (tl === "body" || tl === "lump" || tl === "shell" || tl === "face" ||
          tl === "loop" || tl === "coedge" || tl === "edge" || tl === "vertex" ||
          tl === "point" || tl === "asmheader" || tl === "transform" ||
          tl.endsWith("-surface") || tl.endsWith("-curve") ||
          tl === "straight" || tl === "ellipse") {
        entityType = tl;
        break;
      }
    }
    entities.push({ index: ri, type: entityType, tokens, raw });
  }

  console.log(`[DXF] Parsed ${entities.length} ACIS entities`);

  const resolveRef = (token: string): number => {
    if (token.startsWith("$")) {
      const idx = parseInt(token.substring(1));
      return isNaN(idx) || idx < 0 ? -1 : idx;
    }
    return -1;
  };

  const getEntity = (idx: number): SatEntity | null => {
    if (idx < 0 || idx >= entities.length) return null;
    return entities[idx];
  };

  const parseNums = (tokens: string[]): number[] => {
    const nums: number[] = [];
    for (const t of tokens) {
      if (t.startsWith("$") || t.startsWith("@")) continue;
      const n = parseFloat(t);
      if (!isNaN(n) && isFinite(n)) nums.push(n);
    }
    return nums;
  };

  const skipEntityHeader = (tokens: string[], typeIdx: number): string[] => {
    let pos = typeIdx + 1;
    let headerTokens = 0;
    while (pos < tokens.length && headerTokens < 3) {
      pos++;
      headerTokens++;
    }
    return tokens.slice(pos);
  };

  const getEntityData = (ent: SatEntity): string[] => {
    const typeIdx = ent.tokens.findIndex(t => t.toLowerCase() === ent.type ||
      (ent.type.includes("-") && t.toLowerCase() === ent.type));
    if (typeIdx < 0) return ent.tokens.slice(4);
    return skipEntityHeader(ent.tokens, typeIdx);
  };

  const typeCounts: Record<string, number> = {};
  for (const ent of entities) {
    typeCounts[ent.type || "unknown"] = (typeCounts[ent.type || "unknown"] || 0) + 1;
  }
  console.log("[DXF] ACIS entity type counts:", JSON.stringify(typeCounts));

  for (let ei = 0; ei < Math.min(entities.length, 5); ei++) {
    console.log(`[DXF] Entity[${ei}]: type=${entities[ei].type}, raw="${entities[ei].raw.substring(0, 120)}"`);
  }

  const vertexPositions = new Map<number, Point3D>();

  for (let ei = 0; ei < entities.length; ei++) {
    const ent = entities[ei];
    if (ent.type === "point") {
      const data = getEntityData(ent);
      const nums: number[] = [];
      for (const t of data) {
        if (t.startsWith("$") || t.startsWith("@")) continue;
        const n = parseFloat(t);
        if (!isNaN(n) && isFinite(n)) nums.push(n);
        if (nums.length === 3) break;
      }
      if (nums.length === 3) {
        vertexPositions.set(ei, { x: nums[0], y: nums[1], z: nums[2] });
      }
    }
  }

  for (let ei = 0; ei < entities.length; ei++) {
    const ent = entities[ei];
    if (ent.type === "vertex") {
      const data = getEntityData(ent);
      const allRefs = data.filter(t => t.startsWith("$")).map(t => resolveRef(t));
      for (const ref of allRefs) {
        if (vertexPositions.has(ref)) {
          vertexPositions.set(ei, vertexPositions.get(ref)!);
          break;
        }
      }
    }
  }

  console.log(`[DXF] Found ${vertexPositions.size} vertex/point positions`);
  vertexPositions.forEach((pos, idx) => {
    console.log(`[DXF]   vertex[${idx}]: (${pos.x}, ${pos.y}, ${pos.z})`);
  });

  const edgeVertices = new Map<number, [number, number]>();
  for (let ei = 0; ei < entities.length; ei++) {
    const ent = entities[ei];
    if (ent.type === "edge") {
      const data = getEntityData(ent);
      const refs = data.filter(t => t.startsWith("$")).map(t => resolveRef(t));
      const vertexRefs: number[] = [];
      for (const ref of refs) {
        if (ref >= 0 && ref < entities.length) {
          const refEnt = entities[ref];
          if (refEnt.type === "vertex" || vertexPositions.has(ref)) {
            vertexRefs.push(ref);
          }
        }
      }
      if (vertexRefs.length >= 2) {
        edgeVertices.set(ei, [vertexRefs[0], vertexRefs[1]]);
      }
      if (ei < 70) {
        console.log(`[DXF] Edge[${ei}]: refs=[${refs.join(",")}], vertexRefs=[${vertexRefs.join(",")}], data="${data.join(" ").substring(0, 80)}"`);
      }
    }
  }

  console.log(`[DXF] Found ${edgeVertices.size} edges with vertex refs`);

  const coedgeEdges = new Map<number, { edgeIdx: number; sense: string }>();
  for (let ei = 0; ei < entities.length; ei++) {
    const ent = entities[ei];
    if (ent.type === "coedge") {
      const data = getEntityData(ent);
      const refs = data.filter(t => t.startsWith("$")).map(t => resolveRef(t));
      for (const ref of refs) {
        if (ref >= 0 && ref < entities.length && entities[ref].type === "edge") {
          const sense = data.includes("forward") ? "forward" : "reversed";
          coedgeEdges.set(ei, { edgeIdx: ref, sense });
          break;
        }
      }
    }
  }

  console.log(`[DXF] Found ${coedgeEdges.size} coedge→edge mappings`);

  for (let ei = 0; ei < entities.length; ei++) {
    const ent = entities[ei];
    if (ent.type !== "face") continue;

    const data = getEntityData(ent);
    const faceRefs = data.filter(t => t.startsWith("$")).map(t => resolveRef(t));
    let loopIdx = -1;
    for (const ref of faceRefs) {
      if (ref >= 0 && ref < entities.length && entities[ref].type === "loop") {
        loopIdx = ref;
        break;
      }
    }
    if (loopIdx < 0) continue;

    const allLoops: number[] = [loopIdx];
    const visited = new Set<number>();
    let currentLoop = loopIdx;
    while (currentLoop >= 0 && !visited.has(currentLoop)) {
      visited.add(currentLoop);
      const loopEnt = getEntity(currentLoop);
      if (!loopEnt || loopEnt.type !== "loop") break;
      const loopData = getEntityData(loopEnt);
      const loopRefs = loopData.filter(t => t.startsWith("$")).map(t => resolveRef(t));
      let nextLoop = -1;
      for (const ref of loopRefs) {
        if (ref >= 0 && ref < entities.length && entities[ref].type === "loop" && !visited.has(ref)) {
          nextLoop = ref;
          break;
        }
      }
      if (nextLoop >= 0) allLoops.push(nextLoop);
      currentLoop = nextLoop;
    }

    const faceLoops: Point3D[][] = [];
    for (const li of allLoops) {
      const loopEnt = getEntity(li);
      if (!loopEnt) continue;

      const loopData = getEntityData(loopEnt);
      const loopRefs = loopData.filter(t => t.startsWith("$")).map(t => resolveRef(t));
      let firstCoedge = -1;
      for (const ref of loopRefs) {
        if (ref >= 0 && ref < entities.length && entities[ref].type === "coedge") {
          firstCoedge = ref;
          break;
        }
      }
      if (firstCoedge < 0) continue;

      const loopVertices: Point3D[] = [];
      const coedgeVisited = new Set<number>();
      let currentCoedge = firstCoedge;

      while (currentCoedge >= 0 && !coedgeVisited.has(currentCoedge)) {
        coedgeVisited.add(currentCoedge);
        const coedgeEnt = getEntity(currentCoedge);
        if (!coedgeEnt || coedgeEnt.type !== "coedge") break;

        const cedge = coedgeEdges.get(currentCoedge);
        if (cedge) {
          const ev = edgeVertices.get(cedge.edgeIdx);
          if (ev) {
            const [v0] = cedge.sense === "forward" ? ev : [ev[1], ev[0]];
            const pos = vertexPositions.get(v0);
            if (pos && (loopVertices.length === 0 ||
              Math.abs(pos.x - loopVertices[loopVertices.length - 1].x) > 1e-6 ||
              Math.abs(pos.y - loopVertices[loopVertices.length - 1].y) > 1e-6 ||
              Math.abs(pos.z - loopVertices[loopVertices.length - 1].z) > 1e-6)) {
              loopVertices.push(pos);
            }
          }
        }

        const coData = getEntityData(coedgeEnt);
        const coRefs = coData.filter(t => t.startsWith("$")).map(t => resolveRef(t));
        let nextCoedge = -1;
        for (const ref of coRefs) {
          if (ref >= 0 && ref < entities.length && entities[ref].type === "coedge" &&
              !coedgeVisited.has(ref) && ref !== currentCoedge) {
            nextCoedge = ref;
            break;
          }
        }
        currentCoedge = nextCoedge;
      }

      if (loopVertices.length >= 3) {
        console.log(`[DXF] Face loop with ${loopVertices.length} vertices: ${loopVertices.map(v => `(${v.x.toFixed(1)},${v.y.toFixed(1)},${v.z.toFixed(1)})`).join(", ")}`);
        faceLoops.push(loopVertices);
      }
    }

    const allZ = faceLoops.flat().map(v => v.z);
    const isFlat = allZ.length > 0 && Math.max(...allZ) - Math.min(...allZ) < 0.01;
    const height = extrusionHeight > 0 ? extrusionHeight : 6;

    if (isFlat && faceLoops.length > 0) {
      console.log(`[DXF] Profile is flat (2D), extruding with height=${height}`);
      const outerLoop = faceLoops.reduce((a, b) => {
        const areaA = Math.abs(a.reduce((sum, p, i) => {
          const np = a[(i + 1) % a.length];
          return sum + (p.x * np.y - np.x * p.y);
        }, 0)) / 2;
        const areaB = Math.abs(b.reduce((sum, p, i) => {
          const np = b[(i + 1) % b.length];
          return sum + (p.x * np.y - np.x * p.y);
        }, 0)) / 2;
        return areaA >= areaB ? a : b;
      });
      const openingLoops = faceLoops.filter(l => l !== outerLoop);

      const baseZ = Math.min(...allZ);
      const topZ = baseZ + height;

      const triangulateFaceWithHoles = (outer: Point3D[], holes: Point3D[][], z: number, flipNormal: boolean) => {
        const allVerts2D: { x: number; y: number }[] = [];
        const holeIndices: number[] = [];
        for (const p of outer) allVerts2D.push({ x: p.x, y: p.y });
        for (const hole of holes) {
          holeIndices.push(allVerts2D.length);
          for (const p of hole) allVerts2D.push({ x: p.x, y: p.y });
        }

        const flatCoords: number[] = [];
        for (const v of allVerts2D) {
          flatCoords.push(v.x, v.y);
        }

        const triangles = earcut(flatCoords, holeIndices.length > 0 ? holeIndices : undefined);
        for (let ti = 0; ti < triangles.length; ti += 3) {
          const i0 = triangles[ti], i1 = triangles[ti + 1], i2 = triangles[ti + 2];
          const v0: Point3D = { x: allVerts2D[i0].x, y: allVerts2D[i0].y, z };
          const v1: Point3D = { x: allVerts2D[i1].x, y: allVerts2D[i1].y, z };
          const v2: Point3D = { x: allVerts2D[i2].x, y: allVerts2D[i2].y, z };
          if (flipNormal) {
            faces.push({ vertices: [v0, v2, v1] });
          } else {
            faces.push({ vertices: [v0, v1, v2] });
          }
        }
      };

      triangulateFaceWithHoles(outerLoop, openingLoops, baseZ, true);
      triangulateFaceWithHoles(outerLoop, openingLoops, topZ, false);

      const extrudeLoop = (loop: Point3D[], outward: boolean) => {
        for (let si = 0; si < loop.length; si++) {
          const p0 = loop[si];
          const p1 = loop[(si + 1) % loop.length];
          const b0: Point3D = { x: p0.x, y: p0.y, z: baseZ };
          const b1: Point3D = { x: p1.x, y: p1.y, z: baseZ };
          const t0: Point3D = { x: p0.x, y: p0.y, z: topZ };
          const t1: Point3D = { x: p1.x, y: p1.y, z: topZ };
          if (outward) {
            faces.push({ vertices: [b0, b1, t1] });
            faces.push({ vertices: [b0, t1, t0] });
          } else {
            faces.push({ vertices: [b0, t1, b1] });
            faces.push({ vertices: [b0, t0, t1] });
          }
        }
      };

      extrudeLoop(outerLoop, true);
      for (const hole of openingLoops) {
        extrudeLoop(hole, false);
      }

      console.log(`[DXF] Extruded solid: ${faces.length} triangle faces (outer + ${openingLoops.length} openings)`);
    } else {
      for (const loop of faceLoops) {
        for (let vi = 1; vi < loop.length - 1; vi++) {
          faces.push({ vertices: [loop[0], loop[vi], loop[vi + 1]] });
        }
      }
    }
  }

  if (faces.length === 0) {
    console.log("[DXF] Topology traversal produced no faces");
    const allPts = Array.from(vertexPositions.values());
    const uniqueMap = new Map<string, Point3D>();
    for (const p of allPts) {
      uniqueMap.set(`${p.x.toFixed(4)},${p.y.toFixed(4)},${p.z.toFixed(4)}`, p);
    }
    const uniquePoints = Array.from(uniqueMap.values());
    console.log(`[DXF] Unique vertex positions: ${uniquePoints.length}`);

    if (uniquePoints.length >= 3) {
      const allZ = uniquePoints.map(p => p.z);
      const minZ = Math.min(...allZ);
      const maxZ = Math.max(...allZ);
      const isFlat = (maxZ - minZ) < 0.01;

      if (isFlat) {
        console.log("[DXF] Profile is flat (2D), will build extruded solid");
        const profilePts = uniquePoints.map(p => ({ x: p.x, y: p.y }));
        const minX = Math.min(...profilePts.map(p => p.x));
        const maxX = Math.max(...profilePts.map(p => p.x));
        const minY = Math.min(...profilePts.map(p => p.y));
        const maxY = Math.max(...profilePts.map(p => p.y));

        const outerPts = profilePts.filter(p =>
          Math.abs(p.x - minX) < 0.5 || Math.abs(p.x - maxX) < 0.5 ||
          Math.abs(p.y - minY) < 0.5 || Math.abs(p.y - maxY) < 0.5
        );

        const innerPts = profilePts.filter(p =>
          Math.abs(p.x - minX) > 0.5 && Math.abs(p.x - maxX) > 0.5 &&
          Math.abs(p.y - minY) > 0.5 && Math.abs(p.y - maxY) > 0.5
        );

        const thickness = 6;
        const z0 = minZ;
        const z1 = z0 + thickness;

        const addQuad = (p0: Point3D, p1: Point3D, p2: Point3D, p3: Point3D) => {
          faces.push({ vertices: [p0, p1, p2] });
          faces.push({ vertices: [p0, p2, p3] });
        };

        const sortedOuter = sortPointsCCW(outerPts);
        if (sortedOuter.length >= 3) {
          const topPoly = sortedOuter.map(p => ({ x: p.x, y: p.y, z: z1 }));
          const botPoly = sortedOuter.map(p => ({ x: p.x, y: p.y, z: z0 }));

          for (let vi = 1; vi < topPoly.length - 1; vi++) {
            faces.push({ vertices: [topPoly[0], topPoly[vi], topPoly[vi + 1]] });
          }
          for (let vi = 1; vi < botPoly.length - 1; vi++) {
            faces.push({ vertices: [botPoly[0], botPoly[vi + 1], botPoly[vi]] });
          }

          for (let vi = 0; vi < sortedOuter.length; vi++) {
            const ni = (vi + 1) % sortedOuter.length;
            addQuad(
              { ...topPoly[vi] },
              { ...topPoly[ni] },
              { ...botPoly[ni] },
              { ...botPoly[vi] }
            );
          }
        }

        const openingGroups = groupOpenings(innerPts);
        for (const opening of openingGroups) {
          const sorted = sortPointsCCW(opening);
          if (sorted.length < 3) continue;

          const topO = sorted.map(p => ({ x: p.x, y: p.y, z: z1 }));
          const botO = sorted.map(p => ({ x: p.x, y: p.y, z: z0 }));

          for (let vi = 0; vi < sorted.length; vi++) {
            const ni = (vi + 1) % sorted.length;
            addQuad(
              { ...topO[ni] },
              { ...topO[vi] },
              { ...botO[vi] },
              { ...botO[ni] }
            );
          }
        }

        console.log(`[DXF] Built extruded solid with ${faces.length} faces`);
      } else {
        const convexFaces = convexHull3D(uniquePoints);
        for (const f of convexFaces) faces.push(f);
      }
    }
  }

  console.log(`[DXF] parseAcisSat produced ${faces.length} triangle faces`);
  return faces;
}

function sortPointsCCW(pts: { x: number; y: number }[]): { x: number; y: number }[] {
  if (pts.length < 3) return [...pts];
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  return [...pts].sort((a, b) => {
    return Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx);
  });
}

function groupOpenings(pts: { x: number; y: number }[]): { x: number; y: number }[][] {
  if (pts.length === 0) return [];
  const groups: { x: number; y: number }[][] = [];
  const used = new Set<number>();

  for (let i = 0; i < pts.length; i++) {
    if (used.has(i)) continue;
    const group = [pts[i]];
    used.add(i);

    for (let j = i + 1; j < pts.length; j++) {
      if (used.has(j)) continue;
      let closeToGroup = false;
      for (const gp of group) {
        const dx = Math.abs(pts[j].x - gp.x);
        const dy = Math.abs(pts[j].y - gp.y);
        if (dx < 200 && dy < 200) {
          closeToGroup = true;
          break;
        }
      }
      if (closeToGroup) {
        group.push(pts[j]);
        used.add(j);
      }
    }

    if (group.length >= 3) {
      groups.push(group);
    }
  }

  return groups;
}

function convexHull3D(points: Point3D[]): Parsed3DFace[] {
  const faces: Parsed3DFace[] = [];
  if (points.length < 4) {
    if (points.length === 3) {
      faces.push({ vertices: [points[0], points[1], points[2]] });
    }
    return faces;
  }

  const sub = (a: Point3D, b: Point3D): Point3D => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
  const cross = (a: Point3D, b: Point3D): Point3D => ({
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  });
  const dot = (a: Point3D, b: Point3D) => a.x * b.x + a.y * b.y + a.z * b.z;
  const len = (a: Point3D) => Math.sqrt(dot(a, a));

  let p0 = 0, p1 = 1, p2 = -1, p3 = -1;

  let maxDist = 0;
  for (let j = 1; j < points.length; j++) {
    const d = len(sub(points[j], points[0]));
    if (d > maxDist) { maxDist = d; p1 = j; }
  }

  maxDist = 0;
  const edge01 = sub(points[p1], points[p0]);
  for (let j = 0; j < points.length; j++) {
    if (j === p0 || j === p1) continue;
    const v = sub(points[j], points[p0]);
    const c = cross(edge01, v);
    const d = len(c);
    if (d > maxDist) { maxDist = d; p2 = j; }
  }
  if (p2 === -1) return faces;

  const normal = cross(sub(points[p1], points[p0]), sub(points[p2], points[p0]));
  maxDist = 0;
  for (let j = 0; j < points.length; j++) {
    if (j === p0 || j === p1 || j === p2) continue;
    const d = Math.abs(dot(normal, sub(points[j], points[p0])));
    if (d > maxDist) { maxDist = d; p3 = j; }
  }
  if (p3 === -1) {
    faces.push({ vertices: [points[p0], points[p1], points[p2]] });
    return faces;
  }

  type HullFace = [number, number, number];
  let hull: HullFace[] = [];

  const orient = dot(normal, sub(points[p3], points[p0]));
  if (orient > 0) {
    hull = [[p0, p2, p1], [p0, p1, p3], [p1, p2, p3], [p0, p3, p2]];
  } else {
    hull = [[p0, p1, p2], [p0, p3, p1], [p1, p3, p2], [p0, p2, p3]];
  }

  const assigned = new Set([p0, p1, p2, p3]);

  for (let j = 0; j < points.length; j++) {
    if (assigned.has(j)) continue;
    let visible: number[] = [];
    for (let fi = 0; fi < hull.length; fi++) {
      const [a, b, c] = hull[fi];
      const fn = cross(sub(points[b], points[a]), sub(points[c], points[a]));
      if (dot(fn, sub(points[j], points[a])) > 1e-10) {
        visible.push(fi);
      }
    }
    if (visible.length === 0) continue;

    const horizon: [number, number][] = [];
    const visSet = new Set(visible);
    for (const fi of visible) {
      const [a, b, c] = hull[fi];
      const edges: [number, number][] = [[a, b], [b, c], [c, a]];
      for (const [ea, eb] of edges) {
        let shared = false;
        for (const fj of visible) {
          if (fj === fi) continue;
          const fVerts = hull[fj];
          if (fVerts.includes(ea) && fVerts.includes(eb)) { shared = true; break; }
        }
        if (!shared) horizon.push([ea, eb]);
      }
    }

    const newHull: HullFace[] = [];
    for (let fi = 0; fi < hull.length; fi++) {
      if (!visSet.has(fi)) newHull.push(hull[fi]);
    }
    for (const [ea, eb] of horizon) {
      newHull.push([ea, eb, j]);
    }
    hull = newHull;
    assigned.add(j);
  }

  for (const [a, b, c] of hull) {
    faces.push({ vertices: [points[a], points[b], points[c]] });
  }

  return faces;
}

function parseSabBinary(hexChunks: string[]): Parsed3DFace[] {
  const faces: Parsed3DFace[] = [];
  const hexStr = hexChunks.join("");

  const bytes = new Uint8Array(hexStr.length / 2);
  for (let bi = 0; bi < hexStr.length; bi += 2) {
    bytes[bi / 2] = parseInt(hexStr.substring(bi, bi + 2), 16);
  }

  console.log(`[DXF] SAB binary: ${bytes.length} bytes`);

  const view = new DataView(bytes.buffer);

  const coordTriplets: Point3D[] = [];
  const seen = new Set<string>();

  for (let di = 0; di + 7 < bytes.length - 16; di += 1) {
    try {
      const x = view.getFloat64(di, true);
      const y = view.getFloat64(di + 8, true);
      const z = view.getFloat64(di + 16, true);

      if (isFinite(x) && isFinite(y) && isFinite(z) &&
          Math.abs(x) < 1e6 && Math.abs(y) < 1e6 && Math.abs(z) < 1e6 &&
          (Math.abs(x) > 1e-10 || Math.abs(y) > 1e-10 || Math.abs(z) > 1e-10)) {

        const xr = Math.round(x * 10000) / 10000;
        const yr = Math.round(y * 10000) / 10000;
        const zr = Math.round(z * 10000) / 10000;

        const key = `${xr},${yr},${zr}`;
        if (!seen.has(key)) {
          seen.add(key);
          coordTriplets.push({ x: xr, y: yr, z: zr });
        }
      }
    } catch {}
  }

  console.log(`[DXF] SAB: found ${coordTriplets.length} candidate coordinate triplets`);

  if (coordTriplets.length > 200) {
    console.log("[DXF] SAB: too many candidates, filtering by clustering");
    const filtered = filterClusteredPoints(coordTriplets);
    coordTriplets.length = 0;
    coordTriplets.push(...filtered);
    console.log(`[DXF] SAB: filtered to ${coordTriplets.length} points`);
  }

  if (coordTriplets.length >= 4) {
    const hullFaces = convexHull3D(coordTriplets);
    for (const f of hullFaces) {
      faces.push(f);
    }
  } else if (coordTriplets.length === 3) {
    faces.push({ vertices: [coordTriplets[0], coordTriplets[1], coordTriplets[2]] });
  }

  return faces;
}

function filterClusteredPoints(points: Point3D[]): Point3D[] {
  if (points.length <= 20) return points;

  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
  }

  const rangeX = maxX - minX;
  const rangeY = maxY - minY;
  const rangeZ = maxZ - minZ;
  const maxRange = Math.max(rangeX, rangeY, rangeZ);
  if (maxRange < 1e-6) return points.slice(0, 4);

  const result: Point3D[] = [];
  const bucketSize = maxRange / 50;
  const buckets = new Set<string>();

  for (const p of points) {
    const bx = Math.floor((p.x - minX) / bucketSize);
    const by = Math.floor((p.y - minY) / bucketSize);
    const bz = Math.floor((p.z - minZ) / bucketSize);
    const key = `${bx},${by},${bz}`;
    if (!buckets.has(key)) {
      buckets.add(key);
      result.push(p);
    }
  }

  return result;
}

function parseDxfEntities(content: string) {
  const lines = content.split(/\r?\n/).map(l => l.trim());
  const polylines: ParsedPolyline[] = [];
  const points: Point2D[] = [];
  const lineSegments: { x1: number; y1: number; x2: number; y2: number }[] = [];
  const circles: { cx: number; cy: number; r: number }[] = [];
  const arcs: { cx: number; cy: number; r: number; startAngle: number; endAngle: number }[] = [];
  const ellipses: { cx: number; cy: number; majorX: number; majorY: number; ratio: number; startParam: number; endParam: number }[] = [];
  const splines: { degree: number; controlPoints: Point2D[]; closed: boolean }[] = [];
  const faces3d: Parsed3DFace[] = [];
  const solid3dHandles: string[] = [];

  let i = 0;
  const next = () => (i < lines.length ? lines[i++] : "");
  const peek = () => (i < lines.length ? lines[i] : "");

  let inEntities = false;
  let inBlocks = false;

  while (i < lines.length) {
    const code = next();
    const value = next();

    if (code === "2" && value === "ENTITIES") {
      inEntities = true;
      continue;
    }

    if (code === "2" && value === "BLOCKS") {
      inBlocks = true;
      continue;
    }

    if (code === "0" && value === "ENDSEC" && (inEntities || inBlocks)) {
      if (inEntities) break;
      inBlocks = false;
      continue;
    }

    if (!inEntities && !inBlocks) continue;

    if (code === "0" && value === "LWPOLYLINE") {
      const pts: Point2D[] = [];
      let closed = false;
      let currentX: number | null = null;

      while (i < lines.length) {
        if (peek() === "0") break;
        const gc = next();
        const gv = next();

        if (gc === "70") {
          const flags = parseInt(gv);
          closed = (flags & 1) !== 0;
        }
        if (gc === "10") {
          currentX = parseFloat(gv);
        }
        if (gc === "20" && currentX !== null) {
          pts.push({ x: currentX, y: parseFloat(gv) });
          currentX = null;
        }
      }

      if (pts.length >= 2) {
        polylines.push({ points: pts, closed });
      }
    }

    if (code === "0" && value === "POLYLINE") {
      let closed = false;
      let polyFlags = 0;
      while (i < lines.length) {
        if (peek() === "0") break;
        const gc = next();
        const gv = next();
        if (gc === "70") {
          polyFlags = parseInt(gv);
          closed = (polyFlags & 1) !== 0;
        }
      }

      const isPolyfaceMesh = (polyFlags & 64) !== 0;

      if (isPolyfaceMesh) {
        const meshVertices: Point3D[] = [];
        const meshFaceRefs: number[][] = [];
        while (i < lines.length) {
          const entityCode = peek();
          if (entityCode !== "0") { next(); next(); continue; }
          const savedI = i;
          next();
          const entityType = next();
          if (entityType === "VERTEX") {
            let vx = 0, vy = 0, vz = 0;
            let vFlags = 0;
            let f1 = 0, f2 = 0, f3 = 0, f4 = 0;
            while (i < lines.length) {
              if (peek() === "0") break;
              const gc = next();
              const gv = next();
              if (gc === "10") vx = parseFloat(gv);
              if (gc === "20") vy = parseFloat(gv);
              if (gc === "30") vz = parseFloat(gv);
              if (gc === "70") vFlags = parseInt(gv);
              if (gc === "71") f1 = parseInt(gv);
              if (gc === "72") f2 = parseInt(gv);
              if (gc === "73") f3 = parseInt(gv);
              if (gc === "74") f4 = parseInt(gv);
            }
            const isFaceRecord = (vFlags & 128) !== 0 && (vFlags & 64) === 0;
            const isVertexRecord = (vFlags & 64) !== 0 && (vFlags & 128) === 0;
            const isBothFlags = (vFlags & 192) === 192;
            if (isFaceRecord) {
              const indices: number[] = [];
              if (f1 !== 0) indices.push(Math.abs(f1));
              if (f2 !== 0) indices.push(Math.abs(f2));
              if (f3 !== 0) indices.push(Math.abs(f3));
              if (f4 !== 0) indices.push(Math.abs(f4));
              if (indices.length >= 3) meshFaceRefs.push(indices);
            } else if (isVertexRecord || isBothFlags) {
              meshVertices.push({ x: vx, y: vy, z: vz });
            }
          } else if (entityType === "SEQEND") {
            while (i < lines.length) {
              if (peek() === "0") break;
              next(); next();
            }
            break;
          } else {
            i = savedI;
            break;
          }
        }
        if (meshVertices.length >= 3 && meshFaceRefs.length > 0) {
          for (const faceIdx of meshFaceRefs) {
            const fv = faceIdx.map(idx => meshVertices[idx - 1]).filter(v => v !== undefined);
            if (fv.length >= 3) {
              for (let ti = 1; ti < fv.length - 1; ti++) {
                faces3d.push({ vertices: [fv[0], fv[ti], fv[ti + 1]] });
              }
            }
          }
        }
      } else {
        const pts: Point2D[] = [];
        while (i < lines.length) {
          const entityCode = peek();
          if (entityCode !== "0") { next(); next(); continue; }
          const savedI = i;
          next();
          const entityType = next();
          if (entityType === "VERTEX") {
            let vx = 0, vy = 0;
            while (i < lines.length) {
              if (peek() === "0") break;
              const gc = next();
              const gv = next();
              if (gc === "10") vx = parseFloat(gv);
              if (gc === "20") vy = parseFloat(gv);
            }
            pts.push({ x: vx, y: vy });
          } else if (entityType === "SEQEND") {
            while (i < lines.length) {
              if (peek() === "0") break;
              next(); next();
            }
            break;
          } else {
            i = savedI;
            break;
          }
        }
        if (pts.length >= 2) {
          polylines.push({ points: pts, closed });
        }
      }
    }

    if (code === "0" && value === "LINE") {
      let x1 = 0, y1 = 0, x2 = 0, y2 = 0;
      while (i < lines.length) {
        if (peek() === "0") break;
        const gc = next();
        const gv = next();
        if (gc === "10") x1 = parseFloat(gv);
        if (gc === "20") y1 = parseFloat(gv);
        if (gc === "11") x2 = parseFloat(gv);
        if (gc === "21") y2 = parseFloat(gv);
      }
      lineSegments.push({ x1, y1, x2, y2 });
    }

    if (code === "0" && value === "ARC") {
      let cx = 0, cy = 0, r = 0, startAngle = 0, endAngle = 360;
      while (i < lines.length) {
        if (peek() === "0") break;
        const gc = next();
        const gv = next();
        if (gc === "10") cx = parseFloat(gv);
        if (gc === "20") cy = parseFloat(gv);
        if (gc === "40") r = parseFloat(gv);
        if (gc === "50") startAngle = parseFloat(gv);
        if (gc === "51") endAngle = parseFloat(gv);
      }
      arcs.push({ cx, cy, r, startAngle, endAngle });
    }

    if (code === "0" && value === "CIRCLE") {
      let cx = 0, cy = 0, r = 0;
      while (i < lines.length) {
        if (peek() === "0") break;
        const gc = next();
        const gv = next();
        if (gc === "10") cx = parseFloat(gv);
        if (gc === "20") cy = parseFloat(gv);
        if (gc === "40") r = parseFloat(gv);
      }
      circles.push({ cx, cy, r });
    }

    if (code === "0" && value === "ELLIPSE") {
      let cx = 0, cy = 0, majorX = 0, majorY = 0, ratio = 1, startParam = 0, endParam = 2 * Math.PI;
      while (i < lines.length) {
        if (peek() === "0") break;
        const gc = next();
        const gv = next();
        if (gc === "10") cx = parseFloat(gv);
        if (gc === "20") cy = parseFloat(gv);
        if (gc === "11") majorX = parseFloat(gv);
        if (gc === "21") majorY = parseFloat(gv);
        if (gc === "40") ratio = parseFloat(gv);
        if (gc === "41") startParam = parseFloat(gv);
        if (gc === "42") endParam = parseFloat(gv);
      }
      ellipses.push({ cx, cy, majorX, majorY, ratio, startParam, endParam });
    }

    if (code === "0" && value === "SPLINE") {
      let degree = 3;
      let closed = false;
      const ctrlPts: Point2D[] = [];
      let currentX: number | null = null;
      while (i < lines.length) {
        if (peek() === "0") break;
        const gc = next();
        const gv = next();
        if (gc === "71") degree = parseInt(gv);
        if (gc === "70") {
          const flags = parseInt(gv);
          closed = (flags & 1) !== 0;
        }
        if (gc === "10") {
          currentX = parseFloat(gv);
        }
        if (gc === "20" && currentX !== null) {
          ctrlPts.push({ x: currentX, y: parseFloat(gv) });
          currentX = null;
        }
      }
      if (ctrlPts.length >= 2) {
        splines.push({ degree, controlPoints: ctrlPts, closed });
      }
    }

    if (code === "0" && value === "3DFACE") {
      const verts: Point3D[] = [
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 0, z: 0 },
      ];
      while (i < lines.length) {
        if (peek() === "0") break;
        const gc = next();
        const gv = next();
        if (gc === "10") verts[0].x = parseFloat(gv);
        if (gc === "20") verts[0].y = parseFloat(gv);
        if (gc === "30") verts[0].z = parseFloat(gv);
        if (gc === "11") verts[1].x = parseFloat(gv);
        if (gc === "21") verts[1].y = parseFloat(gv);
        if (gc === "31") verts[1].z = parseFloat(gv);
        if (gc === "12") verts[2].x = parseFloat(gv);
        if (gc === "22") verts[2].y = parseFloat(gv);
        if (gc === "32") verts[2].z = parseFloat(gv);
        if (gc === "13") verts[3].x = parseFloat(gv);
        if (gc === "23") verts[3].y = parseFloat(gv);
        if (gc === "33") verts[3].z = parseFloat(gv);
      }
      const v3 = verts[2];
      const v4 = verts[3];
      const isTri = Math.abs(v3.x - v4.x) < 1e-6 && Math.abs(v3.y - v4.y) < 1e-6 && Math.abs(v3.z - v4.z) < 1e-6;
      faces3d.push({ vertices: isTri ? [verts[0], verts[1], verts[2]] : verts });
    }

    if (code === "0" && value === "MESH") {
      const meshVerts: Point3D[] = [];
      const meshFaceIndices: number[][] = [];
      let mRows = 0, nCols = 0;
      let vertexCount = 0;
      let faceListSize = 0;
      let readingVertices = false;
      let readingFaces = false;
      let vertsCollected = 0;
      let faceDataCollected = 0;
      let currentVert: Point3D = { x: 0, y: 0, z: 0 };
      let hasX = false;
      while (i < lines.length) {
        if (peek() === "0") break;
        const gc = next();
        const gv = next();
        if (gc === "71") mRows = parseInt(gv);
        if (gc === "72") nCols = parseInt(gv);
        if (gc === "92") {
          vertexCount = parseInt(gv);
          readingVertices = true;
          readingFaces = false;
          vertsCollected = 0;
          continue;
        }
        if (gc === "93") {
          faceListSize = parseInt(gv);
          readingVertices = false;
          readingFaces = true;
          faceDataCollected = 0;
          continue;
        }
        if (readingVertices && vertsCollected < vertexCount) {
          if (gc === "10") {
            currentVert = { x: parseFloat(gv), y: 0, z: 0 };
            hasX = true;
          } else if (gc === "20" && hasX) {
            currentVert.y = parseFloat(gv);
          } else if (gc === "30" && hasX) {
            currentVert.z = parseFloat(gv);
            meshVerts.push({ ...currentVert });
            vertsCollected++;
            hasX = false;
          }
        }
        if (readingFaces && faceDataCollected < faceListSize) {
          if (gc === "90") {
            if (meshFaceIndices.length === 0 || meshFaceIndices[meshFaceIndices.length - 1].length > 0) {
              meshFaceIndices.push([]);
            }
            faceDataCollected++;
          } else if (gc === "91") {
            const idx = parseInt(gv);
            if (meshFaceIndices.length > 0) {
              meshFaceIndices[meshFaceIndices.length - 1].push(Math.abs(idx));
            }
            faceDataCollected++;
          }
        }
      }
      if (meshVerts.length >= 3) {
        if (meshFaceIndices.length > 0) {
          meshFaceIndices.forEach(indices => {
            if (indices.length >= 3) {
              const fv = indices.map(idx => meshVerts[idx] || { x: 0, y: 0, z: 0 });
              for (let ti = 1; ti < fv.length - 1; ti++) {
                faces3d.push({ vertices: [fv[0], fv[ti], fv[ti + 1]] });
              }
            }
          });
        } else if (mRows > 0 && nCols > 0) {
          for (let r = 0; r < mRows - 1; r++) {
            for (let c = 0; c < nCols - 1; c++) {
              const i0 = r * nCols + c;
              const i1 = r * nCols + c + 1;
              const i2 = (r + 1) * nCols + c + 1;
              const i3 = (r + 1) * nCols + c;
              if (i0 < meshVerts.length && i1 < meshVerts.length && i2 < meshVerts.length && i3 < meshVerts.length) {
                faces3d.push({ vertices: [meshVerts[i0], meshVerts[i1], meshVerts[i2]] });
                faces3d.push({ vertices: [meshVerts[i0], meshVerts[i2], meshVerts[i3]] });
              }
            }
          }
        }
      }
    }

    if (code === "0" && (value === "3DSOLID" || value === "BODY" || value === "REGION")) {
      console.log(`[DXF] Found ${value} entity`);
      const satLines: string[] = [];
      const binaryChunks: string[] = [];
      const allGroupCodes: string[] = [];
      let historyHandle = "";
      let entityHandle = "";
      while (i < lines.length) {
        if (peek() === "0") break;
        const gc = next();
        const gv = next();
        allGroupCodes.push(gc);
        if (gc === "1" || gc === "3") {
          satLines.push(gv);
        }
        if (gc === "310") {
          binaryChunks.push(gv);
        }
        if (gc === "350") {
          historyHandle = gv;
        }
        if (gc === "5") {
          entityHandle = gv;
        }
      }
      const uniqueCodes = Array.from(new Set(allGroupCodes));
      console.log(`[DXF] ${value}: SAT lines=${satLines.length}, binary chunks=${binaryChunks.length}, handle=${entityHandle}, histRef=${historyHandle}, codes=[${uniqueCodes.join(",")}]`);

      if (satLines.length > 0) {
        const satText = satLines.join("\n");
        const satFaces = parseAcisSat(satText);
        console.log(`[DXF] ${value}: parsed ${satFaces.length} faces from SAT text`);
        for (const f of satFaces) {
          faces3d.push(f);
        }
      } else if (binaryChunks.length > 0) {
        console.log(`[DXF] ${value}: has binary SAB data (${binaryChunks.length} chunks)`);
        const sabFaces = parseSabBinary(binaryChunks);
        console.log(`[DXF] ${value}: parsed ${sabFaces.length} faces from SAB binary`);
        for (const f of sabFaces) {
          faces3d.push(f);
        }
      } else {
        console.log(`[DXF] ${value}: No inline geometry - will search OBJECTS section`);
        solid3dHandles.push(entityHandle || historyHandle);
      }
    }

    if (code === "0" && (value === "POINT" || value === "INSERT")) {
      let px = 0, py = 0;
      while (i < lines.length) {
        if (peek() === "0") break;
        const gc = next();
        const gv = next();
        if (gc === "10") px = parseFloat(gv);
        if (gc === "20") py = parseFloat(gv);
      }
      points.push({ x: px, y: py });
    }
  }

  if (solid3dHandles.length > 0 && faces3d.length === 0) {
    console.log(`[DXF] Searching OBJECTS section for ACIS data (handles: ${solid3dHandles.join(",")})`);
    const acisEntityTypes = new Set([
      "ACSH_EXTRUSION_CLASS", "ACSH_SWEEP_CLASS", "ACSH_REVOLVE_CLASS",
      "ACSH_LOFT_CLASS", "ACSH_BOOLEAN_CLASS", "ACSH_FILLET_CLASS",
      "ACSH_CHAMFER_CLASS", "ACSH_BOX_CLASS", "ACSH_CYLINDER_CLASS",
      "ACSH_CONE_CLASS", "ACSH_SPHERE_CLASS", "ACSH_TORUS_CLASS",
      "ACSH_WEDGE_CLASS", "ACSH_PYRAMID_CLASS",
      "ACSH_HISTORY_CLASS", "ACDB_ACSH_HISTORY_NODE",
    ]);
    let inObjects = false;
    while (i < lines.length) {
      const oc = next();
      const ov = next();
      if (oc === "2" && ov === "OBJECTS") {
        inObjects = true;
        continue;
      }
      if (oc === "0" && ov === "ENDSEC" && inObjects) break;
      if (!inObjects) continue;

      if (oc === "0") {
        const isAcisEntity = acisEntityTypes.has(ov) || ov.startsWith("ACSH_") || ov.startsWith("ACDB_");
        const objSatLines: string[] = [];
        const objBinaryChunks: string[] = [];
        let objHandle = "";
        let ownerHandle = "";
        let extrusionHeight = 0;
        let dirX = 0, dirY = 0, dirZ = 0;
        const numericCodes: Record<string, number> = {};
        while (i < lines.length) {
          if (peek() === "0") break;
          const gc = next();
          const gv = next();
          if (isAcisEntity) {
            if (gc === "1" || gc === "3") objSatLines.push(gv);
            if (gc === "310") objBinaryChunks.push(gv);
            if (gc === "5") objHandle = gv;
            if (gc === "330") ownerHandle = gv;
            if (gc === "10") dirX = parseFloat(gv);
            if (gc === "20") dirY = parseFloat(gv);
            if (gc === "30") dirZ = parseFloat(gv);
            const gcNum = parseInt(gc);
            if ((gcNum >= 10 && gcNum <= 39) || (gcNum >= 40 && gcNum <= 49) || gcNum === 90 || gcNum === 91) {
              if (!numericCodes[gc]) numericCodes[gc] = parseFloat(gv);
            }
          }
        }
        extrusionHeight = numericCodes["40"] || numericCodes["41"] || numericCodes["42"] || 0;

        if (isAcisEntity && (objSatLines.length > 0 || objBinaryChunks.length > 0)) {
          console.log(`[DXF] OBJECTS: found ACIS entity type=${ov}, handle=${objHandle}, owner=${ownerHandle}, SAT=${objSatLines.length}, binary=${objBinaryChunks.length}, height=${extrusionHeight}, dir=(${dirX},${dirY},${dirZ}), numericCodes=${JSON.stringify(numericCodes)}`);
          if (objSatLines.length > 0) {
            const satText = objSatLines.join("\n");
            const satFaces = parseAcisSat(satText, extrusionHeight);
            console.log(`[DXF] ACIS entity ${ov}: parsed ${satFaces.length} faces`);
            for (const f of satFaces) faces3d.push(f);
          } else if (objBinaryChunks.length > 0) {
            const sabFaces = parseSabBinary(objBinaryChunks);
            for (const f of sabFaces) faces3d.push(f);
          }
        }
      }
    }
  }

  return { polylines, points, lineSegments, circles, arcs, ellipses, splines, faces3d };
}

function tryBuildPolylinesFromLines(
  lineSegments: { x1: number; y1: number; x2: number; y2: number }[],
  tolerance: number = 0.1
): ParsedPolyline[] {
  if (lineSegments.length === 0) return [];

  const result: ParsedPolyline[] = [];
  const used = new Set<number>();

  const dist = (a: Point2D, b: Point2D) =>
    Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);

  for (let startIdx = 0; startIdx < lineSegments.length; startIdx++) {
    if (used.has(startIdx)) continue;

    const chain: Point2D[] = [];
    const seg = lineSegments[startIdx];
    chain.push({ x: seg.x1, y: seg.y1 });
    chain.push({ x: seg.x2, y: seg.y2 });
    used.add(startIdx);

    let changed = true;
    while (changed) {
      changed = false;
      for (let j = 0; j < lineSegments.length; j++) {
        if (used.has(j)) continue;
        const s = lineSegments[j];
        const start = { x: s.x1, y: s.y1 };
        const end = { x: s.x2, y: s.y2 };
        const chainEnd = chain[chain.length - 1];

        if (dist(chainEnd, start) < tolerance) {
          chain.push(end);
          used.add(j);
          changed = true;
        } else if (dist(chainEnd, end) < tolerance) {
          chain.push(start);
          used.add(j);
          changed = true;
        }
      }
    }

    const closed = chain.length > 2 && dist(chain[0], chain[chain.length - 1]) < tolerance;
    if (closed) chain.pop();
    result.push({ points: chain, closed });
  }

  return result;
}

function build3DData(faces: Parsed3DFace[]): Solid3DData | undefined {
  if (faces.length === 0) return undefined;

  const min: Point3D = { x: Infinity, y: Infinity, z: Infinity };
  const max: Point3D = { x: -Infinity, y: -Infinity, z: -Infinity };

  const solidFaces: Face3D[] = [];
  const edgeSet = new Set<string>();
  const edges: { start: Point3D; end: Point3D }[] = [];

  const edgeKey = (a: Point3D, b: Point3D) => {
    const ax = a.x.toFixed(4), ay = a.y.toFixed(4), az = a.z.toFixed(4);
    const bx = b.x.toFixed(4), by = b.y.toFixed(4), bz = b.z.toFixed(4);
    return `${ax},${ay},${az}-${bx},${by},${bz}`;
  };

  for (const f of faces) {
    for (const v of f.vertices) {
      min.x = Math.min(min.x, v.x);
      min.y = Math.min(min.y, v.y);
      min.z = Math.min(min.z, v.z);
      max.x = Math.max(max.x, v.x);
      max.y = Math.max(max.y, v.y);
      max.z = Math.max(max.z, v.z);
    }

    if (f.vertices.length === 3) {
      solidFaces.push({ vertices: [f.vertices[0], f.vertices[1], f.vertices[2]] });
    } else if (f.vertices.length === 4) {
      solidFaces.push({ vertices: [f.vertices[0], f.vertices[1], f.vertices[2], f.vertices[3]] });
    }

    for (let ei = 0; ei < f.vertices.length; ei++) {
      const a = f.vertices[ei];
      const b = f.vertices[(ei + 1) % f.vertices.length];
      const k1 = edgeKey(a, b);
      const k2 = edgeKey(b, a);
      if (!edgeSet.has(k1) && !edgeSet.has(k2)) {
        edgeSet.add(k1);
        edges.push({ start: a, end: b });
      }
    }
  }

  if (!isFinite(min.x)) return undefined;

  return {
    faces: solidFaces,
    edges,
    bounds: { min, max },
  };
}

export function parseDxfFile(content: string): DxfParseResult {
  const { polylines, points, lineSegments, circles, arcs, ellipses, splines, faces3d } = parseDxfEntities(content);

  const arcLineSegments = arcs.flatMap(arc => {
    const pts = arcToPoints(arc.cx, arc.cy, arc.r, arc.startAngle, arc.endAngle);
    const segs: { x1: number; y1: number; x2: number; y2: number }[] = [];
    for (let k = 0; k < pts.length - 1; k++) {
      segs.push({ x1: pts[k].x, y1: pts[k].y, x2: pts[k + 1].x, y2: pts[k + 1].y });
    }
    return segs;
  });

  const ellipseLineSegments = ellipses.flatMap(e => {
    const pts = ellipseToPoints(e.cx, e.cy, e.majorX, e.majorY, e.ratio, e.startParam, e.endParam);
    const segs: { x1: number; y1: number; x2: number; y2: number }[] = [];
    for (let k = 0; k < pts.length - 1; k++) {
      segs.push({ x1: pts[k].x, y1: pts[k].y, x2: pts[k + 1].x, y2: pts[k + 1].y });
    }
    const isFullEllipse = Math.abs(e.endParam - e.startParam - 2 * Math.PI) < 0.01 ||
                          (e.startParam === 0 && Math.abs(e.endParam - 2 * Math.PI) < 0.01);
    if (isFullEllipse && pts.length > 2) {
      segs.push({ x1: pts[pts.length - 1].x, y1: pts[pts.length - 1].y, x2: pts[0].x, y2: pts[0].y });
    }
    return segs;
  });

  const splinePolylines: ParsedPolyline[] = splines.map(s => {
    const pts = evaluateBSpline(s.controlPoints, s.degree);
    if (s.closed && pts.length > 2) {
      const first = pts[0];
      const last = pts[pts.length - 1];
      const dist = Math.sqrt((first.x - last.x) ** 2 + (first.y - last.y) ** 2);
      if (dist > 0.1) {
        pts.push({ ...first });
      }
    }
    return { points: pts, closed: s.closed };
  });

  const allLineSegments = [...lineSegments, ...arcLineSegments, ...ellipseLineSegments];
  const linePolylines = tryBuildPolylinesFromLines(allLineSegments);
  const allPolylines = [...polylines, ...linePolylines, ...splinePolylines];

  const closedPolylines = allPolylines.filter(p => p.closed && p.points.length >= 3);
  closedPolylines.sort((a, b) => polygonArea(b.points) - polygonArea(a.points));

  let perimeterPoly: ParsedPolyline | null = null;
  const openingPolys: ParsedPolyline[] = [];

  if (closedPolylines.length > 0) {
    perimeterPoly = closedPolylines[0];

    for (let k = 1; k < closedPolylines.length; k++) {
      const centroid = {
        x: closedPolylines[k].points.reduce((s, p) => s + p.x, 0) / closedPolylines[k].points.length,
        y: closedPolylines[k].points.reduce((s, p) => s + p.y, 0) / closedPolylines[k].points.length,
      };
      if (pointInPolygon(centroid, perimeterPoly.points)) {
        openingPolys.push(closedPolylines[k]);
      }
    }
  }

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  if (perimeterPoly) {
    for (const p of perimeterPoly.points) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  }

  if (!isFinite(minX)) { minX = 0; minY = 0; maxX = 120; maxY = 180; }

  const offsetX = minX;
  const offsetY = minY;

  const round3 = (n: number) => Math.round(n * 1000) / 1000;

  const perimeter: Vertex[] = perimeterPoly
    ? perimeterPoly.points.map(p => ({
        id: crypto.randomUUID(),
        x: round3(p.x - offsetX),
        y: round3(p.y - offsetY),
      }))
    : [];

  const openings: Opening[] = openingPolys.map(poly => {
    const verts = poly.points.map(p => ({
      x: round3(p.x - offsetX),
      y: round3(p.y - offsetY),
    }));

    let oMinX = Infinity, oMinY = Infinity, oMaxX = -Infinity, oMaxY = -Infinity;
    for (const v of verts) {
      oMinX = Math.min(oMinX, v.x);
      oMinY = Math.min(oMinY, v.y);
      oMaxX = Math.max(oMaxX, v.x);
      oMaxY = Math.max(oMaxY, v.y);
    }

    return {
      id: crypto.randomUUID(),
      x: oMinX,
      y: oMinY,
      width: oMaxX - oMinX,
      height: oMaxY - oMinY,
      type: "polygon" as const,
      vertices: verts,
    };
  });

  circles.forEach(c => {
    const cx = round3(c.cx - offsetX);
    const cy = round3(c.cy - offsetY);
    const r = round3(c.r);

    if (perimeterPoly && pointInPolygon({ x: c.cx, y: c.cy }, perimeterPoly.points)) {
      openings.push({
        id: crypto.randomUUID(),
        x: cx - r,
        y: cy - r,
        width: r * 2,
        height: r * 2,
        type: "circle",
      });
    }
  });

  const nodes = points.map(p => ({
    x: round3(p.x - offsetX),
    y: round3(p.y - offsetY),
  }));

  const openLines = allPolylines.filter(p => !p.closed);
  const sketchLines: { x1: number; y1: number; x2: number; y2: number }[] = [];
  for (const ol of openLines) {
    for (let k = 0; k < ol.points.length - 1; k++) {
      sketchLines.push({
        x1: round3(ol.points[k].x - offsetX),
        y1: round3(ol.points[k].y - offsetY),
        x2: round3(ol.points[k + 1].x - offsetX),
        y2: round3(ol.points[k + 1].y - offsetY),
      });
    }
  }

  const width = round3(maxX - minX);
  const height = round3(maxY - minY);

  const solid3d = build3DData(faces3d);

  return { perimeter, openings, nodes, sketchLines, width, height, solid3d };
}
