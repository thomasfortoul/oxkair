"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  Plus,
  Calendar,
  User,
  FileText,
  ArrowUpDown,
  Trash2,
  LogOut,
} from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import {
  getMedicalNotesByUser,
  deleteMedicalNote,
  medicalNotesClient,
} from "@/lib/api/medical-notes-client";
import { getCaseNumber } from "@/lib/utils/case-utils";
import { CaseIdentifier } from "@/components/ui/case-identifier";
import { Footer } from "@/components/nav/Footer";

interface MedicalNote {
  id: string;
  case_number?: string;
  title?: string;
  mrn?: string;
  date_of_service?: string;
  status: string;
  workflow_status?: string;
  created_at?: string;
  updated_at?: string;
  panel_data?: {
    demographics?: {
      patient_name?: string;
      mrn?: string;
      service_date?: string;
      provider_name?: string;
      department?: string;
      team?: string;
      assistant_surgeon?: string;
      resident_presence?: string;
      discharge_date?: string;
    };
  };
}

interface CaseCardProps {
  case: MedicalNote;
  onClick: () => void;
  onDelete: (caseIdentifier: string) => void;
}

function CaseCard({ case: medicalCase, onClick, onDelete }: CaseCardProps) {
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <Card
      className="flex flex-col cursor-pointer hover:shadow-md transition-shadow duration-200 border-l-4 border-l-blue-500"
      onClick={onClick}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="text-lg">
              <CaseIdentifier
                case={medicalCase}
                variant="title"
                showTitle={true}
              />
            </CardTitle>
            <CardDescription className="flex items-center gap-4">
              {medicalCase.panel_data?.demographics?.patient_name && (
                <span className="flex items-center gap-1">
                  <User className="h-3 w-3" />
                  Patient: {medicalCase.panel_data.demographics.patient_name}
                </span>
              )}
              {medicalCase.panel_data?.demographics?.mrn && (
                <span className="flex items-center gap-1">
                  <User className="h-3 w-3" />
                  MRN: {medicalCase.panel_data.demographics.mrn}
                </span>
              )}
              {medicalCase.panel_data?.demographics?.service_date && (
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  Service Date:{" "}
                  {formatDate(medicalCase.panel_data.demographics.service_date)}
                </span>
              )}
              {medicalCase.panel_data?.demographics?.provider_name && (
                <span className="flex items-center gap-1">
                  <User className="h-3 w-3" />
                  Provider: {medicalCase.panel_data.demographics.provider_name}
                </span>
              )}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {/* <Badge className={cn('text-xs', getStatusColor(medicalCase.status))}>
              {medicalCase.status.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ')}
            </Badge> */}
            <Button
              variant="ghost"
              size="icon"
              className="text-red-500 hover:text-red-700"
              onClick={(e) => {
                e.stopPropagation(); // Prevent card click
                onDelete(medicalCase.id);
              }}
              aria-label="Delete case"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-grow">
        <div className="space-y-3">
          {/* Progress indicator */}

          {/* Last updated */}
          <div className="text-xs text-muted-foreground">
            Last updated:{" "}
            {medicalCase.updated_at
              ? formatDate(medicalCase.updated_at)
              : "Unknown"}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ComprehensiveDashboardPage() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [cases, setCases] = useState<MedicalNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("updated_at");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [isDeleting, setIsDeleting] = useState(false);
  // caseToDeleteId will store the ID of the case targeted for deletion
  const [, setCaseToDeleteId] = useState<string | null>(null);

  // Define the order for status groups
  const STATUS_DISPLAY_ORDER = [
    "INCOMPLETE",
    "PENDING_CODER_REVIEW",
    "PENDING_PROVIDER_REVIEW",
    "PENDING_BILLING",
  ];

  const formatStatusGroupName = (statusKey: string) => {
    // Convert to lower case, replace underscores with spaces, then title case each word
    return (
      statusKey
        .toLowerCase()
        .replace(/_/g, " ")
        .replace(/\b\w/g, (char) => char.toUpperCase()) + " Cases"
    );
  };

  const loadCases = React.useCallback(async () => {
    try {
      console.log("[ComprehensiveDashboard] Starting loadCases function");
      setLoading(true);
      const userRole = user!.user_metadata?.userCategory || "coder";
      console.log("[ComprehensiveDashboard] User role:", userRole);

      // Set the authenticated user ID in the medical notes client
      console.log("[ComprehensiveDashboard] Setting user ID in medicalNotesClient:");
      medicalNotesClient.setUserId(user!.id);
      
      console.log("[ComprehensiveDashboard] Calling getMedicalNotesByUser");
      let data = await getMedicalNotesByUser();
      console.log("[ComprehensiveDashboard] Received data from getMedicalNotesByUser:", data?.length || 0, "cases");

      if (userRole === "Provider") {
        console.log("[ComprehensiveDashboard] Filtering cases for Provider role");
        // Filter to only show cases pending provider review for providers
        data = data.filter(
          (note: any) =>
            note.provider_user_id === user!.id &&
            note.status === "PENDING_PROVIDER_REVIEW",
        );
      }

      console.log("[ComprehensiveDashboard] Normalizing data");
      const normalizedData = (data || []).map((note) => ({
        ...note,
        status:
          typeof note.status === "string"
            ? note.status.toUpperCase()
            : "UNKNOWN_STATUS", // Normalize and handle potential undefined/null
        date_of_service:
          note.date_of_service === null ? undefined : note.date_of_service, // Convert null to undefined
      }));
      console.log("[ComprehensiveDashboard] Setting cases in state:", normalizedData?.length || 0);
      setCases(normalizedData);
    } catch (error) {
      console.error("[ComprehensiveDashboard] Error loading cases:", error);
      if (error instanceof Error) {
        console.error("[ComprehensiveDashboard] Error details:", {
          message: error.message,
          stack: error.stack
        });
      }
    } finally {
      console.log("[ComprehensiveDashboard] Finished loading cases");
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user?.id) {
      // Set the authenticated user ID in the medical notes client
      medicalNotesClient.setUserId(user.id);
      loadCases();
    }
  }, [user?.id, loadCases]);

  const filteredCases = cases.filter((medicalCase) => {
    const matchesSearch =
      !searchTerm ||
      medicalCase.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      medicalCase.mrn?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      medicalCase.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      medicalCase.case_number
        ?.toLowerCase()
        .includes(searchTerm.toLowerCase()) ||
      medicalCase.panel_data?.demographics?.patient_name
        ?.toLowerCase()
        .includes(searchTerm.toLowerCase()) ||
      medicalCase.panel_data?.demographics?.provider_name
        ?.toLowerCase()
        .includes(searchTerm.toLowerCase());

    const matchesStatus =
      statusFilter === "all" || medicalCase.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const sortedCases = [...filteredCases].sort((a, b) => {
    let comparison = 0;
    switch (sortBy) {
      case "created_at":
        if (!a.created_at && !b.created_at) comparison = 0;
        else if (!a.created_at) comparison = 1;
        else if (!b.created_at) comparison = -1;
        else
          comparison =
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        break;
      case "updated_at":
        if (!a.updated_at && !b.updated_at) comparison = 0;
        else if (!a.updated_at) comparison = 1;
        else if (!b.updated_at) comparison = -1;
        else
          comparison =
            new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
        break;
      case "date_of_service":
        if (!a.date_of_service && !b.date_of_service) comparison = 0;
        else if (!a.date_of_service) comparison = 1;
        else if (!b.date_of_service) comparison = -1;
        else
          comparison =
            new Date(b.date_of_service).getTime() -
            new Date(a.date_of_service).getTime();
        break;
      case "status":
        comparison = a.status.localeCompare(b.status);
        break;
      default:
        comparison = 0;
    }
    return sortOrder === "asc" ? comparison * -1 : comparison;
  });

  const groupedCases = sortedCases.reduce(
    (acc, medicalCase) => {
      const status = medicalCase.status;
      if (!acc[status]) {
        acc[status] = [];
      }
      acc[status].push(medicalCase);
      return acc;
    },
    {} as Record<string, MedicalNote[]>,
  );

  const handleCaseClick = (caseId: string) => {
    console.log(
      `ComprehensiveDashboard: Handling case click for case ${caseId}`,
    );
    const medicalCase = cases.find((c) => c.id === caseId);
    if (medicalCase) {
      const caseIdentifier = medicalCase.id; // Always use UUID for navigation
      if (medicalCase.status === "INCOMPLETE") {
        router.push(`/cases/new?caseId=${caseIdentifier}`);
      } else if (medicalCase.status === "PENDING_PROVIDER_REVIEW") {
        router.push(`/coder/comprehensive/${caseIdentifier}/provider-review`);
      } else {
        router.push(`/coder/comprehensive/${caseIdentifier}`);
      }
    }
  };

  const handleNewCase = () => {
    router.push("/cases/new");
  };

  const toggleSortOrder = () => {
    setSortOrder((prevOrder) => (prevOrder === "asc" ? "desc" : "asc"));
  };

  const handleDeleteCase = (caseIdentifier: string) => {
    setCaseToDeleteId(caseIdentifier);
    // Confirmation will be handled by a dialog/modal, for now using window.confirm
    if (
      window.confirm(
        "Are you sure you want to permanently delete this case? This action cannot be undone.",
      )
    ) {
      confirmDeleteCase(caseIdentifier);
    } else {
      setCaseToDeleteId(null); // Clear if cancelled
    }
  };

  const confirmDeleteCase = async (caseIdentifier: string) => {
    if (!caseIdentifier || !user?.id) {
      alert("Error: Case identifier or User ID is missing.");
      setCaseToDeleteId(null);
      return;
    }
    setIsDeleting(true);
    try {
      await deleteMedicalNote(caseIdentifier);
      // Filter by both case_number and id to handle both identifier types
      setCases((prevCases) =>
        prevCases.filter(
          (c) => c.case_number !== caseIdentifier && c.id !== caseIdentifier,
        ),
      );
      alert("Case deleted successfully.");
    } catch (error: unknown) {
      console.error("Error deleting case:", error);
      if (error instanceof Error) {
        alert(`Failed to delete case: ${error.message}`);
      }
    } finally {
      setIsDeleting(false);
      setCaseToDeleteId(null);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut();
      router.push("/auth/login");
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div
              className={`animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4 ${isDeleting ? "border-red-500" : "border-blue-500"}`}
            ></div>
            <p className="text-muted-foreground">
              {isDeleting ? "Deleting case..." : "Loading cases..."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <div className="container mx-auto p-6 space-y-6 flex-1">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Dashboard</h1>
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={handleNewCase} className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              New Case
            </Button>
          </div>
        </div>

        {/* Filters and Search */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Filter & Search</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by case ID, title, or MRN..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-48">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="INCOMPLETE">Incomplete</SelectItem>
                  <SelectItem value="PENDING_CODER_REVIEW">
                    Pending Coder Review
                  </SelectItem>
                  <SelectItem value="PENDING_PROVIDER_REVIEW">
                    Pending Provider Review
                  </SelectItem>
                  <SelectItem value="PENDING_BILLING">
                    Pending Billing
                  </SelectItem>
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger className="w-full sm:w-48">
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="updated_at">Last Updated</SelectItem>
                    <SelectItem value="created_at">Date Created</SelectItem>
                    <SelectItem value="date_of_service">
                      Service Date
                    </SelectItem>
                    <SelectItem value="status">Status</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={toggleSortOrder}
                  aria-label="Toggle sort order"
                >
                  <ArrowUpDown className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Cases Grid - Grouped by Status */}
        {loading ? null : sortedCases.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <FileText className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No cases found</h3>
              <p className="text-muted-foreground text-center mb-4">
                {searchTerm || statusFilter !== "all"
                  ? "Try adjusting your search or filter criteria"
                  : "Get started by creating your first case"}
              </p>
              {!searchTerm && statusFilter === "all" && (
                <Button
                  onClick={handleNewCase}
                  className="flex items-center gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Create First Case
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-8">
            {STATUS_DISPLAY_ORDER.map((statusKey) => {
              const casesInGroup = groupedCases[statusKey];
              if (casesInGroup && casesInGroup.length > 0) {
                return (
                  <div key={statusKey}>
                    <h2 className="text-2xl font-semibold mb-4 border-b pb-2">
                      {formatStatusGroupName(statusKey)} ({casesInGroup.length})
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {casesInGroup.map((medicalCase) => (
                        <CaseCard
                          key={medicalCase.id}
                          case={medicalCase}
                          onClick={() => handleCaseClick(medicalCase.id)}
                          onDelete={handleDeleteCase}
                        />
                      ))}
                    </div>
                  </div>
                );
              }
              // Optionally, render a message if a group is empty but filter is not 'all'
              // else if (statusFilter === 'all' || statusFilter === statusKey) {
              //   return (
              //     <div key={statusKey}>
              //       <h2 className="text-2xl font-semibold mb-4 border-b pb-2">
              //         {formatStatusGroupName(statusKey)} (0)
              //       </h2>
              //       <p className="text-muted-foreground">No cases with this status.</p>
              //     </div>
              //   );
              // }
              return null;
            })}
          </div>
        )}

        {/* Summary Stats */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">
                  {cases.length}
                </div>
                <div className="text-sm text-muted-foreground">Total Cases</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-yellow-600">
                  {
                    cases.filter((c) => c.status === "PENDING_CODER_REVIEW")
                      .length
                  }{" "}
                  {/* Or another relevant new status */}
                </div>
                <div className="text-sm text-muted-foreground">In Progress</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-orange-600">
                  {
                    cases.filter((c) => c.status === "PENDING_PROVIDER_REVIEW")
                      .length
                  }
                </div>
                <div className="text-sm text-muted-foreground">
                  Pending Review
                </div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">
                  {
                    cases.filter(
                      (c) =>
                        c.status === "PENDING_BILLING" &&
                        c.workflow_status === "finalized",
                    ).length
                  }{" "}
                  {/* Example, assuming workflow_status might still be used for sub-state */}
                </div>
                <div className="text-sm text-muted-foreground">Completed</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      <Footer />
    </div>
  );
}
