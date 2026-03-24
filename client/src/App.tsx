
import { Switch, Route, Router as WouterRouter } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ProjectProvider } from "@/lib/store";
import { AppShell } from "@/components/layout/AppShell";
import NotFound from "@/pages/not-found";

import ProjectInfo from "@/pages/ProjectInfo";
import PanelDesigner from "@/pages/PanelDesigner";
import MasterSpreadsheet from "@/pages/MasterSpreadsheet";
import CapacityManager from "@/pages/CapacityManager";

// Detect base path from Vite's import.meta.env.BASE_URL (set via vite.config base option)
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function AppRouter() {
  return (
    <WouterRouter base={basePath}>
      <AppShell>
        <Switch>
          <Route path="/" component={ProjectInfo} />
          <Route path="/design" component={PanelDesigner} />
          <Route path="/master" component={MasterSpreadsheet} />
          <Route path="/capacities" component={CapacityManager} />
          <Route component={NotFound} />
        </Switch>
      </AppShell>
    </WouterRouter>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ProjectProvider>
          <Toaster />
          <AppRouter />
        </ProjectProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
