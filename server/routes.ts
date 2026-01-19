import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertProjectSchema, insertPanelSchema, insertCapacitySchema } from "@shared/schema";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Project routes
  app.get("/api/projects", async (req, res) => {
    try {
      const projects = await storage.getAllProjects();
      res.json(projects);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch projects" });
    }
  });

  app.get("/api/projects/:id", async (req, res) => {
    try {
      const project = await storage.getProject(req.params.id);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }
      res.json(project);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch project" });
    }
  });

  app.post("/api/projects", async (req, res) => {
    try {
      const validated = insertProjectSchema.parse(req.body);
      const project = await storage.createProject(validated);
      res.status(201).json(project);
    } catch (error) {
      res.status(400).json({ error: "Invalid project data" });
    }
  });

  app.patch("/api/projects/:id", async (req, res) => {
    try {
      const project = await storage.updateProject(req.params.id, req.body);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }
      res.json(project);
    } catch (error) {
      res.status(500).json({ error: "Failed to update project" });
    }
  });

  app.delete("/api/projects/:id", async (req, res) => {
    try {
      await storage.deleteProject(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete project" });
    }
  });

  // Panel routes
  app.get("/api/projects/:projectId/panels", async (req, res) => {
    try {
      const panels = await storage.getPanelsByProject(req.params.projectId);
      res.json(panels);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch panels" });
    }
  });

  app.get("/api/panels/:id", async (req, res) => {
    try {
      const panel = await storage.getPanel(req.params.id);
      if (!panel) {
        return res.status(404).json({ error: "Panel not found" });
      }
      res.json(panel);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch panel" });
    }
  });

  app.post("/api/panels", async (req, res) => {
    try {
      const validated = insertPanelSchema.parse(req.body);
      const panel = await storage.createPanel(validated);
      res.status(201).json(panel);
    } catch (error) {
      res.status(400).json({ error: "Invalid panel data" });
    }
  });

  app.patch("/api/panels/:id", async (req, res) => {
    try {
      const panel = await storage.updatePanel(req.params.id, req.body);
      if (!panel) {
        return res.status(404).json({ error: "Panel not found" });
      }
      res.json(panel);
    } catch (error) {
      res.status(500).json({ error: "Failed to update panel" });
    }
  });

  app.delete("/api/panels/:id", async (req, res) => {
    try {
      await storage.deletePanel(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete panel" });
    }
  });

  // Capacity routes
  app.get("/api/projects/:projectId/capacities", async (req, res) => {
    try {
      const capacities = await storage.getCapacitiesByProject(req.params.projectId);
      res.json(capacities);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch capacities" });
    }
  });

  app.post("/api/capacities", async (req, res) => {
    try {
      const validated = insertCapacitySchema.parse(req.body);
      const capacity = await storage.createCapacity(validated);
      res.status(201).json(capacity);
    } catch (error) {
      res.status(400).json({ error: "Invalid capacity data" });
    }
  });

  app.patch("/api/capacities/:id", async (req, res) => {
    try {
      const capacity = await storage.updateCapacity(req.params.id, req.body);
      if (!capacity) {
        return res.status(404).json({ error: "Capacity not found" });
      }
      res.json(capacity);
    } catch (error) {
      res.status(500).json({ error: "Failed to update capacity" });
    }
  });

  app.delete("/api/capacities/:id", async (req, res) => {
    try {
      await storage.deleteCapacity(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete capacity" });
    }
  });

  return httpServer;
}
