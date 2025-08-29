# Scripts for Supabase Data Management and File Organization

This directory contains utility scripts to assist with managing test data in the Supabase database and organizing AI output JSON files.

## 1. `insert-test-medical-note.ts`

This script is used to insert sample medical note data, including AI raw output, into the `medical_notes` table in your Supabase database. It also copies the input JSON files into a designated sample data directory.

### Functionality

*   Reads AI raw output from a specified JSON file.
*   Inserts a new record into the `public.medical_notes` table with a generated UUID, a dummy user ID, and other predefined fields.
*   Sets the `ai_raw_output` column with the content from the input JSON file.
*   Sets the `status` of the medical note based on the provided command-line argument.
*   Copies the input JSON file into the `scripts/sample-ai-outputs/` directory.

### Prerequisites

Before running this script, ensure you have:
*   Node.js and npm installed.
*   The following npm packages installed in your project root:
    ```bash
    npm install @supabase/supabase-js uuid dotenv @types/node @types/uuid
    ```
*   Your Supabase credentials configured in a `.env.local` file in your project root (e.g., `/Users/thfo2021/VSC/oxkair2/.env.local`):
    ```
    NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
    SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
    ```
    **Note**: The `SUPABASE_SERVICE_ROLE_KEY` is used to bypass Row Level Security (RLS) for easy testing. In a production environment, you would typically use a client with RLS enabled and proper user authentication.

### Usage

To run the script, use `npx ts-node` followed by the script path, the JSON file path, and the desired case status:

```bash
npx ts-node scripts/insert-test-medical-note.ts <jsonFilePath> <noteFilePath> <noteType> <caseStatus>
```

**Arguments:**

*   `<jsonFilePath>`: The relative path to the JSON file containing the `ai_raw_output` data.
*   `<noteFilePath>`: The relative path to the medical note file (e.g., `.txt`, `.md`).
*   `<noteType>`: The type of medical note. Valid options currently include: `operative_notes`, `admission_notes`, `discharge_notes`, `pathology_notes`, `progress_notes`, `bedside_notes`.
*   `<caseStatus>`: The status to assign to the new medical note. Valid options are:
    *   `INCOMPLETE`
    *   `PENDING_CODER_REVIEW`
    *   `PENDING_PROVIDER_REVIEW`
    *   `PENDING_BILLING`

**Examples:**

```bash
# Insert a complex case (operative note) for coder review
npx ts-node scripts/insert-test-medical-note.ts scripts/sample-ai-outputs/complex-case-all-elements.json scripts/sample-notes/ent-surgery-operative.txt operative_notes PENDING_CODER_REVIEW

# Insert an empty AI output case with INCOMPLETE status (using a dummy operative note)
npx ts-node scripts/insert-test-medical-note.ts scripts/sample-ai-outputs/empty-ai-output.json scripts/sample-notes/new.txt operative_notes INCOMPLETE

# Insert a FESS case for coder review (using an ENT operative note)
npx ts-node scripts/insert-test-medical-note.ts scripts/sample-ai-outputs/fess-with-resident.json scripts/sample-notes/ent-surgery-operative.txt operative_notes PENDING_CODER_REVIEW

# Insert a cholecystectomy case for provider review (using a general surgery operative note)
npx ts-node scripts/insert-test-medical-note.ts scripts/sample-ai-outputs/cholecystectomy-infant.json scripts/sample-notes/general-surgery-operative.txt operative_notes PENDING_PROVIDER_REVIEW
```

## 2. `move-json-file.ts`

This script is a general utility to move a specified JSON file from a source path to a target directory.

### Functionality

*   Takes a source JSON file path and a target directory path as arguments.
*   Moves the source JSON file into the specified target directory.
*   Creates the target directory if it does not already exist.

### Prerequisites

Ensure you have Node.js and npm installed.

### Usage

```bash
npx ts-node scripts/move-json-file.ts <sourceFilePath> <targetDirectoryPath>
```

**Arguments:**

*   `<sourceFilePath>`: The relative path to the JSON file you want to move.
*   `<targetDirectoryPath>`: The relative path to the directory where you want to move the file.

**Example:**

```bash
npx ts-node scripts/move-json-file.ts ai_results.json scripts/sample-ai-outputs/
```

## File Structure for Sample AI Outputs

The `scripts/sample-ai-outputs/` directory is designed to store AI raw output JSON files.

```
scripts/
├── README.md                       # This file
├── insert-test-medical-note.ts     # Script to insert data into Supabase and organize JSONs
├── move-json-file.ts               # Script to move JSON files
└── sample-ai-outputs/
    ├── complex-case-all-elements.json # Example of a complex case
    ├── empty-ai-output.json           # Example of an incomplete AI output
    ├── fess-with-resident.json        # Example of FESS case with resident involvement
    └── cholecystectomy-infant.json    # Example of cholecystectomy case for infant
    # Add other AI output JSON files here