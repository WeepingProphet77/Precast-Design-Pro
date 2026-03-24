
import React from "react";
import { Link, useLocation } from "wouter";
import { useProject } from "@/lib/store";
import { exportProjectToPDF } from "@/lib/pdfExport";
import { cn } from "@/lib/utils";
import { LayoutGrid, PenTool, Database, Activity, FileSpreadsheet, Save, FolderOpen, FileText } from "lucide-react";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { project, isDirty, saveProjectToFile, loadProjectFromFile } = useProject();

  const navItems = [
    { href: "/", label: "Project Info", icon: LayoutGrid },
    { href: "/design", label: "Panel Designer", icon: PenTool },
    { href: "/master", label: "Master Spreadsheet", icon: FileSpreadsheet },
    { href: "/capacities", label: "Capacity Manager", icon: Database },
  ];

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <aside className="w-64 bg-sidebar border-r border-sidebar-border flex flex-col shrink-0">
        <div className="p-6 border-b border-sidebar-border/50">
          <div className="flex items-center gap-2 mb-1">
            <Activity className="w-6 h-6 text-sidebar-primary" />
            <span className="font-bold text-lg text-sidebar-foreground tracking-tight">PrecastPro</span>
          </div>
          <p className="text-xs text-sidebar-foreground/60">Structural Analysis Suite</p>
        </div>

        <div className="px-4 py-6">
          <div className="text-xs font-medium text-sidebar-foreground/40 uppercase tracking-wider mb-2 px-2">
            Project: {project.info.jobNumber}
          </div>
          <nav className="space-y-1">
            {navItems.map((item) => {
              const isActive = location === item.href;
              const Icon = item.icon;
              return (
                <Link key={item.href} href={item.href}>
                  <div
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer",
                      isActive
                        ? "bg-sidebar-primary text-sidebar-primary-foreground"
                        : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    {item.label}
                  </div>
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="mt-auto">
          <div className="px-4 pb-4 space-y-1">
            <div className="text-xs font-medium text-sidebar-foreground/40 uppercase tracking-wider mb-2 px-2">
              File
            </div>
            <button
              onClick={saveProjectToFile}
              className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer w-full text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              data-testid="button-save-project"
            >
              <Save className="w-4 h-4" />
              Save Project
              {isDirty && (
                <span
                  className="ml-auto flex items-center gap-1 text-xs text-amber-500"
                  title="You have unsaved changes"
                >
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                  Unsaved
                </span>
              )}
            </button>
            <button
              onClick={loadProjectFromFile}
              className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer w-full text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              data-testid="button-load-project"
            >
              <FolderOpen className="w-4 h-4" />
              Open Project
            </button>
            <button
              onClick={() => exportProjectToPDF(project)}
              className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer w-full text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              data-testid="button-print-pdf"
            >
              <FileText className="w-4 h-4" />
              Print to PDF
            </button>
          </div>
          <div className="p-4 border-t border-sidebar-border/50">
            <div className="text-xs text-sidebar-foreground/50 text-center">
              LRFD ASCE 7-16 Compliant
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 bg-card border-b flex items-center px-6 shrink-0 justify-between">
           <h1 className="text-sm font-semibold text-foreground/80">
              {project.info.jobName || "Untitled Project"} 
              <span className="mx-2 text-muted-foreground">/</span>
              {navItems.find(i => i.href === location)?.label}
           </h1>
           <div className="text-xs font-mono text-muted-foreground">
             {new Date().toLocaleDateString()}
           </div>
        </header>
        <div className="flex-1 overflow-auto bg-slate-50/50">
          {children}
        </div>
      </main>
    </div>
  );
}
