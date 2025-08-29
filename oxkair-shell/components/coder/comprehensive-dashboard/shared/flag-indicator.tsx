'use client'

import React from 'react'
import { AlertTriangle, AlertCircle, Info } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

interface Flag {
  id: number
  flag_type: string
  severity: 'high' | 'medium' | 'low'
  message: string
  field_name?: string
  resolved: boolean
}

interface FlagIndicatorProps {
  flags: Flag[]
  className?: string
  showCount?: boolean
  size?: 'sm' | 'md' | 'lg'
}

const severityConfig = {
  high: {
    icon: AlertTriangle,
    color: 'destructive',
    bgColor: 'bg-red-100 dark:bg-red-900/20',
    textColor: 'text-red-700 dark:text-red-300',
    borderColor: 'border-red-200 dark:border-red-800'
  },
  medium: {
    icon: AlertCircle,
    color: 'warning',
    bgColor: 'bg-yellow-100 dark:bg-yellow-900/20',
    textColor: 'text-yellow-700 dark:text-yellow-300',
    borderColor: 'border-yellow-200 dark:border-yellow-800'
  },
  low: {
    icon: Info,
    color: 'secondary',
    bgColor: 'bg-blue-100 dark:bg-blue-900/20',
    textColor: 'text-blue-700 dark:text-blue-300',
    borderColor: 'border-blue-200 dark:border-blue-800'
  }
} as const

export function FlagIndicator({ flags, className, showCount = true, size = 'md' }: FlagIndicatorProps) {
  const unresolvedFlags = flags.filter(flag => !flag.resolved)
  
  if (unresolvedFlags.length === 0) {
    return null
  }

  // Group flags by severity
  const flagsBySeverity = unresolvedFlags.reduce((acc, flag) => {
    if (!acc[flag.severity]) {
      acc[flag.severity] = []
    }
    acc[flag.severity].push(flag)
    return acc
  }, {} as Record<string, Flag[]>)

  // Get highest severity
  const highestSeverity = unresolvedFlags.reduce((highest, flag) => {
    const severityOrder = { high: 3, medium: 2, low: 1 }
    return severityOrder[flag.severity] > severityOrder[highest] ? flag.severity : highest
  }, 'low' as 'high' | 'medium' | 'low')

  const config = severityConfig[highestSeverity]
  const Icon = config.icon

  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-5 w-5',
    lg: 'h-6 w-6'
  }

  const badgeSizeClasses = {
    sm: 'text-xs px-1.5 py-0.5',
    md: 'text-sm px-2 py-1',
    lg: 'text-base px-2.5 py-1.5'
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn('flex items-center gap-1', className)}>
            <Icon className={cn(sizeClasses[size], config.textColor)} />
            {showCount && (
              <Badge 
                variant="outline" 
                className={cn(
                  badgeSizeClasses[size],
                  config.bgColor,
                  config.textColor,
                  config.borderColor
                )}
              >
                {unresolvedFlags.length}
              </Badge>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-sm">
          <div className="space-y-2">
            <div className="font-semibold">
              {unresolvedFlags.length} unresolved flag{unresolvedFlags.length !== 1 ? 's' : ''}
            </div>
            <div className="space-y-1">
              {Object.entries(flagsBySeverity).map(([severity, severityFlags]) => {
                const severityConfigItem = severityConfig[severity as keyof typeof severityConfig]
                return (
                  <div key={severity} className="space-y-1">
                    <div className={cn('text-xs font-medium', severityConfigItem.textColor)}>
                      {severity.toUpperCase()} ({severityFlags.length})
                    </div>
                    {severityFlags.slice(0, 3).map((flag) => (
                      <div key={flag.id} className="text-xs text-muted-foreground">
                        • {flag.message}
                      </div>
                    ))}
                    {severityFlags.length > 3 && (
                      <div className="text-xs text-muted-foreground">
                        ... and {severityFlags.length - 3} more
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

interface FlagListProps {
  flags: Flag[]
  onResolve?: (flagId: number) => void
  className?: string
}

export function FlagList({ flags, onResolve, className }: FlagListProps) {
  if (flags.length === 0) {
    return (
      <div className={cn('text-sm text-muted-foreground text-center py-4', className)}>
        No flags to display
      </div>
    )
  }

  return (
    <div className={cn('space-y-2', className)}>
      {flags.map((flag) => {
        const config = severityConfig[flag.severity]
        const Icon = config.icon

        return (
          <div
            key={flag.id}
            className={cn(
              'flex items-start gap-3 p-3 rounded-lg border',
              config.bgColor,
              config.borderColor,
              flag.resolved && 'opacity-60'
            )}
          >
            <Icon className={cn('h-4 w-4 mt-0.5 flex-shrink-0', config.textColor)} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="outline" className={cn('text-xs', config.textColor)}>
                  {flag.severity.toUpperCase()}
                </Badge>
                {flag.field_name && (
                  <Badge variant="secondary" className="text-xs">
                    {flag.field_name}
                  </Badge>
                )}
                {flag.resolved && (
                  <Badge variant="outline" className="text-xs text-green-600">
                    RESOLVED
                  </Badge>
                )}
              </div>
              <p className={cn('text-sm', config.textColor)}>
                {flag.message}
              </p>
            </div>
            {!flag.resolved && onResolve && (
              <button
                onClick={() => onResolve(flag.id)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Resolve
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}