
Last updated: 2025-08-21 12:00 UTC

# Qwen System Documentation: Master Index

Welcome to the Qwen system, a Next.js application for AI-powered medical coding automation. This document serves as the master index for all technical documentation.

## 1. System Overview

The Qwen system processes medical case notes to automate the assignment and validation of medical codes. It is architected as a modular Next.js application with a distinct frontend, backend, and AI processing pipeline.

*   **Application Shell**: A Next.js application responsible for the user interface, API routes, and user authentication.
*   **Major Subsystems**:
    *   **Authentication**: Azure Entra ID-based authentication, managed via middleware (`oxkair-shell/middleware.ts`).
    *   **Database**: PostgreSQL database with a UUID-based schema for storing user profiles, medical notes, and other application data.
    *   **AI Agent Workflow**: A pipeline of AI agents that process medical notes to extract, validate, and assign medical codes.
*   **Data Flow**:
    1.  A user submits medical notes through the UI (`oxkair-shell/app/cases/new/case-form.tsx`).
    2.  A server-side action (`oxkair-shell/app/actions/process-case.ts`) triggers the AI agent workflow.
    3.  The `WorkflowOrchestrator` (`oxkair-shell/lib/workflow/workflow-orchestrator.ts`) manages the execution of the agent pipeline.
    4.  Agents process the data, and the results are stored in the `medical_notes` table in the database.
    5.  The processed data is displayed on the user's dashboard.

## 2. Topic Docs

*   [File Structure](./file-structure.md)
*   [Agents and Workflow](./agents-and-workflow.md)
*   [Authentication](./authentication.md)
*   [Database](./database.md)
*   [State and Orchestration](./state-and-orchestration.md)
*   [Data Transformers](./data-transformers.md)
*   [UI Overview](./ui-overview.md)
*   [Conventions and Ops](./conventions-and-ops.md)

## 3. "Start Here" Path

For new contributors, we recommend reading the documentation in the following order:

1.  **[README.md](./README.md)** (this file)
2.  **[File Structure](./file-structure.md)**: To understand the layout of the repository.
3.  **[Authentication](./authentication.md)**: To understand how users are authenticated.
4.  **[Database](./database.md)**: To understand the data model.
5.  **[Agents and Workflow](./agents-and-workflow.md)**: To understand the AI processing pipeline.

## 4. "When you change X, update Y" Matrix

| When you change... | ...update this document: |
| ------------------ | ------------------------ |
| A new AI agent is added or an existing one is modified | [Agents and Workflow](./agents-and-workflow.md) |
| The database schema is updated | [Database](./database.md) |
| The authentication flow is changed | [Authentication](./authentication.md) |
| A new major UI component is added | [UI Overview](./ui-overview.md) |
| A new library or framework is introduced | [Conventions and Ops](./conventions-and-ops.md) |

## 5. Glossary

| Term | Definition | File Pointer |
| --- | --- | --- |
| **AI Agent** | A component responsible for a specific task in the AI processing pipeline (e.g., code extraction, validation). | `oxkair-shell/lib/agents/` |
| **Workflow Orchestrator** | A class that manages the execution of the AI agent pipeline. | `oxkair-shell/lib/workflow/workflow-orchestrator.ts` |
| **WorkflowState** | The main state object that is passed between agents. | `oxkair-shell/lib/agents/types.ts` |
| **ProcedureCode** | A data model for a medical procedure code (e.g., CPT, HCPCS). | `oxkair-shell/lib/agents/types.ts` |
| **DiagnosisCode** | A data model for a medical diagnosis code (e.g., ICD-10). | `oxkair-shell/lib/agents/types.ts` |

---

## Update Checklist

*   [ ] Verify that all links to topic docs are correct.
*   [ ] Ensure that the "Start Here" path is logical and up-to-date.
*   [ ] Update the "When you change X, update Y" matrix with any new patterns.
*   [ ] Add any new core terms to the glossary.
