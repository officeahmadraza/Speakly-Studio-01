import type { Request, Response } from 'express';
import { app } from '../server.js';

function restoreVercelApiPath(req: Request) {
  if (!req.url) return;
  try {
    const parsed = new URL(req.url, 'http://localhost');
    const vpath = parsed.searchParams.get('__vpath');
    if (vpath !== null) {
      parsed.searchParams.delete('__vpath');
      const cleanSubPath = vpath.replace(/^\/+/, '');
      const qs = parsed.searchParams.toString();
      req.url = `/api${cleanSubPath ? `/${cleanSubPath}` : ''}${qs ? `?${qs}` : ''}`;
    }
  } catch {
    // Keep req.url as-is if URL parsing fails
  }
}

// Vercel serverless handler for /api and rewritten /api/* routes
export default function handler(req: Request, res: Response) {
  restoreVercelApiPath(req);
  return app(req, res);
}
