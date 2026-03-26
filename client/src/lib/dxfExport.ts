import { Panel, Vertex, Opening, DxfView, DimensionAnnotation, UserDrawnLine, SketchLine, ConnectionNode } from "./types";

/**
 * Export panel geometry to DXF (AutoCAD R12 / DXF 2000 compatible).
 *
 * Layers used:
 *   PERIMETER   – panel outline
 *   OPENINGS    – openings / voids
 *   DXFVIEWS    – imported DXF view outlines
 *   SKETCH      – sketch / imported LINE entities
 *   DIMENSIONS  – dimension annotations
 *   USERLINES   – user-drawn solid/hidden lines
 *   CONNECTIONS – connection node markers
 *   CENTROID    – centroid cross-hair
 */

// ── Helpers ──────────────────────────────────────────────────────────────

let handleCounter = 100;
function nextHandle(): string {
  return (handleCounter++).toString(16).toUpperCase();
}

function vertex2d(x: number, y: number): string {
  return ` 10\n${x.toFixed(6)}\n 20\n${y.toFixed(6)}\n`;
}

// ── Layer colours (AutoCAD colour index) ─────────────────────────────────
const LAYER_COLORS: Record<string, number> = {
  PERIMETER: 5,    // blue
  OPENINGS: 1,     // red
  DXFVIEWS: 4,     // cyan
  SKETCH: 8,       // dark gray
  DIMENSIONS: 150,  // steel blue
  USERLINES: 7,    // white/black
  CONNECTIONS: 3,  // green
  CENTROID: 6,     // magenta
};

// ── DXF document builder ─────────────────────────────────────────────────

function headerSection(): string {
  return [
    "  0", "SECTION",
    "  2", "HEADER",
    "  9", "$ACADVER",
    "  1", "AC1015",           // AutoCAD 2000
    "  9", "$INSUNITS",
    " 70", "1",                // inches
    "  0", "ENDSEC",
  ].join("\n") + "\n";
}

function tablesSection(layers: string[]): string {
  const lines: string[] = [
    "  0", "SECTION",
    "  2", "TABLES",
    // ── LTYPE table (continuous + dashed) ──
    "  0", "TABLE",
    "  2", "LTYPE",
    " 70", "2",
    // Continuous
    "  0", "LTYPE",
    "  5", nextHandle(),
    "  2", "CONTINUOUS",
    " 70", "0",
    "  3", "Solid line",
    " 72", "65",
    " 73", "0",
    " 40", "0.0",
    // Dashed
    "  0", "LTYPE",
    "  5", nextHandle(),
    "  2", "DASHED",
    " 70", "0",
    "  3", "__ __ __ __",
    " 72", "65",
    " 73", "2",
    " 40", "0.75",
    " 49", "0.5",
    " 49", "-0.25",
    "  0", "ENDTAB",
    // ── LAYER table ──
    "  0", "TABLE",
    "  2", "LAYER",
    " 70", String(layers.length),
  ];
  for (const name of layers) {
    lines.push(
      "  0", "LAYER",
      "  5", nextHandle(),
      "  2", name,
      " 70", "0",
      " 62", String(LAYER_COLORS[name] ?? 7),
      "  6", "CONTINUOUS",
    );
  }
  lines.push("  0", "ENDTAB", "  0", "ENDSEC");
  return lines.join("\n") + "\n";
}

function entitiesHeader(): string {
  return "  0\nSECTION\n  2\nENTITIES\n";
}

function entitiesFooter(): string {
  return "  0\nENDSEC\n";
}

function eof(): string {
  return "  0\nEOF\n";
}

// ── Entity writers ───────────────────────────────────────────────────────

function lwpolyline(vertices: { x: number; y: number }[], closed: boolean, layer: string): string {
  if (vertices.length < 2) return "";
  const lines: string[] = [
    "  0", "LWPOLYLINE",
    "  5", nextHandle(),
    "  8", layer,
    " 90", String(vertices.length),
    " 70", closed ? "1" : "0",
  ];
  for (const v of vertices) {
    lines.push(` 10\n${v.x.toFixed(6)}`, ` 20\n${v.y.toFixed(6)}`);
  }
  return lines.join("\n") + "\n";
}

function dxfLine(x1: number, y1: number, x2: number, y2: number, layer: string, linetype?: string): string {
  const lines: string[] = [
    "  0", "LINE",
    "  5", nextHandle(),
    "  8", layer,
  ];
  if (linetype) {
    lines.push("  6", linetype);
  }
  lines.push(
    ` 10\n${x1.toFixed(6)}`, ` 20\n${y1.toFixed(6)}`,
    ` 11\n${x2.toFixed(6)}`, ` 21\n${y2.toFixed(6)}`,
  );
  return lines.join("\n") + "\n";
}

function dxfCircle(cx: number, cy: number, r: number, layer: string): string {
  return [
    "  0", "CIRCLE",
    "  5", nextHandle(),
    "  8", layer,
    ` 10\n${cx.toFixed(6)}`, ` 20\n${cy.toFixed(6)}`,
    ` 40\n${r.toFixed(6)}`,
  ].join("\n") + "\n";
}

function dxfPoint(x: number, y: number, layer: string): string {
  return [
    "  0", "POINT",
    "  5", nextHandle(),
    "  8", layer,
    ` 10\n${x.toFixed(6)}`, ` 20\n${y.toFixed(6)}`,
  ].join("\n") + "\n";
}

function dxfText(x: number, y: number, height: number, text: string, layer: string, halign: number = 0): string {
  const lines: string[] = [
    "  0", "TEXT",
    "  5", nextHandle(),
    "  8", layer,
    ` 10\n${x.toFixed(6)}`, ` 20\n${y.toFixed(6)}`,
    ` 40\n${height.toFixed(6)}`,
    "  1", text,
  ];
  if (halign !== 0) {
    lines.push(" 72", String(halign));
    // alignment point
    lines.push(` 11\n${x.toFixed(6)}`, ` 21\n${y.toFixed(6)}`);
  }
  return lines.join("\n") + "\n";
}

// ── Opening writer ───────────────────────────────────────────────────────

function writeOpening(op: Opening, layer: string): string {
  if (op.type === "circle") {
    const r = op.width / 2;
    return dxfCircle(op.x + r, op.y + r, r, layer);
  }
  if (op.type === "polygon" && op.vertices && op.vertices.length >= 3) {
    return lwpolyline(op.vertices, true, layer);
  }
  // Rectangle
  const pts = [
    { x: op.x, y: op.y },
    { x: op.x + op.width, y: op.y },
    { x: op.x + op.width, y: op.y + op.height },
    { x: op.x, y: op.y + op.height },
  ];
  return lwpolyline(pts, true, layer);
}

// ── Dimension writer ─────────────────────────────────────────────────────

function writeDimension(dim: DimensionAnnotation, layer: string): string {
  let out = "";

  const dx = dim.endX - dim.startX;
  const dy = dim.endY - dim.startY;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const off = dim.offset / 3; // scale offset (matches PDF export convention)

  const d1x = dim.startX + nx * off;
  const d1y = dim.startY + ny * off;
  const d2x = dim.endX + nx * off;
  const d2y = dim.endY + ny * off;

  const ext = off > 0 ? 2 : -2;

  // Extension lines
  out += dxfLine(dim.startX, dim.startY, d1x + nx * ext, d1y + ny * ext, layer);
  out += dxfLine(dim.endX, dim.endY, d2x + nx * ext, d2y + ny * ext, layer);

  // Dimension line
  out += dxfLine(d1x, d1y, d2x, d2y, layer);

  // Tick marks (small crosses perpendicular to dim line)
  const tickLen = 2;
  out += dxfLine(d1x - nx * tickLen, d1y - ny * tickLen, d1x + nx * tickLen, d1y + ny * tickLen, layer);
  out += dxfLine(d2x - nx * tickLen, d2y - ny * tickLen, d2x + nx * tickLen, d2y + ny * tickLen, layer);

  // Measurement text
  const distance = Math.sqrt((dim.endX - dim.startX) ** 2 + (dim.endY - dim.startY) ** 2);
  const textStr = `${distance.toFixed(2)}"`;
  const mx = (d1x + d2x) / 2;
  const my = (d1y + d2y) / 2;
  out += dxfText(mx, my + 1, 3, textStr, layer, 1); // center-aligned, 3" text height

  return out;
}

// ── Connection marker writer ─────────────────────────────────────────────

function writeConnection(conn: ConnectionNode, layer: string): string {
  let out = "";
  // Mark the connection position with a POINT
  out += dxfPoint(conn.x, conn.y, layer);
  // Label
  out += dxfText(conn.x + 2, conn.y + 2, 3, conn.label, layer);
  return out;
}

// ── Centroid cross-hair ──────────────────────────────────────────────────

function writeCentroid(cx: number, cy: number, layer: string): string {
  const arm = 6;
  let out = "";
  out += dxfLine(cx - arm, cy, cx + arm, cy, layer);
  out += dxfLine(cx, cy - arm, cx, cy + arm, layer);
  return out;
}

// ── Main export function ─────────────────────────────────────────────────

export function exportPanelToDxf(panel: Panel): void {
  // Reset handle counter for each export
  handleCounter = 100;

  const layers = Object.keys(LAYER_COLORS);
  let dxf = "";

  dxf += headerSection();
  dxf += tablesSection(layers);
  dxf += entitiesHeader();

  // ── Perimeter ──
  if (panel.perimeter.length >= 3) {
    dxf += lwpolyline(panel.perimeter, true, "PERIMETER");
  }

  // ── DXF Views ──
  if (panel.dxfViews && panel.dxfViews.length > 0) {
    for (const view of panel.dxfViews) {
      if (view.polygon.length >= 3) {
        dxf += lwpolyline(view.polygon, true, "DXFVIEWS");
      }
      for (const op of view.openings) {
        dxf += writeOpening(op, "OPENINGS");
      }
      // View centroid
      if (view.showCentroid && view.centroidX != null && view.centroidY != null) {
        dxf += writeCentroid(view.centroidX, view.centroidY, "CENTROID");
      }
    }
  }

  // ── Openings ──
  for (const op of panel.openings) {
    dxf += writeOpening(op, "OPENINGS");
  }

  // ── Sketch lines ──
  for (const sl of panel.sketchLines) {
    dxf += dxfLine(sl.x1, sl.y1, sl.x2, sl.y2, "SKETCH");
  }

  // ── Dimensions ──
  if (panel.dimensions) {
    for (const dim of panel.dimensions) {
      dxf += writeDimension(dim, "DIMENSIONS");
    }
  }

  // ── User-drawn lines ──
  if (panel.userLines) {
    for (const ul of panel.userLines) {
      dxf += dxfLine(ul.x1, ul.y1, ul.x2, ul.y2, "USERLINES", ul.lineType === "hidden" ? "DASHED" : undefined);
    }
  }

  // ── Connections ──
  for (const conn of panel.connections) {
    dxf += writeConnection(conn, "CONNECTIONS");
  }

  // ── Panel centroid ──
  if (panel.centroidX != null && panel.centroidY != null) {
    dxf += writeCentroid(panel.centroidX, panel.centroidY, "CENTROID");
  }

  dxf += entitiesFooter();
  dxf += eof();

  // Trigger download
  const blob = new Blob([dxf], { type: "application/dxf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${panel.name || "panel"}.dxf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
