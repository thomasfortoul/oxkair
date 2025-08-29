"use client";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";

export default function ProgressTestPage() {
  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Progress Update Test</h1>
      </div>

      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          <strong>Feature Removed:</strong> Real-time progress updates have been removed to fix Vercel deployment issues. 
          The application now uses a simplified request-response model with loading spinners instead of live progress tracking.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>What Changed</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2 text-sm">
            <p><strong>Before:</strong> Cases showed real-time progress updates via Server-Sent Events (SSE)</p>
            <p><strong>After:</strong> Cases show a simple loading spinner until processing completes</p>
            <p><strong>Reason:</strong> BroadcastChannel doesn't work in Vercel's serverless environment</p>
            <p><strong>User Experience:</strong> Standard "click → spinner → result" flow</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Removed Components</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            <p>• <code>/api/processing-status/[caseId]</code> - SSE endpoint</p>
            <p>• <code>BroadcastChannel</code> usage in agents</p>
            <p>• <code>ProcessingStatusModal</code> component</p>
            <p>• Progress tracking database tables</p>
            <p>• EventSource listeners in frontend</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}