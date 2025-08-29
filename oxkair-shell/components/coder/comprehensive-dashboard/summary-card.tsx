"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import type {
  EnhancedProcedureCode,
  EnhancedDiagnosisCode,
  StandardizedModifier,
} from "@/lib/agents/newtypes";

export interface SummaryCardData {
  patientName: string;
  mrn: string;
  dateOfService: string;
  providerName: string;
  procedureCodes: {
    code: string;
    modifiers: StandardizedModifier[];
    description?: string;
    workRvu: number;
    adjustedRvu: number;
    diagnosisCodes: EnhancedDiagnosisCode[];
  }[];
  comments: string;
  billableNote: string;
}

interface SummaryCardProps {
  summaryData: SummaryCardData;
  isReadOnly?: boolean;
  onCommentsChange?: (comments: string) => void;
  className?: string;
}

export function SummaryCard({
  summaryData,
  isReadOnly = false,
  onCommentsChange,
  className = "",
}: SummaryCardProps) {
  const handleCommentsChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (onCommentsChange) {
      onCommentsChange(e.target.value);
    }
  };

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } catch {
      return dateString;
    }
  };

  const totalProcedures = summaryData.procedureCodes.length;
  const allIcdCodes = summaryData.procedureCodes.flatMap((proc) =>
    proc.diagnosisCodes.map((dx) => (typeof dx === "string" ? dx : dx.code)),
  );
  const totalUniqueIcdCodes = new Set(allIcdCodes).size;
  const totalAdjustedRVUs = summaryData.procedureCodes.reduce(
    (sum, proc) => sum + (proc.adjustedRvu || 0),
    0,
  );

  return (
    <Card className={`w-full max-w-2xl ${className}`}>
      {!className?.includes("shadow-none") && (
        <CardHeader className="pb-4">
          <CardTitle className="text-xl font-semibold text-center">
            Billing Summary
          </CardTitle>
        </CardHeader>
      )}
      <CardContent
        className={`space-y-4 ${className?.includes("shadow-none") ? "pt-0" : ""}`}
      >
        {/* Patient Information */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-sm text-muted-foreground">
              Patient Name
            </Label>
            <p className="text-sm">{summaryData.patientName}</p>
          </div>
          <div>
            <Label className="text-sm text-muted-foreground">MRN</Label>
            <p className="text-sm">{summaryData.mrn}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-sm text-muted-foreground">
              Date of Service
            </Label>
            <p className="text-sm">{formatDate(summaryData.dateOfService)}</p>
          </div>
          <div>
            <Label className="text-sm text-muted-foreground">Provider</Label>
            <p className="text-sm">{summaryData.providerName}</p>
          </div>
        </div>

        <Separator />

        {/* Procedure and Diagnosis Table */}
        <div className="space-y-2">
          {/* Table Header */}
          <div className="grid grid-cols-[2fr_3fr_2fr_1fr] gap-4 px-2 pb-2 border-b">
            <Label className="text-sm font-medium text-muted-foreground">
              Procedure Codes
            </Label>
            <Label className="text-sm font-medium text-muted-foreground">
              Description
            </Label>
            <Label className="text-sm font-medium text-muted-foreground">
              Diagnosis Codes
            </Label>
            <Label className="text-sm font-medium text-muted-foreground text-right">
              RVU
            </Label>
          </div>
          {/* Table Body */}
          <div className="space-y-2">
            {summaryData.procedureCodes.map((procedure, index) => (
              <div
                key={index}
                className="grid grid-cols-[2fr_3fr_2fr_1fr] gap-4 p-2 bg-muted/50 rounded-md items-start"
              >
                {/* Procedure Codes */}
                <div className="flex flex-wrap items-center gap-1">
                  <Badge variant="outline" className="font-mono text-xs">
                    {procedure.code}
                  </Badge>
                  {procedure.modifiers.map((modifier, modIndex) => (
                    <Badge
                      key={modIndex}
                      variant="secondary"
                      className="font-mono text-xs"
                    >
                      {modifier.modifier || "N/A"}
                    </Badge>
                  ))}
                </div>
                {/* Description */}
                <div
                  className="text-sm text-muted-foreground truncate"
                  title={procedure.description}
                >
                  {procedure.description || "N/A"}
                </div>
                {/* Diagnosis Codes */}
                <div className="flex flex-wrap gap-1">
                  {procedure.diagnosisCodes.map((dxCode, dxIndex) => (
                    <Badge
                      key={dxIndex}
                      variant="outline"
                      className="font-mono text-xs"
                    >
                      {typeof dxCode === "string" ? dxCode : dxCode.code}
                    </Badge>
                  ))}
                </div>
                {/* RVU */}
                <div className="text-sm text-right">
                  {procedure.workRvu.toFixed(2)}
                </div>
              </div>
            ))}
          </div>
        </div>

        <Separator />

        {/* Totals Section */}
        <div className="grid grid-cols-3 gap-4 px-2 text-center">
          <div>
            <p className="text-sm text-muted-foreground">Total Procedures</p>
            <p className="text-lg font-semibold">{totalProcedures}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Total ICD Codes</p>
            <p className="text-lg font-semibold">{totalUniqueIcdCodes}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Total Adjusted RVU</p>
            <p className="text-lg font-semibold">
              {totalAdjustedRVUs.toFixed(2)}
            </p>
          </div>
        </div>

        <Separator />

        {/* Billable Note */}
        {summaryData.billableNote && (
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="item-1">
              <AccordionTrigger className="text-sm">
                View Billable Note
              </AccordionTrigger>
              <AccordionContent>
                <div className="p-3 bg-muted/50 rounded-md">
                  <p className="text-sm whitespace-pre-wrap">
                    {summaryData.billableNote}
                  </p>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}

        {/* Comments */}
        <div>
          <Label
            htmlFor="comments"
            className="text-sm text-muted-foreground mb-2 block"
          >
            Comments
          </Label>
          {isReadOnly ? (
            <div className="p-3 bg-muted/50 rounded-md min-h-[80px]">
              <p className="text-sm whitespace-pre-wrap">
                {summaryData.comments || "No comments provided."}
              </p>
            </div>
          ) : (
            <Textarea
              id="comments"
              value={summaryData.comments}
              onChange={handleCommentsChange}
              placeholder="Add any additional comments or notes..."
              className="min-h-[80px] resize-none"
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// Utility function to generate summary data from case data
export function generateSummaryData(
  caseData: any,
  dashboardState?: any,
): SummaryCardData {
  // Extract patient demographics
  const demographics = caseData?.panel_data?.demographics || {};

  // Extract procedure codes from dashboard state or case data
  const procedureCodes =
    dashboardState?.panelData?.groupedProcedures?.map((proc: any) => ({
      code: proc.cptCode || "",
      modifiers: proc.modifiers || [],
      description: proc.description || "",
      workRvu: proc.rvu?.workRvu || 0,
      adjustedRvu: proc.rvu?.adjustedRvu || 0,
      diagnosisCodes: proc.icdCodes || [],
    })) || [];

  // Extract billable note from AI output if available
  const billableNote =
    caseData?.ai_raw_output?.billing_summary ||
    caseData?.ai_raw_output?.summary ||
    "";

  return {
    patientName: demographics.patient_name || "Unknown Patient",
    mrn: caseData?.mrn || demographics.mrn || "",
    dateOfService: caseData?.date_of_service || demographics.service_date || "",
    providerName: demographics.provider_name || "Unknown Provider",
    procedureCodes,
    comments: "",
    billableNote,
  };
}
