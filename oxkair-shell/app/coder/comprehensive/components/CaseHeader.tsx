"use client"

import React from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Save, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CaseIdentifier } from "@/components/ui/case-identifier"
import type { MedicalNote } from "@/lib/coder/comprehensive-dashboard/types"

interface CaseHeaderProps {
  caseData: MedicalNote | null
  caseId: string
  cptGroupsCount: number
  onSave: () => void
  onSubmit: () => void
  isSubmitting: boolean
}

export function CaseHeader({
  caseData,
  caseId,
  cptGroupsCount,
  onSave,
  onSubmit,
  isSubmitting,
}: CaseHeaderProps) {
  const router = useRouter()

  return (
    <header className="flex items-center justify-between px-8 py-4 border-b bg-white border-b-blue-100">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push("/coder/comprehensive")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-semibold">
            <CaseIdentifier
              case={caseData}
              caseId={caseId}
              variant="title"
              showTitle={true}
            />
          </h1>
          <p className="text-sm text-muted-foreground">
            {caseData?.mrn && `MRN: ${caseData.mrn}`}
            {caseData?.date_of_service &&
              ` • Service Date: ${new Date(caseData.date_of_service).toLocaleDateString()}`}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">
          {cptGroupsCount} code{cptGroupsCount !== 1 ? 's' : ''}
        </span>
        <Button 
          variant="outline" 
          onClick={onSave} 
          disabled={isSubmitting}
        >
          <Save className="h-4 w-4 mr-2" />
          Save
        </Button>
        <Button 
          onClick={onSubmit} 
          disabled={isSubmitting}
          className="bg-blue-600 hover:bg-blue-700 text-white"
        >
          <Send className="h-4 w-4 mr-2" />
          {isSubmitting ? "Submitting..." : "Submit to Provider"}
        </Button>
      </div>
    </header>
  )
}