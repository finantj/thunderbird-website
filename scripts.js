const BADGE_CATALOG = [
];

const STORAGE_KEY = "thunderbirdScout";
const PROGRESS_ENDPOINT = "/api/progress";

const AUTHORIZED_TROOP_SOURCE = "./data/authorized-troops.json";
let authorizedTroopDiscounts = new Set();

let badgeModalElements = null;
let activeBadgeTrigger = null;
let badgeModalKeydownHandler = null;

function hashIdentifier(value) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function ensureScoutIdentifier(profile = {}) {
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

function sanitizeProfileForSync(profile = {}) {
  const summary = {
    name: profile.name || "",
    troop: profile.troop || "",
    parentEmail: profile.parentEmail || "",
    contactPhone: profile.contactPhone || "",
    pace: profile.pace || "",
    city: profile.city || "",
    state: profile.state || "",
    scholarshipEligible: !!profile.scholarshipEligible,
  };
  if (profile.troopNormalized) {
    summary.troopNormalized = profile.troopNormalized;
  }
  if (profile.scholarshipVerifiedAt) {
    summary.scholarshipVerifiedAt = profile.scholarshipVerifiedAt;
  }
  if (profile.createdAt) {
    summary.createdAt = profile.createdAt;
  }
  if (profile.updatedAt) {
    summary.updatedAt = profile.updatedAt;
  }
  if (Array.isArray(profile.badges)) {
    summary.badges = profile.badges.map((badge) => ({
      name: badge.name || "",
      progress: typeof badge.progress === "number" ? badge.progress : 0,
      status: badge.status || "",
    }));
  }
  return summary;
}

function postProgressUpdate(event) {
  if (!event || !event.scoutId || typeof fetch !== "function") return;
  fetch(PROGRESS_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(event),
  }).catch((error) => console.warn("Progress sync failed", error));
}

function normalizeTroopIdentifier(value) {
  if (!value && value !== 0) return "";
  return value
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/, "");
}

function loadScoutProfile() {
  const stored = window.localStorage?.getItem(STORAGE_KEY);
  if (!stored) return null;
  try {
    const profile = JSON.parse(stored);
    if (profile && typeof profile === "object") {
      ensureScoutIdentifier(profile);
    }
    return profile;
  } catch (error) {
    console.error("Unable to parse stored scout profile", error);
    return null;
  }
}

function saveScoutProfile(profile) {
  if (!profile || typeof profile !== "object") return null;
  const next = { ...profile };
  const now = new Date().toISOString();
  if (!next.createdAt) {
    next.createdAt = now;
  }
  next.updatedAt = now;
  const scoutId = ensureScoutIdentifier(next);
  try {
    window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch (error) {
    console.error("Unable to save scout profile", error);
  }
  if (scoutId) {
    postProgressUpdate({
      type: "profile",
      scoutId,
      profile: sanitizeProfileForSync(next),
      timestamp: next.updatedAt,
    });
  }
  if (profile && typeof profile === "object") {
    profile.scoutId = next.scoutId;
    profile.createdAt = next.createdAt;
    profile.updatedAt = next.updatedAt;
  }
  return next;
}

function handleLoginForm(form) {
  // placeholder: original login handling continues here in upstream code
}