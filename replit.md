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

### Panel Geometry Input
- **DXF File Import**: Import .DXF files to define panel geometry (supports LWPOLYLINE, POLYLINE, LINE, ARC, CIRCLE, POINT, INSERT entities)
- **Rectangle Template**: Quick rectangular panel creation by specifying width and height
- **Automatic Classification**: Largest closed polyline becomes perimeter; smaller enclosed polylines become openings
- **Coordinate Normalization**: Lower-left corner of imported geometry is set to (0,0)
- **Imported Nodes**: POINT/INSERT entities from DXF are preserved as snap points for connection placement
- **Grid Background**: 12" grid displayed behind panel geometry
- **Datum Marker**: X, Y, Z datum axes shown at panel origin (0,0)
- **Filled Display**: Panel shape rendered with fill and opening cutouts using even-odd fill rule

### Connection Placement
- **Click to Place**: Click on canvas to place connections, with automatic snapping to imported geometry vertices and nodes
- **Coordinate Entry**: Dialog to enter exact X, Y coordinates for precise connection placement
- **Snap-to-Geometry**: Connections snap to perimeter vertices, opening corners, sketch line endpoints, and imported nodes
- **Drag to Reposition**: Connections can be dragged to new positions on the canvas

### File Save/Load System
- **Local File Storage**: All project data saved as .ppd (PrecastPro Data) JSON files downloadable to local machine
- **File Load**: Open .ppd or .json files to restore complete project state
- **No Server Persistence Required**: Project data resides entirely in local files

### PDF Export
- **Professional Report**: Multi-page PDF generated via jsPDF with jspdf-autotable
- **Project Data Sheet**: Cover page with project info, panel index, and ASCE 7-16 design basis
- **Panel Pages**: One page per panel with properties, geometry drawing (perimeter, openings, connections, centroid), connection forces table, and LRFD load combination results with utilization coloring
- **Master Spreadsheet**: Aggregated governing load cases for all connections across all panels
- **Capacity Table**: Connection capacity definitions and usage summary
- **Utilization Coloring**: Green (<90%), amber (90-100%), red (>100%) for utilization ratios

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