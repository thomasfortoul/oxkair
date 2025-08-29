'use client'

import React from 'react'
import { cn } from '@/lib/utils'

interface CaseIdentifierProps {
  case?: {
    id?: string
    case_number?: string
    title?: string
  } | null
  caseNumber?: string
  caseId?: string
  variant?: 'default' | 'short' | 'title' | 'badge'
  showTitle?: boolean
  className?: string
}

/**
 * CaseIdentifier component for consistent case number display across the application
 * 
 * @param case - The case object containing id, case_number, and optionally title
 * @param caseNumber - Direct case number override
 * @param caseId - Direct case ID override (will be formatted if it's a UUID)
 * @param variant - Display variant: 'default', 'short', 'title', or 'badge'
 * @param showTitle - Whether to show the case title alongside the identifier
 * @param className - Additional CSS classes
 */
export function CaseIdentifier({
  case: caseData,
  caseNumber,
  caseId,
  variant = 'default',
  showTitle = false,
  className
}: CaseIdentifierProps) {
  
  // Determine the case identifier to display
  const getCaseIdentifier = (): string => {
    // Direct override takes precedence
    if (caseNumber) {
      return caseNumber
    }
    
    // Use case object's case_number if available
    if (caseData?.case_number) {
      return caseData.case_number
    }
    
    // Fallback to formatted case ID
    const idToFormat = caseId || caseData?.id
    if (idToFormat) {
      // Check if it's a UUID format and format it
      if (idToFormat.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)) {
        return `Case ${idToFormat.slice(0, 8)}`
      }
      // If it's already a case number format, return as is
      if (idToFormat.match(/^CASE-\d{4}$/)) {
        return idToFormat
      }
      // Otherwise, treat as case ID
      return `Case ${idToFormat}`
    }
    
    return 'Unknown Case'
  }

  const identifier = getCaseIdentifier()
  const title = caseData?.title

  // Render based on variant
  const renderContent = () => {
    switch (variant) {
      case 'short':
        // Just the number part for CASE-#### format, otherwise full identifier
        if (identifier.startsWith('CASE-')) {
          return identifier.replace('CASE-', '#')
        }
        return identifier

      case 'title':
        if (title && showTitle) {
          return `${title} (${identifier})`
        }
        if (title) {
          return title
        }
        return identifier

      case 'badge':
        return (
          <span className={cn(
            'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
            'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
            className
          )}>
            {identifier}
          </span>
        )

      case 'default':
      default:
        if (showTitle && title) {
          return (
            <span className={cn('space-x-2', className)}>
              <span className="font-medium">{title}</span>
              <span className="text-muted-foreground">({identifier})</span>
            </span>
          )
        }
        return <span className={cn(className)}>{identifier}</span>
    }
  }

  // For badge variant, the styling is handled inside renderContent
  if (variant === 'badge') {
    return renderContent()
  }

  return (
    <span className={cn(
      variant === 'short' && 'font-mono text-sm',
      variant === 'title' && 'font-medium',
      className
    )}>
      {renderContent()}
    </span>
  )
}

/**
 * Hook to get case identifier string
 */
export function useCaseIdentifier(
  caseData?: { id?: string; case_number?: string },
  fallbackId?: string
): string {
  if (caseData?.case_number) {
    return caseData.case_number
  }
  
  const idToFormat = fallbackId || caseData?.id
  if (idToFormat) {
    if (idToFormat.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)) {
      return `Case ${idToFormat.slice(0, 8)}`
    }
    if (idToFormat.match(/^CASE-\d{4}$/)) {
      return idToFormat
    }
    return `Case ${idToFormat}`
  }
  
  return 'Unknown Case'
}

export default CaseIdentifier