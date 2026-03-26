
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { ProjectData, Panel, ConnectionNode, DimensionAnnotation, UserDrawnLine, LoadAnnotation } from "./types";
import { calculateLoadCombinations } from "./calculations";

const MARGIN = 20;
const PAGE_W = 612;
const PAGE_H = 792;
const CONTENT_W = PAGE_W - 2 * MARGIN;

const COLORS = {
  primary: [0, 45, 114] as [number, number, number],    // Wells Blue #002D72
  accent: [0, 112, 189] as [number, number, number],    // Vibrant Blue #0070BD
  lightGray: [245, 245, 245] as [number, number, number],
  medGray: [200, 200, 200] as [number, number, number],
  text: [40, 40, 40] as [number, number, number],
  muted: [120, 120, 120] as [number, number, number],
  success: [34, 139, 34] as [number, number, number],
  warning: [200, 150, 0] as [number, number, number],
  danger: [200, 30, 30] as [number, number, number],
};

function drawHeader(doc: jsPDF, project: ProjectData) {
  doc.setFillColor(...COLORS.primary);
  doc.rect(0, 0, PAGE_W, 40, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("WELLS Connection Loading", MARGIN, 18);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  const stdLabel = project.info.designStandard === "ASCE7-22" ? "ASCE 7-22" : "ASCE 7-16";
  const methodLabel = project.info.designMethod === "ASD" ? "ASD" : "LRFD";
  doc.text(`${methodLabel} Analysis Report  |  ${stdLabel}`, MARGIN, 30);

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text(`${project.info.jobNumber}  -  ${project.info.jobName}`, PAGE_W - MARGIN, 18, { align: "right" });
  doc.text(project.info.date || new Date().toLocaleDateString(), PAGE_W - MARGIN, 30, { align: "right" });
}

function drawFooter(doc: jsPDF, pageNum: number, totalPages: number) {
  doc.setDrawColor(...COLORS.medGray);
  doc.line(MARGIN, PAGE_H - 30, PAGE_W - MARGIN, PAGE_H - 30);
  doc.setFontSize(7);
  doc.setTextColor(...COLORS.muted);
  doc.text("WELLS Connection Loading  |  Precast Concrete Cladding Connection Analysis", MARGIN, PAGE_H - 20);
  doc.text(`Page ${pageNum} of ${totalPages}`, PAGE_W - MARGIN, PAGE_H - 20, { align: "right" });
}

function drawSectionTitle(doc: jsPDF, title: string, y: number): number {
  doc.setFillColor(...COLORS.primary);
  doc.rect(MARGIN, y, CONTENT_W, 18, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text(title, MARGIN + 6, y + 12);
  return y + 24;
}

function drawKeyValue(doc: jsPDF, key: string, value: string, x: number, y: number, keyWidth = 100): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.muted);
  doc.text(key, x, y);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...COLORS.text);
  doc.text(value || "—", x + keyWidth, y);
  return y + 14;
}

function generateProjectDataSheet(doc: jsPDF, project: ProjectData) {
  drawHeader(doc, project);

  let y = 60;

  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...COLORS.primary);
  doc.text("Project Data Sheet", MARGIN, y);
  y += 30;

  y = drawSectionTitle(doc, "PROJECT INFORMATION", y);
  y += 4;
  y = drawKeyValue(doc, "Job Name:", project.info.jobName, MARGIN + 6, y);
  y = drawKeyValue(doc, "Job Number:", project.info.jobNumber, MARGIN + 6, y);
  y = drawKeyValue(doc, "Engineer:", project.info.engineer, MARGIN + 6, y);
  y = drawKeyValue(doc, "Location:", project.info.location, MARGIN + 6, y);
  y = drawKeyValue(doc, "Date:", project.info.date || new Date().toLocaleDateString(), MARGIN + 6, y);
  y += 10;

  y = drawSectionTitle(doc, "PROJECT SUMMARY", y);
  y += 4;
  y = drawKeyValue(doc, "Total Panels:", String(project.panels.length), MARGIN + 6, y);
  const totalConnections = project.panels.reduce((sum, p) => sum + p.connections.length, 0);
  y = drawKeyValue(doc, "Total Connections:", String(totalConnections), MARGIN + 6, y);
  y = drawKeyValue(doc, "Capacity Types:", String(project.capacities.length), MARGIN + 6, y);
  y += 10;

  y = drawSectionTitle(doc, "PANEL INDEX", y);
  y += 2;

  if (project.panels.length > 0) {
    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      head: [["Panel", "Size (W x H x T)", "Connections", "Description"]],
      body: project.panels.map(p => [
        p.name,
        `${p.width}" × ${p.height}" × ${p.thickness}"`,
        String(p.connections.length),
        p.description || "—",
      ]),
      styles: { fontSize: 8, cellPadding: 4, textColor: COLORS.text },
      headStyles: { fillColor: COLORS.accent, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8 },
      alternateRowStyles: { fillColor: COLORS.lightGray },
    });
  } else {
    doc.setFontSize(9);
    doc.setTextColor(...COLORS.muted);
    doc.text("No panels defined.", MARGIN + 6, y + 14);
  }

  y = drawSectionTitle(doc, "DESIGN BASIS", (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 16 : y + 30);
  y += 4;
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...COLORS.text);
  const dbStdLabel = project.info.designStandard === "ASCE7-22" ? "ASCE 7-22" : "ASCE 7-16";
  const dbSectionRef = project.info.designMethod === "ASD" ? "Section 2.4" : "Section 2.3";
  const dbMethodName = project.info.designMethod === "ASD"
    ? "ASD (Allowable Stress Design)"
    : "LRFD (Load and Resistance Factor Design)";
  const designBasis = [
    `Design Standard: ${dbStdLabel} (Minimum Design Loads and Associated Criteria)`,
    `Design Method: ${dbMethodName}`,
    "",
    `Load Combinations per ${dbStdLabel} ${dbSectionRef}:`,
  ];
  const combos = project.info.designMethod === "ASD"
    ? [
        "  1.  D",
        "  2.  D + L",
        "  3.  D + 0.75L + 0.75(0.6W)",
        "  4.  D + 0.6W",
        "  5.  0.6D + 0.6W",
        "  6.  D + 0.7E",
        "  7.  D + 0.75L + 0.75(0.7E)",
        "  8.  0.6D + 0.7E",
      ]
    : [
        "  1.  1.4D",
        "  2.  1.2D + 1.6L",
        "  3.  1.2D + 1.0W + 1.0L",
        "  4.  0.9D + 1.0W",
        "  5.  1.2D + 1.0E + 1.0L",
        "  6.  0.9D + 1.0E",
      ];
  [...designBasis, ...combos].forEach(line => {
    doc.text(line, MARGIN + 6, y);
    y += 10;
  });
}

function drawPolygon(doc: jsPDF, points: number[][], style: "F" | "S" | "FD" = "FD") {
  if (points.length < 3) return;
  const deltas: Array<[number, number]> = [];
  for (let i = 1; i < points.length; i++) {
    deltas.push([points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]]);
  }
  deltas.push([points[0][0] - points[points.length - 1][0], points[0][1] - points[points.length - 1][1]]);
  doc.lines(deltas, points[0][0], points[0][1], [1, 1], style, true);
}


function drawDimensionsOnPdf(
  doc: jsPDF,
  dimensions: DimensionAnnotation[],
  ox: number, oy: number,
  minX: number, minY: number,
  pw: number, ph: number,
  pdfScale: number
) {
  if (!dimensions || dimensions.length === 0) return;

  dimensions.forEach(dim => {
    const sx = ox + (dim.startX - minX) * pdfScale;
    const sy = oy + (ph - (dim.startY - minY)) * pdfScale;
    const ex = ox + (dim.endX - minX) * pdfScale;
    const ey = oy + (ph - (dim.endY - minY)) * pdfScale;

    const dxLine = ex - sx;
    const dyLine = ey - sy;
    const len = Math.sqrt(dxLine * dxLine + dyLine * dyLine) || 1;
    const nx = -dyLine / len;
    const ny = dxLine / len;

    // Scale offset proportionally (the offset is in screen pixels, convert to PDF points)
    const off = dim.offset * pdfScale / 3;

    const d1x = sx + nx * off;
    const d1y = sy + ny * off;
    const d2x = ex + nx * off;
    const d2y = ey + ny * off;

    const ext = off > 0 ? 2 : -2;

    doc.setDrawColor(3, 105, 161); // #0369a1
    doc.setLineWidth(0.3);

    // Extension lines
    doc.line(sx, sy, d1x + nx * ext, d1y + ny * ext);
    doc.line(ex, ey, d2x + nx * ext, d2y + ny * ext);

    // Dimension line
    doc.setLineWidth(0.5);
    doc.line(d1x, d1y, d2x, d2y);

    // Tick marks
    doc.setLineWidth(0.6);
    doc.line(d1x - nx * 2, d1y - ny * 2, d1x + nx * 2, d1y + ny * 2);
    doc.line(d2x - nx * 2, d2y - ny * 2, d2x + nx * 2, d2y + ny * 2);

    // Measurement text
    const distance = Math.sqrt((dim.endX - dim.startX) ** 2 + (dim.endY - dim.startY) ** 2);
    const textStr = `${distance.toFixed(2)}"`;
    const mx = (d1x + d2x) / 2;
    const my = (d1y + d2y) / 2;

    doc.setFontSize(5);
    doc.setTextColor(3, 105, 161);
    doc.text(textStr, mx, my - 1, { align: "center" });
  });
}

function drawUserLinesOnPdf(
  doc: jsPDF,
  userLines: UserDrawnLine[],
  ox: number, oy: number,
  minX: number, minY: number,
  pw: number, ph: number,
  pdfScale: number
) {
  if (!userLines || userLines.length === 0) return;

  userLines.forEach(line => {
    const sx = ox + (line.x1 - minX) * pdfScale;
    const sy = oy + (ph - (line.y1 - minY)) * pdfScale;
    const ex = ox + (line.x2 - minX) * pdfScale;
    const ey = oy + (ph - (line.y2 - minY)) * pdfScale;

    doc.setDrawColor(51, 65, 85); // slate-700
    doc.setLineWidth(0.5);

    if (line.lineType === "hidden") {
      // Dashed line for hidden lines
      const dx = ex - sx;
      const dy = ey - sy;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len < 0.1) return;
      const dashLen = 4;
      const gapLen = 2;
      const ux = dx / len;
      const uy = dy / len;
      let d = 0;
      while (d < len) {
        const segEnd = Math.min(d + dashLen, len);
        doc.line(
          sx + ux * d, sy + uy * d,
          sx + ux * segEnd, sy + uy * segEnd
        );
        d = segEnd + gapLen;
      }
    } else {
      doc.line(sx, sy, ex, ey);
    }
  });
}

function drawLoadAnnotationsOnPdf(
  doc: jsPDF,
  annotations: LoadAnnotation[],
  ox: number, oy: number,
  minX: number, minY: number,
  pw: number, ph: number,
  pdfScale: number
) {
  if (!annotations || annotations.length === 0) return;

  const loadColor: [number, number, number] = [185, 28, 28]; // red-700

  annotations.forEach(ann => {
    doc.setDrawColor(...loadColor);
    doc.setFillColor(...loadColor);
    doc.setTextColor(...loadColor);

    if (ann.type === "line_load") {
      const sx = ox + (ann.startX - minX) * pdfScale;
      const sy = oy + (ph - (ann.startY - minY)) * pdfScale;
      const ex = ox + (ann.endX - minX) * pdfScale;
      const ey = oy + (ph - (ann.endY - minY)) * pdfScale;

      // Arrows along the line
      const dx = ex - sx;
      const dy = ey - sy;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const ux = dx / len;
      const uy = dy / len;

      // Arrow direction based on ann.direction
      let ax: number, ay: number;
      const lineDir = ann.direction || "positive";
      if (lineDir === "up") {
        ax = 0; ay = -1;
      } else if (lineDir === "down") {
        ax = 0; ay = 1;
      } else if (lineDir === "left") {
        ax = -1; ay = 0;
      } else if (lineDir === "right") {
        ax = 1; ay = 0;
      } else if (lineDir === "negative") {
        ax = -0.7; ay = 0.7;
      } else {
        // Positive = toward panel face (+Z)
        ax = 0.7; ay = -0.7;
      }

      const arrowLen = 6;
      const arrowCount = Math.max(2, Math.floor(len / 12));

      // Connecting line along the tail ends
      const t0bx = sx + ax * arrowLen;
      const t0by = sy + ay * arrowLen;
      const tNbx = ex + ax * arrowLen;
      const tNby = ey + ay * arrowLen;
      doc.setLineWidth(0.3);
      doc.line(t0bx, t0by, tNbx, tNby);

      // Arrows: shaft from tail to base, arrowhead at base (touching applied line)
      for (let i = 0; i <= arrowCount; i++) {
        const t = arrowCount === 0 ? 0.5 : i / arrowCount;
        const bx = sx + dx * t;
        const by = sy + dy * t;
        const tx = bx + ax * arrowLen;
        const ty = by + ay * arrowLen;
        doc.line(tx, ty, bx, by);
        // Arrowhead at base
        doc.line(bx + (ax * 1.5 + ux * 1.5), by + (ay * 1.5 + uy * 1.5), bx, by);
        doc.line(bx + (ax * 1.5 - ux * 1.5), by + (ay * 1.5 - uy * 1.5), bx, by);
      }

      if (ann.label) {
        const mx = (sx + ex) / 2 + ax * (arrowLen + 4);
        const my = (sy + ey) / 2 + ay * (arrowLen + 4);
        doc.setFontSize(5);
        doc.text(ann.label, mx, my);
      }
      return;
    }

    // Point loads
    const px = ox + (ann.startX - minX) * pdfScale;
    const py = oy + (ph - (ann.startY - minY)) * pdfScale;
    const arrowSize = 8;

    if (ann.type === "point_vertical") {
      const dir = ann.direction === "up" ? -1 : 1;
      doc.setLineWidth(0.5);
      doc.line(px, py, px, py + arrowSize * dir);
      doc.line(px - 2, py + arrowSize * dir - 3 * dir, px, py + arrowSize * dir);
      doc.line(px + 2, py + arrowSize * dir - 3 * dir, px, py + arrowSize * dir);
      if (ann.label) {
        doc.setFontSize(5);
        doc.text(ann.label, px + 3, py + (dir > 0 ? 2 : -2));
      }
    } else if (ann.type === "point_horizontal") {
      const dir = ann.direction === "left" ? -1 : 1;
      doc.setLineWidth(0.5);
      doc.line(px, py, px + arrowSize * dir, py);
      doc.line(px + arrowSize * dir - 3 * dir, py - 2, px + arrowSize * dir, py);
      doc.line(px + arrowSize * dir - 3 * dir, py + 2, px + arrowSize * dir, py);
      if (ann.label) {
        doc.setFontSize(5);
        doc.text(ann.label, px + (dir > 0 ? arrowSize + 2 : -arrowSize - 8), py - 2);
      }
    } else if (ann.type === "point_out_of_plane") {
      // Foreshortened arrow at ~45deg angle representing Z axis
      const zx = 0.7, zy = -0.7;
      // Positive = toward panel face (+Z), Negative = away from panel (-Z)
      const sign = ann.direction === "negative" ? -1 : 1;
      const tipX = px + sign * arrowSize * zx;
      const tipY = py + sign * arrowSize * zy;
      doc.setLineWidth(0.5);
      doc.line(px, py, tipX, tipY);
      // Arrowhead
      doc.line(tipX, tipY, tipX - sign * (zx * 3 + zy * 1.5), tipY - sign * (zy * 3 - zx * 1.5));
      doc.line(tipX, tipY, tipX - sign * (zx * 3 - zy * 1.5), tipY - sign * (zy * 3 + zx * 1.5));
      if (ann.label) {
        doc.setFontSize(5);
        doc.text(ann.label, tipX + 3, tipY - 2);
      }
    }
  });
}

function drawPanelGeometry(doc: jsPDF, panel: Panel, x: number, y: number, maxW: number, maxH: number) {
  const hasDxfViews = panel.dxfViews && panel.dxfViews.length > 0;

  if (hasDxfViews) {
    const views = panel.dxfViews!;
    const allXs = views.flatMap(v => v.polygon.map(p => p.x));
    const allYs = views.flatMap(v => v.polygon.map(p => p.y));
    // Include sketch line bounds so LINE entities aren't clipped
    if (panel.sketchLines) {
      panel.sketchLines.forEach(l => {
        allXs.push(l.x1, l.x2);
        allYs.push(l.y1, l.y2);
      });
    }
    const minX = Math.min(...allXs);
    const maxXp = Math.max(...allXs);
    const minY = Math.min(...allYs);
    const maxYp = Math.max(...allYs);
    const pw = maxXp - minX || 1;
    const ph = maxYp - minY || 1;
    const scale = Math.min((maxW - 20) / pw, (maxH - 20) / ph);
    const ox = x + (maxW - pw * scale) / 2;
    const oy = y + (maxH - ph * scale) / 2;

    const fillColors: [number, number, number][] = [
      [219, 234, 254], [220, 252, 231], [254, 249, 195], [243, 232, 255],
    ];
    const strokeColors: [number, number, number][] = [
      [30, 64, 175], [21, 128, 61], [133, 77, 14], [109, 40, 217],
    ];

    views.forEach((view, viewIdx) => {
      const fc = fillColors[viewIdx % fillColors.length];
      const sc = strokeColors[viewIdx % strokeColors.length];
      const pts = view.polygon.map(v => [
        ox + (v.x - minX) * scale,
        oy + (ph - (v.y - minY)) * scale,
      ]);
      if (pts.length > 2) {
        doc.setFillColor(...fc);
        doc.setDrawColor(...sc);
        doc.setLineWidth(0.8);
        drawPolygon(doc, pts, "FD");
      }
      view.openings.forEach(opening => {
        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(...sc);
        doc.setLineWidth(0.5);
        if (opening.type === "polygon" && opening.vertices) {
          const verts = opening.vertices.map(v => [
            ox + (v.x - minX) * scale,
            oy + (ph - (v.y - minY)) * scale,
          ]);
          if (verts.length > 2) drawPolygon(doc, verts, "FD");
        } else if (opening.type === "rect") {
          const rx = ox + (opening.x - minX) * scale;
          const ry = oy + (ph - (opening.y + opening.height - minY)) * scale;
          doc.rect(rx, ry, opening.width * scale, opening.height * scale, "FD");
        } else if (opening.type === "circle") {
          const cx = ox + (opening.x + opening.width / 2 - minX) * scale;
          const cy = oy + (ph - (opening.y + opening.height / 2 - minY)) * scale;
          doc.circle(cx, cy, (opening.width / 2) * scale, "FD");
        }
      });
      if (view.showCentroid) {
        const avgX = view.polygon.reduce((s, v) => s + v.x, 0) / view.polygon.length;
        const avgY = view.polygon.reduce((s, v) => s + v.y, 0) / view.polygon.length;
        const cgx = ox + (avgX - minX) * scale;
        const cgy = oy + (ph - (avgY - minY)) * scale;
        doc.setDrawColor(...sc);
        doc.setLineWidth(0.5);
        doc.line(cgx - 4, cgy, cgx + 4, cgy);
        doc.line(cgx, cgy - 4, cgx, cgy + 4);
        doc.circle(cgx, cgy, 3, "S");
      }
      doc.setFontSize(6);
      doc.setTextColor(...sc);
      const bbox = pts.reduce((b, p) => ({ minX: Math.min(b.minX, p[0]), maxX: Math.max(b.maxX, p[0]), minY: Math.min(b.minY, p[1]), maxY: Math.max(b.maxY, p[1]) }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
      doc.text(view.name, (bbox.minX + bbox.maxX) / 2, bbox.minY - 2, { align: "center" });
    });

    panel.connections.forEach(conn => {
      const cx = ox + (conn.x - minX) * scale;
      const cy = oy + (ph - (conn.y - minY)) * scale;
      doc.setFillColor(...COLORS.accent);
      switch (conn.marker) {
        case "triangle-down": {
          const s = 4;
          doc.triangle(cx - s, cy - s, cx + s, cy - s, cx, cy + s, "F");
          break;
        }
        case "square":
          doc.rect(cx - 3, cy - 3, 6, 6, "F");
          break;
        case "diamond": {
          const s = 4;
          drawPolygon(doc, [[cx, cy - s], [cx + s, cy], [cx, cy + s], [cx - s, cy]], "F");
          break;
        }
        default:
          doc.circle(cx, cy, 3, "F");
      }
      doc.setFontSize(6);
      doc.setTextColor(...COLORS.accent);
      doc.text(conn.label, cx + 5, cy - 2);
    });

    // Render sketch lines (LINE entities) as display-only line segments
    if (panel.sketchLines && panel.sketchLines.length > 0) {
      doc.setDrawColor(71, 85, 105); // slate-600
      doc.setLineWidth(0.5);
      panel.sketchLines.forEach(l => {
        const sx1 = ox + (l.x1 - minX) * scale;
        const sy1 = oy + (ph - (l.y1 - minY)) * scale;
        const sx2 = ox + (l.x2 - minX) * scale;
        const sy2 = oy + (ph - (l.y2 - minY)) * scale;
        doc.line(sx1, sy1, sx2, sy2);
      });
    }

    if (panel.dimensions && panel.dimensions.length > 0) {
      drawDimensionsOnPdf(doc, panel.dimensions, ox, oy, minX, minY, pw, ph, scale);
    }
    drawUserLinesOnPdf(doc, panel.userLines || [], ox, oy, minX, minY, pw, ph, scale);
    drawLoadAnnotationsOnPdf(doc, panel.loadAnnotations || [], ox, oy, minX, minY, pw, ph, scale);
    return;
  }

  if (panel.perimeter.length < 2) {
    doc.setFontSize(8);
    doc.setTextColor(...COLORS.muted);
    doc.text("No geometry defined (rectangle template)", x + maxW / 2, y + maxH / 2, { align: "center" });

    const pw = panel.width;
    const ph = panel.height;
    const scale = Math.min((maxW - 20) / pw, (maxH - 20) / ph);
    const ox = x + (maxW - pw * scale) / 2;
    const oy = y + (maxH - ph * scale) / 2;

    doc.setDrawColor(...COLORS.primary);
    doc.setLineWidth(1);
    doc.rect(ox, oy, pw * scale, ph * scale);

    panel.connections.forEach(conn => {
      const cx = ox + conn.x * scale;
      const cy = oy + (ph - conn.y) * scale;
      doc.setFillColor(...COLORS.accent);
      doc.circle(cx, cy, 3, "F");
      doc.setFontSize(6);
      doc.setTextColor(...COLORS.accent);
      doc.text(conn.label, cx + 5, cy - 2);
    });

    if (panel.dimensions && panel.dimensions.length > 0) {
      drawDimensionsOnPdf(doc, panel.dimensions, ox, oy, 0, 0, pw, ph, scale);
    }
    drawUserLinesOnPdf(doc, panel.userLines || [], ox, oy, 0, 0, pw, ph, scale);
    drawLoadAnnotationsOnPdf(doc, panel.loadAnnotations || [], ox, oy, 0, 0, pw, ph, scale);
    return;
  }

  const xs = panel.perimeter.map(v => v.x);
  const ys = panel.perimeter.map(v => v.y);
  const minX = Math.min(...xs);
  const maxXp = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxYp = Math.max(...ys);
  const pw = maxXp - minX || 1;
  const ph = maxYp - minY || 1;

  const scale = Math.min((maxW - 20) / pw, (maxH - 20) / ph);
  const ox = x + (maxW - pw * scale) / 2;
  const oy = y + (maxH - ph * scale) / 2;

  doc.setDrawColor(...COLORS.primary);
  doc.setFillColor(240, 245, 250);
  doc.setLineWidth(0.8);

  const points = panel.perimeter.map(v => [
    ox + (v.x - minX) * scale,
    oy + (ph - (v.y - minY)) * scale,
  ]);

  if (points.length > 2) {
    doc.setFillColor(240, 245, 250);
    drawPolygon(doc, points, "FD");
  }

  panel.openings.forEach(opening => {
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(...COLORS.muted);
    doc.setLineWidth(0.5);
    if (opening.type === "rect") {
      const rx = ox + (opening.x - minX) * scale;
      const ry = oy + (ph - (opening.y + opening.height - minY)) * scale;
      doc.rect(rx, ry, opening.width * scale, opening.height * scale, "FD");
    } else if (opening.type === "circle") {
      const cx = ox + (opening.x - minX) * scale;
      const cy = oy + (ph - (opening.y - minY)) * scale;
      doc.circle(cx, cy, (opening.width / 2) * scale, "FD");
    } else if (opening.type === "polygon" && opening.vertices) {
      const verts = opening.vertices.map(v => [
        ox + (v.x - minX) * scale,
        oy + (ph - (v.y - minY)) * scale,
      ]);
      if (verts.length > 2) {
        drawPolygon(doc, verts, "FD");
      }
    }
  });

  panel.connections.forEach(conn => {
    const cx = ox + (conn.x - minX) * scale;
    const cy = oy + (ph - (conn.y - minY)) * scale;
    doc.setFillColor(...COLORS.accent);

    switch (conn.marker) {
      case "triangle-down": {
        const s = 4;
        doc.triangle(cx - s, cy - s, cx + s, cy - s, cx, cy + s, "F");
        break;
      }
      case "square":
        doc.rect(cx - 3, cy - 3, 6, 6, "F");
        break;
      case "diamond": {
        const s = 4;
        const diamondPts = [[cx, cy - s], [cx + s, cy], [cx, cy + s], [cx - s, cy]];
        drawPolygon(doc, diamondPts, "F");
        break;
      }
      default:
        doc.circle(cx, cy, 3, "F");
    }

    doc.setFontSize(6);
    doc.setTextColor(...COLORS.accent);
    doc.text(conn.label, cx + 5, cy - 2);
  });

  if (panel.centroidX !== undefined && panel.centroidY !== undefined) {
    const cgx = ox + (panel.centroidX - minX) * scale;
    const cgy = oy + (ph - (panel.centroidY - minY)) * scale;
    doc.setDrawColor(200, 50, 50);
    doc.setLineWidth(0.5);
    doc.line(cgx - 4, cgy, cgx + 4, cgy);
    doc.line(cgx, cgy - 4, cgx, cgy + 4);
    doc.circle(cgx, cgy, 3, "S");
  }

  if (panel.dimensions && panel.dimensions.length > 0) {
    drawDimensionsOnPdf(doc, panel.dimensions, ox, oy, minX, minY, pw, ph, scale);
  }
  drawUserLinesOnPdf(doc, panel.userLines || [], ox, oy, minX, minY, pw, ph, scale);
  drawLoadAnnotationsOnPdf(doc, panel.loadAnnotations || [], ox, oy, minX, minY, pw, ph, scale);
}

function generatePanelPage(doc: jsPDF, project: ProjectData, panel: Panel) {
  doc.addPage();
  drawHeader(doc, project);

  let y = 56;

  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...COLORS.primary);
  doc.text(`Panel: ${panel.name}`, MARGIN, y);
  if (panel.description) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...COLORS.muted);
    doc.text(panel.description, MARGIN, y + 14);
  }
  y += 28;

  y = drawSectionTitle(doc, "PANEL PROPERTIES", y);
  y += 4;

  const col1X = MARGIN + 6;
  const col2X = PAGE_W / 2 + 10;
  const savedY = y;

  y = drawKeyValue(doc, "Width:", `${panel.width}"`, col1X, y, 80);
  y = drawKeyValue(doc, "Height:", `${panel.height}"`, col1X, y, 80);
  y = drawKeyValue(doc, "Thickness:", `${panel.thickness}"`, col1X, y, 80);
  y = drawKeyValue(doc, "Panel Weight:", `${panel.panelWeight || 0} lbs`, col1X, y, 80);

  let y2 = savedY;
  y2 = drawKeyValue(doc, "Supported Wt:", `${panel.supportedElementsWeight || 0} lbs`, col2X, y2, 80);
  y2 = drawKeyValue(doc, "+Wind Press:", `${panel.positiveWindPressure || 0} psf`, col2X, y2, 80);
  y2 = drawKeyValue(doc, "-Wind Press:", `${panel.negativeWindPressure || 0} psf`, col2X, y2, 80);
  y2 = drawKeyValue(doc, "Seismic Fp:", `${panel.seismicForceFp || 0} lbs`, col2X, y2, 80);

  y = Math.max(y, y2) + 6;

  y = drawSectionTitle(doc, "PANEL GEOMETRY & CONNECTIONS", y);
  y += 4;

  const geomH = 180;
  doc.setDrawColor(...COLORS.medGray);
  doc.setLineWidth(0.3);
  doc.rect(MARGIN, y, CONTENT_W, geomH);
  drawPanelGeometry(doc, panel, MARGIN, y, CONTENT_W, geomH);
  y += geomH + 10;

  if (panel.connections.length > 0) {
    y = drawSectionTitle(doc, "CONNECTION FORCES", y);
    y += 2;

    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      head: [["Conn.", "Type", "Marker", "X", "Y", "Dx", "Dy", "Dz", "Lx", "Ly", "Lz", "Wx", "Wy", "Wz", "Ex", "Ey", "Ez"]],
      body: panel.connections.map(c => {
        const D = c.forces.D || { x: 0, y: 0, z: 0 };
        const L = c.forces.L || { x: 0, y: 0, z: 0 };
        const W = c.forces.W || { x: 0, y: 0, z: 0 };
        const E = c.forces.E || { x: 0, y: 0, z: 0 };
        const markerLabels: Record<string, string> = {
          "triangle-down": "Bearing",
          "circle": "Tieback",
          "square": "Lateral",
          "diamond": "P-to-P",
        };
        return [
          c.label,
          c.type,
          markerLabels[c.marker] || c.marker,
          c.x.toFixed(1),
          c.y.toFixed(1),
          String(D.x), String(D.y), String(D.z),
          String(L.x), String(L.y), String(L.z),
          String(W.x), String(W.y), String(W.z),
          String(E.x), String(E.y), String(E.z),
        ];
      }),
      styles: { fontSize: 6, cellPadding: 2, textColor: COLORS.text, halign: "center" },
      headStyles: { fillColor: COLORS.accent, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 6 },
      alternateRowStyles: { fillColor: COLORS.lightGray },
      columnStyles: {
        0: { halign: "left", fontStyle: "bold" },
      },
    });

    const forceTableEnd = (doc as any).lastAutoTable?.finalY || y + 50;
    y = forceTableEnd + 10;

    if (y > PAGE_H - 120) {
      doc.addPage();
      drawHeader(doc, project);
      y = 56;
    }

    y = drawSectionTitle(doc, `${project.info.designMethod === "ASD" ? "ASD" : "LRFD"} LOAD COMBINATIONS`, y);
    y += 2;

    const comboRows: string[][] = [];
    panel.connections.forEach(conn => {
      const capacity = project.capacities.find(c => c.type === conn.type);
      const combos = calculateLoadCombinations(conn, capacity, project.info.designMethod, project.info.designStandard);
      combos.forEach(combo => {
        comboRows.push([
          conn.label,
          combo.comboName,
          String(combo.fx),
          String(combo.fy),
          String(combo.fz),
          combo.maxUtilization !== undefined ? `${(combo.maxUtilization * 100).toFixed(1)}%` : "N/A",
        ]);
      });
    });

    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      head: [["Conn.", "Load Combination", "Fx (lbs)", "Fy (lbs)", "Fz (lbs)", "Util."]],
      body: comboRows,
      styles: { fontSize: 7, cellPadding: 3, textColor: COLORS.text },
      headStyles: { fillColor: COLORS.accent, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 7 },
      alternateRowStyles: { fillColor: COLORS.lightGray },
      columnStyles: {
        0: { fontStyle: "bold" },
        2: { halign: "right" },
        3: { halign: "right" },
        4: { halign: "right" },
        5: { halign: "right" },
      },
      didParseCell: (data: any) => {
        if (data.column.index === 5 && data.section === "body") {
          const val = parseFloat(data.cell.raw);
          if (!isNaN(val)) {
            if (val > 100) data.cell.styles.textColor = COLORS.danger;
            else if (val > 90) data.cell.styles.textColor = COLORS.warning;
            else data.cell.styles.textColor = COLORS.success;
            data.cell.styles.fontStyle = "bold";
          }
        }
      },
    });
  } else {
    doc.setFontSize(9);
    doc.setTextColor(...COLORS.muted);
    doc.text("No connections defined for this panel.", MARGIN + 6, y + 14);
  }
}

function generateMasterSpreadsheet(doc: jsPDF, project: ProjectData) {
  doc.addPage();
  drawHeader(doc, project);

  let y = 56;
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...COLORS.primary);
  doc.text("Master Connection Schedule", MARGIN, y);
  y += 20;

  const allData = project.panels.flatMap(panel =>
    panel.connections.map(conn => {
      const capacity = project.capacities.find(c => c.type === conn.type);
      const loads = calculateLoadCombinations(conn, capacity, project.info.designMethod, project.info.designStandard);
      const governing = loads.reduce((prev, current) =>
        (current.maxUtilization || 0) > (prev.maxUtilization || 0) ? current : prev
      , loads[0]);
      return {
        panelName: panel.name,
        connLabel: conn.label,
        connType: conn.type,
        combo: governing?.comboName || "—",
        fx: governing?.fx || 0,
        fy: governing?.fy || 0,
        fz: governing?.fz || 0,
        utilization: governing?.maxUtilization,
      };
    })
  );

  if (allData.length > 0) {
    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      head: [["Panel", "Connection", "Type", "Governing Combo", "Fx (lbs)", "Fy (lbs)", "Fz (lbs)", "Utilization"]],
      body: allData.map(row => [
        row.panelName,
        row.connLabel,
        row.connType,
        row.combo,
        String(row.fx),
        String(row.fy),
        String(row.fz),
        row.utilization !== undefined ? `${(row.utilization * 100).toFixed(1)}%` : "N/A",
      ]),
      styles: { fontSize: 8, cellPadding: 4, textColor: COLORS.text },
      headStyles: { fillColor: COLORS.accent, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8 },
      alternateRowStyles: { fillColor: COLORS.lightGray },
      columnStyles: {
        0: { fontStyle: "bold" },
        4: { halign: "right" },
        5: { halign: "right" },
        6: { halign: "right" },
        7: { halign: "right" },
      },
      didParseCell: (data: any) => {
        if (data.column.index === 7 && data.section === "body") {
          const val = parseFloat(data.cell.raw);
          if (!isNaN(val)) {
            if (val > 100) data.cell.styles.textColor = COLORS.danger;
            else if (val > 90) data.cell.styles.textColor = COLORS.warning;
            else data.cell.styles.textColor = COLORS.success;
            data.cell.styles.fontStyle = "bold";
          }
        }
      },
    });
  } else {
    doc.setFontSize(9);
    doc.setTextColor(...COLORS.muted);
    doc.text("No connections found in project.", MARGIN + 6, y + 14);
  }
}

function generateCapacityTable(doc: jsPDF, project: ProjectData) {
  doc.addPage();
  drawHeader(doc, project);

  let y = 56;
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...COLORS.primary);
  doc.text("Connection Capacity Table", MARGIN, y);
  y += 6;
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...COLORS.muted);
  doc.text(`Allowable ${project.info.designMethod === "ASD" ? "service" : "factored"} resistance per connection type (${project.info.designMethod} basis)`, MARGIN, y + 10);
  y += 24;

  if (project.capacities.length > 0) {
    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      head: [["Connection Type", "Capacity X (lbs)", "Capacity Y (lbs)", "Capacity Z (lbs)"]],
      body: project.capacities.map(c => [
        `Type ${c.type}`,
        c.capacityX.toLocaleString(),
        c.capacityY.toLocaleString(),
        c.capacityZ.toLocaleString(),
      ]),
      styles: { fontSize: 9, cellPadding: 6, textColor: COLORS.text },
      headStyles: { fillColor: COLORS.accent, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 9 },
      alternateRowStyles: { fillColor: COLORS.lightGray },
      columnStyles: {
        0: { fontStyle: "bold" },
        1: { halign: "right" },
        2: { halign: "right" },
        3: { halign: "right" },
      },
    });

    const tableEnd = (doc as any).lastAutoTable?.finalY || y + 60;
    y = tableEnd + 20;

    y = drawSectionTitle(doc, "CAPACITY USAGE SUMMARY", y);
    y += 6;

    project.capacities.forEach(cap => {
      const connectionsOfType = project.panels.flatMap(p =>
        p.connections.filter(c => c.type === cap.type)
      );
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...COLORS.text);
      doc.text(`Type ${cap.type}: ${connectionsOfType.length} connection(s)`, MARGIN + 6, y);
      y += 14;
    });
  } else {
    doc.setFontSize(9);
    doc.setTextColor(...COLORS.muted);
    doc.text("No capacity types defined.", MARGIN + 6, y + 14);
  }
}

export function exportProjectToPDF(project: ProjectData) {
  const doc = new jsPDF({ unit: "pt", format: "letter" });

  generateProjectDataSheet(doc, project);

  project.panels.forEach(panel => {
    generatePanelPage(doc, project, panel);
  });

  generateMasterSpreadsheet(doc, project);
  generateCapacityTable(doc, project);

  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    drawFooter(doc, i, totalPages);
  }

  const filename = `${project.info.jobNumber || "project"}_${project.info.jobName || "report"}_${project.info.designMethod}.pdf`.replace(/\s+/g, "_");
  doc.save(filename);
}
