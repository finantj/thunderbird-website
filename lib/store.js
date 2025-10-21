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
  try {
    window.localStorage?.setItem(KEY, JSON.stringify(obj));
  } catch (error) {
    console.error("Unable to save local store", error);
  }
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
    all.badges[badgeId] = { modules: {}, total: 0, percent: 0, purchased: false };
  }
  return all.badges[badgeId];
}

function recalcBadgePercent(badge, totalModules) {
  if (!badge) return;
  const modules = badge.modules || {};
  const doneCount = Object.values(modules).filter((m) => m.done).length;
  badge.total = totalModules || badge.total || 0;
  badge.percent = badge.total ? Math.round((doneCount / badge.total) * 100) : 0;
}

export function saveModuleWork(badgeId, moduleId, updates = {}) {
  const all = loadAll();
  if (!badgeId || !moduleId) return null;
  all.badges = all.badges || {};
  const badge = ensureBadgeRecord(all, badgeId);
  const next = { ...(badge.modules[moduleId] || {}), ...updates };
  next.updatedAt = new Date().toISOString();
  badge.modules[moduleId] = next;
  const totalModules = badge.total || 0;
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

export function markPurchased(badgeId, purchased = true, totalModules = 6) {
  const all = loadAll();
  if (!badgeId) return;
  all.badges = all.badges || {};
  const badge = ensureBadgeRecord(all, badgeId);
  badge.purchased = !!purchased;
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
  return response.json();
}