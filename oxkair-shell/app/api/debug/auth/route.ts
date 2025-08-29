import { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const headers: Record<string, string> = {};
  
  // Collect all headers for debugging
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });

  const debugInfo = {
    timestamp: new Date().toISOString(),
    url: request.url,
    method: request.method,
    headers: headers,
    middlewareHeaders: {
      'x-user-oid': request.headers.get('x-user-oid'),
      'x-user-email': request.headers.get('x-user-email'),
      'x-user-issuer': request.headers.get('x-user-issuer'),
      'x-user-name-identifier': request.headers.get('x-user-name-identifier'),
      'x-user-tenant-id': request.headers.get('x-user-tenant-id'),
      'x-user-provider-name': request.headers.get('x-user-provider-name'),
      'x-user-roles': request.headers.get('x-user-roles'),
    },
    easyAuthHeaders: {
      'X-MS-CLIENT-PRINCIPAL': request.headers.get('X-MS-CLIENT-PRINCIPAL') ? 'Present' : 'Missing',
      'X-MS-CLIENT-PRINCIPAL-IDP': request.headers.get('X-MS-CLIENT-PRINCIPAL-IDP'),
      'X-MS-CLIENT-PRINCIPAL-NAME': request.headers.get('X-MS-CLIENT-PRINCIPAL-NAME'),
    }
  };

  return new Response(
    JSON.stringify(debugInfo, null, 2),
    { 
      status: 200, 
      headers: { 'Content-Type': 'application/json' } 
    }
  );
}