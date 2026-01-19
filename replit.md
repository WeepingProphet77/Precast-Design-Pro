# PrecastPro Designer

## Overview

PrecastPro Designer is a professional CAD-style structural engineering tool for designing and analyzing architectural precast concrete cladding panels. The application provides LRFD (Load and Resistance Factor Design) analysis capabilities, allowing engineers to design panels using AutoCAD-like drawing tools, define connection points, apply load combinations per ASCE 7-16, and calculate utilization ratios against defined capacities.

The application is built as a full-stack TypeScript project with a React frontend and Express backend, using PostgreSQL database for data persistence.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight client-side routing)
- **State Management**: React Context API via custom `ProjectProvider` for global project data
- **Data Fetching**: TanStack React Query for server state management
- **UI Components**: shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS v4 with custom engineering-themed color palette
- **Canvas Rendering**: Konva.js (react-konva) for interactive panel designer with 2D graphics
- **Form Handling**: React Hook Form with Zod validation

### Backend Architecture
- **Framework**: Express.js with TypeScript
- **Build Tool**: esbuild for server bundling, Vite for client
- **API Pattern**: RESTful routes prefixed with `/api`
- **Storage Interface**: Abstract `IStorage` interface with `DbStorage` implementation using Drizzle ORM
- **Database**: PostgreSQL via Drizzle ORM with schema defined in `shared/schema.ts`

### Data Flow
- Projects, panels, and capacities persisted in PostgreSQL database
- API routes in `server/routes.ts` handle CRUD operations via storage interface
- Client-side state managed with React Context API for active project
- Database schema in `shared/schema.ts` uses Drizzle ORM with Zod integration for validation
- Calculations (LRFD load combinations) performed client-side in `client/src/lib/calculations.ts`

### CAD Features
- **Blank Canvas**: Starts with empty workspace for custom panel designs
- **Line Drawing Tool**: Continuous polyline creation with endpoint snapping
- **Angle Snapping**: Hold Shift to snap lines to 45-degree increments
- **Endpoint Snapping**: Automatically snaps to existing endpoints when drawing
- **Move/Copy Tools**: Translate and duplicate sketch objects
- **Coordinate System**: CAD-standard origin at bottom-left, Y-axis pointing up
- **Command Line**: AutoCAD-style command interface at bottom of canvas

### Key Application Pages
1. **Project Info** (`/`) - Project metadata configuration
2. **Panel Designer** (`/design`) - Interactive canvas for panel geometry and connection placement
3. **Master Spreadsheet** (`/master`) - Tabular view of all connections with governing load cases
4. **Capacity Manager** (`/capacities`) - Define allowable strength limits per connection type

### Build System
- Development: Vite dev server with HMR, Express backend with tsx
- Production: Vite builds client to `dist/public`, esbuild bundles server to `dist/index.cjs`
- Custom build script in `script/build.ts` handles both client and server builds

## External Dependencies

### Database
- **PostgreSQL**: Configured via `DATABASE_URL` environment variable
- **Drizzle ORM**: Schema management and type-safe queries
- **drizzle-kit**: Database migrations in `./migrations` directory

### UI Framework
- **Radix UI**: Full suite of accessible primitives (dialog, dropdown, tabs, etc.)
- **shadcn/ui**: Pre-built component patterns using Radix + Tailwind
- **Lucide React**: Icon library

### Key Libraries
- **Konva/react-konva**: 2D canvas rendering for panel designer
- **Zod**: Runtime type validation, integrated with forms and Drizzle
- **date-fns**: Date formatting utilities
- **class-variance-authority**: Component variant management

### Replit-Specific
- `@replit/vite-plugin-runtime-error-modal`: Development error overlay
- `@replit/vite-plugin-cartographer`: Development tooling
- `@replit/vite-plugin-dev-banner`: Development environment indicator
- Custom `vite-plugin-meta-images`: OpenGraph image URL injection for deployments