# Running PrecastPro Designer Locally

## System Requirements

- **Node.js** v20 or newer
- **npm** v9 or newer (comes with Node.js)
- **PostgreSQL** v14 or newer — either installed locally or a hosted service (Neon, Supabase, Railway, etc. all have free tiers)

---

## Environment Variable

Create a file called `.env` in the project root with one required variable:

```
DATABASE_URL=postgresql://username:password@localhost:5432/precastpro
```

Replace the credentials with your actual PostgreSQL connection details. If you use a hosted service they will give you this URL directly.

---

## Setup Steps

```bash
# 1. Install all dependencies
npm install

# 2. Push the database schema (creates the tables)
npm run db:push

# 3. Start the development server
npm run dev
```

Then open your browser to `http://localhost:5000`.

---

## Build for Production (optional)

```bash
npm run build       # Builds client + server into /dist
npm run start       # Runs the production build
```

---

## Notes

- The single `npm run dev` command starts both the backend API (Express) and the frontend (Vite with hot reloading) together — there is no need to run two separate processes.
- The project has three Replit-specific dev plugins in `vite.config.ts`, but they are already guarded to only load when running on Replit, so they will simply be skipped locally without any changes needed.
- The database schema is straightforward — only `projects`, `panels`, and `capacities` tables. The `npm run db:push` command creates them automatically.
- No external API keys or third-party services are required beyond the database.
