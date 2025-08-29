import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  try {
    // Log all headers for debugging
    const headersObject: { [key: string]: string } = {};
    request.headers.forEach((value, key) => {
      headersObject[key] = value;
    });

    // Get user info from middleware headers
    const userOid = request.headers.get("x-user-oid");
    const userEmail = request.headers.get("x-user-email");
    const userProvider = request.headers.get("x-user-provider-name");
    
    return new Response(
      JSON.stringify({
        message: "Authentication debug information",
        headers: headersObject,
        user: {
          oid: userOid,
          email: userEmail,
          provider: userProvider,
        },
        timestamp: new Date().toISOString(),
      }),
      { 
        status: 200, 
        headers: { "Content-Type": "application/json" } 
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ 
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error"
      }),
      { 
        status: 500, 
        headers: { "Content-Type": "application/json" } 
      }
    );
  }
}