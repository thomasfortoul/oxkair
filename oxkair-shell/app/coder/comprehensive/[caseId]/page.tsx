"use client"

import React, { useState, useEffect, useCallback, useRef } from "react"
import { useRouter, useParams, useSearchParams } from "next/navigation"
import { ArrowLeft, Check, AlertTriangle, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { useAuth } from "@/lib/auth/auth-context"
import { getMedicalNoteById, updateMedicalNote, medicalNotesClient } from "@/lib/api/medical-notes-client"
import { getUserProfile } from "@/lib/api/profiles-client"
import { dashboardAPI } from "@/lib/coder/comprehensive-dashboard/api"
import {
  transformAiOutputToPanelData,
  reconstructPanelDataToAiOutputFormat,
} from "@/lib/coder/comprehensive-dashboard/data-transformer"
import type { Flag } from "@/lib/coder/comprehensive-dashboard/api"
import type {
  ComprehensiveDashboardState,
  UserType,
  CPTGroup,
  MedicalNote,
} from "@/lib/coder/comprehensive-dashboard/types"
import { StandardizedEvidence, StandardizedModifier, ModifierClassifications } from "@/lib/agents/newtypes"
import { CaseHeader } from "../components/CaseHeader"
import { OperativeNote } from "../components/OperativeNote"
import { CPTGroupCard } from "../components/CPTGroupCard"
import { SummaryCard, generateSummaryData, type SummaryCardData } from "@/components/coder/comprehensive-dashboard/summary-card"
import { Footer } from "@/components/nav/Footer"

export default function RefactoredCaseDetailPage() {
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  const { user } = useAuth()

  const caseId = params.caseId as string

  // State from original page.tsx
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [caseData, setCaseData] = useState<MedicalNote | null>(null)
  const [flags, setFlags] = useState<Flag[]>([])
  const [dashboardState, setDashboardState] = useState<Partial<ComprehensiveDashboardState>>({})
  const [userType, setUserType] = useState<UserType | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)

  // Summary dialog state
  const [showSummaryDialog, setShowSummaryDialog] = useState(false)
  const [summaryData, setSummaryData] = useState<SummaryCardData | null>(null)
  const [summaryComments, setSummaryComments] = useState<string>("")

  // State from newpage.tsx for UI interactions
  const [expandedCards, setExpandedCards] = useState<Set<number>>(new Set())
  const [editingCards, setEditingCards] = useState<Set<number>>(new Set())
  const [localEdits, setLocalEdits] = useState<{ [key: string]: any }>({})
  const [originalCardStates, setOriginalCardStates] = useState<{ [key: number]: CPTGroup }>({})

  // Contextual content for highlighting
  const [contextualContent, setContextualContent] = useState<{
    type: "note" | "lcd"
    content: string
    highlight?: string | string[]
    sourceNoteType?: string
    policyId?: string
    evidenceDescription?: string
  } | null>(null)

  // Ref for the operative note container to enable scrolling
  const operativeNoteRef = useRef<HTMLDivElement>(null)

  const commitEditsRef = useRef<(() => void) | undefined>(undefined)

  // Helper function to deduplicate diagnosis codes within a CPT group
  const deduplicateIcdCodes = useCallback((cptGroups: any[]): CPTGroup[] => {
    return cptGroups
      .filter((group): group is CPTGroup => {
        // Type guard to ensure we only process CPTGroup objects
        return group && typeof group === 'object' && 'cptCode' in group && 'icdCodes' in group
      })
      .map(group => ({
        ...group,
        icdCodes: group.icdCodes.filter((icd, index, array) => {
          // Keep only the first occurrence of each diagnosis code
          return array.findIndex(item => item.code === icd.code) === index
        })
      }))
  }, [])

  // Transform function to convert mock data to CPTGroup format
  const transformCodeGroupsToCPTGroups = useCallback((mockCodeGroups: any[]): CPTGroup[] => {
    return mockCodeGroups.map((group, index) => ({
      cptCode: group.cptCode || "",
      description: group.description || "",
      tag: group.status === "Primary" ? "Primary" : "Secondary",
      icdCodes: group.diagnosisCode ? [{
        code: group.diagnosisCode,
        description: group.diagnosisDescription || "",
        cptLinked: {
          code: group.cptCode || "",
          description: group.description || "",
          units: 1,
          evidence: [],
          isPrimary: group.status === "Primary"
        },
        evidence: []
      }] : [],
      modifiers: (group.modifiers || []).map((mod: any) => ({
        modifier: typeof mod === 'string' ? mod : mod.code || mod.modifier || "",
        explanation: typeof mod === 'object' ? mod.description || mod.explanation || "" : "",
        priority: 1,
        required: false,
        evidence: [],
        sourceNoteType: "operative_notes"
      })),
      rvu: {
        workRvu: {
          mp: group.rvu?.workRvu?.mp || 0,
          pe: group.rvu?.workRvu?.pe || 0,
          work: group.rvu?.workRvu?.work || 0,
        },
        adjustedRvu: {
          mp: group.rvu?.adjustedRvu?.mp || 0,
          pe: group.rvu?.adjustedRvu?.pe || 0,
          work: group.rvu?.adjustedRvu?.work || 0,
        },
      },
      compliance: {
        hasViolation: group.compliance?.hasIssue || false,
        status: group.compliance?.hasIssue ? "error" : "info",
        violationDetails: group.compliance?.hasIssue ? group.compliance.reason : undefined,
        details: [],
      },
      sourceNoteType: "operative_notes",
      evidence: [],
    }))
  }, [])

  // Load case data (from original page.tsx)
  const loadCaseData = useCallback(async () => {
    console.log("DEBUG: Attempting to load case data for caseId:", caseId)

    try {
      setLoading(true)
      if (!user?.id || !userType) {
        setError("Authentication error: User not logged in or user type not determined.")
        setLoading(false)
        return
      }

      const data = await getMedicalNoteById(caseId);

      if (!data) {
        console.error("DEBUG: Failed to load case data - no data returned")
        setError("Case not found or access denied")
        return
      }

      setCaseData(data)

      const pristineAiOutput = data.ai_raw_output
      const storedPanelData = data.panel_data
      let dataForPanelTransformation = data.ai_raw_output

      // Debug logging to understand the data flow issue
      console.log("DEBUG: Case data loaded:", {
        caseId: data.id,
        hasAiRawOutput: !!data.ai_raw_output,
        hasFinalProcessedData: !!data.final_processed_data,
        hasPanelData: !!data.panel_data,
        aiRawOutputKeys: data.ai_raw_output ? Object.keys(data.ai_raw_output) : [],
        dataForTransformationKeys: dataForPanelTransformation ? Object.keys(dataForPanelTransformation) : []
      })

      if (data.ai_raw_output) {
        console.log("DEBUG: ai_raw_output structure:", JSON.stringify(data.ai_raw_output, null, 2))
      }

      if (storedPanelData && storedPanelData.groupedProcedures && storedPanelData.groupedProcedures.length > 0) {
        // Deduplicate diagnosis codes before setting state
        const deduplicatedPanelData = {
          ...storedPanelData,
          groupedProcedures: deduplicateIcdCodes(storedPanelData.groupedProcedures)
        }
        
        setDashboardState({
          caseData: data,
          initialAIOutput: pristineAiOutput || transformAiOutputToPanelData({}),
          panelData: deduplicatedPanelData,
          userType,
        })
      } else if (dataForPanelTransformation) {
        try {
          const transformedPanelData = transformAiOutputToPanelData(dataForPanelTransformation)
          
          // Deduplicate diagnosis codes after transformation
          const deduplicatedPanelData = {
            ...transformedPanelData,
            groupedProcedures: deduplicateIcdCodes(transformedPanelData.groupedProcedures || [])
          }

          setDashboardState({
            caseData: data,
            initialAIOutput: pristineAiOutput || transformAiOutputToPanelData({}),
            panelData: deduplicatedPanelData,
            userType,
          })
        } catch (transformError) {
          console.error("DEBUG: Error during transformAiOutputToPanelData:", transformError)
          setError(`Failed to transform AI output: ${transformError instanceof Error ? transformError.message : "Unknown error"}`)
        }
      } else {
        const emptyTransform = transformAiOutputToPanelData({})
        setDashboardState({
          caseData: data,
          initialAIOutput: emptyTransform,
          panelData: emptyTransform,
          userType,
        })
      }
    } catch (err: unknown) {
      console.error("Error loading case:", err)
      if (err instanceof Error) {
        setError(err.message)
      } else {
        setError("An unknown error occurred")
      }
    } finally {
      setLoading(false)
    }
  }, [caseId, user, userType])

  // Load user profile
  useEffect(() => {
    const fetchUserProfile = async () => {
      if (user) {
        // Set the authenticated user ID in the medical notes client
        medicalNotesClient.setUserId(user.id);
        
        const profile = await getUserProfile(user.id);
        if (profile) {
          setUserType(profile.user_category === 'Provider' ? 'provider' : 'coder')
        }
      }
    }
    fetchUserProfile()
  }, [user])

  // Load case data when dependencies are ready
  useEffect(() => {
    if (caseId && user && userType) {
      loadCaseData()
    }
  }, [caseId, user, userType, loadCaseData])

  // Progress tracking removed - using simple loading states instead

  // Helper function to normalize text for matching (handles whitespace differences and case)
  const normalizeTextForMatching = (text: string): string => {
    return text
      .toLowerCase() // Convert to lowercase for case-insensitive matching
      .replace(/\s+/g, ' ') // Replace all whitespace sequences (including newlines) with single spaces
      .trim() // Remove leading/trailing whitespace
  }

  // Helper function to process multiple excerpts separated by semicolons or " ... " delimiters
  const processExcerpts = (highlight: string | string[]): string[] => {
    const highlightsArray = Array.isArray(highlight) ? highlight : [highlight]
    const allExcerpts: string[] = []

    highlightsArray.forEach(item => {
      if (item && typeof item === 'string' && item.trim()) {
        // First try splitting by " ... " delimiter (from code extraction agent)
        let excerpts: string[] = []
        if (item.includes('...')) {
          excerpts = item.split('...').map(excerpt => excerpt.trim()).filter(excerpt => excerpt)
        } 
        else if (item.includes(' ...' )) {
          excerpts = item.split(' ... ').map(excerpt => excerpt.trim()).filter(excerpt => excerpt)
        } 
        
        else {
          // Fallback to semicolon separation for other sources
          excerpts = item.split(';').map(excerpt => excerpt.trim()).filter(excerpt => excerpt)
        }
        allExcerpts.push(...excerpts)
      }
    })

    return allExcerpts
  }

  // Helper function to find matching excerpts in note content
  const findMatchingExcerpts = (noteContent: string, excerpts: string[]): string[] => {
    const normalizedNoteContent = normalizeTextForMatching(noteContent)
    const matchingExcerpts: string[] = []

    excerpts.forEach(excerpt => {
      const normalizedExcerpt = normalizeTextForMatching(excerpt)

      if (normalizedExcerpt && normalizedNoteContent.includes(normalizedExcerpt)) {
        // Find the actual text in the original note content that matches
        // We need to find the original text with its original formatting
        const words = normalizedExcerpt.split(' ')
        if (words.length > 0) {
          // Create a regex pattern that allows for flexible whitespace matching
          const pattern = words.map(word =>
            word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // Escape special regex characters
          ).join('\\s+') // Allow any whitespace between words

          const regex = new RegExp(pattern, 'gi')
          const match = noteContent.match(regex)

          if (match && match[0]) {
            matchingExcerpts.push(match[0])
          } else {
            // Fallback: if regex fails, use the original excerpt
            matchingExcerpts.push(excerpt)
          }
        }
      } else {
        // Enhanced fallback: try partial matching for longer excerpts
        // This helps when the exact text isn't found but parts of it exist
        if (normalizedExcerpt.length > 20) {
          // For longer excerpts, try to find key phrases (first and last few words)
          const words = normalizedExcerpt.split(' ')
          if (words.length >= 4) {
            const firstPart = words.slice(0, 3).join(' ')
            const lastPart = words.slice(-3).join(' ')
            
            // Check if we can find the beginning and end parts
            const firstMatch = normalizedNoteContent.includes(normalizeTextForMatching(firstPart))
            const lastMatch = normalizedNoteContent.includes(normalizeTextForMatching(lastPart))
            
            if (firstMatch || lastMatch) {
              // If we find partial matches, include the original excerpt for highlighting
              matchingExcerpts.push(excerpt)
              return
            }
          }
        }
        
        // Final fallback: always include the excerpt so it can be displayed
        // This ensures that evidence is never lost, even if highlighting doesn't work perfectly
        matchingExcerpts.push(excerpt)
      }
    })

    return matchingExcerpts
  }

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
      ]

      let foundNoteType = content.sourceNoteType
      let matchingHighlights: string[] = []

      // Process all excerpts (handle semicolon separation and arrays)
      const allExcerpts = processExcerpts(content.highlight)

      // Find the note type that contains the most matching excerpts
      let bestMatch = { noteType: foundNoteType, matches: [] as string[] }

      for (const noteType of noteTypes) {
        const noteContent = caseData[noteType] as string | undefined
        if (noteContent) {
          const matches = findMatchingExcerpts(noteContent, allExcerpts)
          if (matches.length > bestMatch.matches.length) {
            bestMatch = { noteType, matches }
          }
        }
      }

      // Use the best match found
      if (bestMatch.matches.length > 0) {
        foundNoteType = bestMatch.noteType
        matchingHighlights = bestMatch.matches
      } else {
        // Enhanced fallback: use original excerpts and try to find the best note type
        // even if exact matching failed
        matchingHighlights = allExcerpts
        
        // Try to determine the best note type based on content length and relevance
        let bestNoteType = content.sourceNoteType || "operative_notes"
        let maxContentLength = 0
        
        for (const noteType of noteTypes) {
          const noteContent = caseData[noteType] as string | undefined
          if (noteContent && noteContent.length > maxContentLength) {
            maxContentLength = noteContent.length
            bestNoteType = noteType
          }
        }
        
        foundNoteType = bestNoteType
      }

      setContextualContent({
        ...content,
        sourceNoteType: foundNoteType,
        highlight: matchingHighlights.length > 0 ? matchingHighlights : content.highlight
      })

      // Scroll to the highlighted content with a delay to allow for rendering
      setTimeout(() => {
        if (operativeNoteRef.current) {
          const highlightedElement = operativeNoteRef.current.querySelector('.evidence-highlight')
          if (highlightedElement) {
            highlightedElement.scrollIntoView({
              behavior: 'smooth',
              block: 'center'
            })
          }
        }
      }, 100)
    } else {
      setContextualContent(content)
    }
  }

  // Handle granular data changes
  const handleGranularDataChange = (
    panelType: string,
    itemId: string | number,
    field: string,
    newValue: any,
    isUserModified: boolean = true,
  ) => {
    setDashboardState((prev) => {
      const panelData = prev.panelData?.[panelType as keyof typeof prev.panelData]

      if (panelType === "groupedProcedures" && Array.isArray(panelData)) {
        const updatedProcedures = [...(panelData as CPTGroup[])]
        const groupIndex = typeof itemId === "number" ? itemId : parseInt(itemId as string)

        if (updatedProcedures[groupIndex]) {
          if (field.includes('.')) {
            // Handle nested field updates (e.g., 'rvu.workRvu', 'icdCodes.0.code')
            const fieldParts = field.split('.')
            let target = { ...updatedProcedures[groupIndex] }
            let current = target

            for (let i = 0; i < fieldParts.length - 1; i++) {
              const part = fieldParts[i]
              const currentAny = current as any
              if (Array.isArray(currentAny[part])) {
                currentAny[part] = [...currentAny[part]]
              } else if (typeof currentAny[part] === 'object') {
                currentAny[part] = { ...currentAny[part] }
              }
              current = currentAny[part]
            }

            (current as any)[fieldParts[fieldParts.length - 1]] = newValue
            updatedProcedures[groupIndex] = target
          } else {
            updatedProcedures[groupIndex] = {
              ...updatedProcedures[groupIndex],
              [field]: newValue,
            }
          }
        }

        return {
          ...prev,
          panelData: {
            ...prev.panelData,
            groupedProcedures: deduplicateIcdCodes(updatedProcedures),
          },
        } as Partial<ComprehensiveDashboardState>
      }

      return prev
    })
  }

  // Handle modifier changes
  const handleModifierChange = (groupIndex: number, modifierIndex: number, field: string, value: any) => {
    setDashboardState((prev) => {
      const updatedProcedures = [...(prev.panelData?.groupedProcedures || [] as CPTGroup[])]
      if (updatedProcedures[groupIndex]) {
        const updatedModifiers = [...(updatedProcedures[groupIndex].modifiers || [])]
        if (updatedModifiers[modifierIndex]) {
          updatedModifiers[modifierIndex] = {
            ...updatedModifiers[modifierIndex],
            [field]: value,
          }
        }
        updatedProcedures[groupIndex] = {
          ...updatedProcedures[groupIndex],
          modifiers: updatedModifiers,
        }
      }

      return {
        ...prev,
        panelData: {
          ...prev.panelData,
          groupedProcedures: updatedProcedures,
        },
      } as Partial<ComprehensiveDashboardState>
    })
  }

  // Add modifier
  const handleAddModifier = (groupIndex: number) => {
    setDashboardState((prev) => {
      const updatedProcedures = [...(prev.panelData?.groupedProcedures || [] as CPTGroup[])]
      if (updatedProcedures[groupIndex]) {
        const newModifier: StandardizedModifier = {
          modifier: "",
          description: "",
          rationale: "",
          linkedCptCode: updatedProcedures[groupIndex].cptCode,
          evidence: [],
          classification: ModifierClassifications.PRICING,
          requiredDocumentation: false,
          feeAdjustment: "0%"
        }
        updatedProcedures[groupIndex] = {
          ...updatedProcedures[groupIndex],
          modifiers: [...(updatedProcedures[groupIndex].modifiers || []), newModifier],
        }
      }

      return {
        ...prev,
        panelData: {
          ...prev.panelData,
          groupedProcedures: updatedProcedures,
        },
      } as Partial<ComprehensiveDashboardState>
    })
  }

  // Remove modifier
  const handleRemoveModifier = (groupIndex: number, modifierIndex: number) => {
    setDashboardState((prev) => {
      const updatedProcedures = [...(prev.panelData?.groupedProcedures || [] as CPTGroup[])]
      if (updatedProcedures[groupIndex]) {
        updatedProcedures[groupIndex] = {
          ...updatedProcedures[groupIndex],
          modifiers: updatedProcedures[groupIndex].modifiers?.filter((_, i) => i !== modifierIndex) || [],
        }
      }

      return {
        ...prev,
        panelData: {
          ...prev.panelData,
          groupedProcedures: updatedProcedures,
        },
      } as Partial<ComprehensiveDashboardState>
    })
  }

  // Add new CPT Group
  const handleAddCPTGroup = () => {
    const newCPTGroup: CPTGroup = {
      cptCode: "",
      description: "",
      tag: "Secondary",
      icdCodes: [{
        code: "",
        description: "",
        linkedCptCode: "",
        evidence: []
      }],
      modifiers: [],
      rvu: {
        workRvu: {
          mp: 0,
          pe: 0,
          work: 0,
        },
        adjustedRvu: {
          mp: 0,
          pe: 0,
          work: 0,
        },
      },
      compliance: {
        hasViolation: false,
        status: "info",
        details: [],
      },
      sourceNoteType: "operative_notes",
      evidence: [],
    }

    // Add the new CPT group at the top of the list and deduplicate
    setDashboardState((prev) => {
      const updatedProcedures = [
        newCPTGroup,
        ...(prev.panelData?.groupedProcedures || [] as CPTGroup[]),
      ]
      
      return {
        ...prev,
        panelData: {
          ...prev.panelData,
          groupedProcedures: deduplicateIcdCodes(updatedProcedures),
        },
      } as Partial<ComprehensiveDashboardState>
    })

    // Update indices for existing expanded/editing cards (shift them down by 1)
    setExpandedCards(prev => {
      const newSet = new Set<number>()
      prev.forEach(index => newSet.add(index + 1))
      newSet.add(0) // Add the new card at index 0 as expanded
      return newSet
    })

    setEditingCards(prev => {
      const newSet = new Set<number>()
      prev.forEach(index => newSet.add(index + 1))
      newSet.add(0) // Add the new card at index 0 as editable
      return newSet
    })
  }

  // Remove CPT Group
  const handleRemoveCPTGroup = (index: number) => {
    setDashboardState((prev) => ({
      ...prev,
      panelData: {
        ...prev.panelData,
        groupedProcedures:
          prev.panelData?.groupedProcedures?.filter((_, i) => i !== index) || [],
      },
    }) as Partial<ComprehensiveDashboardState>)
  }

  // Update CPT Group
  const handleUpdateCPTGroup = (index: number, field: string, value: any) => {
    setDashboardState((prev) => {
      const updatedProcedures = [...(prev.panelData?.groupedProcedures || [] as CPTGroup[])];
      if (updatedProcedures[index]) {
        if (field.includes('.')) {
          // Handle nested field updates (e.g., 'rvu.workRvu', 'icdCodes.0.code')
          const fieldParts = field.split('.');
          let target = { ...updatedProcedures[index] };
          let current = target;

          for (let i = 0; i < fieldParts.length - 1; i++) {
            const part = fieldParts[i];
            const currentAny = current as any;
            if (Array.isArray(currentAny[part])) {
              currentAny[part] = [...currentAny[part]];
            } else if (typeof currentAny[part] === 'object') {
              currentAny[part] = { ...currentAny[part] };
            }
            current = currentAny[part];
          }

          (current as any)[fieldParts[fieldParts.length - 1]] = value;
          updatedProcedures[index] = target;
        } else {
          updatedProcedures[index] = {
            ...updatedProcedures[index],
            [field]: value,
          };
        }
      }

      return {
        ...prev,
        panelData: {
          ...prev.panelData,
          groupedProcedures: deduplicateIcdCodes(updatedProcedures),
        },
      } as Partial<ComprehensiveDashboardState>;
    });
  };

  // Handle saving changes for a specific card and exit edit mode
  const handleSaveCard = (index: number) => {
    // Remove from editing state
    setEditingCards(prev => {
      const newSet = new Set(prev)
      newSet.delete(index)
      return newSet
    })

    // Remove original state since changes are committed
    setOriginalCardStates(prev => {
      const newStates = { ...prev }
      delete newStates[index]
      return newStates
    })
  }

  // Handle reverting changes for a specific card and exit edit mode
  const handleRevertCard = (index: number) => {
    // Restore original state if it exists
    const originalState = originalCardStates[index]
    if (originalState) {
      setDashboardState(prev => {
        const updatedProcedures = [...(prev.panelData?.groupedProcedures || [] as CPTGroup[])]
        updatedProcedures[index] = originalState

        return {
          ...prev,
          panelData: {
            ...prev.panelData,
            groupedProcedures: updatedProcedures,
          },
        } as Partial<ComprehensiveDashboardState>
      })

      // Remove original state
      setOriginalCardStates(prev => {
        const newStates = { ...prev }
        delete newStates[index]
        return newStates
      })
    }

    // Remove from editing state
    setEditingCards(prev => {
      const newSet = new Set(prev)
      newSet.delete(index)
      return newSet
    })
  }

  // Handle save functionality
  const handleSave = async () => {
    if (commitEditsRef.current) {
      commitEditsRef.current()
    }

    if (!user || !caseId || !dashboardState.panelData) {
      setSubmitError("Missing necessary data to save")
      return
    }

    try {
      const transformedData = reconstructPanelDataToAiOutputFormat(dashboardState.panelData)

      // Only send allowed fields for regular users
      // Processors and admins can update all fields, but regular users are restricted
      const dataToSave = {
        final_processed_data: transformedData,
        panel_data: {
          ...caseData?.panel_data,
          groupedProcedures: dashboardState.panelData.groupedProcedures
        },
        provider_user_id: caseData?.provider_user_id,
        institution_id: caseData?.institution_id,
      }

      const result = await dashboardAPI.updateCaseData(caseId, dataToSave)

      if (result.error) {
        throw new Error(result.error)
      }

      setSubmitSuccess("Case data saved successfully!")
      setTimeout(() => setSubmitSuccess(null), 3000)
    } catch (err: unknown) {
      console.error("Error in handleSave:", err)
      if (err instanceof Error) {
        setSubmitError(`Save failed: ${err.message}`)
      } else {
        setSubmitError("An unknown error occurred during save")
      }
      setTimeout(() => setSubmitError(null), 5000)
    }
  }

  // Handle submit functionality - now opens summary dialog
  const handleSubmit = async () => {
    if (!user || !caseId || !dashboardState.panelData || !dashboardState.initialAIOutput) {
      setSubmitError("Missing necessary data to submit")
      return
    }

    // Generate summary data
    const summary = generateSummaryData(caseData, dashboardState)
    setSummaryData(summary)
    setSummaryComments(summary.comments || "")
    setShowSummaryDialog(true)
  }

  // Handle actual submission from summary dialog
  const handleActualSubmit = async () => {
    if (!user || !caseId || !dashboardState.panelData || !dashboardState.initialAIOutput || !summaryData) {
      setSubmitError("Missing necessary data to submit")
      return
    }

    setIsSubmitting(true)
    setSubmitError(null)
    setSubmitSuccess(null)

    try {
      const coderReviewedAiFormat = reconstructPanelDataToAiOutputFormat(dashboardState.panelData)

      // Update summary data with comments
      const updatedSummaryData = { ...summaryData, comments: summaryComments }

      const dataToSave: any = {
        ai_raw_output: dashboardState.initialAIOutput,
        final_processed_data: coderReviewedAiFormat,
        summary_data: updatedSummaryData,
        status: "PENDING_PROVIDER_REVIEW",
        provider_user_id: caseData?.provider_user_id,
        institution_id: caseData?.institution_id,
      }

      await updateMedicalNote(caseData!.id, dataToSave);

      setSubmitSuccess("Case submitted successfully for provider review!")
      setShowSummaryDialog(false)
      router.push("/coder/comprehensive")
    } catch (err: unknown) {
      console.error("Error in handleActualSubmit:", err)
      if (err instanceof Error) {
        setSubmitError(`Submit failed: ${err.message}`)
      } else {
        setSubmitError("An unknown error occurred during submission")
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  // Handle comments change in summary dialog
  const handleSummaryCommentsChange = (comments: string) => {
    setSummaryComments(comments)
  }

  // Get CPT groups from dashboard state
  const cptGroups = dashboardState.panelData?.groupedProcedures || []

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
        <CaseHeader
          caseData={caseData}
          caseId={caseId}
          cptGroupsCount={cptGroups.length}
          onSave={handleSave}
          onSubmit={handleSubmit}
          isSubmitting={isSubmitting}
        />

        {/* Status Messages */}
        {submitError && (
          <Alert variant="destructive" className="mx-8 mt-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{submitError}</AlertDescription>
          </Alert>
        )}
        {submitSuccess && (
          <Alert className="mx-8 mt-4 bg-green-50 border-green-200 text-green-800">
            <Check className="h-4 w-4" />
            <AlertDescription>{submitSuccess}</AlertDescription>
          </Alert>
        )}


        {/* Loading State */}
        {loading && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-blue-600 font-medium">Loading case...</p>
            </div>
          </div>
        )}

        {/* Error State */}
        {error && !loading && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <AlertTriangle className="h-12 w-12 text-red-500 mb-4 mx-auto" />
              <h2 className="text-xl font-semibold mb-2">Error Loading Case</h2>
              <p className="text-muted-foreground mb-4">{error}</p>
              <Button onClick={() => router.push("/coder/comprehensive")} variant="outline">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Cases
              </Button>
            </div>
          </div>
        )}

        {/* Main Content - Only show when not loading and no error */}
        {!loading && !error && (
          <div className="flex flex-1 px-8 min-h-0">
            {/* Left Panel: Code Cards */}
            <aside className="w-2/5 overflow-y-auto scrollbar-hide pt-6 pr-6 pl-12 h-full">
              {/* Add Code Button */}
              <div className="mb-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAddCPTGroup}
                  className="w-full"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Code
                </Button>
              </div>

              <div className="space-y-3 pb-8">
                {cptGroups.map((group, index) => (
                  <CPTGroupCard
                    key={index}
                    group={group}
                    index={index}
                    isExpanded={expandedCards.has(index)}
                    isEditing={editingCards.has(index)}
                    onToggleExpand={() => {
                      const newExpanded = new Set(expandedCards)
                      if (newExpanded.has(index)) {
                        newExpanded.delete(index)
                      } else {
                        newExpanded.add(index)
                      }
                      setExpandedCards(newExpanded)
                    }}
                    onEdit={() => {
                      const newEditing = new Set(editingCards)
                      if (newEditing.has(index)) {
                        newEditing.delete(index)
                      } else {
                        // Store original state before editing
                        setOriginalCardStates(prev => ({
                          ...prev,
                          [index]: { ...group }
                        }))

                        newEditing.add(index)
                        if (!expandedCards.has(index)) {
                          setExpandedCards(prev => new Set([...prev, index]))
                        }
                      }
                      setEditingCards(newEditing)
                    }}
                    onEvidenceClick={(evidence: StandardizedEvidence[] | undefined, sourceNoteType: string | undefined, justification?: string) => {
                      const evidenceArray = Array.isArray(evidence) ? evidence : evidence ? [evidence] : [];
                      const excerpts = evidenceArray.flatMap(e => e.verbatimEvidence || [e.rationale]).filter(e => e && e.trim());
                    
                      if (excerpts.length > 0) {
                        handleContextualContentChange({
                          type: "note",
                          content: caseData?.operative_notes || caseData?.content || "",
                          highlight: excerpts,
                          sourceNoteType: sourceNoteType,
                          evidenceDescription: justification || evidenceArray[0]?.rationale,
                        });
                      }
                    }}
                    onDelete={() => handleRemoveCPTGroup(index)}
                    onUpdate={handleUpdateCPTGroup}
                    onRevert={() => handleRevertCard(index)}
                    onSave={() => handleSaveCard(index)}
                  />
                ))}
              </div>
            </aside>

            <OperativeNote
              operativeNoteRef={operativeNoteRef}
              noteContent={caseData?.operative_notes || caseData?.content || "No operative note available"}
              contextualContent={contextualContent}
            />
          </div>
        )}

        {/* Summary Dialog */}
        <Dialog open={showSummaryDialog} onOpenChange={setShowSummaryDialog}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Review Summary Before Submission</DialogTitle>
            </DialogHeader>

            {summaryData && (
              <SummaryCard
                summaryData={{ ...summaryData, comments: summaryComments }}
                isReadOnly={false}
                onCommentsChange={handleSummaryCommentsChange}
                className="shadow-none"
              />
            )}

            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                onClick={() => setShowSummaryDialog(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                onClick={handleActualSubmit}
                disabled={isSubmitting}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {isSubmitting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2"></div>
                    Submitting...
                  </>
                ) : (
                  "Submit to Provider"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <Footer />
    </TooltipProvider>
  )
}
