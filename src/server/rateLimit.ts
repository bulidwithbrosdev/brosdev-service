interface RateBucket {
  timestamps: number[];
}

const buckets = new Map<string, RateBucket>();

export function checkSlidingRateLimit(
  key: string,
  limitPerMinute: number
): { allowed: boolean; remaining: number; resetInSeconds: number } {
  const now = Date.now();
  const windowMs = 60_000;
  const effectiveLimit = Math.max(1, limitPerMinute);

  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { timestamps: [] };
    buckets.set(key, bucket);
  }

  // Prune timestamps outside the 60s window
  bucket.timestamps = bucket.timestamps.filter((ts) => now - ts < windowMs);

  if (bucket.timestamps.length >= effectiveLimit) {
    const oldest = bucket.timestamps[0] || now;
    const resetInSeconds = Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000));
    return { allowed: false, remaining: 0, resetInSeconds };
  }

  bucket.timestamps.push(now);
  return {
    allowed: true,
    remaining: Math.max(0, effectiveLimit - bucket.timestamps.length),
    resetInSeconds: 60,
  };
}

// Periodically purge stale keys to keep memory bounded
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets.entries()) {
    bucket.timestamps = bucket.timestamps.filter((ts) => now - ts < 60_000);
    if (bucket.timestamps.length === 0) {
      buckets.delete(key);
    }
  }
}, 5 * 60_000).unref();
