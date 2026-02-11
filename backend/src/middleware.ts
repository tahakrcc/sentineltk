import { Request, Response, NextFunction } from 'express';

/**
 * Rate limiter middleware.
 * @param maxRequests Max requests per window
 * @param windowMs Time window in milliseconds
 */
export function rateLimiter(maxRequests: number, windowMs: number) {
    const requests: Map<string, { count: number; start: number }> = new Map();

    // Cleanup old entries every minute
    setInterval(() => {
        const now = Date.now();
        for (const [key, value] of requests) {
            if (now - value.start > windowMs) {
                requests.delete(key);
            }
        }
    }, 60000);

    return (req: Request, res: Response, next: NextFunction) => {
        const key = req.ip || 'unknown';
        const now = Date.now();

        const entry = requests.get(key);

        if (!entry || now - entry.start > windowMs) {
            requests.set(key, { count: 1, start: now });
            return next();
        }

        entry.count++;

        if (entry.count > maxRequests) {
            return res.status(429).json({
                error: 'Çok fazla istek. Lütfen daha sonra tekrar deneyin.',
                retryAfter: Math.ceil((windowMs - (now - entry.start)) / 1000),
            });
        }

        return next();
    };
}
