"use client";

import { Suspense, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { CaseForm } from "./case-form";
import { Footer } from "@/components/nav/Footer";
import {
  getMedicalNoteById,
  medicalNotesClient,
  MedicalNote,
} from "@/lib/api/medical-notes-client";

function NewCasePageContent() {
  const searchParams = useSearchParams();
  const caseId = searchParams.get("caseId");
  const [caseData, setCaseData] = useState<MedicalNote | null>(null);
  const [isLoading, setIsLoading] = useState(!!caseId);
  const [title, setTitle] = useState(
    caseId ? "Loading Case..." : "Create New Case",
  );

  useEffect(() => {
    if (caseId) {
      setIsLoading(true);
      getMedicalNoteById(caseId)
        .then((data) => {
          if (data) {
            setCaseData(data);
            setTitle(`Edit Case: ${data.case_number || data.id}`);
          } else {
            setTitle("Case not found");
          }
        })
        .catch((error) => {
          console.error("Failed to fetch case data:", error);
          setTitle("Error loading case");
        })
        .finally(() => {
          setIsLoading(false);
        });
    } else {
      setIsLoading(false);
      setTitle("Create New Case");
    }
  }, [caseId]);

  if (isLoading) {
    return <div className="p-6">Loading case details...</div>;
  }

  return (
    <div className="flex-1">
      <CaseForm caseId={caseId} title={title} initialData={caseData} />
    </div>
  );
}

export default function NewCasePage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Suspense fallback={<div>Loading case details...</div>}>
        <NewCasePageContent />
      </Suspense>
      <Footer />
    </div>
  );
}
