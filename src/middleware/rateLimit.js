/**
 * Simple in-memory rate limiter middleware.
 *
 * Tracks request counts per IP within a sliding time window.
 * Returns 429 when the limit is exceeded.
 */

/**
 * Create a rate limiter middleware.
 * @param {object} options
 * @param {number}  options.windowMs   - Time window in milliseconds (default: 60_000)
 * @param {number}  options.maxRequests - Max requests allowed per window (default: 100)
 * @returns {Function} express middleware
 */
function createRateLimiter(options = {}) {
  const windowMs = options.windowMs || 60_000;       // 1 minute
  const maxRequests = options.maxRequests || 100;

  // In-memory store: IP → { count, resetAt }
  const store = new Map();

  // Periodic cleanup every 60 seconds to prevent memory leaks
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of store) {
      if (entry.resetAt <= now) {
        store.delete(ip);
      }
    }
  }, 60_000);

  // Allow the timer to not block process exit
  if (cleanupInterval.unref) {
    cleanupInterval.unref();
  }

  return function rateLimitMiddleware(req, res, next) {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const now = Date.now();

    let entry = store.get(ip);

    if (!entry || entry.resetAt <= now) {
      // Start a new window
      entry = { count: 0, resetAt: now + windowMs };
      store.set(ip, entry);
    }

    entry.count += 1;

    // Set rate-limit headers
    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - entry.count));
    res.setHeader('X-RateLimit-Reset', Math.ceil(entry.resetAt / 1000));

    if (entry.count > maxRequests) {
      return res.status(429).json({
        error: 'Too many requests, please try again later.',
        retryAfter: Math.ceil((entry.resetAt - now) / 1000),
      });
    }

    next();
  };
}

module.exports = { createRateLimiter };
