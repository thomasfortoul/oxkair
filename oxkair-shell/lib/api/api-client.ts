'use client';

type ApiOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: any;
  headers?: Record<string, string>;
};

export function useApiClient() {
  const fetchWithAuth = async (endpoint: string, options: ApiOptions = {}) => {
    const url = `/api/gateway${endpoint}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...options.headers,
    };
    
    // Easy Auth handles authentication via cookies automatically
    
    const response = await fetch(url, {
      method: options.method || 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    
    return response.json();
  };
  
  return {
    get: (endpoint: string, options?: Omit<ApiOptions, 'method' | 'body'>) => 
      fetchWithAuth(endpoint, { ...options, method: 'GET' }),
    post: (endpoint: string, body: any, options?: Omit<ApiOptions, 'method'>) => 
      fetchWithAuth(endpoint, { ...options, method: 'POST', body }),
    put: (endpoint: string, body: any, options?: Omit<ApiOptions, 'method'>) => 
      fetchWithAuth(endpoint, { ...options, method: 'PUT', body }),
    delete: (endpoint: string, options?: Omit<ApiOptions, 'method' | 'body'>) => 
      fetchWithAuth(endpoint, { ...options, method: 'DELETE' }),
  };
}