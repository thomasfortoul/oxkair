# Qwen System Documentation

## Table of Contents
1. [Overview](#overview)
2. [System Architecture](#system-architecture)
3. [Documentation](#documentation)
4. [Database Schema](#database-schema)
5. [Authentication System](#authentication-system)
6. [Case Processing Workflow](#case-processing-workflow)
7. [Development Environment](#development-environment)
8. [Azure Deployment](#azure-deployment)
9. [Best Practices](#best-practices)

## Overview

The Qwen system is a Next.js application designed for medical coding automation. It uses AI agents to process medical case notes, extract relevant information, assign medical codes (CPT, HCPCS, ICD-10), and validate them against compliance rules (CCI, MUE, LCD).

The system features:
- Azure Entra ID authentication
- PostgreSQL database with UUID-based schema
- AI-powered medical coding workflow
- Comprehensive agent-based processing pipeline
- Support for both Azure deployment and local development

## System Architecture

The application follows a modular architecture with clear separation of concerns:

```
app/                   # Next.js application
├── actions/          # Server-side actions (AI case processing entry point)
├── api/              # API routes
│   └── auth/me/      # Authentication endpoint
├── cases/            # Case management UI
└── coder/            # Main application dashboard
components/            # Reusable UI components
lib/                   # Core libraries and business logic
├── agents/           # AI agents for processing
├── services/         # Database and external service interactions
└── workflow/         # Workflow orchestrator
middleware.ts          # Authentication middleware
```

Key technologies:
- Frontend: React, Next.js, Tailwind CSS
- Backend: Next.js API Routes
- Database: PostgreSQL with UUID primary keys
- Authentication: Azure Entra ID (via Easy Auth)
- AI: Azure OpenAI
- Testing: Jest, Vitest

## Documentation

The `/docs` directory contains detailed information about the system's architecture, components, and processes. Key documents include:

- `README.md`: General overview and entry point to the documentation.
- `file-structure.md`: Detailed breakdown of the project's file structure.
- `database.md`: Information on the database schema and migrations.
- `authentication.md`: Explanation of the authentication flow.
- `agents-and-workflow.md`: Details on the AI agents and processing workflow.
- `ui-overview.md`: Overview of the user interface components.
- `/DB-migration`: Contains scripts and tests for database migrations.

## Database Schema

The system uses a PostgreSQL database with the following schema:

### Institutions
```sql
CREATE TABLE public.institutions (
  id uuid PRIMARY KEY,           -- UUID, no default
  name varchar NOT NULL,
  email_domains text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

### Profiles
```sql
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,           -- Azure OID (canonical key)
  email text,
  name text,
  user_category text,
  npi text,
  recovery_email text,
  phone_number text,
  verification_status text DEFAULT 'not verified',
  institution_id uuid REFERENCES public.institutions(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

### User Settings
```sql
CREATE TABLE public.user_settings (
  id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  theme text DEFAULT 'light',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

### Medical Notes
```sql
CREATE TABLE public.medical_notes (
  id uuid PRIMARY KEY,           -- UUID, no default
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  provider_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  institution_id uuid REFERENCES public.institutions(id) ON DELETE SET NULL,
  
  mrn text,
  date_of_service timestamptz,
  insurance_provider text,
  status text DEFAULT 'INCOMPLETE',
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  operative_notes text,
  admission_notes text,
  discharge_notes text,
  pathology_notes text,
  progress_notes text,
  bedside_notes text,
  billable_notes text[],
  
  ai_raw_output jsonb,
  panel_data jsonb,
  final_processed_data jsonb,
  summary_data jsonb,
  
  workflow_status text DEFAULT 'processing',
  case_number text NOT NULL
);
```

All tables have `updated_at` triggers to automatically maintain timestamps.

## Authentication System

The authentication system uses Azure Entra ID with the following flow:

### Middleware Processing
1. Each request passes through `middleware.ts`
2. For protected routes, the middleware attempts to authenticate the user:
   - First tries `/.auth/me` endpoint (Azure Easy Auth)
   - Falls back to `X-MS-CLIENT-PRINCIPAL` header validation
3. User information is extracted and added to request headers:
   - `x-user-oid` (Object ID)
   - `x-user-email`
   - `x-user-issuer`
   - `x-user-name-identifier`
   - `x-user-tenant-id`
   - `x-user-provider-name`
   - `x-user-roles`
   - `x-user-raw` (Raw principal data)

### User Profile Management
The `/api/auth/me` endpoint:
1. Retrieves user data from middleware headers
2. Uses `ProfileService` to find or create user profile
3. Returns combined user authentication and profile data
4. Provides fallback data if profile service fails

### Key Implementation Details
- User ID is the Azure OID (Object ID)
- Profiles are automatically created on first access
- Development mode supports simulated authentication headers
- Unauthenticated API requests return 401 errors
- Unauthenticated UI requests redirect to login

## Case Processing Workflow

The AI processing workflow is orchestrated by the `WorkflowOrchestrator`:

### Entry Points
- UI: `app/cases/new/case-form.tsx`
- API: `app/actions/process-case.ts`
- Orchestrator: `lib/workflow/workflow-orchestrator.ts`

### Agent Pipeline
1. **CodeExtractionAgent**: Extracts procedure and diagnosis codes from medical notes
2. **CCIAgent**: Validates codes against CCI (Correct Coding Initiative) rules
3. **LCDAgent**: Checks coverage policies using LCD (Local Coverage Determinations)
4. **ModifierAssignmentAgent**: Assigns appropriate modifiers based on validation results
5. **ComprehensiveRVUAgent**: Calculates RVUs (Relative Value Units) and payment estimates

### Data Flow
1. Medical notes are submitted through the UI
2. Server action initiates the workflow
3. Each agent processes the data and adds to the shared `WorkflowState`
4. Results are stored in the `medical_notes` table
5. Final processed data is available in the dashboard

## Development Environment

### Local Development Setup
1. Environment variables:
   - `SIMULATE_XMS=true` for development authentication
   - `DEV_XMS_HEADER` contains base64 encoded simulated user data
2. Run with `npm run dev`
3. Access at `http://localhost:3000`

### Authentication in Development
- Uses simulated `X-MS-CLIENT-PRINCIPAL` headers
- Can be overridden per request with `x-local-xms` header
- Profile creation works the same as in production

### Testing
- Unit and integration tests in the `testing/` directory
- Run with `npm test`
- Uses Jest and Vitest frameworks

## Azure Deployment

### Authentication
- Uses Azure App Service Easy Auth with Entra ID
- Authentication endpoint: `/.auth/login/aad`
- User information available at `/.auth/me`

### Database
- PostgreSQL database hosted on Azure
- Connection strings provided via environment variables
- Schema deployed via migration scripts

### Key Differences from Development
- Real Azure authentication instead of simulated headers
- Production database instead of development database
- HTTPS enforced in production

## Best Practices

### Coding Standards
- Follow established coding styles and patterns within the codebase.
- Write clear, concise, and well-documented code.
- Ensure new code is covered by unit or integration tests.

### Documentation
- When changes are made to the system, the relevant documentation in the `/docs` directory should be updated accordingly.
- All changes should be confirmed and validated before updating the documentation to ensure accuracy.