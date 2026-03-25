
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { ProjectData, createDefaultProject, Panel, ConnectionNode, ProjectInfo, ConnectionCapacity } from "./types";

const CACHE_KEY = "precastpro_project_cache";
const FILENAME_KEY = "precastpro_current_filename";

function loadCachedProject(): ProjectData | null {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return null;
    const data = JSON.parse(cached) as ProjectData;
    if (data.info && data.panels && data.capacities) {
      if (!data.info.designStandard) data.info.designStandard = "ASCE7-16";
      if (!data.info.designMethod) data.info.designMethod = "LRFD";
      // Strip legacy name field if present
      data.capacities = data.capacities.map(({ name, ...rest }: any) => rest);
      return data;
    }
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

function loadCachedFileName(): string | null {
  try {
    return localStorage.getItem(FILENAME_KEY);
  } catch {
    return null;
  }
}

function saveCachedFileName(name: string | null) {
  try {
    if (name) {
      localStorage.setItem(FILENAME_KEY, name);
    } else {
      localStorage.removeItem(FILENAME_KEY);
    }
  } catch {
    // ignore
  }
}

interface ProjectContextType {
  project: ProjectData;
  isDirty: boolean;
  currentFileName: string | null;
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
  saveProjectAs: () => void;
  newProject: () => void;
  loadProjectFromFile: () => void;
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

export const ProjectProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [project, setProject] = useState<ProjectData>(() => {
    return loadCachedProject() || createDefaultProject();
  });
  const [isDirty, setIsDirty] = useState(false);
  const [currentFileName, setCurrentFileName] = useState<string | null>(() => loadCachedFileName());
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

  // Save with dialog (used for Save As, or first-time Save)
  const saveWithDialog = useCallback(async () => {
    const json = JSON.stringify(project, null, 2);
    const filename = `${project.info.jobNumber || "project"}_${project.info.jobName || "untitled"}.ppd`.replace(/\s+/g, "_");

    if ("showSaveFilePicker" in window) {
      try {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: filename,
          types: [
            {
              description: "WELLS Connection Loading Project File",
              accept: { "application/json": [".ppd"] },
            },
          ],
        });
        const writable = await handle.createWritable();
        await writable.write(json);
        await writable.close();
        fileHandleRef.current = handle;
        const savedName = handle.name || filename;
        setCurrentFileName(savedName);
        saveCachedFileName(savedName);
        setIsDirty(false);
        return;
      } catch (err: any) {
        if (err.name === "AbortError") return;
      }
    }

    // Fallback: legacy download
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setCurrentFileName(filename);
    saveCachedFileName(filename);
    setIsDirty(false);
  }, [project]);

  // Save: if we already have a file handle, write directly without dialog
  const saveProjectToFile = useCallback(async () => {
    if (fileHandleRef.current) {
      try {
        const json = JSON.stringify(project, null, 2);
        const writable = await fileHandleRef.current.createWritable();
        await writable.write(json);
        await writable.close();
        setIsDirty(false);
        return;
      } catch (err: any) {
        // If permission denied or handle stale, fall through to dialog
        fileHandleRef.current = null;
      }
    }
    // No existing handle — show dialog
    await saveWithDialog();
  }, [project, saveWithDialog]);

  // Save As: always show the dialog
  const saveProjectAs = useCallback(async () => {
    await saveWithDialog();
  }, [saveWithDialog]);

  // New Project: clear cache and reset
  const newProject = useCallback(() => {
    const defaultData = createDefaultProject();
    setProject(defaultData);
    saveToBrowserCache(defaultData);
    fileHandleRef.current = null;
    setCurrentFileName(null);
    saveCachedFileName(null);
    setIsDirty(false);
    isInitialLoad.current = true;
  }, []);

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
        if (!data.info.designStandard) data.info.designStandard = "ASCE7-16";
        if (!data.info.designMethod) data.info.designMethod = "LRFD";
        // Strip legacy name field if present
        data.capacities = data.capacities.map(({ name, ...rest }: any) => rest);
        setProject(data);
        saveToBrowserCache(data);
        const openedName = file.name;
        setCurrentFileName(openedName);
        saveCachedFileName(openedName);
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
        currentFileName,
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
        saveProjectAs,
        newProject,
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
