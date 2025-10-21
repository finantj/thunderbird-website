// LocalStorage-backed store for demo/MVP
import { queueProgressSync } from "./server-sync";

const KEY = "tmb_progress_v1";

function sanitizeProfile(profile = {}) {
  const copy = {
    name: profile.name || "",
    troop: profile.troop || "",
    parentEmail: profile.parentEmail || "",
    city: profile.city || "",
    state: profile.state || "",
    pace: profile.pace || "",
    contactPhone: profile.contactPhone || "",
    scholarshipEligible: !!profile.scholarshipEligible,
  };
  if (profile.troopNormalized) {
    copy.troopNormalized = profile.troopNormalized;
  }
  if (profile.scholarshipVerifiedAt) {
    copy.scholarshipVerifiedAt = profile.scholarshipVerifiedAt;
  }
  if (profile.createdAt) {
    copy.createdAt = profile.createdAt;
  }
  if (profile.updatedAt) {
    copy.updatedAt = profile.updatedAt;
  }
  if (Array.isArray(profile.badges)) {
    copy.badges = profile.badges.map((badge) => ({
      name: badge.name || "",
      progress: typeof badge.progress === "number" ? badge.progress : 0,
      status: badge.status || "",
    }));
  }
  return copy;
}

function hashIdentifier(value) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0; // Convert to 32bit integer
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function ensureScoutId(profile = {}) {
  if (profile.scoutId) return profile.scoutId;
  const baseParts = [profile.parentEmail, profile.troop, profile.name]
    .map((part) => (part || "").toString().trim().toLowerCase())
    .filter(Boolean);
  let scoutId = profile.scoutId || null;
  if (baseParts.length) {
    scoutId = `scout_${hashIdentifier(baseParts.join("|"))}`;
  }
  if (!scoutId) {
    scoutId = `scout_${Math.random().toString(36).slice(2, 10)}`;
  }
  profile.scoutId = scoutId;
  return scoutId;
}

function serializeModule(module = {}) {
  return {
    responses: module.responses || {},
    entries: Array.isArray(module.entries) ? module.entries : [],
    checklist: Array.isArray(module.checklist) ? module.checklist : [],
    done: !!module.done,
    updatedAt: module.updatedAt,
  };
}

function summarizeBadge(badge = {}) {
  return {
    percent: typeof badge.percent === "number" ? badge.percent : 0,
    total: typeof badge.total === "number" ? badge.total : 0,
    purchased: !!badge.purchased,
  };
}

function loadAll() {
  if (typeof window === "undefined") return {};
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || "{}");
    if (parsed.scout) {
      ensureScoutId(parsed.scout);
    }
    return parsed;
  } catch {
    return {};
  }
}
function saveAll(obj) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(obj));
}

export function getScout() {
  const all = loadAll();
  if (all.scout) {
    ensureScoutId(all.scout);
    return all.scout;
  }
  return { name: "", troop: "", parentEmail: "", city: "", state: "", scoutId: null };
}
export function setScout(data) {
  const all = loadAll();
  const next = { ...(all.scout || {}), ...data };
  const now = new Date().toISOString();
  if (!next.createdAt) {
    next.createdAt = now;
  }
  next.updatedAt = now;
  const scoutId = ensureScoutId(next);
  all.scout = next;
  saveAll(all);
  if (scoutId) {
    queueProgressSync({
      type: "profile",
      scoutId,
      profile: sanitizeProfile(next),
      timestamp: now,
    });
  }
}

export function getScoutId() {
  const all = loadAll();
  if (!all.scout) return null;
  return ensureScoutId(all.scout);
}

function ensureBadgeRecord(all, badgeId) {
  all.badges = all.badges || {};
  if (!all.badges[badgeId]) {
    all.badges[badgeId] = { purchased: false, modules: {}, percent: 0, total: 0 };
  }
  const badge = all.badges[badgeId];
  badge.modules = badge.modules || {};
  return badge;
}

function recalcBadgePercent(badge, hintedTotal) {
  if (typeof hintedTotal === "number" && !Number.isNaN(hintedTotal)) {
    badge.total = hintedTotal;
  }
  const doneCount = Object.values(badge.modules).filter((m) => m.done).length;
  const total = badge.total || hintedTotal || Object.keys(badge.modules).length || 0;
  badge.total = total;
  badge.percent = total ? Math.min(1, doneCount / total) : 0;
}

export function getBadgeProgress(badgeId) {
  const all = loadAll();
  return (all.badges && all.badges[badgeId]) || { purchased: false, modules: {}, percent: 0 };
}

export function getModuleWork(badgeId, moduleId) {
  const progress = getBadgeProgress(badgeId);
  return progress.modules?.[moduleId] || {};
}

export function saveModuleWork(badgeId, moduleId, updates = {}) {
  const all = loadAll();
  const badge = ensureBadgeRecord(all, badgeId);
  const existing = badge.modules[moduleId] || {};
  const next = { ...existing };

  const { totalModules, responses, entries, checklist, done } = updates;

  if (responses) {
    next.responses = { ...(existing.responses || {}), ...responses };
  }

  if (Array.isArray(entries)) {
    next.entries = entries;
  }

  if (Array.isArray(checklist)) {
    next.checklist = checklist;
  }

  if (typeof done === "boolean") {
    next.done = done;
  }

  next.updatedAt = new Date().toISOString();
  badge.modules[moduleId] = next;

  recalcBadgePercent(badge, totalModules);
  saveAll(all);
  const scoutId = all.scout ? ensureScoutId(all.scout) : null;
  if (scoutId) {
    queueProgressSync({
      type: "module",
      scoutId,
      badgeId,
      moduleId,
      module: serializeModule(next),
      badge: summarizeBadge(badge),
      timestamp: next.updatedAt,
    });
  }
  return next;
}

export function updateModule(badgeId, moduleId, payload = {}) {
  const { totalModules, ...rest } = payload;
  const merged = saveModuleWork(badgeId, moduleId, { ...rest, totalModules, done: true });
  const progress = getBadgeProgress(badgeId);
  progress.modules[moduleId] = merged;
  return progress;
}

export function markPurchased(badgeId, purchased = true, totalModules = 6) {
  const all = loadAll();
  const badge = ensureBadgeRecord(all, badgeId);
  badge.purchased = purchased;
  badge.total = totalModules;
  recalcBadgePercent(badge, totalModules);
  saveAll(all);
  const scoutId = all.scout ? ensureScoutId(all.scout) : null;
  if (scoutId) {
    queueProgressSync({
      type: "purchase",
      scoutId,
      badgeId,
      badge: summarizeBadge(badge),
      timestamp: new Date().toISOString(),
    });
  }
}
export async function fetchBadges() {
  const response = await fetch("/api/manifest");
  if (!response.ok) {
    throw new Error("Failed to load badges");
  }
  const { badges } = await response.json();
  return badges;
}
