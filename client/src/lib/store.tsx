
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { ProjectData, createDefaultProject, Panel, ConnectionNode, ProjectInfo, ConnectionCapacity } from "./types";

const CACHE_KEY = "precastpro_project_cache";

function loadCachedProject(): ProjectData | null {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return null;
    const data = JSON.parse(cached) as ProjectData;
    if (data.info && data.panels && data.capacities) return data;
  } catch {
    // Corrupted cache, ignore
  }
  return null;
}

function saveToBrowserCache(project: ProjectData) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(project));
  } catch {
    // Storage full or unavailable, ignore
  }
}

interface ProjectContextType {
  project: ProjectData;
  isDirty: boolean;
  updateProjectInfo: (info: ProjectInfo) => void;
  setProjectData: (data: ProjectData) => void;
  updatePanel: (panel: Panel) => void;
  addPanel: () => void;
  deletePanel: (id: string) => void;
  updateConnection: (panelId: string, connection: ConnectionNode) => void;
  addConnection: (panelId: string, connection: ConnectionNode) => void;
  deleteConnection: (panelId: string, connectionId: string) => void;
  updateCapacity: (capacity: ConnectionCapacity) => void;
  addCapacity: (capacity: ConnectionCapacity) => void;
  deleteCapacity: (type: string) => void;
  saveProjectToFile: () => void;
  loadProjectFromFile: () => void;
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

export const ProjectProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [project, setProject] = useState<ProjectData>(() => {
    return loadCachedProject() || createDefaultProject();
  });
  const [isDirty, setIsDirty] = useState(false);
  const fileHandleRef = useRef<FileSystemFileHandle | null>(null);
  const isInitialLoad = useRef(true);

  // Auto-save to browser cache whenever project changes
  useEffect(() => {
    if (isInitialLoad.current) {
      isInitialLoad.current = false;
      return;
    }
    saveToBrowserCache(project);
    setIsDirty(true);
  }, [project]);

  const updateProjectInfo = (info: ProjectInfo) => {
    setProject((prev) => ({ ...prev, info }));
  };

  const setProjectData = (data: ProjectData) => {
    setProject(data);
  };

  const updatePanel = (updatedPanel: Panel) => {
    setProject((prev) => ({
      ...prev,
      panels: prev.panels.map((p) => (p.id === updatedPanel.id ? updatedPanel : p)),
    }));
  };

  const addPanel = () => {
    const newPanel: Panel = {
      id: crypto.randomUUID(),
      name: `P-0${project.panels.length + 1}`,
      width: 120,
      height: 180,
      thickness: 6,
      panelWeight: 0,
      supportedElementsWeight: 0,
      positiveWindPressure: 0,
      negativeWindPressure: 0,
      seismicForceFp: 0,
      perimeter: [],
      openings: [],
      sketchLines: [],
      connections: [],
    };
    setProject((prev) => ({ ...prev, panels: [...prev.panels, newPanel] }));
  };

  const deletePanel = (id: string) => {
    setProject((prev) => ({
      ...prev,
      panels: prev.panels.filter((p) => p.id !== id),
    }));
  };

  const updateConnection = (panelId: string, connection: ConnectionNode) => {
    setProject((prev) => ({
      ...prev,
      panels: prev.panels.map((p) => {
        if (p.id !== panelId) return p;
        return {
          ...p,
          connections: p.connections.map((c) => (c.id === connection.id ? connection : c)),
        };
      }),
    }));
  };

  const addConnection = (panelId: string, connection: ConnectionNode) => {
    setProject((prev) => ({
      ...prev,
      panels: prev.panels.map((p) => {
        if (p.id !== panelId) return p;
        return {
          ...p,
          connections: [...p.connections, connection],
        };
      }),
    }));
  };

  const deleteConnection = (panelId: string, connectionId: string) => {
    setProject((prev) => ({
      ...prev,
      panels: prev.panels.map((p) => {
        if (p.id !== panelId) return p;
        return {
          ...p,
          connections: p.connections.filter((c) => c.id !== connectionId),
        };
      }),
    }));
  };

  const updateCapacity = (capacity: ConnectionCapacity) => {
    setProject((prev) => ({
      ...prev,
      capacities: prev.capacities.map((c) => (c.type === capacity.type ? capacity : c)),
    }));
  };

  const addCapacity = (capacity: ConnectionCapacity) => {
    setProject((prev) => ({
      ...prev,
      capacities: [...prev.capacities, capacity]
    }));
  };

  const deleteCapacity = (type: string) => {
    setProject((prev) => ({
      ...prev,
      capacities: prev.capacities.filter((c) => c.type !== type),
    }));
  };

  const saveProjectToFile = useCallback(async () => {
    const json = JSON.stringify(project, null, 2);
    const filename = `${project.info.jobNumber || "project"}_${project.info.jobName || "untitled"}.ppd`.replace(/\s+/g, "_");

    // Try the File System Access API (save dialog with location picker)
    if ("showSaveFilePicker" in window) {
      try {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: filename,
          types: [
            {
              description: "PrecastPro Project File",
              accept: { "application/json": [".ppd"] },
            },
          ],
        });
        const writable = await handle.createWritable();
        await writable.write(json);
        await writable.close();
        fileHandleRef.current = handle;
        setIsDirty(false);
        return;
      } catch (err: any) {
        // User cancelled the dialog — do nothing
        if (err.name === "AbortError") return;
        // Fall through to legacy download on other errors
      }
    }

    // Fallback: legacy download for browsers without File System Access API
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setIsDirty(false);
  }, [project]);

  const loadProjectFromFile = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".ppd,.json";
    input.onchange = async (e: any) => {
      const file = e.target?.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text) as ProjectData;
        if (!data.info || !data.panels || !data.capacities) {
          throw new Error("Invalid project file format");
        }
        setProject(data);
        saveToBrowserCache(data);
        setIsDirty(false);
        fileHandleRef.current = null;
      } catch (err: any) {
        alert("Failed to load project file: " + (err.message || "Unknown error"));
      }
    };
    input.click();
  }, []);

  return (
    <ProjectContext.Provider
      value={{
        project,
        isDirty,
        updateProjectInfo,
        setProjectData,
        updatePanel,
        addPanel,
        deletePanel,
        updateConnection,
        addConnection,
        deleteConnection,
        updateCapacity,
        addCapacity,
        deleteCapacity,
        saveProjectToFile,
        loadProjectFromFile,
      }}
    >
      {children}
    </ProjectContext.Provider>
  );
};

export const useProject = () => {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error("useProject must be used within a ProjectProvider");
  }
  return context;
};
