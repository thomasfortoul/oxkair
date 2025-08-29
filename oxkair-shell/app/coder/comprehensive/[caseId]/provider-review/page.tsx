"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import { SummaryCard, type SummaryCardData } from "@/components/coder/comprehensive-dashboard/summary-card";
import { useAuth } from "@/lib/auth/auth-context";
import { getMedicalNoteById, medicalNotesClient } from "@/lib/api/medical-notes-client";
import { CaseIdentifier } from "@/components/ui/case-identifier";
import { dashboardAPI } from "@/lib/coder/comprehensive-dashboard/api";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TooltipProvider } from "@/components/ui/tooltip";
import { generateSummaryData } from "@/components/coder/comprehensive-dashboard/summary-card";
import { OperativeNote } from "../../components/OperativeNote";
import { Footer } from "@/components/nav/Footer";

interface MedicalNote {
  id: string;
  user_id?: string;
  mrn?: string;
  date_of_service?: string | null;
  insurance_provider?: string | null;
  content?: string;
  operative_notes?: string;
  admission_notes?: string;
  discharge_notes?: string;
  pathology_notes?: string;
  progress_notes?: string;
  bedside_notes?: string;
  title?: string;
  status?: string;
  summary_data?: SummaryCardData;
  created_at?: string | null;
  updated_at?: string | null;
}

export default function ProviderReviewPage() {
  const router = useRouter();
  const params = useParams();
  const { user } = useAuth();

  const caseId = params.caseId as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [caseData, setCaseData] = useState<MedicalNote | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<'provider' | 'coder' | null>(null);

  // State for OperativeNote component
  const [contextualContent, setContextualContent] = useState<{
    type: "note" | "lcd"
    content: string
    highlight?: string | string[]
    sourceNoteType?: string
    policyId?: string
    evidenceDescription?: string
  } | null>(null);

  // Ref for the operative note container to enable scrolling
  const operativeNoteRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loadCaseData = async () => {
      if (!user?.id || !caseId) return;

      try {
        setLoading(true);
        // Set the authenticated user ID in the medical notes client
        medicalNotesClient.setUserId(user.id);
        const data = await getMedicalNoteById(caseId);

        if (!data) {
          setError("Case not found or access denied");
          return;
        }

        // Check if user is either the assigned provider or the original coder
        const isProvider = data.provider_user_id === user.id;
        const isCoder = data.user_id === user.id;
        
        // Check if user has processor or admin role (can view all cases)
        // Also check if user is a coder (should be able to view cases)
        const userRoles = user.roles || [];
        const userCategory = user.user_metadata?.userCategory || '';
        const hasProcessorRole = userRoles.includes('processor') || userRoles.includes('admin');
        const isUserCoder = userCategory === 'coder' || userCategory === 'Medical Coder' || userRoles.includes('coder');
        
        // Allow access if user is the provider, original coder, has processor/admin role, or is a coder
        if (!isProvider && !isCoder && !hasProcessorRole && !isUserCoder) {
          setError("You are not authorized to view this review page.");
          return;
        }

        // Set user role for UI display
        let determinedRole: 'provider' | 'coder' = 'coder';
        if (isProvider) {
          determinedRole = 'provider';
        } else if (hasProcessorRole) {
          // For processor/admin, show as coder interface unless they're specifically the provider
          determinedRole = 'coder';
        }
        setUserRole(determinedRole);

        // Check case status - allow access for both PENDING_PROVIDER_REVIEW and PENDING_BILLING
        if (data.status !== "PENDING_PROVIDER_REVIEW" && data.status !== "PENDING_BILLING") {
          setError("This case is not available for review");
          return;
        }

        setCaseData(data);
      } catch (err: unknown) {
        console.error("Error loading case:", err);
        setError(err instanceof Error ? err.message : "An unknown error occurred");
      } finally {
        setLoading(false);
      }
    };

    loadCaseData();
  }, [caseId, user]);

  const handleApprove = async () => {
    if (!caseData) return;

    setIsSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(null);

    try {
      const result = await dashboardAPI.updateCaseData(caseId, {
        status: "PENDING_BILLING",
        provider_approved_at: new Date().toISOString(),
        provider_decision: "approved"
      });

      if (result.error) {
        throw new Error(result.error);
      }

      setSubmitSuccess("Case approved successfully!");
      setTimeout(() => {
        router.push("/coder/comprehensive");
      }, 2000);
    } catch (err: unknown) {
      console.error("Error approving case:", err);
      setSubmitError(err instanceof Error ? err.message : "Failed to approve case");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!caseData) return;

    setIsSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(null);

    try {
      const result = await dashboardAPI.updateCaseData(caseId, {
        status: "PENDING_CODER_REVIEW",
        provider_approved_at: new Date().toISOString(),
        provider_decision: "rejected"
      });

      if (result.error) {
        throw new Error(result.error);
      }

      setSubmitSuccess("Case rejected and sent back to coder for review!");
      setTimeout(() => {
        router.push("/coder/comprehensive");
      }, 2000);
    } catch (err: unknown) {
      console.error("Error rejecting case:", err);
      setSubmitError(err instanceof Error ? err.message : "Failed to reject case");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBackToList = () => {
    router.push("/coder/comprehensive");
  };

  // Handle contextual content changes for highlighting
  const handleContextualContentChange = (content: {
    type: "note" | "lcd"
    content: string
    highlight?: string | string[]
    sourceNoteType?: string
    policyId?: string
    evidenceDescription?: string
  }) => {
    if (content.type === "note" && content.highlight && caseData) {
      const noteTypes: (keyof MedicalNote)[] = [
        "operative_notes",
        "admission_notes",
        "discharge_notes",
        "pathology_notes",
        "progress_notes",
        "content",
      ];

      let foundNoteType = content.sourceNoteType;

      const highlightsToCheck = Array.isArray(content.highlight)
        ? content.highlight
        : [content.highlight];

      for (const noteType of noteTypes) {
        const noteContent = caseData[noteType] as string | undefined;
        if (noteContent && highlightsToCheck.some(highlight => noteContent.includes(highlight))) {
          foundNoteType = noteType;
          break;
        }
      }

      setContextualContent({ ...content, sourceNoteType: foundNoteType });

      // Scroll to the highlighted content with a delay to allow for rendering
      setTimeout(() => {
        if (operativeNoteRef.current) {
          const highlightedElement = operativeNoteRef.current.querySelector('.evidence-highlight');
          if (highlightedElement) {
            highlightedElement.scrollIntoView({
              behavior: 'smooth',
              block: 'center'
            });
          }
        }
      }, 100);
    } else {
      setContextualContent(content);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading case for review...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex flex-col items-center justify-center h-64">
          <AlertTriangle className="h-12 w-12 text-red-500 mb-4" />
          <h2 className="text-xl font-semibold mb-2">Error Loading Case</h2>
          <p className="text-muted-foreground mb-4">{error}</p>
          <Button onClick={handleBackToList} variant="outline">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Cases
          </Button>
        </div>
      </div>
    );
  }

  const noteTypes = [
    { key: 'operative_notes', label: 'Operative' },
    { key: 'admission_notes', label: 'Admission Notes' },
    { key: 'discharge_notes', label: 'Discharge Notes' },
    { key: 'pathology_notes', label: 'Pathology Notes' },
    { key: 'progress_notes', label: 'Progress Notes' },
    { key: 'bedside_notes', label: 'Bedside Notes' },
  ];

  const availableNotes = noteTypes.filter(noteType => 
    caseData?.[noteType.key as keyof MedicalNote] && 
    String(caseData[noteType.key as keyof MedicalNote]).trim()
  );

  // Generate summary data if not available
  const summaryData = caseData?.summary_data || (caseData ? generateSummaryData(caseData, { panelData: { groupedProcedures: [] } }) : null);

  return (
    <TooltipProvider>
      <style jsx global>{`
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
      `}</style>
      <div className="h-screen flex flex-col bg-white">
        {/* Header */}
        <header className="flex items-center justify-between px-8 py-4 border-b bg-white border-b-blue-100">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={handleBackToList}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-xl font-semibold">
                Provider Review: <CaseIdentifier
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
            <Badge variant="secondary">
              {caseData?.status === "PENDING_PROVIDER_REVIEW" ? "Pending Review" : "Pending Billing"}
            </Badge>
            {userRole && (
              <Badge variant="outline">
                {userRole === 'provider' ? 'Provider View' : 'Coder View'}
              </Badge>
            )}
          </div>
        </header>

        {/* Status Messages */}
        {submitError && (
          <Alert variant="destructive" className="mx-8 mt-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{submitError}</AlertDescription>
          </Alert>
        )}
        {submitSuccess && (
          <Alert className="mx-8 mt-4 bg-green-50 border-green-200 text-green-800">
            <CheckCircle className="h-4 w-4" />
            <AlertDescription>{submitSuccess}</AlertDescription>
          </Alert>
        )}

        {/* Main Content */}
        <div className="flex flex-1 px-8">
          {/* Left Panel: Billing Summary */}
          <aside className="w-2/5 overflow-y-scroll scrollbar-hide pt-6 pr-6 pl-12">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg font-medium text-black">Case Information & Billing</CardTitle>
              </CardHeader>
              <CardContent>
                {summaryData ? (
                  <SummaryCard
                    summaryData={summaryData}
                    isReadOnly={true}
                    className="shadow-none border-0"
                  />
                ) : (
                  <div className="text-center py-12">
                    <p className="text-muted-foreground">No billing summary data available</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Action Buttons - Only show for providers and when case is pending review */}
            {userRole === 'provider' && caseData?.status === "PENDING_PROVIDER_REVIEW" && (
              <div className="flex gap-4 mt-6">
                <Button
                  onClick={handleApprove}
                  disabled={isSubmitting}
                  className="flex-1"
                >
                  {isSubmitting ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2"></div>
                  ) : (
                    <CheckCircle className="h-4 w-4 mr-2" />
                  )}
                  Approve Case
                </Button>
                <Button
                  onClick={handleReject}
                  disabled={isSubmitting}
                  variant="destructive"
                  className="flex-1"
                >
                  {isSubmitting ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2"></div>
                  ) : (
                    <XCircle className="h-4 w-4 mr-2" />
                  )}
                  Reject Case
                </Button>
              </div>
            )}

            {/* Status message for coders or when case is already processed */}
            {(userRole === 'coder' || caseData?.status === "PENDING_BILLING") && (
              <Card className="mt-6">
                <CardContent className="pt-6">
                  <div className="text-center">
                    {caseData?.status === "PENDING_BILLING" ? (
                      <div className="flex items-center justify-center gap-2 text-green-600">
                        <CheckCircle className="h-5 w-5" />
                        <span className="font-medium">Case has been approved and is pending billing</span>
                      </div>
                    ) : userRole === 'coder' ? (
                      <div className="flex items-center justify-center gap-2 text-blue-600">
                        <AlertTriangle className="h-5 w-5" />
                        <span className="font-medium">Case is awaiting provider review</span>
                      </div>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            )}
          </aside>

          {/* Right Panel: Operative Note using OperativeNote component */}
          <OperativeNote
            operativeNoteRef={operativeNoteRef}
            noteContent={caseData?.operative_notes || caseData?.content || "No operative note available"}
            contextualContent={contextualContent}
          />
        </div>
        <Footer />
      </div>
    </TooltipProvider>
  );
}