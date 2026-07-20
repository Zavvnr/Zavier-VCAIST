const requestWindows = new Map<string, number[]>();
const windowMs = 60_000;
const maximumRequests = 8;

export function checkAiRateLimit(identifier: string, now = Date.now()) {
  const previous = requestWindows.get(identifier) ?? [];
  const active = previous.filter((timestamp) => now - timestamp < windowMs);
  if (active.length >= maximumRequests) return false;

  active.push(now);
  requestWindows.set(identifier, active);

  if (requestWindows.size > 5_000) {
    for (const [key, timestamps] of requestWindows) {
      if (!timestamps.some((timestamp) => now - timestamp < windowMs)) requestWindows.delete(key);
    }
  }
  return true;
}
