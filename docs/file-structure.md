
Last updated: 2025-08-21 12:00 UTC

# File Structure

This document provides an overview of the directory structure for the `oxkair-shell` application.

## Top-Level Directories

| Path | Description |
| --- | --- |
| **`oxkair-shell/app/`** | The main Next.js application directory, containing pages, API routes, and UI components. |
| **`oxkair-shell/components/`** | Reusable UI components used throughout the application. |
| **`oxkair-shell/lib/`** | Core libraries and business logic, including AI agents, database services, and workflow orchestration. |
| **`oxkair-shell/scripts/`** | Utility scripts for various tasks, such as data parsing, testing, and environment validation. |
| **`oxkair-shell/public/`** | Static assets, such as images and fonts. |
| **`oxkair-shell/styles/`** | Global and component-specific stylesheets. |
| **`oxkair-shell/tests/`** | Unit and integration tests. |

## Key Directories and Files

### `oxkair-shell/app/`

| Path | Description |
| --- | --- |
| **`actions/`** | Server-side actions, including the entry point for AI case processing (`process-case.ts`). |
| **`api/`** | API routes for handling client-side requests. |
| **`cases/`** | UI components for creating and managing medical cases. |
| **`coder/`** | Core application logic for the medical coding dashboard. |
| **`layout.tsx`** | The main layout component for the application. |
| **`page.tsx`** | The main entry point for the application's UI. |

### `oxkair-shell/lib/`

| Path | Description |
| --- | --- |
| **`agents/`** | The heart of the AI system, containing individual agent implementations. |
| **`services/`** | Services for interacting with external systems like databases and AI models. |
| **`workflow/`** | The AI workflow orchestrator and state management logic. |
| **`db/`** | Database-related utilities and services. |
| **`auth/`** | Authentication-related utilities and context. |

### `oxkair-shell/components/`

| Path | Description |
| --- | --- |
| **`nav/`** | Navigation components, such as the main navigation bar and sidebar. |
| **`ui/`** | Generic UI components, such as buttons, dialogs, and forms. |
| **`coder/`** | Components specific to the medical coding dashboard. |

---

## Update Checklist

*   [ ] Update this document when new top-level directories are added or existing ones are removed.
*   [ ] Add descriptions for new key directories and files.
