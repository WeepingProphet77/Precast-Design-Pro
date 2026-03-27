
import { Vertex, Opening } from "./types";

interface Point2D {
  x: number;
  y: number;
}

function polygonSignedArea(pts: Point2D[]): number {
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    area += pts[i].x * pts[j].y;
    area -= pts[j].x * pts[i].y;
  }
  return area / 2;
}

function polygonCentroid(pts: Point2D[]): { cx: number; cy: number; area: number } {
  const A = polygonSignedArea(pts);
  if (Math.abs(A) < 1e-10) {
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    return { cx, cy, area: 0 };
  }

  let cx = 0;
  let cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    const cross = pts[i].x * pts[j].y - pts[j].x * pts[i].y;
    cx += (pts[i].x + pts[j].x) * cross;
    cy += (pts[i].y + pts[j].y) * cross;
  }
  cx /= (6 * A);
  cy /= (6 * A);

  return { cx, cy, area: Math.abs(A) };
}

function circleArea(r: number): number {
  return Math.PI * r * r;
}

export function calculateNetArea(
  perimeter: Vertex[],
  openings: Opening[]
): number {
  if (perimeter.length < 3) return 0;

  const perimPts = perimeter.map(v => ({ x: v.x, y: v.y }));
  let totalArea = Math.abs(polygonSignedArea(perimPts));

  for (const op of openings) {
    if (op.type === "polygon" && op.vertices && op.vertices.length >= 3) {
      totalArea -= Math.abs(polygonSignedArea(op.vertices));
    } else if (op.type === "circle") {
      totalArea -= circleArea(op.width / 2);
    } else {
      totalArea -= op.width * op.height;
    }
  }

  return Math.max(0, totalArea);
}

export function calculateCentroid(
  perimeter: Vertex[],
  openings: Opening[]
): { x: number; y: number } {
  if (perimeter.length < 3) return { x: 0, y: 0 };

  const perimPts = perimeter.map(v => ({ x: v.x, y: v.y }));
  const perimResult = polygonCentroid(perimPts);

  let totalArea = perimResult.area;
  let totalCx = perimResult.cx * perimResult.area;
  let totalCy = perimResult.cy * perimResult.area;

  for (const op of openings) {
    if (op.type === "polygon" && op.vertices && op.vertices.length >= 3) {
      const opResult = polygonCentroid(op.vertices);
      totalArea -= opResult.area;
      totalCx -= opResult.cx * opResult.area;
      totalCy -= opResult.cy * opResult.area;
    } else if (op.type === "circle") {
      const r = op.width / 2;
      const ocx = op.x + r;
      const ocy = op.y + r;
      const oArea = circleArea(r);
      totalArea -= oArea;
      totalCx -= ocx * oArea;
      totalCy -= ocy * oArea;
    } else {
      const ocx = op.x + op.width / 2;
      const ocy = op.y + op.height / 2;
      const oArea = op.width * op.height;
      totalArea -= oArea;
      totalCx -= ocx * oArea;
      totalCy -= ocy * oArea;
    }
  }

  if (Math.abs(totalArea) < 1e-10) {
    return { x: perimResult.cx, y: perimResult.cy };
  }

  return {
    x: Math.round((totalCx / totalArea) * 100) / 100,
    y: Math.round((totalCy / totalArea) * 100) / 100,
  };
}
