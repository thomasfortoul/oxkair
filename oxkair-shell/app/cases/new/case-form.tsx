"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Check,
  ChevronsUpDown,
  ArrowLeft, // FIX: Added missing ArrowLeft import
  Save,
  Play,
  Upload,
  DollarSign,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Papa from "papaparse";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { useAuth } from "@/lib/auth/auth-context";
import {
  MedicalNote,
  createMedicalNote,
  updateMedicalNote,
  getMedicalNoteById,
  medicalNotesClient
} from "@/lib/api/medical-notes-client";
import { getCaseNumber } from "@/lib/utils/case-utils";
import { v4 as uuidv4 } from "uuid";
import { processOperativeNoteAction } from "@/app/actions/process-case";
import { WorkflowLogger } from "@/app/coder/lib/logging";

// Define the note types for the "Notes to Bill" panel
const noteTypes = [
  { value: "operative_notes", label: "Operative Notes" },
  { value: "admission_notes", label: "Admission Notes" },
  { value: "discharge_notes", label: "Discharge Notes" },
  { value: "pathology_notes", label: "Pathology Notes" },
  { value: "progress_notes", label: "Progress Notes" },
  { value: "bedside_notes", label: "Bedside Notes" },
];

// Define an interface for the CSV row data
interface CsvRowData {
  patientName: string;
  mrn: string;
  dateOfService: string;
  providerName: string;
  department: string;
  team: string;
  assistantSurgeon: string;
  residentPresence: string;
  dischargeDate: string;
  [key: string]: any;
}

// Component that contains all the logic using useSearchParams
interface CaseFormProps {
  caseId?: string | null;
  title: string;
  initialData?: MedicalNote | null;
}

export function CaseForm({ caseId, title, initialData }: CaseFormProps) {
  const router = useRouter();
  const { user } = useAuth();

  // Instantiate WorkflowLogger
  const logger = new WorkflowLogger("CaseForm");

  const [mrn, setMrn] = useState("");
  const [dateOfService, setDateOfService] = useState("");
  const [insuranceProvider, setInsuranceProvider] = useState("");

  const [operativeNotes, setOperativeNotes] = useState("");
  const [admissionNotes, setAdmissionNotes] = useState("");
  const [dischargeNotes, setDischargeNotes] = useState("");
  const [pathologyNotes, setPathologyNotes] = useState("");
  const [progressNotes, setProgressNotes] = useState("");
  const [bedsideNotes, setBedsideNotes] = useState("");
  const [billableNotes, setBillableNotes] = useState<string[]>([]);
  const [caseData, setCaseData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [internalCaseId, setInternalCaseId] = useState<string | null>(null);

  // Simple loading state
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentProgressStep, setCurrentProgressStep] = useState(0);
  const [isProgressFading, setIsProgressFading] = useState(false);

  // Progress steps for the processing modal
  const progressSteps = [
    "Scanning note...",
    "Identifying diagnosis codes...",
    "Extracting procedure codes...",
    "Evaluating compliance issues...",
    "Identifying modifiers...",
    "Evaluating LCDs...",
    "Verifying compliance issues...",
    "Checking bundling and global periods...",
    "Calculating RVUs...",
    "Finalizing results...",
  ];

  // CSV upload and demographics state
  const [parsedCsvData, setParsedCsvData] = useState<any[]>([]);
  const [uniqueMrns, setUniqueMrns] = useState<string[]>([]);
  const [selectedMrn, setSelectedMrn] = useState<string | null>(null);
  const [openMrnSelect, setOpenMrnSelect] = useState(false);
  const [showCsvDialog, setShowCsvDialog] = useState(false);

  const [patientName, setPatientName] = useState("");
  const [providerName, setProviderName] = useState("");
  const [department, setDepartment] = useState("");
  const [team, setTeam] = useState("");
  const [assistantSurgeon, setAssistantSurgeon] = useState("");
  const [residentPresence, setResidentPresence] = useState("");
  const [dischargeDate, setDischargeDate] = useState("");

  // Provider selection state
  const [providers, setProviders] = useState<any[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);

  // Notes panel state
  const [activeNoteTab, setActiveNoteTab] = useState("operative_notes");
  const [hoveredTab, setHoveredTab] = useState<string | null>(null);

  // Effect to cycle through progress steps during processing
  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (isProcessing) {
      setCurrentProgressStep(0); // Reset to first step when processing starts
      setIsProgressFading(false);

      interval = setInterval(() => {
        // Start fade out
        setIsProgressFading(true);

        // After fade out completes, change text and fade back in
        setTimeout(() => {
          setCurrentProgressStep((prev) => (prev + 1) % progressSteps.length);
          setIsProgressFading(false);
        }, 350); // 200ms fade out duration
      }, 3500); // Change every 5 seconds
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [isProcessing, progressSteps.length]);

  useEffect(() => {
    const fetchCaseData = async () => {
      if (caseId && user) {
        setLoading(true);
        setError(null);
        try {
          // Set the authenticated user ID in the medical notes client
          medicalNotesClient.setUserId(user.id);
          const data = await getMedicalNoteById(caseId);
          if (data) {
            setCaseData(data);
            setInternalCaseId(data.id);
            setMrn(data.mrn || "");
            setDateOfService(
              data.date_of_service
                ? new Date(data.date_of_service).toISOString().split("T")[0]
                : "",
            );
            setInsuranceProvider(data.insurance_provider || "");
            setOperativeNotes(data.operative_notes || "");
            setAdmissionNotes(data.admission_notes || "");
            setDischargeNotes(data.discharge_notes || "");
            setPathologyNotes(data.pathology_notes || "");
            setProgressNotes(data.progress_notes || "");
            setBedsideNotes(data.bedside_notes || "");
            // Ensure billableNotes is always an array
            const billableNotesData = data.billable_notes;
            if (Array.isArray(billableNotesData)) {
              setBillableNotes(billableNotesData);
            } else {
              setBillableNotes([]);
            }

            if (data.panel_data && typeof data.panel_data === "object") {
              const demographics = (data.panel_data as any).demographics;
              if (demographics) {
                setPatientName(demographics.patient_name || "");
                setProviderName(demographics.provider_name || "");
                setDepartment(demographics.department || "");
                setTeam(demographics.team || "");
                setAssistantSurgeon(demographics.assistant_surgeon || "");
                setResidentPresence(demographics.resident_presence || "");
                setDischargeDate(
                  demographics.discharge_date
                    ? new Date(demographics.discharge_date)
                        .toISOString()
                        .split("T")[0]
                    : "",
                );
              }
            }
          }
        } catch (err: unknown) {
          logger.logError("CaseForm", "Error fetching case data", {
            error: err,
          });
          setError((err as Error).message || "Failed to load case data.");
        } finally {
          setLoading(false);
        }
      }
    };

    fetchCaseData();
  }, [caseId, user]);

  // Fetch providers for the current user's institution
  useEffect(() => {
    const fetchProviders = async () => {
      if (user?.user_metadata?.institutionId) {
        try {
          const response = await fetch(
            `/api/users?role=Provider&institution_id=${user.user_metadata?.institutionId}`,
          );
          if (response.ok) {
            const data = await response.json();
            setProviders(data);
          } else {
            console.error("Failed to fetch providers");
          }
        } catch (error) {
          console.error("Error fetching providers:", error);
        }
      }
    };

    fetchProviders();
  }, [user]);

  // Effect to populate fields when selectedMrn changes
  useEffect(() => {
    if (selectedMrn && parsedCsvData.length > 0) {
      const selectedRow = parsedCsvData.find((row) => row.mrn === selectedMrn);
      if (selectedRow) {
        setPatientName(selectedRow.patientName || "");
        setMrn(selectedRow.mrn || "");
        setDateOfService(
          selectedRow.dateOfService
            ? new Date(selectedRow.dateOfService).toISOString().split("T")[0]
            : "",
        );
        setProviderName(selectedRow.providerName || "");
        setDepartment(selectedRow.department || "");
        setTeam(selectedRow.team || "");
        setAssistantSurgeon(selectedRow.assistantSurgeon || "");
        setResidentPresence(selectedRow.residentPresence || "");
        setDischargeDate(
          selectedRow.dischargeDate
            ? new Date(selectedRow.dischargeDate).toISOString().split("T")[0]
            : "",
        );
      }
    }
  }, [selectedMrn, parsedCsvData]);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setLoading(true);
      setError(null);
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results: {
          data: CsvRowData[];
          errors: any[];
          meta: any;
        }) => {
          if (results.errors.length > 0) {
            logger.logError("CaseForm", "CSV Parsing Errors", {
              errors: results.errors,
            });
            setError("Error parsing CSV file. Please check the file format.");
            setLoading(false);
            return;
          }
          const data = results.data;
          setParsedCsvData(data);

          const mrns = new Set<string>();
          data.forEach((row: any) => {
            if (row.mrn) {
              mrns.add(row.mrn);
            }
          });
          setUniqueMrns(Array.from(mrns));
          setLoading(false);
        },
        error: (err: Error) => {
          logger.logError("CaseForm", "CSV Parsing Error", { error: err });
          setError(`Failed to read CSV file: ${err.message}`);
          setLoading(false);
        },
      });
    }
  };

  const insuranceProviders = [
    "Medicare",
    "UnitedHealth Group",
    "Elevance Health Inc.",
    "Centene Corp.",
    "Humana",
    "CVS Health",
    "Kaiser Foundation",
    "Health Care Services Corporation (HCSC)",
    "Cigna Health",
    "Molina Healthcare Inc.",
    "GuideWell",
    "Independence Health Group Inc.",
    "Highmark Group",
    "Blue Cross Blue Shield of Michigan",
    "Blue Cross Blue Shield of New Jersey",
    "UPMC Health System",
    "Blue Cross Blue Shield of North Carolina",
    "Caresource",
    "Health Net of California, Inc.",
    "Local Initiative Health Authority",
    "Carefirst Inc.",
    "Metropolitan",
    "Blue Cross Blue Shield of Massachusetts",
    "Blue Cross Blue Shield of Tennessee",
    "Point32Health Inc.",
    "Health Net Community Solutions",
  ];

  const validateRequiredFields = () => {
    if (!mrn.trim()) {
      setError("MRN is required.");
      return false;
    }
    if (!dateOfService) {
      setError("Date of Service is required.");
      return false;
    }
    if (!insuranceProvider) {
      setError("Insurance Provider is required.");
      return false;
    }

    if (billableNotes.length === 0) {
      setError("At least one note type must be selected for billing.");
      return false;
    }

    const allNotes = [
      operativeNotes,
      admissionNotes,
      dischargeNotes,
      pathologyNotes,
      progressNotes,
      bedsideNotes,
    ];
    if (allNotes.every((note) => !note.trim())) {
      setError("At least one clinical note must have content.");
      return false;
    }

    const noteContentMap: { [key: string]: string } = {
      operative_notes: operativeNotes,
      admission_notes: admissionNotes,
      discharge_notes: dischargeNotes,
      pathology_notes: pathologyNotes,
      progress_notes: progressNotes,
      bedside_notes: bedsideNotes,
    };

    for (const noteType of billableNotes) {
      // Validate noteType is a valid string
      if (typeof noteType !== "string" || !noteType) {
        setError(`Invalid note type selected. Please refresh and try again.`);
        return false;
      }

      if (!noteContentMap[noteType] || !noteContentMap[noteType].trim()) {
        const noteLabel =
          noteTypes.find((n) => n.value === noteType)?.label || noteType;
        setError(`The selected note type "${noteLabel}" cannot be empty.`);
        return false;
      }
    }
    setError(null);
    return true;
  };

  const handleSaveCaseInternal = async (
    statusToSave:
      | "INCOMPLETE"
      | "PENDING_PROVIDER_REVIEW"
      | "PENDING_CODER_REVIEW",
    currentCaseIdParam?: string | null,
  ): Promise<string | null> => {
    if (!user) {
      setError("User not authenticated.");
      return null;
    }

    let effectiveCaseId: string | null =
      internalCaseId || currentCaseIdParam || caseId || null;

    const caseDataPayload = {
      mrn,
      date_of_service: dateOfService
        ? new Date(dateOfService).toISOString()
        : null,
      insurance_provider: insuranceProvider,
      operative_notes: operativeNotes,
      admission_notes: admissionNotes,
      discharge_notes: dischargeNotes,
      pathology_notes: pathologyNotes,
      progress_notes: progressNotes,
      bedside_notes: bedsideNotes,
      billable_notes: billableNotes,
      status: statusToSave,
      provider_user_id: selectedProvider,
      institution_id: user.user_metadata?.institutionId || null,
      panel_data: {
        demographics: {
          patient_name: patientName,
          mrn: mrn,
          service_date: dateOfService
            ? new Date(dateOfService).toISOString()
            : null,
          provider_name: providerName,
          department: department,
          team: team,
          assistant_surgeon: assistantSurgeon,
          resident_presence: residentPresence,
          discharge_date: dischargeDate || null,
        },
      },
    };

    try {
      let result;

      if (effectiveCaseId) {
        result = await updateMedicalNote(effectiveCaseId, caseDataPayload);
      } else {
        const newGeneratedId = uuidv4();
        effectiveCaseId = newGeneratedId;
        result = await createMedicalNote({
          id: newGeneratedId,
          ...caseDataPayload,
        });
        setInternalCaseId(newGeneratedId);
      }

      logger.logInfo("CaseForm", "Case saved/updated internally", {
        data: result,
      });
      return effectiveCaseId;
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const errorStack = err instanceof Error ? err.stack : undefined;

      logger.logError("CaseForm", "Error in handleSaveCaseInternal", {
        errorMessage,
        errorStack,
        errorType: err?.constructor?.name || typeof err,
        caseId: effectiveCaseId,
        status: statusToSave,
      });
      setError(errorMessage || "Failed to save case internally.");
      return null;
    }
  };

  const handleSaveCase = async (
    status: "INCOMPLETE" | "PENDING_PROVIDER_REVIEW",
  ) => {
    setLoading(true);
    setError(null);
    setSuccess(false);

    const savedId = await handleSaveCaseInternal(status, caseId);

    if (savedId) {
      setSuccess(true);
      if (status === "INCOMPLETE") {
        router.push("/coder/comprehensive");
      } else {
        router.push(`/coder/comprehensive/${savedId}`);
      }
    }
    setLoading(false);
  };

  const handlePendCase = () => {
    if (!validateRequiredFields()) {
      return;
    }
    handleSaveCase("INCOMPLETE");
  };

  const handleProcessCase = async () => {
    setError(null);
    setSuccess(false);

    if (!user) {
      setError("User not authenticated.");
      return;
    }

    if (!validateRequiredFields()) {
      return;
    }

    // if (!selectedProvider) {
    //   setError("A provider must be selected to process the case.");
    //   return;
    // }

    setIsProcessing(true);
    // Processing started - show loading state

    const currentEffectiveCaseId = await handleSaveCaseInternal(
      "INCOMPLETE",
      caseId,
    );

    if (!currentEffectiveCaseId) {
      setError("Failed to save the case before processing. Please try again.");
      setIsProcessing(false);
      return;
    }

    const combinedNote = [
      operativeNotes,
      admissionNotes,
      dischargeNotes,
      pathologyNotes,
      progressNotes,
      bedsideNotes,
    ]
      .filter(Boolean)
      .join("\n\n");
    try {
      const userRole = user?.user_metadata?.userCategory || "Unknown";

      // Start the processing and wait for completion
      const actionResult = await processOperativeNoteAction(
        combinedNote,
        currentEffectiveCaseId,
        userRole,
        true, // Explicitly update status when user clicks Process Case
      );

      if (!actionResult.success || !actionResult.data?.caseId) {
        throw new Error(actionResult.error || "Failed to start AI workflow.");
      }

      // Processing completed successfully
      setIsProcessing(false);
      router.push(`/coder/comprehensive/${currentEffectiveCaseId}`);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.logError("CaseForm", "Error processing case", { error: err });
      setError(errorMessage);
      setIsProcessing(false);
    }
  };

  const handleBackToDashboard = () => {
    router.push("/coder/comprehensive");
  };

  // Get available note sections for tabs
  const noteSections = [
    {
      title: "Operative",
      key: "operative_notes",
      content: operativeNotes,
      setter: setOperativeNotes,
    },
    {
      title: "Pathology",
      key: "pathology_notes",
      content: pathologyNotes,
      setter: setPathologyNotes,
    },
    {
      title: "Admission",
      key: "admission_notes",
      content: admissionNotes,
      setter: setAdmissionNotes,
    },
    {
      title: "Discharge",
      key: "discharge_notes",
      content: dischargeNotes,
      setter: setDischargeNotes,
    },
    {
      title: "Bedside",
      key: "bedside_notes",
      content: bedsideNotes,
      setter: setBedsideNotes,
    },
  ];

  return (
    <>
      {/* Simple loading overlay */}
      {isProcessing && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-lg">
            <div className="flex items-center space-x-3">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
              <span
                className={`transition-opacity duration-200 ease-in-out ${
                  isProgressFading ? "opacity-0" : "opacity-100"
                }`}
              >
                {progressSteps[currentProgressStep]}
              </span>
            </div>
          </div>
        </div>
      )}
      <div className="container mx-auto p-6 space-y-6 min-h-screen">
        {/* Header */}
        <header className="flex items-center justify-between px-8 py-4 border-b bg-white border-b-blue-100 mb-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={handleBackToDashboard}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-xl font-semibold">{title}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={handlePendCase}
              variant="outline"
              disabled={loading || isProcessing}
            >
              <Save className="h-4 w-4 mr-2" />
              {loading ? "Pending..." : "Pend Case"}
            </Button>
            <Button
              onClick={handleProcessCase}
              disabled={loading || isProcessing}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Play className="h-4 w-4 mr-2" />
              {isProcessing ? "Processing..." : "Process Case"}
            </Button>
          </div>
        </header>

        {/* Error/Success Messages */}
        {error && (
          <p className="text-red-500 bg-red-100 p-3 rounded-md mb-4">{error}</p>
        )}
        {success && (
          <p className="text-green-500 bg-green-100 p-3 rounded-md mb-4">
            Case {caseId ? "updated" : "created"} successfully!
          </p>
        )}

        {/* Main Content Grid */}
        <form
          onSubmit={(e) => e.preventDefault()}
          className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1"
        >
          {/* Left Column: Patient Details & Actions */}
          <div className="lg:col-span-1 space-y-6">
            {/* CSV Upload Card */}
            <Card>
              <CardHeader>
                <CardTitle>CSV Upload</CardTitle>
              </CardHeader>
              <CardContent>
                <Dialog open={showCsvDialog} onOpenChange={setShowCsvDialog}>
                  <DialogTrigger asChild>
                    <Button className="w-full">
                      <Upload className="h-4 w-4 mr-2" />
                      Upload CSV
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-md">
                    <DialogHeader>
                      <DialogTitle>Upload CSV File</DialogTitle>
                      <DialogDescription>
                        Upload a CSV file to populate case details
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <Input
                        id="csvUpload"
                        type="file"
                        accept=".csv"
                        onChange={handleFileUpload}
                      />
                      {parsedCsvData.length > 0 && (
                        <p className="text-sm text-gray-500">
                          {parsedCsvData.length} rows parsed from CSV.
                        </p>
                      )}

                      {/* MRN Selection within the modal */}
                      {uniqueMrns.length > 0 && (
                        <div className="space-y-2">
                          <Label>Select Patient MRN</Label>
                          <Popover
                            open={openMrnSelect}
                            onOpenChange={setOpenMrnSelect}
                          >
                            <PopoverTrigger asChild>
                              <Button
                                variant="outline"
                                role="combobox"
                                aria-expanded={openMrnSelect}
                                className="w-full justify-between"
                              >
                                {selectedMrn
                                  ? uniqueMrns.find(
                                      (mrn) => mrn === selectedMrn,
                                    )
                                  : "Select MRN..."}
                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                              <Command>
                                <CommandInput placeholder="Search MRN..." />
                                <CommandEmpty>No MRN found.</CommandEmpty>
                                <CommandGroup>
                                  {uniqueMrns.map((mrn) => (
                                    <CommandItem
                                      key={mrn}
                                      value={mrn}
                                      onSelect={(currentValue) => {
                                        setSelectedMrn(
                                          currentValue === selectedMrn
                                            ? null
                                            : currentValue,
                                        );
                                        setOpenMrnSelect(false);
                                      }}
                                    >
                                      <Check
                                        className={cn(
                                          "mr-2 h-4 w-4",
                                          selectedMrn === mrn
                                            ? "opacity-100"
                                            : "opacity-0",
                                        )}
                                      />
                                      {mrn}
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              </Command>
                            </PopoverContent>
                          </Popover>
                        </div>
                      )}
                    </div>
                    <DialogFooter>
                      <Button onClick={() => setShowCsvDialog(false)}>
                        Done
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </CardContent>
            </Card>

            {/* Patient & Service Details Card */}
            <Card>
              <CardHeader>
                <CardTitle>Patient & Service Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="insuranceProvider">Insurance Provider</Label>
                  <Select
                    onValueChange={setInsuranceProvider}
                    value={insuranceProvider}
                  >
                    <SelectTrigger id="insuranceProvider" className="mt-1">
                      <SelectValue placeholder="Select an insurance provider" />
                    </SelectTrigger>
                    <SelectContent
                      position="popper"
                      side="bottom"
                      sideOffset={5}
                      avoidCollisions={false}
                      className="max-h-60 overflow-y-auto"
                    >
                      {insuranceProviders.map((provider) => (
                        <SelectItem key={provider} value={provider}>
                          {provider}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="assignedProvider">Assigned Provider</Label>
                  <Select
                    onValueChange={setSelectedProvider}
                    value={selectedProvider || ""}
                  >
                    <SelectTrigger id="assignedProvider" className="mt-1">
                      <SelectValue placeholder="Select a provider for review" />
                    </SelectTrigger>
                    <SelectContent
                      position="popper"
                      side="bottom"
                      sideOffset={5}
                      avoidCollisions={false}
                      className="max-h-60 overflow-y-auto"
                    >
                      {providers.map((provider) => (
                        <SelectItem key={provider.id} value={provider.id}>
                          {provider.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="patientName">Patient Name</Label>
                  <Input
                    id="patientName"
                    type="text"
                    value={patientName}
                    onChange={(e) => setPatientName(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="mrn">MRN</Label>
                  <Input
                    id="mrn"
                    type="text"
                    inputMode="numeric"
                    value={mrn}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      const numericValue = e.target.value.replace(
                        /[^0-9]/g,
                        "",
                      );
                      setMrn(numericValue);
                    }}
                    required
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="dateOfService">Date of Service</Label>
                  <Input
                    id="dateOfService"
                    type="date"
                    value={dateOfService}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setDateOfService(e.target.value)
                    }
                    required
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="providerName">Provider Name</Label>
                  <Input
                    id="providerName"
                    type="text"
                    value={providerName}
                    onChange={(e) => setProviderName(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="department">Department</Label>
                  <Input
                    id="department"
                    type="text"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="team">Team</Label>
                  <Input
                    id="team"
                    type="text"
                    value={team}
                    onChange={(e) => setTeam(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="assistantSurgeon">Assistant Surgeon</Label>
                  <Input
                    id="assistantSurgeon"
                    type="text"
                    value={assistantSurgeon}
                    onChange={(e) => setAssistantSurgeon(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="residentPresence">Resident Presence</Label>
                  <Input
                    id="residentPresence"
                    type="text"
                    value={residentPresence}
                    onChange={(e) => setResidentPresence(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="dischargeDate">Discharge Date</Label>
                  <Input
                    id="dischargeDate"
                    type="date"
                    value={dischargeDate}
                    onChange={(e) => setDischargeDate(e.target.value)}
                    className="mt-1"
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column: Clinical Notes with Tabs */}
          <div className="lg:col-span-2">
            <Card className="h-full">
              <CardContent className="p-6 h-full">
                <div className="h-full flex flex-col">
                  <Tabs value={activeNoteTab} className="h-full flex flex-col">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-xl font-semibold">Clinical Notes</h2>
                      <div className="flex-grow ml-4">
                        <ScrollArea className="w-full whitespace-nowrap">
                          <TabsList className="grid w-full grid-cols-5">
                            {noteSections.map((section) => (
                              <Popover
                                key={section.key}
                                open={hoveredTab === section.key}
                              >
                                <PopoverTrigger asChild>
                                  <TabsTrigger
                                    value={section.key}
                                    className={cn(
                                      "text-sm",
                                      activeNoteTab === section.key
                                        ? "bg-muted"
                                        : "",
                                    )}
                                    onClick={() =>
                                      setActiveNoteTab(section.key)
                                    }
                                    onMouseEnter={() =>
                                      setHoveredTab(section.key)
                                    }
                                    onMouseLeave={() => setHoveredTab(null)}
                                  >
                                    {billableNotes.includes(section.key) && (
                                      <DollarSign className="h-4 w-4 mr-2 text-green-500" />
                                    )}
                                    {section.title}
                                  </TabsTrigger>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto">
                                  <div className="flex items-center gap-2 p-2">
                                    <DollarSign
                                      className={`h-5 w-5 ${
                                        billableNotes.includes(section.key)
                                          ? "text-green-500"
                                          : "text-muted-foreground"
                                      }`}
                                    />
                                    <span className="font-semibold">
                                      {billableNotes.includes(section.key)
                                        ? "Billable"
                                        : "Not Billable"}
                                    </span>
                                  </div>
                                </PopoverContent>
                              </Popover>
                            ))}
                          </TabsList>
                          <ScrollBar orientation="horizontal" />
                        </ScrollArea>
                      </div>
                    </div>

                    <div className="flex-grow">
                      {noteSections.map((section) => (
                        <TabsContent
                          key={section.key}
                          value={section.key}
                          className="h-full mt-0"
                        >
                          <Card className="h-full border-0 shadow-none">
                            <CardHeader>
                              <div className="flex items-center justify-between">
                                <CardTitle className="text-lg">
                                  {section.title} Notes
                                </CardTitle>
                                <div className="flex items-center space-x-2">
                                  <Label
                                    htmlFor={`billable-toggle-${section.key}`}
                                  >
                                    Billable
                                  </Label>
                                  <Switch
                                    id={`billable-toggle-${section.key}`}
                                    checked={billableNotes.includes(
                                      section.key,
                                    )}
                                    onCheckedChange={(checked) => {
                                      if (checked) {
                                        setBillableNotes([
                                          ...billableNotes,
                                          section.key,
                                        ]);
                                      } else {
                                        setBillableNotes(
                                          billableNotes.filter(
                                            (note) => note !== section.key,
                                          ),
                                        );
                                      }
                                    }}
                                  />
                                </div>
                              </div>
                            </CardHeader>
                            {/* FIX: Replaced the smart quote ” with a standard quote " */}
                            <CardContent className="pb-6">
                              <Textarea
                                value={section.content}
                                onChange={(
                                  e: React.ChangeEvent<HTMLTextAreaElement>,
                                ) => section.setter(e.target.value)}
                                className="min-h-[700px] max-h-[900px] resize-none overflow-y-auto"
                                placeholder={`Enter ${section.title.toLowerCase()} notes...`}
                              />
                            </CardContent>
                          </Card>
                        </TabsContent>
                      ))}
                    </div>
                  </Tabs>
                </div>
              </CardContent>
            </Card>
          </div>
        </form>
      </div>
    </>
  );
}

// Main component that wraps the content in Suspense
function NewCasePageContent() {
  const searchParams = useSearchParams();
  const caseId = searchParams.get("caseId");
  const caseNumber = getCaseNumber(caseId);

  return (
    <CaseForm
      caseId={caseId}
      title={caseId ? `Edit Case: ${caseNumber}` : "Create New Case"}
    />
  );
}

export default function NewCasePage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-blue-600 font-medium">Loading case details...</p>
          </div>
        </div>
      }
    >
      <NewCasePageContent />
    </Suspense>
  );
}
