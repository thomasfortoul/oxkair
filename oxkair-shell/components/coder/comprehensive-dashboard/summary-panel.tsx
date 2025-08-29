"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { CheckCircle, Send, FileCheck, AlertTriangle } from "lucide-react"
import type { SummaryPanel } from "@/lib/coder/comprehensive-dashboard/types"

interface SummaryPanelProps {
  data: SummaryPanel
  handleSubmit: () => Promise<void>;
  isSubmitting: boolean;
}

export function SummaryPanel({
  data,
  handleSubmit,
  isSubmitting
}: SummaryPanelProps) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'clean': return 'bg-green-100 text-green-800'
      case 'flagged': return 'bg-red-100 text-red-800'
      case 'unresolved': return 'bg-yellow-100 text-yellow-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getOverallStatusColor = (status: string) => {
    switch (status) {
      case 'ready': return 'bg-green-100 text-green-800 border-green-200'
      case 'pending_resolution': return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      case 'PENDING_BILLING': return 'bg-blue-100 text-blue-800 border-blue-200'
      default: return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const getPanelIcon = (panelType: string) => {
    switch (panelType) {
      case 'demographics': return '👤'
      case 'diagnosis': return '🏥'
      case 'procedure': return '⚕️'
      case 'assistant': return '👥'
      case 'modifier': return '⚙️'
      case 'compliance': return '🛡️'
      case 'rvu': return '💰'
      default: return '📋'
    }
  }

  const totalFlags = data.panelSummaries.reduce((sum, panel) => sum + panel.flagCount, 0)
  const cleanPanels = data.panelSummaries.filter(panel => panel.status === 'clean').length
  const totalPanels = data.panelSummaries.length

  return (
    <div className="max-w-6xl mx-auto p-6">
      <Card className="shadow-lg border-0 bg-gradient-to-br from-white to-gray-50">
        <CardHeader className="pb-8">
          <div className="text-center space-y-4">
            <div className="flex items-center justify-center gap-3">
              <div className="p-3 bg-blue-100 rounded-full">
                <FileCheck className="h-8 w-8 text-blue-600" />
              </div>
              <div>
                <CardTitle className="text-2xl font-bold text-gray-900">
                  Summary & Final Review
                </CardTitle>
                <CardDescription className="text-lg text-gray-600 mt-1">
                  Complete overview of all panels and submission status
                </CardDescription>
              </div>
            </div>
            
            {data.flags.length > 0 && (
              <div className="flex items-center justify-center gap-2 p-3 bg-red-50 rounded-lg border border-red-200">
                <AlertTriangle className="h-5 w-5 text-red-600" />
                <span className="text-red-800 font-medium">
                  {data.flags.length} issue{data.flags.length !== 1 ? 's' : ''} require{data.flags.length === 1 ? 's' : ''} attention
                </span>
              </div>
            )}
          </div>
        </CardHeader>
        
        <CardContent className="space-y-8 px-8 pb-8">
          {/* Overall Status Card */}
          <div className="relative overflow-hidden">
            <div className={`p-8 rounded-2xl border-2 ${getOverallStatusColor(data.overallStatus)} relative`}>
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <h3 className="text-xl font-bold">Overall Status</h3>
                  <p className="text-base opacity-90 max-w-md">
                    {data.overallStatus === 'ready' && 'Case is ready for submission'}
                    {data.overallStatus === 'pending_resolution' && 'Some issues need to be resolved before submission'}
                    {data.overallStatus === 'PENDING_BILLING' && 'Case has been submitted for review'}
                  </p>
                </div>
                <div className="text-right space-y-1">
                  <div className="text-3xl font-bold">
                    {data.overallStatus.replace('_', ' ').toUpperCase()}
                  </div>
                  <div className="text-sm opacity-75 font-medium">
                    {cleanPanels}/{totalPanels} panels clean
                  </div>
                </div>
              </div>
              
              {/* Progress bar */}
              <div className="mt-6">
                <div className="flex justify-between text-sm font-medium mb-2">
                  <span>Progress</span>
                  <span>{Math.round((cleanPanels / totalPanels) * 100)}%</span>
                </div>
                <div className="w-full bg-white/30 rounded-full h-3">
                  <div 
                    className="bg-current h-3 rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${(cleanPanels / totalPanels) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Panel Summary */}
          <div className="space-y-6">
            <h3 className="text-xl font-bold text-gray-900 text-center">Panel Status Overview</h3>
            
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50 border-b border-gray-200">
                    <TableHead className="font-semibold text-gray-900 py-4">Panel</TableHead>
                    <TableHead className="font-semibold text-gray-900 py-4">Status</TableHead>
                    <TableHead className="font-semibold text-gray-900 py-4">Issues</TableHead>
                    <TableHead className="font-semibold text-gray-900 py-4">Last Modified</TableHead>
                    <TableHead className="font-semibold text-gray-900 py-4">Modified By</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.panelSummaries.map((panel, index) => (
                    <TableRow key={index} className="hover:bg-gray-50 transition-colors">
                      <TableCell className="py-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-gray-100 rounded-lg">
                            <span className="text-xl">{getPanelIcon(panel.panelType)}</span>
                          </div>
                          <span className="font-medium text-gray-900 capitalize">
                            {panel.panelType.replace('_', ' ')}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="py-4">
                        <Badge className={`${getStatusColor(panel.status)} font-medium px-3 py-1`}>
                          {panel.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-4">
                        {panel.flagCount > 0 ? (
                          <Badge variant="destructive" className="font-medium px-3 py-1">
                            {panel.flagCount} issue{panel.flagCount !== 1 ? 's' : ''}
                          </Badge>
                        ) : (
                          <div className="flex items-center gap-2 text-green-600 font-medium">
                            <CheckCircle className="h-4 w-4" />
                            Clean
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="py-4 text-gray-600 font-medium">
                        {new Date(panel.lastModified).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="py-4 text-gray-600 font-medium">
                        {panel.modifiedBy}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>



          {/* Action Buttons */}
          <div className="flex flex-col items-center space-y-4 pt-6">
            <div className="flex gap-4 w-full max-w-md">
              {data.workflow.canSubmitToProvider && (
                <Button 
                  className="flex-1 h-12 text-base font-semibold bg-blue-600 hover:bg-blue-700 shadow-lg hover:shadow-xl transition-all duration-200" 
                  onClick={handleSubmit} 
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-current mr-3"></div>
                  ) : (
                    <Send className="h-5 w-5 mr-3" />
                  )}
                  {isSubmitting ? 'Submitting...' : 'Submit to Provider'}
                </Button>
              )}
              {data.workflow.canFinalizeDirectly && (
                <Button 
                  variant="outline" 
                  className="flex-1 h-12 text-base font-semibold border-2 hover:bg-gray-50 shadow-lg hover:shadow-xl transition-all duration-200"
                >
                  <CheckCircle className="h-5 w-5 mr-3" />
                  Finalize Directly
                </Button>
              )}
            </div>
          </div>

          {/* Summary Statistics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div className="bg-white p-6 rounded-xl border border-gray-200 text-center shadow-sm hover:shadow-md transition-shadow">
              <div className="text-3xl font-bold text-blue-600 mb-2">{totalPanels}</div>
              <div className="text-sm font-medium text-gray-600 uppercase tracking-wide">Total Panels</div>
            </div>
            <div className="bg-white p-6 rounded-xl border border-gray-200 text-center shadow-sm hover:shadow-md transition-shadow">
              <div className="text-3xl font-bold text-green-600 mb-2">{cleanPanels}</div>
              <div className="text-sm font-medium text-gray-600 uppercase tracking-wide">Clean Panels</div>
            </div>
            <div className="bg-white p-6 rounded-xl border border-gray-200 text-center shadow-sm hover:shadow-md transition-shadow">
              <div className="text-3xl font-bold text-red-600 mb-2">{totalFlags}</div>
              <div className="text-sm font-medium text-gray-600 uppercase tracking-wide">Total Issues</div>
            </div>
            <div className="bg-white p-6 rounded-xl border border-gray-200 text-center shadow-sm hover:shadow-md transition-shadow">
              <div className="text-3xl font-bold text-purple-600 mb-2">
                {Math.round((cleanPanels / totalPanels) * 100)}%
              </div>
              <div className="text-sm font-medium text-gray-600 uppercase tracking-wide">Complete</div>
            </div>
          </div>

          {/* Audit Information */}
          {data.submittedBy && (
            <div className="pt-6 border-t border-gray-200">
              <div className="text-center text-sm text-gray-500 bg-gray-50 p-4 rounded-lg">
                <span className="font-medium">Last modified by:</span> {data.submittedBy} 
                <span className="mx-2">•</span>
                <span className="font-medium">at:</span> {data.submittedAt}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}