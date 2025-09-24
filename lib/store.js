// LocalStorage-backed store for demo/MVP
const KEY = "tmb_progress_v1";

function loadAll() {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; }
}
function saveAll(obj) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(obj));
}

export function getScout() {
  const all = loadAll();
  return all.scout || { name: "", troop: "", parentEmail: "", city: "", state: "" };
}
export function setScout(data) {
  const all = loadAll();
  all.scout = { ...(all.scout||{}), ...data };
  saveAll(all);
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
}
export async function fetchBadges() {
  const response = await fetch("/api/manifest");
  if (!response.ok) {
    throw new Error("Failed to load badges");
  }
  const { badges } = await response.json();
  return badges;
}
