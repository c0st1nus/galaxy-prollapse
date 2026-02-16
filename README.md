# Cleaning App (School Hackathon)

This project is a monorepo containing a web frontend (SvelteKit) and a backend (ElysiaJS), all managed with [Bun](https://bun.sh/).

## Project Structure

- **root**: Contains scripts to run both frontend and backend concurrently.
- **web**: SvelteKit application using Vite and TailwindCSS.
- **backend**: ElysiaJS API server.

## Prerequisites

- [Bun](https://bun.sh/) runtime installed.

## Getting Started

### Installation

Install dependencies for the root, backend, and frontend concurrently:

```bash
bun run install:all
```

Or manually:

```bash
bun install
cd backend && bun install
cd ../web && bun install
```

### Running the Application

Start both the backend and frontend development servers concurrently:

```bash
bun run dev
```

- **Frontend**: `http://localhost:5173` (default Vite port)
- **Backend API**: `http://localhost:3000` (default Elysia port)

### Quick Frontend Testing Mode

Run a separate quick-testing frontend mode (with backend) that enables a dev-only UI route:

```bash
bun run dev:quick
```

- **Dev-only frontend lab**: `http://localhost:5173/dev`
- This route is disabled in normal `bun run dev` mode and in production builds.

## Scripts

- `bun run dev`: Runs both frontend and backend in development mode.
- `bun run dev:quick`: Runs backend + frontend quick-testing mode (`/dev` enabled).
- `bun run build`: Builds both frontend and backend for production.
- `bun run start`: Starts the production build for both.
