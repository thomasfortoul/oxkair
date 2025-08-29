import { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  console.log("[Debug Headers] Request received");
  console.log("[Debug Headers] Request URL:", request.url);
  console.log("[Debug Headers] Request headers type:", typeof request.headers);
  console.log("[Debug Headers] Request headers keys:", Object.keys(request.headers));
  
  // Log all headers for debugging
  console.log("[Debug Headers] All headers:");
  try {
    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      headers[key] = value;
      console.log(`  ${key}: ${value.substring(0, 50)}${value.length > 50 ? '...' : ''}`);
    });
    
    return new Response(
      JSON.stringify({ 
        message: "Headers logged to server console",
        headers: headers
      }, null, 2),
      { 
        status: 200, 
        headers: { 'Content-Type': 'application/json' } 
      }
    );
  } catch (e) {
    console.log("[Debug Headers] Could not iterate headers:", e);
    return new Response(
      JSON.stringify({ 
        error: "Could not iterate headers",
        details: e instanceof Error ? e.message : String(e)
      }),
      { 
        status: 500, 
        headers: { 'Content-Type': 'application/json' } 
      }
    );
  }
}