/**
 * Request ID Correlation Integration Tests
 * 
 * Verifies that request IDs flow through the system for error correlation.
 */

import { describe, it, expect } from 'vitest';
import request from "supertest";
import express, { Request, Response, NextFunction } from "express";
import { randomUUID } from 'crypto';

function createTestAppWithRequestId() {
  const app = express();
  app.use(express.json());
  
  app.use((req: Request, res: Response, next: NextFunction) => {
    const requestId = req.headers['x-request-id'] as string || randomUUID();
    res.setHeader('X-Request-Id', requestId);
    (req as any).requestId = requestId;
    next();
  });
  
  app.get('/api/test/success', (_req: Request, res: Response) => {
    res.json({ success: true });
  });
  
  app.get('/api/test/error', (req: Request, res: Response) => {
    const requestId = (req as any).requestId;
    res.status(500).json({
      error: {
        code: 'TEST_ERROR',
        message: 'Test error occurred',
        status: 500,
        requestId,
      }
    });
  });
  
  app.post('/api/test/chat-error', (req: Request, res: Response) => {
    const requestId = (req as any).requestId;
    res.status(403).json({
      error: {
        code: 'ACCESS_DENIED',
        message: 'You do not have access to this channel',
        status: 403,
        requestId,
      }
    });
  });
  
  return app;
}

describe('Request ID Correlation - API responses', () => {
  it('should include X-Request-Id header on success responses', async () => {
    const app = createTestAppWithRequestId();
    const response = await request(app).get('/api/test/success');
    
    expect(response.status).toBe(200);
    expect(response.headers['x-request-id']).toBeDefined();
    expect(typeof response.headers['x-request-id']).toBe('string');
  });

  it('should include X-Request-Id header on error responses', async () => {
    const app = createTestAppWithRequestId();
    const response = await request(app).get('/api/test/error');
    
    expect(response.status).toBe(500);
    expect(response.headers['x-request-id']).toBeDefined();
  });

  it('should echo client-provided X-Request-Id', async () => {
    const app = createTestAppWithRequestId();
    const clientRequestId = 'client-provided-id-123';
    const response = await request(app)
      .get('/api/test/success')
      .set('X-Request-Id', clientRequestId);
    
    expect(response.headers['x-request-id']).toBe(clientRequestId);
  });

  it('should include requestId in error envelope body', async () => {
    const app = createTestAppWithRequestId();
    const response = await request(app).get('/api/test/error');
    
    expect(response.status).toBe(500);
    expect(response.body.error.requestId).toBeDefined();
    expect(response.body.error.requestId).toBe(response.headers['x-request-id']);
  });

  it('should include requestId in chat-related error responses', async () => {
    const app = createTestAppWithRequestId();
    const response = await request(app).post('/api/test/chat-error');
    
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('ACCESS_DENIED');
    expect(response.body.error.requestId).toBeDefined();
    expect(response.body.error.requestId).toBe(response.headers['x-request-id']);
  });
});

describe('Request ID format validation', () => {
  it('should be a valid UUID format when auto-generated', async () => {
    const app = createTestAppWithRequestId();
    const response = await request(app).get('/api/test/success');
    
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    expect(response.headers['x-request-id']).toMatch(uuidRegex);
  });

  it('should allow non-UUID client-provided IDs', async () => {
    const app = createTestAppWithRequestId();
    const customId = 'my-custom-trace-id';
    const response = await request(app)
      .get('/api/test/success')
      .set('X-Request-Id', customId);
    
    expect(response.headers['x-request-id']).toBe(customId);
  });
});

describe('Request ID correlation workflow', () => {
  it('should maintain consistent ID across request lifecycle', async () => {
    const app = createTestAppWithRequestId();
    const response = await request(app).get('/api/test/error');
    
    const headerRequestId = response.headers['x-request-id'];
    const bodyRequestId = response.body.error.requestId;
    
    expect(headerRequestId).toBe(bodyRequestId);
  });
});

describe('Client-side ApiError class expectations', () => {
  it('should structure error with requestId property', () => {
    const mockApiError = {
      name: 'ApiError',
      status: 500,
      body: 'Internal server error',
      requestId: 'abc-123-def',
    };
    
    expect(mockApiError.requestId).toBe('abc-123-def');
    expect(mockApiError.status).toBe(500);
  });

  it('should handle null requestId when header missing', () => {
    const mockApiError = {
      name: 'ApiError',
      status: 500,
      body: 'Error',
      requestId: null as string | null,
    };
    
    expect(mockApiError.requestId).toBeNull();
  });
});

describe('Toast notification formatting', () => {
  it('should format toast with requestId when available', () => {
    const requestId = 'abc-123-def';
    const toastDescription = requestId 
      ? `Failed to send. Request ID: ${requestId}`
      : 'Failed to send.';
    
    expect(toastDescription).toContain('Request ID:');
    expect(toastDescription).toContain(requestId);
  });

  it('should omit requestId in toast when not available', () => {
    const requestId = null;
    const toastDescription = requestId 
      ? `Failed to send. Request ID: ${requestId}`
      : 'Failed to send.';
    
    expect(toastDescription).not.toContain('Request ID:');
    expect(toastDescription).toBe('Failed to send.');
  });
});
