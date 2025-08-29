'use client'

import React, { useState } from 'react'
import { ChevronDown, ChevronRight, Clock, User, FileText, Flag, Upload } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'

interface AuditEntry {
  id: number
  case_id: string
  panel_type?: string
  action_type: string
  field_name?: string
  old_value?: unknown
  new_value?: unknown
  user_id: string
  user_type?: 'coder' | 'provider'
  rationale?: string
  created_at: string
  user_profile?: {
    first_name?: string
    last_name?: string
  }
}

interface AuditTrailProps {
  entries: AuditEntry[]
  className?: string
  maxEntries?: number
  showPanelFilter?: boolean
}

const actionTypeConfig = {
  create: {
    icon: FileText,
    label: 'Created',
    color: 'text-green-600',
    bgColor: 'bg-green-50 dark:bg-green-900/20'
  },
  update: {
    icon: FileText,
    label: 'Updated',
    color: 'text-blue-600',
    bgColor: 'bg-blue-50 dark:bg-blue-900/20'
  },
  delete: {
    icon: FileText,
    label: 'Deleted',
    color: 'text-red-600',
    bgColor: 'bg-red-50 dark:bg-red-900/20'
  },
  flag_create: {
    icon: Flag,
    label: 'Flag Created',
    color: 'text-orange-600',
    bgColor: 'bg-orange-50 dark:bg-orange-900/20'
  },
  flag_resolve: {
    icon: Flag,
    label: 'Flag Resolved',
    color: 'text-green-600',
    bgColor: 'bg-green-50 dark:bg-green-900/20'
  },
  flag_unresolve: {
    icon: Flag,
    label: 'Flag Unresolved',
    color: 'text-orange-600',
    bgColor: 'bg-orange-50 dark:bg-orange-900/20'
  },
  submit: {
    icon: Upload,
    label: 'Submitted',
    color: 'text-purple-600',
    bgColor: 'bg-purple-50 dark:bg-purple-900/20'
  },
  attestation_upload: {
    icon: Upload,
    label: 'Attestation Uploaded',
    color: 'text-blue-600',
    bgColor: 'bg-blue-50 dark:bg-blue-900/20'
  },
  attestation_delete: {
    icon: FileText,
    label: 'Attestation Deleted',
    color: 'text-red-600',
    bgColor: 'bg-red-50 dark:bg-red-900/20'
  },
  ai_output_update: {
    icon: FileText,
    label: 'AI Output Updated',
    color: 'text-indigo-600',
    bgColor: 'bg-indigo-50 dark:bg-indigo-900/20'
  }
} as const

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  
  return date.toLocaleDateString()
}

function getUserName(entry: AuditEntry): string {
  if (entry.user_profile?.first_name || entry.user_profile?.last_name) {
    return `${entry.user_profile.first_name || ''} ${entry.user_profile.last_name || ''}`.trim()
  }
  return entry.user_type === 'coder' ? 'coder' : 'Provider'
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return 'N/A'
  if (typeof value === 'object') {
    return JSON.stringify(value, null, 2)
  }
  return String(value)
}

interface AuditEntryItemProps {
  entry: AuditEntry
  isExpanded: boolean
  onToggle: () => void
}

function AuditEntryItem({ entry, isExpanded, onToggle }: AuditEntryItemProps) {
  const config = actionTypeConfig[entry.action_type as keyof typeof actionTypeConfig] || actionTypeConfig.update
  const Icon = config.icon

  const hasDetails = entry.old_value || entry.new_value || entry.rationale
  const showChanges = entry.old_value !== undefined || entry.new_value !== undefined

  return (
    <div className={cn('border rounded-lg p-3', config.bgColor)}>
      <div className="flex items-start gap-3">
        <Icon className={cn('h-4 w-4 mt-0.5 flex-shrink-0', config.color)} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={cn('text-sm font-medium', config.color)}>
              {config.label}
            </span>
            {entry.panel_type && (
              <Badge variant="outline" className="text-xs">
                {entry.panel_type}
              </Badge>
            )}
            {entry.field_name && (
              <Badge variant="secondary" className="text-xs">
                {entry.field_name}
              </Badge>
            )}
            {entry.user_type && (
              <Badge variant="outline" className="text-xs">
                {entry.user_type}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <User className="h-3 w-3" />
            <span>{getUserName(entry)}</span>
            <Clock className="h-3 w-3 ml-2" />
            <span>{formatTimestamp(entry.created_at)}</span>
          </div>
          {entry.rationale && (
            <div className="mt-2 text-sm text-muted-foreground">
              <strong>Rationale:</strong> {entry.rationale}
            </div>
          )}
        </div>
        {hasDetails && (
          <Collapsible open={isExpanded} onOpenChange={onToggle}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                {isExpanded ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
              </Button>
            </CollapsibleTrigger>
          </Collapsible>
        )}
      </div>
      
      {hasDetails && (
        <Collapsible open={isExpanded}>
          <CollapsibleContent className="mt-3 pt-3 border-t border-border/50">
            {showChanges && (
              <div className="space-y-3">
                {entry.old_value !== undefined && (
                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-1">
                      Previous Value:
                    </div>
                    <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
                      {formatValue(entry.old_value)}
                    </pre>
                  </div>
                )}
                {entry.new_value !== undefined && (
                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-1">
                      New Value:
                    </div>
                    <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
                      {formatValue(entry.new_value)}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  )
}

export function AuditTrail({ 
  entries, 
  className, 
  maxEntries = 10,
  showPanelFilter = false 
}: AuditTrailProps) {
  const [expandedEntries, setExpandedEntries] = useState<Set<number>>(new Set())
  const [selectedPanel, setSelectedPanel] = useState<string>('all')

  const filteredEntries = selectedPanel === 'all' 
    ? entries 
    : entries.filter(entry => entry.panel_type === selectedPanel)

  const displayEntries = filteredEntries.slice(0, maxEntries)
  const hasMore = filteredEntries.length > maxEntries

  const toggleExpanded = (entryId: number) => {
    const newExpanded = new Set(expandedEntries)
    if (newExpanded.has(entryId)) {
      newExpanded.delete(entryId)
    } else {
      newExpanded.add(entryId)
    }
    setExpandedEntries(newExpanded)
  }

  const panelTypes = Array.from(new Set(entries.map(e => e.panel_type).filter(Boolean)))

  if (entries.length === 0) {
    return (
      <div className={cn('text-sm text-muted-foreground text-center py-4', className)}>
        No audit trail entries found
      </div>
    )
  }

  return (
    <div className={cn('space-y-3', className)}>
      {showPanelFilter && panelTypes.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Filter by panel:</span>
          <select
            value={selectedPanel}
            onChange={(e) => setSelectedPanel(e.target.value)}
            className="text-sm border rounded px-2 py-1"
          >
            <option value="all">All Panels</option>
            {panelTypes.map(panel => (
              <option key={panel} value={panel}>
                {panel}
              </option>
            ))}
          </select>
        </div>
      )}
      
      <div className="space-y-2">
        {displayEntries.map((entry) => (
          <AuditEntryItem
            key={entry.id}
            entry={entry}
            isExpanded={expandedEntries.has(entry.id)}
            onToggle={() => toggleExpanded(entry.id)}
          />
        ))}
      </div>
      
      {hasMore && (
        <div className="text-center">
          <Button variant="outline" size="sm">
            Show {filteredEntries.length - maxEntries} more entries
          </Button>
        </div>
      )}
    </div>
  )
}