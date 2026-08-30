# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Hugo Site Development

- `task dev` - Start Hugo development server with drafts
- Development server runs from `ryanwallace.cloud/` directory

## Architecture Overview

This is a personal website built with:

### Core Technologies

- **Hugo**: Static site generator for main website content
- **Caddy**: Web server with caching and metrics
- **Docker**: Multi-stage build for deployment
- **Fly.io**: Hosting platform

### Project Structure

- `ryanwallace.cloud/` - Main Hugo site
  - `content/posts/` - Blog posts in Markdown
  - `hugo.toml` - Hugo configuration
- `Taskfile.yaml` - Task runner configuration
- `Dockerfile` - Multi-stage build (Hugo → Caddy)

## Key Files

- `Taskfile.yaml` - Primary development commands
- `ryanwallace.cloud/hugo.toml` - Site configuration
- `Dockerfile` - Production build definition
- `Caddyfile` - Web server configuration
- `ryanwallace.cloud/assets/css/custom.css` - CSS configuration
