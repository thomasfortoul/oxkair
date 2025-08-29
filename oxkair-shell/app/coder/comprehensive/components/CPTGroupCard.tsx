"use client";

import React from "react";
import { CPTGroup } from "@/lib/coder/comprehensive-dashboard/types";
import { 
  EnhancedDiagnosisCode, 
  StandardizedModifier, 
  StandardizedEvidence,
  ModifierClassifications 
} from "@/lib/agents/newtypes";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  ChevronDown,
  ChevronUp,
  Check,
  AlertTriangle,
  Edit2,
  Trash2,
  Save,
  Plus,
  Undo2,
  HelpCircle,
} from "lucide-react";

interface CPTGroupCardProps {
  group: CPTGroup;
  index: number;
  isExpanded: boolean;
  isEditing: boolean;
  onToggleExpand: () => void;
  onEdit: () => void;
  onEvidenceClick: (
    evidence: StandardizedEvidence[] | undefined,
    sourceNoteType: string | undefined,
    justification?: string,
  ) => void;
  onDelete: () => void;
  onUpdate: (index: number, field: string, value: any) => void;
  onRevert: () => void;
  onSave: () => void;
}

export function CPTGroupCard({
  group,
  index,
  isExpanded,
  isEditing,
  onToggleExpand,
  onEdit,
  onEvidenceClick,
  onDelete,
  onUpdate,
  onRevert,
  onSave,
}: CPTGroupCardProps) {
  // Helper function to safely get work RVU value
  const getWorkRvuValue = (): number => {
    if (!group.rvu?.workRvu) return 0;
    
    // Handle new structure: {mp, pe, work}
    if (typeof group.rvu.workRvu === 'object' && 'work' in group.rvu.workRvu) {
      const workValue = group.rvu.workRvu.work;
      return typeof workValue === 'number' ? workValue : 0;
    }
    
    // Handle old structure: number
    if (typeof group.rvu.workRvu === 'number') {
      return group.rvu.workRvu;
    }
    
    // Handle string values that might need parsing
    if (typeof group.rvu.workRvu === 'string') {
      const parsed = parseFloat(group.rvu.workRvu);
      return isNaN(parsed) ? 0 : parsed;
    }
    
    // Handle unexpected object structure
    if (typeof group.rvu.workRvu === 'object') {
      console.error('Unexpected RVU structure:', group.rvu.workRvu);
      return 0;
    }
    
    return 0;
  };
  // Helper function to determine the highest severity level
  const getHighestSeverity = () => {
    const violations = [
      ...(group.compliance?.ptpViolations || []),
      ...(group.compliance?.mueViolations || []),
      ...(group.compliance?.globalViolations || []),
      ...(group.compliance?.lcdViolations || []),
      ...(group.compliance?.rvuViolations || []),
    ];

    if (violations.some((v) => v.severity === "ERROR")) return "ERROR";
    if (
      group.complianceIssues &&
      group.complianceIssues.some((issue) => issue.severity === "ERROR")
    )
      return "ERROR";

    if (violations.some((v) => v.severity === "WARNING")) return "WARNING";
    if (
      group.complianceIssues &&
      group.complianceIssues.some((issue) => issue.severity === "WARNING")
    )
      return "WARNING";

    if (violations.some((v) => v.severity === "INFO")) return "INFO";
    if (
      group.complianceIssues &&
      group.complianceIssues.some((issue) => issue.severity === "INFO")
    )
      return "INFO";

    // Check legacy status field as fallback
    if (group.compliance?.status === "error") return "ERROR";
    if (group.compliance?.status === "warning") return "WARNING";

    return "none";
  };

  const highestSeverity = getHighestSeverity();
  const handleIcdCodeChange = (
    icdIndex: number,
    field: "code" | "description",
    value: string,
  ) => {
    const updatedIcdCodes = [...group.icdCodes];
    updatedIcdCodes[icdIndex] = {
      ...updatedIcdCodes[icdIndex],
      [field]: value,
    };
    onUpdate(index, "icdCodes", updatedIcdCodes);
  };

  const addIcdCode = () => {
    const newIcdCode: EnhancedDiagnosisCode = {
      code: "",
      description: "",
      evidence: [],
      linkedCptCode: group.cptCode, // Use string reference to CPT code
    };
    onUpdate(index, "icdCodes", [...group.icdCodes, newIcdCode]);
  };

  const removeIcdCode = (icdIndex: number) => {
    const updatedIcdCodes = group.icdCodes.filter((_, i) => i !== icdIndex);
    onUpdate(index, "icdCodes", updatedIcdCodes);
  };

  const handleModifierChange = (
    modIndex: number,
    field: "modifier" | "rationale",
    value: string,
  ) => {
    const updatedModifiers = [...(group.modifiers || [])];
    updatedModifiers[modIndex] = {
      ...updatedModifiers[modIndex],
      [field]: value,
    };
    onUpdate(index, "modifiers", updatedModifiers);
  };

  const addModifier = () => {
    const newModifier: StandardizedModifier = {
      modifier: "",
      description: "",
      rationale: "",
      evidence: [],
      classification: ModifierClassifications.PRICING, // Default classification
      requiredDocumentation: false,
      linkedCptCode: group.cptCode, // Use string reference to CPT code
      feeAdjustment: "",
    };
    onUpdate(index, "modifiers", [...(group.modifiers || []), newModifier]);
  };

  const removeModifier = (modIndex: number) => {
    const updatedModifiers = (group.modifiers || []).filter(
      (_, i) => i !== modIndex,
    );
    onUpdate(index, "modifiers", updatedModifiers);
  };
  return (
    <Card
      className={`relative shadow-sm py-1 border-l-4 transition-colors ${
        highestSeverity === "ERROR"
          ? "border-l-red-500 hover:border-l-red-600 bg-red-50/30"
          : highestSeverity === "WARNING"
            ? "border-l-amber-500 hover:border-l-amber-600 bg-amber-50/30"
            : "border-l-blue-600 hover:border-l-blue-700"
      }`}
    >
      <CardHeader className="pb-1 pt-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  {isEditing ? (
                    <Input
                      value={group.cptCode}
                      onChange={(e) =>
                        onUpdate(index, "cptCode", e.target.value)
                      }
                      className="text-base font-semibold w-24"
                      placeholder="CPT Code"
                    />
                  ) : (
                    <button
                      className="text-lg font-semibold text-black hover:text-blue-700 cursor-pointer transition-colors"
                      onClick={() =>
                        onEvidenceClick(group.evidence, undefined)
                      }
                    >
                      {group.cptCode}
                    </button>
                  )}
                </TooltipTrigger>
                <TooltipContent>
                  <p>
                    {isEditing ? "Edit CPT code" : "Click to display evidence"}
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {isEditing ? (
              <Select
                value={group.tag}
                onValueChange={(value) => onUpdate(index, "tag", value)}
              >
                <SelectTrigger className="w-28 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Primary">Primary</SelectItem>
                  <SelectItem value="Secondary">Secondary</SelectItem>
                  <SelectItem value="Tertiary">Tertiary</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <Badge
                variant={group.tag === "Primary" ? "default" : "outline"}
                className={`text-xs ${
                  group.tag === "Primary"
                    ? "bg-blue-600 hover:bg-blue-700 text-white border-blue-600"
                    : "bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200"
                }`}
              >
                {group.tag}
              </Badge>
            )}

            {!isExpanded &&
              !isEditing &&
              group.modifiers?.map((modifier) => (
                <TooltipProvider key={modifier.modifier}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge
                        variant="secondary"
                        className="cursor-pointer bg-slate-100 hover:bg-blue-100 text-slate-700 hover:text-blue-700 border-slate-200 hover:border-blue-200"
                        onClick={() =>
                          onEvidenceClick(
                            modifier.evidence,
                            undefined,
                            modifier.rationale,
                          )
                        }
                      >
                        {modifier.modifier}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Click to display evidence</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ))}
          </div>

          {/* Top-right action area */}
          <div className="flex items-center gap-1">
            {isEditing ? (
              // Action bar with Save, Delete, and Revert
              <>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-green-600"
                        onClick={onSave}
                      >
                        <Save className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Save changes</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-red-500 hover:text-red-700"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              Delete Code Group
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete this code group?
                              This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={onDelete}>
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Delete code</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={onRevert}
                      >
                        <Undo2 className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Revert changes</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </>
            ) : (
              // Edit button and collapse chevron (when not editing)
              <>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={onEdit}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Edit</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                {isExpanded && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={onToggleExpand}
                        >
                          <ChevronUp className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Collapse</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0 pb-1">
        {!isExpanded ? (
          <React.Fragment>
            <div className="space-y-1">
              {isEditing ? (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Input
                        value={group.icdCodes?.[0]?.code || ""}
                        onChange={(e) =>
                          handleIcdCodeChange(0, "code", e.target.value)
                        }
                        className="text-base font-medium w-32"
                        placeholder="ICD Code"
                      />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Edit primary diagnosis code</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {group.icdCodes && group.icdCodes.length > 0 ? (
                    group.icdCodes.map((icd, icdIndex) => (
                      <TooltipProvider key={icdIndex}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <p
                              className="text-base font-medium text-black cursor-pointer hover:text-blue-700 transition-colors"
                              onClick={() =>
                                onEvidenceClick(
                                  icd.evidence,
                                  undefined,
                                )
                              }
                            >
                              {icd.code}
                              {icdIndex < group.icdCodes.length - 1 && ","}
                            </p>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Click to display evidence for {icd.code}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ))
                  ) : (
                    <p className="text-base font-medium text-gray-500">
                      No diagnosis code
                    </p>
                  )}
                </div>
              )}

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    {isEditing ? (
                      <Input
                        type="number"
                        value={getWorkRvuValue().toString()}
                        onChange={(e) => {
                          const value = parseFloat(e.target.value);
                          const numericValue = isNaN(value) ? 0 : value;
                          onUpdate(
                            index,
                            "rvu.workRvu.work",
                            numericValue,
                          );
                        }}
                        className="text-sm w-24"
                      />
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        {getWorkRvuValue()} RVU
                      </p>
                    )}
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Work Relative Value Units</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>

            {/* Bottom-right area for collapsed view */}
            <div className="absolute bottom-2 right-2 flex gap-1">
              {/* Compliance indicator (former edit-button slot) */}
              {!isEditing && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-6 w-6">
                        {highestSeverity === "ERROR" ? (
                          <AlertTriangle className="h-4 w-4 text-red-500" />
                        ) : highestSeverity === "WARNING" ? (
                          <HelpCircle className="h-4 w-4 text-amber-600" />
                        ) : (
                          <Check className="h-4 w-4 text-green-500" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-sm">
                      {highestSeverity === "ERROR" ? (
                        <div className="space-y-1">
                          <p className="font-medium text-red-600">
                            Has compliance issues
                          </p>
                          {group.compliance?.ptpViolations &&
                            group.compliance.ptpViolations.filter(
                              (v) => v.severity === "ERROR",
                            ).length > 0 && (
                              <p className="text-xs">
                                •{" "}
                                {
                                  group.compliance.ptpViolations.filter(
                                    (v) => v.severity === "ERROR",
                                  ).length
                                }{" "}
                                PTP error(s)
                              </p>
                            )}
                          {group.compliance?.mueViolations &&
                            group.compliance.mueViolations.filter(
                              (v) => v.severity === "ERROR",
                            ).length > 0 && (
                              <p className="text-xs">
                                •{" "}
                                {
                                  group.compliance.mueViolations.filter(
                                    (v) => v.severity === "ERROR",
                                  ).length
                                }{" "}
                                MUE error(s)
                              </p>
                            )}
                          {group.compliance?.globalViolations &&
                            group.compliance.globalViolations.filter(
                              (v) => v.severity === "ERROR",
                            ).length > 0 && (
                              <p className="text-xs">
                                •{" "}
                                {
                                  group.compliance.globalViolations.filter(
                                    (v) => v.severity === "ERROR",
                                  ).length
                                }{" "}
                                Global period error(s)
                              </p>
                            )}
                          {group.compliance?.lcdViolations &&
                            group.compliance.lcdViolations.filter(
                              (v) => v.severity === "ERROR",
                            ).length > 0 && (
                              <p className="text-xs">
                                •{" "}
                                {
                                  group.compliance.lcdViolations.filter(
                                    (v) => v.severity === "ERROR",
                                  ).length
                                }{" "}
                                LCD error(s)
                              </p>
                            )}
                          {group.compliance?.rvuViolations &&
                            group.compliance.rvuViolations.filter(
                              (v) => v.severity === "ERROR",
                            ).length > 0 && (
                              <p className="text-xs">
                                •{" "}
                                {
                                  group.compliance.rvuViolations.filter(
                                    (v) => v.severity === "ERROR",
                                  ).length
                                }{" "}
                                RVU error(s)
                              </p>
                            )}
                          {group.complianceIssues &&
                            group.complianceIssues.filter(
                              (issue) => issue.severity === "ERROR",
                            ).length > 0 && (
                              <p className="text-xs">
                                •{" "}
                                {
                                  group.complianceIssues.filter(
                                    (issue) => issue.severity === "ERROR",
                                  ).length
                                }{" "}
                                high severity issue(s)
                              </p>
                            )}
                          <p className="text-xs text-gray-600 mt-1">
                            Click to expand for details
                          </p>
                        </div>
                      ) : highestSeverity === "WARNING" ? (
                        <div className="space-y-1">
                          <p className="font-medium text-amber-600">
                            Compliance warnings found
                          </p>
                          {group.compliance?.ptpViolations &&
                            group.compliance.ptpViolations.filter(
                              (v) => v.severity === "WARNING",
                            ).length > 0 && (
                              <p className="text-xs">
                                •{" "}
                                {
                                  group.compliance.ptpViolations.filter(
                                    (v) => v.severity === "WARNING",
                                  ).length
                                }{" "}
                                PTP warning(s)
                              </p>
                            )}
                          {group.compliance?.mueViolations &&
                            group.compliance.mueViolations.filter(
                              (v) => v.severity === "WARNING",
                            ).length > 0 && (
                              <p className="text-xs">
                                •{" "}
                                {
                                  group.compliance.mueViolations.filter(
                                    (v) => v.severity === "WARNING",
                                  ).length
                                }{" "}
                                MUE warning(s)
                              </p>
                            )}
                          {group.compliance?.globalViolations &&
                            group.compliance.globalViolations.filter(
                              (v) => v.severity === "WARNING",
                            ).length > 0 && (
                              <p className="text-xs">
                                •{" "}
                                {
                                  group.compliance.globalViolations.filter(
                                    (v) => v.severity === "WARNING",
                                  ).length
                                }{" "}
                                Global period warning(s)
                              </p>
                            )}
                          {group.compliance?.lcdViolations &&
                            group.compliance.lcdViolations.filter(
                              (v) => v.severity === "WARNING",
                            ).length > 0 && (
                              <p className="text-xs">
                                •{" "}
                                {
                                  group.compliance.lcdViolations.filter(
                                    (v) => v.severity === "WARNING",
                                  ).length
                                }{" "}
                                LCD warning(s)
                              </p>
                            )}
                          {group.compliance?.rvuViolations &&
                            group.compliance.rvuViolations.filter(
                              (v) => v.severity === "WARNING",
                            ).length > 0 && (
                              <p className="text-xs">
                                •{" "}
                                {
                                  group.compliance.rvuViolations.filter(
                                    (v) => v.severity === "WARNING",
                                  ).length
                                }{" "}
                                RVU warning(s)
                              </p>
                            )}
                          {group.complianceIssues &&
                            group.complianceIssues.filter(
                              (issue) => issue.severity === "WARNING",
                            ).length > 0 && (
                              <p className="text-xs">
                                •{" "}
                                {
                                  group.complianceIssues.filter(
                                    (issue) => issue.severity === "WARNING",
                                  ).length
                                }{" "}
                                medium severity issue(s)
                              </p>
                            )}
                          <p className="text-xs text-gray-600 mt-1">
                            Click to expand for details
                          </p>
                        </div>
                      ) : highestSeverity === "INFO" ? (
                        <div className="space-y-1">
                          <p className="font-medium text-blue-600">
                            Compliance info available
                          </p>
                          {group.complianceIssues &&
                            group.complianceIssues.filter(
                              (issue) => issue.severity === "INFO",
                            ).length > 0 && (
                              <p className="text-xs">
                                •{" "}
                                {
                                  group.complianceIssues.filter(
                                    (issue) => issue.severity === "INFO",
                                  ).length
                                }{" "}
                                low severity issue(s)
                              </p>
                            )}
                          <p className="text-xs text-gray-600 mt-1">
                            Click to expand for details
                          </p>
                        </div>
                      ) : (
                        <p>No compliance issues</p>
                      )}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}

              {/* Expand chevron */}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={onToggleExpand}
                    >
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Expand</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </React.Fragment>
        ) : (
          <div className="pt-2 border-t mt-1">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <p
                    className="text-sm text-gray-700 cursor-pointer hover:text-blue-600 transition-colors"
                    onClick={() =>
                      onEvidenceClick(group.evidence, undefined)
                    }
                  >
                    {group.description || "No description available"}
                  </p>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Click to display evidence</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <div className="py-3 border-t border-gray-100 mt-3">
              <div className="flex justify-between items-center mb-2">
                <h4 className="text-sm font-medium text-blue-800">
                  Diagnosis Codes
                </h4>
                {isEditing && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={addIcdCode}
                    className="h-6 px-2"
                  >
                    <Plus className="h-3 w-3 mr-1" /> Add
                  </Button>
                )}
              </div>
              <div className="space-y-2">
                {group.icdCodes.map((icd, icdIndex) => (
                  <div key={icdIndex} className="flex items-center gap-2">
                    {isEditing ? (
                      <>
                        <Input
                          value={icd.code}
                          onChange={(e) =>
                            handleIcdCodeChange(
                              icdIndex,
                              "code",
                              e.target.value,
                            )
                          }
                          className="text-sm font-medium w-24"
                          placeholder="Code"
                        />
                        <Input
                          value={icd.description}
                          onChange={(e) =>
                            handleIcdCodeChange(
                              icdIndex,
                              "description",
                              e.target.value,
                            )
                          }
                          className="text-sm flex-1"
                          placeholder="Description"
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-red-500"
                          onClick={() => removeIcdCode(icdIndex)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    ) : (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div
                              className="cursor-pointer hover:text-blue-600 transition-colors w-full"
                              onClick={() =>
                                onEvidenceClick(
                                  icd.evidence,
                                  undefined,
                                )
                              }
                            >
                              <p className="text-sm font-medium text-black">
                                {icd.code}
                              </p>
                              <p className="text-sm text-gray-600">
                                {icd.description || "No description"}
                              </p>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Click to display evidence</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>
                ))}
                {group.icdCodes.length === 0 && !isEditing && (
                  <p className="text-sm text-muted-foreground">
                    No diagnosis codes.
                  </p>
                )}
              </div>
            </div>

            <div className="py-3 border-t border-gray-100">
              <div className="flex justify-between items-center mb-2">
                <h4 className="text-sm font-medium text-blue-800">Modifiers</h4>
                {isEditing && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={addModifier}
                    className="h-6 px-2"
                  >
                    <Plus className="h-3 w-3 mr-1" /> Add
                  </Button>
                )}
              </div>
              <div className="space-y-2">
                {(group.modifiers || []).map((modifier, modIndex) => (
                  <div key={modIndex} className="flex items-center gap-2">
                    {isEditing ? (
                      <>
                        <Input
                          value={modifier.modifier || ""}
                          onChange={(e) =>
                            handleModifierChange(
                              modIndex,
                              "modifier",
                              e.target.value,
                            )
                          }
                          className="text-sm w-20"
                          placeholder="Mod"
                        />
                        <Input
                          value={modifier.rationale}
                          onChange={(e) =>
                            handleModifierChange(
                              modIndex,
                              "rationale",
                              e.target.value,
                            )
                          }
                          className="text-sm flex-1"
                          placeholder="Rationale"
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-red-500"
                          onClick={() => removeModifier(modIndex)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    ) : (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div
                              className="cursor-pointer hover:text-blue-600 w-full"
                              onClick={() =>
                                onEvidenceClick(
                                  modifier.evidence,
                                  undefined,
                                  modifier.rationale,
                                )
                              }
                            >
                              <div className="flex items-center gap-2 mb-1">
                                <Badge variant="secondary">
                                  {modifier.modifier}
                                </Badge>
                                {modifier.requiredDocumentation && (
                                  <Badge variant="destructive">Required</Badge>
                                )}
                              </div>
                              <p className="text-sm text-gray-600">
                                {modifier.rationale || "No rationale"}
                              </p>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Click to display evidence</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>
                ))}
                {(group.modifiers || []).length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    {isEditing
                      ? "No modifiers. Add one above."
                      : "Modifiers: none"}
                  </p>
                )}
              </div>
            </div>

            <div className="py-3 border-t border-gray-100">
              <h4 className="text-sm font-medium text-blue-800 mb-1">
                RVU Details
              </h4>
              <div className="flex gap-4 text-sm text-gray-600 items-center">
                <div className="flex items-center gap-2">
                  <span>Work RVU:</span>
                  {isEditing ? (
                    <Input
                      type="number"
                      value={getWorkRvuValue().toString()}
                      onChange={(e) => {
                        const value = parseFloat(e.target.value);
                        const numericValue = isNaN(value) ? 0 : value;
                        onUpdate(
                          index,
                          "rvu.workRvu.work",
                          numericValue,
                        );
                      }}
                      className="text-sm w-24 h-8"
                    />
                  ) : (
                    <span>{getWorkRvuValue().toFixed(2)}</span>
                  )}
                </div>
                {/* <span>Adjusted RVU: {(group.rvu?.adjustedRvu?.work || 0) + (group.rvu?.adjustedRvu?.pe || 0) + (group.rvu?.adjustedRvu?.mp || 0)}</span> */}
              </div>
            </div>

            <div className="py-3 border-t border-gray-100">
              <h4 className="text-sm font-medium text-blue-800 mb-1">
                Global Period
              </h4>
              <div className="flex gap-4 text-sm text-gray-600 items-center">
                {group.globalPeriod ? (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="cursor-help underline decoration-dotted">
                          {group.globalPeriod === "000"
                            ? "No global period"
                            : group.globalPeriod === "010"
                              ? "10 days"
                              : group.globalPeriod === "090"
                                ? "90 days"
                                : group.globalPeriod}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-sm">
                        <p>
                          {group.globalPeriodDescription ||
                            `Global period: ${group.globalPeriod}`}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : (
                  <span>N/A</span>
                )}
              </div>
            </div>

            <div className="py-3 border-t border-gray-100">
              <h4 className="text-sm font-medium text-blue-800 mb-1">
                Compliance
              </h4>

              {/* Compliance Issues */}
              {group.complianceIssues && group.complianceIssues.length > 0 && (
                <div className="mt-3">
                  {group.complianceIssues.map((issue, index) => (
                    <div
                      key={index}
                      className={`border rounded p-2 mb-2 ${
                        issue.severity === "INFO"
                          ? "bg-blue-50 border-blue-200"
                          : issue.severity === "WARNING"
                            ? "bg-amber-50 border-amber-200"
                            : "bg-red-50 border-red-200"
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className={`text-xs font-medium ${
                            issue.severity === "INFO"
                              ? "text-blue-800"
                              : issue.severity === "WARNING"
                                ? "text-amber-800"
                                : "text-red-800"
                          }`}
                        >
                          {issue.type}
                        </span>
                        <span
                          className={`text-xs px-1 rounded ${
                            issue.severity === "INFO"
                              ? "bg-blue-100 text-blue-700"
                              : issue.severity === "WARNING"
                                ? "bg-amber-100 text-amber-700"
                                : "bg-red-100 text-red-700"
                          }`}
                        >
                          {issue.severity.toUpperCase()}
                        </span>
                      </div>
                      <p
                        className={`text-xs mb-1 ${
                          issue.severity === "INFO"
                            ? "text-blue-700"
                            : issue.severity === "WARNING"
                              ? "text-amber-700"
                              : "text-red-700"
                        }`}
                      >
                        {issue.description}
                      </p>
                      {/* <div className="mt-1">
                        <span className="text-xs text-gray-600">
                          {issue.recommendation}
                        </span>
                      </div> */}
                    </div>
                  ))}
                </div>
              )}

              {/* Show "No compliance issues" only when there are truly no issues */}
              {highestSeverity === "none" &&
                !group.compliance?.violationDetails && (
                  <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded">
                    <p className="text-sm text-green-700">
                      No compliance issues
                    </p>
                  </div>
                )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
