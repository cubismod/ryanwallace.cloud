# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Hugo Site Development

- `task dev` - Start Hugo development server with drafts
- Development server runs from `ryanwallace.cloud/` directory

### TypeScript Map Application

- `task build` - Build the interactive map application (runs pnpm build, clean, move)
- `task format` - Format TypeScript code using Prettier
- `task typecheck` - Run TypeScript type checking
- Individual commands can be run from `ryanwallace.cloud/map/`:
  - `pnpm build` - Build with Webpack bundler
  - `pnpm typecheck` - Type check without emitting files
  - `pnpm prettier --write .` - Format code
- Use `task build` instead of `pnpm build` for this repo

## Architecture Overview

This is a personal website built with a hybrid architecture:

### Core Technologies

- **Hugo**: Static site generator for main website content
- **TypeScript/Leaflet**: Interactive map application for MBTA real-time tracking
- **Caddy**: Web server with caching and metrics
- **Docker**: Multi-stage build for deployment
- **Fly.io**: Hosting platform

### Project Structure

- `ryanwallace.cloud/` - Main Hugo site
  - `content/posts/` - Blog posts in Markdown
  - `map/` - TypeScript application for MBTA tracking
  - `hugo.toml` - Hugo configuration
- `Taskfile.yaml` - Task runner configuration
- `Dockerfile` - Multi-stage build (Node.js → Hugo → Caddy)

### Map Application Details

The map application is a real-time MBTA (Massachusetts Bay Transportation Authority) tracker built with:

- **Leaflet**: Interactive mapping library
- **MapTiler**: Map tiles provider
- **DataTables**: For tabular data display
- **Webpack**: Build tool and bundler
- **TypeScript**: Type safety for complex geospatial data structures

The app handles real-time vehicle tracking, route visualization, and service alerts. The build process integrates into Hugo's static site generation.

### Build Process

1. Node.js stage builds the TypeScript map application
2. Hugo stage generates static site content
3. Caddy stage serves the final application with caching

## Key Files

- `Taskfile.yaml` - Primary development commands
- `ryanwallace.cloud/map/package.json` - Map app dependencies and scripts
- `ryanwallace.cloud/hugo.toml` - Site configuration
- `Dockerfile` - Production build definition
- `Caddyfile` - Web server configuration
- `ryanwallace.cloud/assets/css/custom.css` - CSS configuration
