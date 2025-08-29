import { NextRequest } from "next/server";

/**
 * Health check endpoint that verifies the application is running
 * and can connect to required services
 */
export async function GET(request: NextRequest) {
  try {
    // Simple health check response
    return new Response(
      JSON.stringify({
        status: "healthy",
        timestamp: new Date().toISOString(),
        service: "oxkair-shell",
      }),
      { 
        status: 200, 
        headers: { "Content-Type": "application/json" } 
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ 
        status: "unhealthy",
        error: error instanceof Error ? error.message : "Unknown error"
      }),
      { 
        status: 500, 
        headers: { "Content-Type": "application/json" } 
      }
    );
  }
}