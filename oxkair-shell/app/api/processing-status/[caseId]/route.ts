// SSE endpoint stubbed out - no longer needed for real-time updates
// Returns 204 No Content to gracefully close any client connections
export async function GET() {
  return new Response(null, { status: 204 });
}
