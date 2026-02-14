import React, { useRef, useEffect, useCallback } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Solid3DData } from "@/lib/types";

interface ThreeViewerProps {
  solid3d: Solid3DData;
  width?: number;
  height?: number;
  className?: string;
}

export default function ThreeViewer({ solid3d, width = 800, height = 600, className }: ThreeViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const animFrameRef = useRef<number>(0);

  const buildScene = useCallback(() => {
    if (!containerRef.current) return;

    if (rendererRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      rendererRef.current.dispose();
      controlsRef.current?.dispose();
      containerRef.current.innerHTML = "";
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf1f5f9);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100000);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.rotateSpeed = 0.8;
    controlsRef.current = controls;

    const { min, max } = solid3d.bounds;
    const cx = (min.x + max.x) / 2;
    const cy = (min.y + max.y) / 2;
    const cz = (min.z + max.z) / 2;
    const dx = max.x - min.x;
    const dy = max.y - min.y;
    const dz = max.z - min.z;
    const maxDim = Math.max(dx, dy, dz) || 100;

    controls.target.set(cx, cy, cz);
    camera.position.set(cx + maxDim * 1.2, cy + maxDim * 0.8, cz + maxDim * 1.2);
    camera.lookAt(cx, cy, cz);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight1.position.set(maxDim, maxDim * 2, maxDim);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.3);
    dirLight2.position.set(-maxDim, -maxDim, -maxDim * 0.5);
    scene.add(dirLight2);

    const geometry = new THREE.BufferGeometry();
    const vertices: number[] = [];
    const indices: number[] = [];
    let vertIndex = 0;

    for (const face of solid3d.faces) {
      const verts = face.vertices;
      if (verts.length === 3) {
        vertices.push(verts[0].x, verts[0].y, verts[0].z);
        vertices.push(verts[1].x, verts[1].y, verts[1].z);
        vertices.push(verts[2].x, verts[2].y, verts[2].z);
        indices.push(vertIndex, vertIndex + 1, vertIndex + 2);
        vertIndex += 3;
      } else if (verts.length === 4) {
        vertices.push(verts[0].x, verts[0].y, verts[0].z);
        vertices.push(verts[1].x, verts[1].y, verts[1].z);
        vertices.push(verts[2].x, verts[2].y, verts[2].z);
        vertices.push(verts[3].x, verts[3].y, verts[3].z);
        indices.push(vertIndex, vertIndex + 1, vertIndex + 2);
        indices.push(vertIndex, vertIndex + 2, vertIndex + 3);
        vertIndex += 4;
      }
    }

    geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    const material = new THREE.MeshPhongMaterial({
      color: 0x93c5fd,
      side: THREE.DoubleSide,
      flatShading: true,
      transparent: true,
      opacity: 0.85,
    });
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    const edgeGeometry = new THREE.BufferGeometry();
    const edgeVerts: number[] = [];
    for (const edge of solid3d.edges) {
      edgeVerts.push(edge.start.x, edge.start.y, edge.start.z);
      edgeVerts.push(edge.end.x, edge.end.y, edge.end.z);
    }
    edgeGeometry.setAttribute("position", new THREE.Float32BufferAttribute(edgeVerts, 3));
    const edgeMaterial = new THREE.LineBasicMaterial({ color: 0x1e3a5f, linewidth: 1 });
    const edgeLines = new THREE.LineSegments(edgeGeometry, edgeMaterial);
    scene.add(edgeLines);

    const gridHelper = new THREE.GridHelper(maxDim * 2, 20, 0xcccccc, 0xe5e5e5);
    gridHelper.position.set(cx, min.y, cz);
    scene.add(gridHelper);

    const axesHelper = new THREE.AxesHelper(maxDim * 0.3);
    axesHelper.position.set(min.x, min.y, min.z);
    scene.add(axesHelper);

    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();
  }, [solid3d, width, height]);

  useEffect(() => {
    buildScene();
    return () => {
      cancelAnimationFrame(animFrameRef.current);
      rendererRef.current?.dispose();
      controlsRef.current?.dispose();
    };
  }, [buildScene]);

  useEffect(() => {
    if (rendererRef.current && cameraRef.current) {
      rendererRef.current.setSize(width, height);
      cameraRef.current.aspect = width / height;
      cameraRef.current.updateProjectionMatrix();
    }
  }, [width, height]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ width, height }}
      data-testid="three-viewer"
    />
  );
}

export function renderIsometricSnapshot(
  solid3d: Solid3DData,
  canvasWidth: number = 400,
  canvasHeight: number = 300
): HTMLCanvasElement {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xffffff);

  const { min, max } = solid3d.bounds;
  const cx = (min.x + max.x) / 2;
  const cy = (min.y + max.y) / 2;
  const cz = (min.z + max.z) / 2;
  const dx = max.x - min.x;
  const dy = max.y - min.y;
  const dz = max.z - min.z;
  const maxDim = Math.max(dx, dy, dz) || 100;

  const aspect = canvasWidth / canvasHeight;
  const d = maxDim * 0.8;
  const camera = new THREE.OrthographicCamera(-d * aspect, d * aspect, d, -d, 0.1, maxDim * 10);

  const isoAngle = Math.atan(Math.sqrt(2));
  camera.position.set(
    cx + maxDim,
    cy + maxDim,
    cz + maxDim
  );
  camera.lookAt(cx, cy, cz);
  camera.up.set(0, 1, 0);

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);

  const dirLight = new THREE.DirectionalLight(0xffffff, 0.7);
  dirLight.position.set(maxDim, maxDim * 2, maxDim);
  scene.add(dirLight);

  const geometry = new THREE.BufferGeometry();
  const vertices: number[] = [];
  const indices: number[] = [];
  let vertIndex = 0;

  for (const face of solid3d.faces) {
    const verts = face.vertices;
    if (verts.length === 3) {
      vertices.push(verts[0].x, verts[0].y, verts[0].z);
      vertices.push(verts[1].x, verts[1].y, verts[1].z);
      vertices.push(verts[2].x, verts[2].y, verts[2].z);
      indices.push(vertIndex, vertIndex + 1, vertIndex + 2);
      vertIndex += 3;
    } else if (verts.length === 4) {
      vertices.push(verts[0].x, verts[0].y, verts[0].z);
      vertices.push(verts[1].x, verts[1].y, verts[1].z);
      vertices.push(verts[2].x, verts[2].y, verts[2].z);
      vertices.push(verts[3].x, verts[3].y, verts[3].z);
      indices.push(vertIndex, vertIndex + 1, vertIndex + 2);
      indices.push(vertIndex, vertIndex + 2, vertIndex + 3);
      vertIndex += 4;
    }
  }

  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const material = new THREE.MeshPhongMaterial({
    color: 0x93c5fd,
    side: THREE.DoubleSide,
    flatShading: true,
  });
  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);

  const edgeGeometry = new THREE.BufferGeometry();
  const edgeVerts: number[] = [];
  for (const edge of solid3d.edges) {
    edgeVerts.push(edge.start.x, edge.start.y, edge.start.z);
    edgeVerts.push(edge.end.x, edge.end.y, edge.end.z);
  }
  edgeGeometry.setAttribute("position", new THREE.Float32BufferAttribute(edgeVerts, 3));
  const edgeMaterial = new THREE.LineBasicMaterial({ color: 0x1e3a5f });
  const edgeLines = new THREE.LineSegments(edgeGeometry, edgeMaterial);
  scene.add(edgeLines);

  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(canvasWidth, canvasHeight);
  renderer.render(scene, camera);

  const canvas = renderer.domElement;
  renderer.dispose();

  return canvas;
}
