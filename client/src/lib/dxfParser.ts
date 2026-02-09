
import { Vertex, Opening } from "./types";

interface Point2D {
  x: number;
  y: number;
}

interface ParsedPolyline {
  points: Point2D[];
  closed: boolean;
}

interface DxfParseResult {
  perimeter: Vertex[];
  openings: Opening[];
  nodes: Point2D[];
  sketchLines: { x1: number; y1: number; x2: number; y2: number }[];
  width: number;
  height: number;
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

function parseDxfEntities(content: string) {
  const lines = content.split(/\r?\n/).map(l => l.trim());
  const polylines: ParsedPolyline[] = [];
  const points: Point2D[] = [];
  const lineSegments: { x1: number; y1: number; x2: number; y2: number }[] = [];
  const circles: { cx: number; cy: number; r: number }[] = [];
  const arcs: { cx: number; cy: number; r: number; startAngle: number; endAngle: number }[] = [];

  let i = 0;
  const next = () => (i < lines.length ? lines[i++] : "");
  const peek = () => (i < lines.length ? lines[i] : "");

  let inEntities = false;

  while (i < lines.length) {
    const code = next();
    const value = next();

    if (code === "2" && value === "ENTITIES") {
      inEntities = true;
      continue;
    }

    if (code === "0" && value === "ENDSEC" && inEntities) {
      break;
    }

    if (!inEntities) continue;

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
      while (i < lines.length) {
        if (peek() === "0") break;
        const gc = next();
        const gv = next();
        if (gc === "70") {
          const flags = parseInt(gv);
          closed = (flags & 1) !== 0;
        }
      }

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

  return { polylines, points, lineSegments, circles, arcs };
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

export function parseDxfFile(content: string): DxfParseResult {
  const { polylines, points, lineSegments, circles, arcs } = parseDxfEntities(content);

  const arcLineSegments = arcs.flatMap(arc => {
    const pts = arcToPoints(arc.cx, arc.cy, arc.r, arc.startAngle, arc.endAngle);
    const segs: { x1: number; y1: number; x2: number; y2: number }[] = [];
    for (let k = 0; k < pts.length - 1; k++) {
      segs.push({ x1: pts[k].x, y1: pts[k].y, x2: pts[k + 1].x, y2: pts[k + 1].y });
    }
    return segs;
  });

  const allLineSegments = [...lineSegments, ...arcLineSegments];
  const linePolylines = tryBuildPolylinesFromLines(allLineSegments);
  const allPolylines = [...polylines, ...linePolylines];

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

  return { perimeter, openings, nodes, sketchLines, width, height };
}
