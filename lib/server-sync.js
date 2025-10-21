const pendingEvents = [];
let flushTimer = null;
let retryDelay = 1000;

function canSync() {
  return typeof window !== "undefined" && typeof fetch === "function";
}

function scheduleFlush(delay = 100) {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushQueue();
  }, delay);
}

async function flushQueue() {
  if (!pendingEvents.length || !canSync()) {
    return;
  }
  const events = pendingEvents.splice(0, pendingEvents.length);
  const payload = events.length === 1 ? events[0] : { events };
  try {
    const response = await fetch("/api/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    });
    if (!response.ok) {
      throw new Error(`Progress sync failed (${response.status})`);
    }
    retryDelay = 1000;
  } catch (error) {
    if (typeof console !== "undefined") {
      console.warn("Unable to sync progress", error);
    }
    pendingEvents.unshift(...events);
    scheduleFlush(retryDelay);
    retryDelay = Math.min(retryDelay * 2, 8000);
    return;
  }
  if (pendingEvents.length) {
    scheduleFlush();
  }
}

export function queueProgressSync(event) {
  if (!event || !event.scoutId || !canSync()) {
    return;
  }
  const payload = { ...event };
  if (!payload.timestamp) {
    payload.timestamp = new Date().toISOString();
  }
  pendingEvents.push(payload);
  scheduleFlush();
}
