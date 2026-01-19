import { db } from "./db";
import { projects, panels, capacities, type Project, type Panel, type Capacity, type InsertProject, type InsertPanel, type InsertCapacity } from "@shared/schema";
import { eq } from "drizzle-orm";

export interface IStorage {
  // Project operations
  getProject(id: string): Promise<Project | undefined>;
  getAllProjects(): Promise<Project[]>;
  createProject(project: InsertProject): Promise<Project>;
  updateProject(id: string, project: Partial<InsertProject>): Promise<Project | undefined>;
  deleteProject(id: string): Promise<void>;
  
  // Panel operations
  getPanel(id: string): Promise<Panel | undefined>;
  getPanelsByProject(projectId: string): Promise<Panel[]>;
  createPanel(panel: InsertPanel): Promise<Panel>;
  updatePanel(id: string, panel: Partial<InsertPanel>): Promise<Panel | undefined>;
  deletePanel(id: string): Promise<void>;
  
  // Capacity operations
  getCapacitiesByProject(projectId: string): Promise<Capacity[]>;
  createCapacity(capacity: InsertCapacity): Promise<Capacity>;
  updateCapacity(id: string, capacity: Partial<InsertCapacity>): Promise<Capacity | undefined>;
  deleteCapacity(id: string): Promise<void>;
}

export class DbStorage implements IStorage {
  // Project operations
  async getProject(id: string): Promise<Project | undefined> {
    const result = await db.select().from(projects).where(eq(projects.id, id));
    return result[0];
  }

  async getAllProjects(): Promise<Project[]> {
    return db.select().from(projects);
  }

  async createProject(project: InsertProject): Promise<Project> {
    const result = await db.insert(projects).values(project).returning();
    return result[0];
  }

  async updateProject(id: string, project: Partial<InsertProject>): Promise<Project | undefined> {
    const result = await db.update(projects)
      .set({ ...project, updatedAt: new Date() })
      .where(eq(projects.id, id))
      .returning();
    return result[0];
  }

  async deleteProject(id: string): Promise<void> {
    await db.delete(projects).where(eq(projects.id, id));
  }

  // Panel operations
  async getPanel(id: string): Promise<Panel | undefined> {
    const result = await db.select().from(panels).where(eq(panels.id, id));
    return result[0];
  }

  async getPanelsByProject(projectId: string): Promise<Panel[]> {
    return db.select().from(panels).where(eq(panels.projectId, projectId));
  }

  async createPanel(panel: InsertPanel): Promise<Panel> {
    const result = await db.insert(panels).values(panel).returning();
    return result[0];
  }

  async updatePanel(id: string, panel: Partial<InsertPanel>): Promise<Panel | undefined> {
    const result = await db.update(panels)
      .set(panel)
      .where(eq(panels.id, id))
      .returning();
    return result[0];
  }

  async deletePanel(id: string): Promise<void> {
    await db.delete(panels).where(eq(panels.id, id));
  }

  // Capacity operations
  async getCapacitiesByProject(projectId: string): Promise<Capacity[]> {
    return db.select().from(capacities).where(eq(capacities.projectId, projectId));
  }

  async createCapacity(capacity: InsertCapacity): Promise<Capacity> {
    const result = await db.insert(capacities).values(capacity).returning();
    return result[0];
  }

  async updateCapacity(id: string, capacity: Partial<InsertCapacity>): Promise<Capacity | undefined> {
    const result = await db.update(capacities)
      .set(capacity)
      .where(eq(capacities.id, id))
      .returning();
    return result[0];
  }

  async deleteCapacity(id: string): Promise<void> {
    await db.delete(capacities).where(eq(capacities.id, id));
  }
}

export const storage = new DbStorage();
