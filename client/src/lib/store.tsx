
import React, { createContext, useContext, useState, useEffect } from "react";
import { ProjectData, createDefaultProject, Panel, ConnectionNode, ProjectInfo, ConnectionCapacity } from "./types";

interface ProjectContextType {
  project: ProjectData;
  updateProjectInfo: (info: ProjectInfo) => void;
  updatePanel: (panel: Panel) => void;
  addPanel: () => void;
  deletePanel: (id: string) => void;
  updateConnection: (panelId: string, connection: ConnectionNode) => void;
  addConnection: (panelId: string, connection: ConnectionNode) => void;
  deleteConnection: (panelId: string, connectionId: string) => void;
  updateCapacity: (capacity: ConnectionCapacity) => void;
  addCapacity: (capacity: ConnectionCapacity) => void;
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

export const ProjectProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [project, setProject] = useState<ProjectData>(createDefaultProject());

  const updateProjectInfo = (info: ProjectInfo) => {
    setProject((prev) => ({ ...prev, info }));
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
      }))
  }

  return (
    <ProjectContext.Provider
      value={{
        project,
        updateProjectInfo,
        updatePanel,
        addPanel,
        deletePanel,
        updateConnection,
        addConnection,
        deleteConnection,
        updateCapacity,
        addCapacity
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
