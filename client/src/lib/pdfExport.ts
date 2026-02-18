
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { ProjectData, Panel, ConnectionNode, Solid3DData, Point3D, Face3D } from "./types";
import { calculateLoadCombinations } from "./calculations";

const MARGIN = 20;
const PAGE_W = 612;
const PAGE_H = 792;
const CONTENT_W = PAGE_W - 2 * MARGIN;

const COLORS = {
  primary: [30, 58, 95] as [number, number, number],
  accent: [0, 100, 180] as [number, number, number],
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
  doc.text("PrecastPro Designer", MARGIN, 18);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text("LRFD Analysis Report  |  ASCE 7-16", MARGIN, 30);

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text(`${project.info.jobNumber}  -  ${project.info.jobName}`, PAGE_W - MARGIN, 18, { align: "right" });
  doc.text(project.info.date || "", PAGE_W - MARGIN, 30, { align: "right" });
}

function drawFooter(doc: jsPDF, pageNum: number, totalPages: number) {
  doc.setDrawColor(...COLORS.medGray);
  doc.line(MARGIN, PAGE_H - 30, PAGE_W - MARGIN, PAGE_H - 30);
  doc.setFontSize(7);
  doc.setTextColor(...COLORS.muted);
  doc.text("PrecastPro Designer  |  Precast Concrete Cladding Connection Analysis", MARGIN, PAGE_H - 20);
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
  y = drawKeyValue(doc, "Date:", project.info.date, MARGIN + 6, y);
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
  const designBasis = [
    "Design Code: ASCE 7-16 (Minimum Design Loads and Associated Criteria)",
    "Design Method: LRFD (Load and Resistance Factor Design)",
    "Reference: PCI Design Handbook, 9th Edition",
    "",
    "Load Combinations per ASCE 7-16 Section 2.3.1:",
    "  1.  1.4D",
    "  2.  1.2D + 1.6L",
    "  3.  1.2D + 1.0W + 1.0L",
    "  4.  0.9D + 1.0W",
    "  5.  1.2D + 1.0E + 1.0L",
    "  6.  0.9D + 1.0E",
  ];
  designBasis.forEach(line => {
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

function projectIsometric(p: Point3D, cx: number, cy: number, cz: number): { x: number; y: number; depth: number } {
  const rx = p.x - cx;
  const ry = p.y - cy;
  const rz = p.z - cz;
  const angle = Math.PI / 6;
  const px = (rx - rz) * Math.cos(angle);
  const py = -ry + (rx + rz) * Math.sin(angle);
  return { x: px, y: py, depth: rx + ry + rz };
}

function faceNormalZ(verts: Point3D[], cx: number, cy: number, cz: number): number {
  if (verts.length < 3) return 0;
  const p0 = projectIsometric(verts[0], cx, cy, cz);
  const p1 = projectIsometric(verts[1], cx, cy, cz);
  const p2 = projectIsometric(verts[2], cx, cy, cz);
  return (p1.x - p0.x) * (p2.y - p0.y) - (p1.y - p0.y) * (p2.x - p0.x);
}

function face3DNormal(verts: Point3D[]): Point3D {
  if (verts.length < 3) return { x: 0, y: 0, z: 0 };
  const ax = verts[1].x - verts[0].x, ay = verts[1].y - verts[0].y, az = verts[1].z - verts[0].z;
  const bx = verts[2].x - verts[0].x, by = verts[2].y - verts[0].y, bz = verts[2].z - verts[0].z;
  return { x: ay * bz - az * by, y: az * bx - ax * bz, z: ax * by - ay * bx };
}

function drawIsometric3D(doc: jsPDF, solid3d: Solid3DData, x: number, y: number, maxW: number, maxH: number) {
  const { min, max } = solid3d.bounds;
  const cx = (min.x + max.x) / 2;
  const cy = (min.y + max.y) / 2;
  const cz = (min.z + max.z) / 2;

  let projMinX = Infinity, projMinY = Infinity, projMaxX = -Infinity, projMaxY = -Infinity;
  const allPoints: Point3D[] = [];
  solid3d.faces.forEach(f => f.vertices.forEach(v => allPoints.push(v)));

  for (const p of allPoints) {
    const proj = projectIsometric(p, cx, cy, cz);
    projMinX = Math.min(projMinX, proj.x);
    projMinY = Math.min(projMinY, proj.y);
    projMaxX = Math.max(projMaxX, proj.x);
    projMaxY = Math.max(projMaxY, proj.y);
  }

  const pw = projMaxX - projMinX || 1;
  const ph = projMaxY - projMinY || 1;
  const scale = Math.min((maxW - 30) / pw, (maxH - 30) / ph);
  const ox = x + (maxW - pw * scale) / 2 - projMinX * scale;
  const oy = y + (maxH - ph * scale) / 2 - projMinY * scale;

  const lightDir = { x: 0.3, y: -0.8, z: 0.5 };
  const lightLen = Math.sqrt(lightDir.x ** 2 + lightDir.y ** 2 + lightDir.z ** 2);
  lightDir.x /= lightLen; lightDir.y /= lightLen; lightDir.z /= lightLen;

  const ptKey3D = (p: Point3D) => `${p.x.toFixed(3)},${p.y.toFixed(3)},${p.z.toFixed(3)}`;
  const edgeKey3D = (a: Point3D, b: Point3D) => {
    const ka = ptKey3D(a), kb = ptKey3D(b);
    return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
  };

  const edgeFaceNormals = new Map<string, Point3D[]>();
  for (const face of solid3d.faces) {
    const norm = face3DNormal(face.vertices);
    const verts = face.vertices;
    for (let ei = 0; ei < verts.length; ei++) {
      const ek = edgeKey3D(verts[ei], verts[(ei + 1) % verts.length]);
      if (!edgeFaceNormals.has(ek)) edgeFaceNormals.set(ek, []);
      edgeFaceNormals.get(ek)!.push(norm);
    }
  }

  const creaseThreshold = Math.cos(30 * Math.PI / 180);
  const creaseEdges = new Set<string>();
  for (const [ek, normals] of Array.from(edgeFaceNormals.entries())) {
    if (normals.length === 1) {
      creaseEdges.add(ek);
    } else if (normals.length === 2) {
      const [n1, n2] = normals;
      const len1 = Math.sqrt(n1.x ** 2 + n1.y ** 2 + n1.z ** 2);
      const len2 = Math.sqrt(n2.x ** 2 + n2.y ** 2 + n2.z ** 2);
      if (len1 > 1e-10 && len2 > 1e-10) {
        const dot = (n1.x * n2.x + n1.y * n2.y + n1.z * n2.z) / (len1 * len2);
        if (dot < creaseThreshold) {
          creaseEdges.add(ek);
        }
      }
    }
  }

  type ProjectedFace = {
    projected: number[][];
    norm: Point3D;
    depth: number;
    screenNz: number;
  };
  const projectedFaces: ProjectedFace[] = [];

  for (const face of solid3d.faces) {
    const norm = face3DNormal(face.vertices);
    const projected = face.vertices.map(v => {
      const p = projectIsometric(v, cx, cy, cz);
      return [ox + p.x * scale, oy + p.y * scale];
    });

    if (projected.length < 3) continue;

    const screenNz = (projected[1][0] - projected[0][0]) * (projected[2][1] - projected[0][1])
                    - (projected[1][1] - projected[0][1]) * (projected[2][0] - projected[0][0]);

    const depth = face.vertices.reduce((s, v) => s + v.x + v.y + v.z, 0) / face.vertices.length;

    projectedFaces.push({ projected, norm, depth, screenNz });
  }

  projectedFaces.sort((a, b) => a.depth - b.depth);

  for (const face of projectedFaces) {
    if (face.screenNz <= 0) continue;

    const nLen = Math.sqrt(face.norm.x ** 2 + face.norm.y ** 2 + face.norm.z ** 2);
    if (nLen < 1e-10) continue;

    const ldot = (face.norm.x * lightDir.x + face.norm.y * lightDir.y + face.norm.z * lightDir.z) / nLen;
    const shade = 0.4 + 0.5 * Math.max(0, Math.min(1, ldot * 0.5 + 0.5));
    const r = Math.round(200 * shade);
    const g = Math.round(205 * shade);
    const b = Math.round(215 * shade);
    doc.setFillColor(r, g, b);
    drawPolygon(doc, face.projected, "F");
  }

  doc.setDrawColor(50, 60, 80);
  doc.setLineWidth(0.5);
  for (const face of solid3d.faces) {
    const verts = face.vertices;
    for (let ei = 0; ei < verts.length; ei++) {
      const a = verts[ei];
      const b = verts[(ei + 1) % verts.length];
      const ek = edgeKey3D(a, b);
      if (!creaseEdges.has(ek)) continue;
      const p1 = projectIsometric(a, cx, cy, cz);
      const p2 = projectIsometric(b, cx, cy, cz);
      doc.line(ox + p1.x * scale, oy + p1.y * scale, ox + p2.x * scale, oy + p2.y * scale);
    }
  }

  doc.setFontSize(7);
  doc.setTextColor(...COLORS.muted);
  doc.text("Isometric View", x + maxW / 2, y + maxH - 4, { align: "center" });
}

function drawPanelGeometry(doc: jsPDF, panel: Panel, x: number, y: number, maxW: number, maxH: number) {
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

  const has3D = panel.solid3d && panel.solid3d.faces.length > 0;

  if (has3D && panel.solid3d) {
    y = drawSectionTitle(doc, "3D ISOMETRIC VIEW", y);
    y += 4;
    const isoH = 200;
    doc.setDrawColor(...COLORS.medGray);
    doc.setLineWidth(0.3);
    doc.rect(MARGIN, y, CONTENT_W, isoH);
    drawIsometric3D(doc, panel.solid3d, MARGIN, y, CONTENT_W, isoH);
    y += isoH + 10;

    if (y > PAGE_H - 250) {
      doc.addPage();
      drawHeader(doc, project);
      y = 56;
    }
  }

  y = drawSectionTitle(doc, "PANEL GEOMETRY & CONNECTIONS", y);
  y += 4;

  const geomH = has3D ? 140 : 180;
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

    y = drawSectionTitle(doc, "LRFD LOAD COMBINATIONS", y);
    y += 2;

    const comboRows: string[][] = [];
    panel.connections.forEach(conn => {
      const capacity = project.capacities.find(c => c.type === conn.type);
      const combos = calculateLoadCombinations(conn, capacity);
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
      const loads = calculateLoadCombinations(conn, capacity);
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
  doc.text("Allowable factored resistance per connection type (LRFD basis)", MARGIN, y + 10);
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

  const filename = `${project.info.jobNumber || "project"}_${project.info.jobName || "report"}_LRFD.pdf`.replace(/\s+/g, "_");
  doc.save(filename);
}
