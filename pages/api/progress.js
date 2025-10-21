import fs from "fs";
import path from "path";

const STORE_PATH = path.join(process.cwd(), "data", "progress-store.json");

function ensureStore() {
  try {
    const dir = path.dirname(STORE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(STORE_PATH)) {
      fs.writeFileSync(STORE_PATH, JSON.stringify({ scouts: {} }, null, 2));
    }
  } catch (error) {
    console.error("Failed to prepare progress store", error);
    throw error;
  }
}

function loadStore() {
  ensureStore();
  try {
    const raw = fs.readFileSync(STORE_PATH, "utf-8");
    const data = JSON.parse(raw);
    if (!data.scouts || typeof data.scouts !== "object") {
      data.scouts = {};
    }
    return data;
  } catch (error) {
    console.error("Unable to read progress store", error);
    throw error;
  }
}

function writeStore(data) {
  ensureStore();
  fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2));
}

function applyProfileUpdate(record, event) {
  if (!event.profile || typeof event.profile !== "object") return;
  record.profile = { ...(record.profile || {}), ...event.profile };
  record.profile.updatedAt = event.timestamp || new Date().toISOString();
  if (!record.profile.createdAt) {
    record.profile.createdAt = record.profile.updatedAt;
  }
}

function applyModuleUpdate(record, event) {
  const { badgeId, moduleId, module, badge } = event;
  if (!badgeId || !moduleId || !module) return;
  record.badges = record.badges || {};
  const badgeRecord = record.badges[badgeId] || { modules: {} };
  badgeRecord.modules = badgeRecord.modules || {};
  badgeRecord.modules[moduleId] = {
    ...(badgeRecord.modules[moduleId] || {}),
    ...module,
  };
  if (badge) {
    badgeRecord.summary = { ...(badgeRecord.summary || {}), ...badge };
  }
  badgeRecord.updatedAt = event.timestamp || new Date().toISOString();
  record.badges[badgeId] = badgeRecord;
}

function applyPurchase(record, event) {
  const { badgeId, badge } = event;
  if (!badgeId) return;
  record.badges = record.badges || {};
  const badgeRecord = record.badges[badgeId] || { modules: {} };
  badgeRecord.summary = { ...(badgeRecord.summary || {}), ...badge };
  badgeRecord.updatedAt = event.timestamp || new Date().toISOString();
  record.badges[badgeId] = badgeRecord;
}

function sanitizeAssistantMessage(message) {
  if (!message || typeof message !== "object") return null;
  const content = typeof message.content === "string" ? message.content.trim() : "";
  if (!content) return null;
  const payload = {
    role: message.role === "assistant" ? "assistant" : "scout",
    content,
  };
  if (message.createdAt) {
    payload.createdAt = message.createdAt;
  }
  if (Array.isArray(message.suggestions) && message.suggestions.length) {
    payload.suggestions = message.suggestions
      .map((suggestion) => (typeof suggestion === "string" ? suggestion.trim() : ""))
      .filter(Boolean)
      .slice(0, 5);
  }
  if (Array.isArray(message.resources) && message.resources.length) {
    payload.resources = message.resources
      .map((resource) => {
        if (!resource || typeof resource !== "object") return null;
        const title = typeof resource.title === "string" ? resource.title.trim() : "";
        const url = typeof resource.url === "string" ? resource.url.trim() : "";
        if (!title || !url) return null;
        const entry = { title, url };
        if (typeof resource.description === "string" && resource.description.trim()) {
          entry.description = resource.description.trim();
        }
        return entry;
      })
      .filter(Boolean)
      .slice(0, 5);
  }
  return payload;
}

function applyAssistant(record, event) {
  const { badgeId, moduleId, messages } = event || {};
  if (!badgeId || !Array.isArray(messages) || !messages.length) return;
  record.badges = record.badges || {};
  const badgeRecord = record.badges[badgeId] || { modules: {} };
  badgeRecord.assistant = badgeRecord.assistant || {};
  const key = moduleId || "general";
  const thread = badgeRecord.assistant[key] || { messages: [] };
  thread.messages = Array.isArray(thread.messages) ? thread.messages : [];
  const sanitized = messages
    .map((message) => sanitizeAssistantMessage(message))
    .filter(Boolean);
  if (!sanitized.length) {
    badgeRecord.assistant[key] = thread;
    record.badges[badgeId] = badgeRecord;
    return;
  }
  thread.messages = [...thread.messages, ...sanitized];
  thread.updatedAt = event.timestamp || new Date().toISOString();
  badgeRecord.assistant[key] = thread;
  badgeRecord.updatedAt = thread.updatedAt;
  record.badges[badgeId] = badgeRecord;
}

function applyEvent(store, event) {
  const { scoutId, type } = event || {};
  if (!scoutId || !type) return;
  const now = event.timestamp || new Date().toISOString();
  const record = store.scouts[scoutId] || { badges: {}, createdAt: now };
  record.updatedAt = now;
  switch (type) {
    case "profile":
      applyProfileUpdate(record, event);
      break;
    case "module":
      applyModuleUpdate(record, event);
      break;
    case "purchase":
      applyPurchase(record, event);
      break;
    case "assistant":
      applyAssistant(record, event);
      break;
    default:
      break;
  }
  store.scouts[scoutId] = record;
}

function normalizeEvents(body) {
  if (!body) return [];
  if (Array.isArray(body.events)) {
    return body.events.filter(Boolean);
  }
  return [body];
}

function sanitizeRecord(record = {}) {
  const badges = {};
  if (record.badges && typeof record.badges === "object") {
    Object.entries(record.badges).forEach(([badgeId, badgeRecord]) => {
      badges[badgeId] = {
        modules: badgeRecord.modules || {},
        summary: badgeRecord.summary || {},
        assistant: badgeRecord.assistant || {},
        updatedAt: badgeRecord.updatedAt,
      };
    });
  }
  return {
    profile: record.profile || null,
    badges,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export default function handler(req, res) {
  try {
    if (req.method === "GET") {
      const { scoutId } = req.query || {};
      if (!scoutId) {
        res.status(400).json({ error: "Missing scoutId" });
        return;
      }
      const store = loadStore();
      const record = store.scouts[scoutId];
      if (!record) {
        res.status(404).json({ error: "Scout not found" });
        return;
      }
      res.status(200).json({ scout: sanitizeRecord(record) });
      return;
    }

    if (req.method !== "POST") {
      res.setHeader("Allow", ["GET", "POST"]);
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const events = normalizeEvents(req.body);
    if (!events.length) {
      res.status(400).json({ error: "Missing progress payload" });
      return;
    }

    const store = loadStore();
    events.forEach((event) => applyEvent(store, event));
    writeStore(store);

    const lastEvent = events[events.length - 1];
    const record = lastEvent?.scoutId ? store.scouts[lastEvent.scoutId] : null;

    res.status(200).json({ success: true, scout: record ? sanitizeRecord(record) : null });
  } catch (error) {
    console.error("Progress handler failed", error);
    res.status(500).json({ error: "Unable to persist progress" });
  }
}
