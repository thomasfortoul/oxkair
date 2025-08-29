
Last updated: 2025-08-21 12:15 UTC

# UI Overview

[Back to Master Index](./README.md)

This document provides an overview of the user interface, including the route structure, key components, and client-side state management patterns.

## Route Tree

The application's routes are defined by the directory structure under `oxkair-shell/app/`.

-   `/` (`page.tsx`): The main landing page, which handles authentication and redirects users to the dashboard.
-   `/coder/comprehensive`: The main dashboard view where users can see a list of all cases.
-   `/coder/comprehensive/[caseId]` (`page.tsx`): The detailed view for a single case. This is where the results of the AI processing are displayed in the `ComprehensiveDashboard` component.
-   `/cases/new` (`page.tsx`): The form for creating a new medical case. The core of this page is the `CaseForm` component.
-   `/auth/signup` (`page.tsx`): A page for user signup.
-   `/api/`: Contains all API routes for server-side logic, such as authentication, database operations, and AI processing.

## Critical Components

-   **`AppLayout`** (`oxkair-shell/components/nav/AppLayout.tsx`): The main layout component that wraps most pages. It includes the `NavBar`, `SideBar`, and `Footer`.

-   **`CaseForm`** (`oxkair-shell/app/cases/new/case-form.tsx`): A client component that handles the creation and editing of medical cases. It includes state management for form inputs, file uploads (CSV), and submission to the backend.

-   **`ComprehensiveDashboard`** (`oxkair-shell/components/coder/comprehensive-dashboard/comprehensive-dashboard.tsx`): The central component for displaying the results of a processed case. It takes `caseData` as a prop and renders various cards and panels to show the extracted codes, compliance flags, and RVU calculations.

-   **Shared UI Primitives**: The application uses `shadcn/ui` for its component library, located in `oxkair-shell/components/ui/`. These include common elements like `Button`, `Card`, `Input`, `Select`, and `Dialog`.

## Client-Side State Management

-   **React State (`useState`, `useEffect`)**: The primary method for managing component-level state. This is used extensively in `CaseForm` to handle form data and in `ComprehensiveDashboard` to manage the display of case data.

-   **Authentication (`useAuth`)**: The `useAuth` hook from `oxkair-shell/lib/auth/auth-context.tsx` provides access to the current user's authentication status and profile information throughout the application.

-   **Server Actions**: The `CaseForm` component invokes a server action, `processOperativeNoteAction` (from `oxkair-shell/app/actions/process-case.ts`), to initiate the AI processing workflow on the server. This is a key interaction point between the client and the backend.

-   **Loading/Error Conventions**:
    -   **Loading**: Components typically use a `loading` state variable to display spinners or skeletons while data is being fetched. The `ComprehensiveDashboard` and `CaseForm` both show loading states.
    -   **Error**: Errors are caught in `try...catch` blocks, and an `error` state variable is used to display error messages to the user.

## Update Checklist

When making changes to the UI, please update this document:

-   [ ] Add any new routes to the route tree.
-   [ ] Document any new critical or shared components.
-   [ ] Describe any changes to client-side state management patterns (e.g., introduction of a new state management library).
-   [ ] Update screenshots/GIFs if they are added to the repository.
