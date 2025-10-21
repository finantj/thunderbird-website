import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");

function loadBadgeConfig(badgeId) {
  if (!badgeId) return null;
  const filePath = path.join(DATA_DIR, `${badgeId}.json`);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw);
  } catch (error) {
    console.error(`Unable to load badge file for ${badgeId}`, error);
    return null;
  }
}

function summarizeModuleRequirement(module) {
  if (!module) return null;
  if (module.instructions) return module.instructions;
  if (module.prompt) return module.prompt;
  return `${module.title} module`; // fallback
}

function buildModuleSuggestions(module, messageLower) {
  if (!module) {
    return [
      "Review the badge summary to confirm which requirement you're focusing on.",
      "Write your ideas in the workspace, then click Save Progress so your counselor can see your notes.",
    ];
  }
  const suggestions = [];
  switch (module.type) {
    case "reading":
    case "reflection":
      suggestions.push(
        "Draft a few bullet points first, then expand each into 2-3 sentences for your reflection.",
        "Tie your response back to a personal experience or goal so the counselor can see what you learned."
      );
      break;
    case "project":
      suggestions.push(
        "List the steps of your project in order (plan, gather materials, carry it out, reflection).",
        "Link to supporting evidence like photos, a document, or a spreadsheet so your counselor can verify the work."
      );
      break;
    case "catalog":
      suggestions.push(
        "Record the exact call numbers or shelf locations so someone else could find the same items.",
        "Describe any help you received from a librarian or catalog tool—this shows you understand the process."
      );
      break;
    case "readingLog":
      suggestions.push(
        "Include a mix of genres—biography, fiction, non-fiction, poetry, or audiobooks all count.",
        "Aim for 3-5 sentence takeaways that highlight what the book taught you or why you recommend it."
      );
      break;
    case "research":
      suggestions.push(
        "Note where you found each source and why it is trustworthy (author background, publication, bias).",
        "Summarize each source in your own words before combining them into your main summary."
      );
      break;
    case "serviceLog":
      suggestions.push(
        "Log each session separately with date, hours, activity, and who benefited.",
        "Capture any signatures, photos, or feedback in the notes so your counselor can confirm the service."
      );
      break;
    case "quiz":
      suggestions.push(
        "Answer from your own knowledge first. If you're unsure, review the module resources before checking answers.",
        "Use the model answers to double-check, but write in your own words when you explain something."
      );
      break;
    default:
      suggestions.push(
        "Break the requirement into smaller bullet points and tackle them one at a time.",
        "Re-read the instructions just above the workspace to make sure you address every part of the requirement."
      );
      break;
  }
  if (messageLower.includes("stuck") || messageLower.includes("don't know") || messageLower.includes("dont know")) {
    suggestions.unshift("Start by jotting any ideas you have—even short phrases—then build them into full answers.");
  }
  if (module.type === "serviceLog" && (messageLower.includes("hours") || messageLower.includes("ideas"))) {
    suggestions.unshift("Consider options like reading aloud at a library, organizing a book drive, or helping younger readers.");
  }
  return suggestions.slice(0, 4);
}

function buildFollowUps(module) {
  const prompts = [];
  if (module) {
    prompts.push(`What should my finished work for \"${module.title}\" include?`);
    if (module.type === "project") {
      prompts.push("Can you help me outline the project steps?");
    }
    if (module.type === "readingLog") {
      prompts.push("What genres count toward the reading log?");
    }
    if (module.type === "serviceLog") {
      prompts.push("How can I show proof of my service hours?");
    }
  } else {
    prompts.push("Which module should I work on next?");
    prompts.push("How do I know if I'm ready for a checkpoint?");
  }
  return prompts.slice(0, 3);
}

function pickResources(badge, limit = 3) {
  if (!badge || !Array.isArray(badge.resources)) return [];
  return badge.resources.slice(0, limit).map((resource) => ({
    title: resource.title,
    url: resource.url,
    description: resource.description,
  }));
}

function composeReply({ badge, module, messageLower, suggestions }) {
  const lines = [];
  if (module) {
    lines.push(
      `You're working on **${module.title}** for the ${badge.title} merit badge. Let's make sure your notes cover the requirement.`,
    );
    const requirement = summarizeModuleRequirement(module);
    if (requirement) {
      lines.push(`Requirement focus: ${requirement}`);
    }
  } else if (badge) {
    lines.push(`Let's look at your progress on the ${badge.title} merit badge.`);
    if (badge.summary) {
      lines.push(badge.summary);
    }
  }
  if (messageLower.includes("checkpoint")) {
    lines.push("Finish the module linked to your next checkpoint, then mark it complete so your counselor can review it.");
  }
  if (suggestions && suggestions.length) {
    lines.push("Try these next steps:");
    suggestions.forEach((suggestion, index) => {
      lines.push(`${index + 1}. ${suggestion}`);
    });
  }
  lines.push("Write your responses in the workspace on this page and click **Save Progress** so nothing is lost.");
  return lines.join("\n\n");
}

export default function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { badgeId, moduleId, message, history } = req.body || {};
  if (!badgeId || typeof badgeId !== "string") {
    res.status(400).json({ error: "badgeId is required" });
    return;
  }
  if (!message || typeof message !== "string" || !message.trim()) {
    res.status(400).json({ error: "message is required" });
    return;
  }

  const badge = loadBadgeConfig(badgeId);
  if (!badge) {
    res.status(404).json({ error: "Badge not found" });
    return;
  }

  const normalizedHistory = Array.isArray(history)
    ? history
        .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
        .filter(Boolean)
    : [];
  const moduleKey = moduleId || "general";
  const module = Array.isArray(badge.modules)
    ? badge.modules.find((item) => item.id === moduleKey)
    : null;

  const lowerMessage = message.toLowerCase();
  const suggestions = buildModuleSuggestions(module, lowerMessage);
  const followUps = buildFollowUps(module);
  if (normalizedHistory.length) {
    suggestions.push("Summarize what you've already tried so I can give more targeted feedback.");
  }

  const reply = composeReply({ badge, module, messageLower: lowerMessage, suggestions });
  const resources = pickResources(badge, module ? 2 : 3);

  res.status(200).json({
    reply,
    suggestions,
    followUps,
    resources,
    moduleTitle: module ? module.title : null,
  });
}
