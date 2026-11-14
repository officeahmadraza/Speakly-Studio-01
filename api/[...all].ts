import type { Request, Response } from 'express';
import handler from './index.js';

// Vercel serverless catch-all handler for /api/*
export default function catchAllHandler(req: Request, res: Response) {
  return handler(req, res);
}
