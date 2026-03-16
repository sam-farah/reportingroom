import type { Request, Response, NextFunction } from 'express';
import { MedicalDataEncryption } from '../encryption';

// Security middleware for regulatory compliance
export const securityMiddleware = {
  // Validate encryption setup on startup
  validateEncryption: (req: Request, res: Response, next: NextFunction) => {
    const validation = MedicalDataEncryption.validateEncryptionSetup();
    
    if (!validation.valid) {
      console.error('❌ Encryption validation failed:', validation.issues);
      return res.status(500).json({
        error: 'Server security configuration invalid',
        message: 'End-to-end encryption not properly configured for regulatory compliance',
        issues: validation.issues
      });
    }
    
    next();
  },

  // Add security headers for medical data protection
  addSecurityHeaders: (req: Request, res: Response, next: NextFunction) => {
    // HIPAA/Medical data security headers
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // Allow same-origin framing so blob: PDF previews work inside the app
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    
    // Medical data specific headers
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    // Content Security Policy for medical applications
    // blob: allowed in frame-src and object-src so fetched PDF blobs can render inline
    res.setHeader('Content-Security-Policy', 
      "default-src 'self'; " +
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
      "style-src 'self' 'unsafe-inline'; " +
      "img-src 'self' data: blob:; " +
      "font-src 'self'; " +
      "connect-src 'self'; " +
      "media-src 'none'; " +
      "object-src blob:; " +
      "frame-src 'self' blob:;"
    );
    
    next();
  },

  // Log security events for audit trail
  auditLogger: (req: Request, res: Response, next: NextFunction) => {
    const timestamp = new Date().toISOString();
    const userId = (req as any).user?.claims?.sub || 'anonymous';
    const ip = req.ip || req.connection.remoteAddress;
    
    // Log all access to sensitive endpoints
    const sensitiveEndpoints = ['/api/reports', '/api/worksheets', '/api/patients'];
    const isSensitive = sensitiveEndpoints.some(endpoint => req.path.startsWith(endpoint));
    
    if (isSensitive) {
      console.log(`🔒 [AUDIT] ${timestamp} - User: ${userId}, IP: ${ip}, Method: ${req.method}, Path: ${req.path}`);
    }
    
    next();
  },

  // Rate limiting for API endpoints
  rateLimiter: (() => {
    const requests = new Map<string, { count: number; resetTime: number }>();
    const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
    const MAX_REQUESTS = 100; // per window
    
    return (req: Request, res: Response, next: NextFunction) => {
      const key = `${req.ip}:${(req as any).user?.claims?.sub || 'anonymous'}`;
      const now = Date.now();
      const userRequests = requests.get(key);
      
      if (!userRequests || now > userRequests.resetTime) {
        requests.set(key, { count: 1, resetTime: now + WINDOW_MS });
        return next();
      }
      
      if (userRequests.count >= MAX_REQUESTS) {
        return res.status(429).json({
          error: 'Rate limit exceeded',
          message: 'Too many requests. Please try again later.',
          retryAfter: Math.ceil((userRequests.resetTime - now) / 1000)
        });
      }
      
      userRequests.count++;
      next();
    };
  })(),

  // Validate request size to prevent DoS
  requestSizeValidator: (maxSize: number = 50 * 1024 * 1024) => { // 50MB default
    return (req: Request, res: Response, next: NextFunction) => {
      const contentLength = parseInt(req.get('Content-Length') || '0');
      
      if (contentLength > maxSize) {
        return res.status(413).json({
          error: 'Request too large',
          message: 'File size exceeds maximum allowed limit for medical data processing',
          maxSize: `${maxSize / (1024 * 1024)}MB`
        });
      }
      
      next();
    };
  }
};

// Database query encryption wrapper
export const encryptedQuery = {
  // Encrypt sensitive data before database insert/update
  beforeWrite: (data: Record<string, any>) => {
    return Object.keys(data).reduce((encrypted, key) => {
      const value = data[key];
      
      // Encrypt specific sensitive fields
      if (['patientName', 'patientDob', 'findings', 'impression', 'indication'].includes(key) && value) {
        encrypted[key] = MedicalDataEncryption.encryptMedicalData(String(value));
        encrypted[`${key}_encrypted`] = true;
      } else {
        encrypted[key] = value;
      }
      
      return encrypted;
    }, {} as Record<string, any>);
  },

  // Decrypt sensitive data after database read
  afterRead: (data: Record<string, any>) => {
    return Object.keys(data).reduce((decrypted, key) => {
      const value = data[key];
      
      // Decrypt if field is marked as encrypted
      if (data[`${key}_encrypted`] && value) {
        try {
          decrypted[key] = MedicalDataEncryption.decryptMedicalData(String(value));
        } catch (error) {
          console.error(`Failed to decrypt ${key}:`, error);
          decrypted[key] = '[DECRYPTION_ERROR]';
        }
        // Remove encryption flag
        delete decrypted[`${key}_encrypted`];
      } else if (!key.endsWith('_encrypted')) {
        decrypted[key] = value;
      }
      
      return decrypted;
    }, {} as Record<string, any>);
  }
};