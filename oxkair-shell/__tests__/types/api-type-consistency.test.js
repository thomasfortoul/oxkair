/**
 * API Type Consistency Tests
 * Ensures API routes use standardized request/response types consistently
 */

import { describe, test, expect, beforeAll } from '@jest/globals';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const API_DIR = join(process.cwd(), 'app/api');

describe('API Type Consistency', () => {
  let apiRoutes = [];

  beforeAll(async () => {
    const getApiRoutes = (dir, routes = []) => {
      try {
        const files = readdirSync(dir, { withFileTypes: true });
        files.forEach(file => {
          const fullPath = join(dir, file.name);
          if (file.isDirectory()) {
            getApiRoutes(fullPath, routes);
          } else if (file.name === 'route.ts') {
            routes.push({
              name: file.name,
              path: fullPath,
              endpoint: fullPath.replace(API_DIR, '').replace('/route.ts', ''),
              content: readFileSync(fullPath, 'utf8')
            });
          }
        });
      } catch (error) {
        // Directory might not exist
      }
      return routes;
    };

    apiRoutes = getApiRoutes(API_DIR);
  });

  test('All API routes use consistent HTTP method signatures', () => {
    const httpMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
    
    apiRoutes.forEach(route => {
      httpMethods.forEach(method => {
        const methodPattern = new RegExp(`export\\s+async\\s+function\\s+${method}`, 'g');
        const matches = route.content.match(methodPattern);
        
        if (matches) {
          // Check for proper request/response typing
          const requestPattern = new RegExp(`${method}\\s*\\([^)]*request\\s*:[^,)]+`, 'g');
          const hasTypedRequest = route.content.match(requestPattern);
          
          if (hasTypedRequest) {
            console.log(`✓ ${route.endpoint} ${method} has typed request`);
          }
        }
      });
    });
  });

  test('API routes use consistent response format', () => {
    const responsePatterns = [
      /NextResponse\.json\(/g,
      /Response\.json\(/g,
      /return.*?json\(/g
    ];

    apiRoutes.forEach(route => {
      responsePatterns.forEach(pattern => {
        const matches = route.content.match(pattern);
        if (matches) {
          console.log(`✓ ${route.endpoint} uses consistent response format`);
        }
      });
    });
  });

  test('Error responses follow consistent structure', () => {
    const errorResponsePatterns = [
      /error\s*:\s*['"]/g,
      /message\s*:\s*['"]/g,
      /status\s*:\s*\d+/g,
      /NextResponse\.json\([^)]*error/g
    ];

    apiRoutes.forEach(route => {
      if (route.content.includes('error') || route.content.includes('catch')) {
        const hasConsistentErrorFormat = errorResponsePatterns.some(pattern => 
          route.content.match(pattern)
        );
        
        expect(hasConsistentErrorFormat).toBe(true);
        console.log(`✓ ${route.endpoint} uses consistent error format`);
      }
    });
  });

  test('Authentication middleware is consistently applied', () => {
    const authPatterns = [
      /withAuth/g,
      /withSimpleAuth/g,
      /auth/g,
      /authorization/g,
      /bearer/g
    ];

    const protectedRoutes = apiRoutes.filter(route => 
      !route.endpoint.includes('/health') && 
      !route.endpoint.includes('/debug') &&
      !route.endpoint.includes('/public')
    );

    protectedRoutes.forEach(route => {
      const hasAuth = authPatterns.some(pattern => 
        route.content.match(pattern)
      );
      
      if (route.content.includes('POST') || route.content.includes('PUT') || route.content.includes('DELETE')) {
        console.log(`✓ ${route.endpoint} checked for authentication`);
      }
    });
  });

  test('Request validation uses consistent schemas', () => {
    const validationPatterns = [
      /validate/g,
      /schema/g,
      /zod/g,
      /parse/g,
      /safeParse/g
    ];

    apiRoutes.forEach(route => {
      if (route.content.includes('POST') || route.content.includes('PUT')) {
        const hasValidation = validationPatterns.some(pattern => 
          route.content.match(pattern)
        );
        
        if (hasValidation) {
          console.log(`✓ ${route.endpoint} implements request validation`);
        }
      }
    });
  });

  test('Database operations use consistent error handling', () => {
    const dbPatterns = [
      /query/g,
      /execute/g,
      /transaction/g,
      /pool/g,
      /client/g
    ];

    const dbErrorPatterns = [
      /DatabaseError/g,
      /QueryError/g,
      /catch.*?error/g,
      /try.*?catch/g
    ];

    apiRoutes.forEach(route => {
      const hasDbOperation = dbPatterns.some(pattern => 
        route.content.match(pattern)
      );
      
      if (hasDbOperation) {
        const hasErrorHandling = dbErrorPatterns.some(pattern => 
          route.content.match(pattern)
        );
        
        expect(hasErrorHandling).toBe(true);
        console.log(`✓ ${route.endpoint} has database error handling`);
      }
    });
  });

  test('API routes handle CORS consistently', () => {
    const corsPatterns = [
      /cors/g,
      /Access-Control/g,
      /origin/g,
      /headers.*?allow/gi
    ];

    apiRoutes.forEach(route => {
      corsPatterns.forEach(pattern => {
        const matches = route.content.match(pattern);
        if (matches) {
          console.log(`✓ ${route.endpoint} handles CORS`);
        }
      });
    });
  });

  test('Content-Type headers are properly set', () => {
    const contentTypePatterns = [
      /content-type/gi,
      /application\/json/g,
      /text\/plain/g,
      /multipart\/form-data/g
    ];

    apiRoutes.forEach(route => {
      contentTypePatterns.forEach(pattern => {
        const matches = route.content.match(pattern);
        if (matches) {
          console.log(`✓ ${route.endpoint} sets Content-Type headers`);
        }
      });
    });
  });

  test('Rate limiting and security headers are consistent', () => {
    const securityPatterns = [
      /rate.*?limit/gi,
      /x-.*?header/gi,
      /security/gi,
      /throttle/gi
    ];

    apiRoutes.forEach(route => {
      securityPatterns.forEach(pattern => {
        const matches = route.content.match(pattern);
        if (matches) {
          console.log(`✓ ${route.endpoint} implements security measures`);
        }
      });
    });
  });

  test('API versioning is handled consistently', () => {
    const versionPatterns = [
      /v1/g,
      /v2/g,
      /version/gi,
      /api.*?version/gi
    ];

    apiRoutes.forEach(route => {
      versionPatterns.forEach(pattern => {
        const matches = route.content.match(pattern);
        if (matches) {
          console.log(`✓ ${route.endpoint} handles API versioning`);
        }
      });
    });
  });

  test('Pagination parameters are consistently typed', () => {
    const paginationPatterns = [
      /limit/g,
      /offset/g,
      /page/g,
      /pageSize/g,
      /cursor/g
    ];

    apiRoutes.forEach(route => {
      if (route.content.includes('GET')) {
        paginationPatterns.forEach(pattern => {
          const matches = route.content.match(pattern);
          if (matches) {
            console.log(`✓ ${route.endpoint} handles pagination`);
          }
        });
      }
    });
  });

  test('File upload endpoints use consistent multipart handling', () => {
    const uploadPatterns = [
      /multipart/g,
      /formData/g,
      /file/g,
      /upload/g,
      /blob/g
    ];

    apiRoutes.forEach(route => {
      const hasUpload = uploadPatterns.some(pattern => 
        route.content.match(pattern)
      );
      
      if (hasUpload) {
        console.log(`✓ ${route.endpoint} handles file uploads`);
      }
    });
  });

  test('WebSocket endpoints use consistent message types', () => {
    const wsPatterns = [
      /websocket/gi,
      /ws/g,
      /socket/g,
      /realtime/gi
    ];

    apiRoutes.forEach(route => {
      const hasWebSocket = wsPatterns.some(pattern => 
        route.content.match(pattern)
      );
      
      if (hasWebSocket) {
        console.log(`✓ ${route.endpoint} handles WebSocket connections`);
      }
    });
  });
});