import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import ProgressBar from "../../components/ProgressBar";
import {
  getBadgeProgress,
  markPurchased,
  saveModuleWork,
  updateModule,
} from "../../lib/store";

const TIME_OPTIONS = {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
};

function formatTimestamp(timestamp) {
  if (!timestamp) return null;
  try {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return null;
    return new Intl.DateTimeFormat("en", TIME_OPTIONS).format(date);
  } catch (error) {
    console.error("Unable to format timestamp", error);
    return null;
  }
}

function normalizeEntry(type, entry = {}) {
  switch (type) {
    case "readingLog":
      return {
        title: entry.title || "",
        author: entry.author || "",
        format: entry.format || "",
        pages: entry.pages !== undefined && entry.pages !== null ? String(entry.pages) : "",
        why: entry.why || "",
        takeaway: entry.takeaway || "",
      };
    case "research":
      return {
        title: entry.title || "",
        format: entry.format || "",
        url: entry.url || "",
        summary: entry.summary || "",
        credibility: entry.credibility || "",
      };
    case "serviceLog":
      return {
        date: entry.date || "",
        hours: entry.hours !== undefined && entry.hours !== null ? String(entry.hours) : "",
        activity: entry.activity || "",
        notes: entry.notes || "",
        evidence: entry.evidence || "",
      };
    default:
      return { ...entry };
  }
}

function emptyEntry(type) {
  return normalizeEntry(type, {});
}

function createInitialDraft(module, state = {}) {
  const responses = state.responses || {};
  switch (module.type) {
    case "reading":
      return {
        responses: {
          keyPoints: responses.keyPoints || "",
          example: responses.example || "",
          supportLink: responses.supportLink || "",
        },
        entries: [],
      };
    case "project":
      return {
        responses: {
          plan: responses.plan || "",
          materials: responses.materials || "",
          proofLink: responses.proofLink || "",
          reflection: responses.reflection || "",
        },
        entries: [],
      };
    case "reflection":
      return {
        responses: {
          reflection: responses.reflection || "",
          nextSteps: responses.nextSteps || "",
        },
        entries: [],
      };
    case "report":
      return {
        responses: {
          summary: responses.summary || "",
          link: responses.link || "",
          notes: responses.notes || "",
        },
        entries: [],
      };
    case "catalog":
      return {
        responses: {
          author: responses.author || "",
          title: responses.title || "",
          subject: responses.subject || "",
          location: responses.location || "",
        },
        entries: [],
      };
    case "quiz":
      return {
        responses: {
          answers: { ...(responses.answers || {}) },
        },
        entries: [],
      };
    case "readingLog": {
      const entries = Array.isArray(state.entries) && state.entries.length
        ? state.entries.map((entry) => normalizeEntry(module.type, entry))
        : [emptyEntry(module.type)];
      return { responses: {}, entries };
    }
    case "research": {
      const entries = Array.isArray(state.entries) && state.entries.length
        ? state.entries.map((entry) => normalizeEntry(module.type, entry))
        : [emptyEntry(module.type)];
      return {
        responses: {
          notes: responses.notes || "",
        },
        entries,
      };
    }
    case "serviceLog": {
      const entries = Array.isArray(state.entries) && state.entries.length
        ? state.entries.map((entry) => normalizeEntry(module.type, entry))
        : [emptyEntry(module.type)];
      return {
        responses: {
          goal: responses.goal || "",
        },
        entries,
      };
    }
    default:
      return {
        responses: { ...responses },
        entries: Array.isArray(state.entries)
          ? state.entries.map((entry) => normalizeEntry(module.type, entry))
          : [],
      };
  }
}

function sanitizeResponses(responses = {}) {
  const cleaned = {};
  Object.entries(responses).forEach(([key, value]) => {
    if (typeof value === "string") {
      cleaned[key] = value.trim();
    } else if (value !== undefined) {
      cleaned[key] = value;
    }
  });
  return cleaned;
}

function sanitizeEntries(type, entries = []) {
  const filtered = entries
    .map((entry) => normalizeEntry(type, entry))
    .filter((entry) =>
      Object.values(entry).some((value) =>
        typeof value === "string" ? value.trim() !== "" : value !== undefined && value !== null
      )
    );

  return filtered.map((entry) => {
    const mapped = { ...entry };
    if (type === "readingLog") {
      if (mapped.pages !== "" && mapped.pages !== null) {
        const parsed = Number(mapped.pages);
        mapped.pages = Number.isNaN(parsed) ? mapped.pages : parsed;
      }
    }
    if (type === "serviceLog") {
      if (mapped.hours !== "" && mapped.hours !== null) {
        const parsed = Number(mapped.hours);
        mapped.hours = Number.isNaN(parsed) ? mapped.hours : parsed;
      }
    }
    return mapped;
  });
}

function buildUpdatesFromDraft(module, draft) {
  switch (module.type) {
    case "readingLog":
    case "research":
    case "serviceLog": {
      const updates = { entries: sanitizeEntries(module.type, draft.entries) };
      const extraResponses = sanitizeResponses(draft.responses);
      if (Object.keys(extraResponses).length) {
        updates.responses = extraResponses;
      }
      return updates;
    }
    case "quiz":
      return {
        responses: {
          answers: draft.responses?.answers || {},
        },
      };
    default:
      return {
        responses: sanitizeResponses(draft.responses),
      };
  }
}

function ModuleCard({
  module,
  state,
  purchased,
  onSave,
  onComplete,
  onReopen,
  totalModules,
}) {
  const [draft, setDraft] = useState(() => createInitialDraft(module, state));
  const [isDirty, setIsDirty] = useState(false);
  const [revealedAnswers, setRevealedAnswers] = useState(
    () => Array.isArray(module.quiz) ? module.quiz.map(() => false) : []
  );

  useEffect(() => {
    setDraft(createInitialDraft(module, state));
    setIsDirty(false);
    setRevealedAnswers(Array.isArray(module.quiz) ? module.quiz.map(() => false) : []);
  }, [state, module]);

  const handleResponseChange = (key, value) => {
    setDraft((prev) => ({
      ...prev,
      responses: { ...(prev.responses || {}), [key]: value },
    }));
    setIsDirty(true);
  };

  const handleEntryChange = (index, key, value) => {
    setDraft((prev) => {
      const nextEntries = prev.entries.map((entry, idx) =>
        idx === index ? { ...entry, [key]: value } : entry
      );
      return { ...prev, entries: nextEntries };
    });
    setIsDirty(true);
  };

  const handleAddEntry = () => {
    setDraft((prev) => ({
      ...prev,
      entries: [...prev.entries, emptyEntry(module.type)],
    }));
    setIsDirty(true);
  };

  const handleRemoveEntry = (index) => {
    setDraft((prev) => {
      const nextEntries = prev.entries.filter((_, idx) => idx !== index);
      return {
        ...prev,
        entries: nextEntries.length ? nextEntries : [emptyEntry(module.type)],
      };
    });
    setIsDirty(true);
  };

  const handleSave = () => {
    const updates = buildUpdatesFromDraft(module, draft);
    onSave(module.id, { ...updates, totalModules });
    setIsDirty(false);
  };

  const handleComplete = () => {
    const updates = buildUpdatesFromDraft(module, draft);
    onComplete(module, { ...updates, totalModules });
    setIsDirty(false);
  };

  const handleReopen = () => {
    onReopen(module.id);
  };

  const toggleReveal = (index) => {
    setRevealedAnswers((prev) =>
      prev.map((value, idx) => (idx === index ? !value : value))
    );
  };

  const savedAt = formatTimestamp(state.updatedAt);
  const done = !!state.done;

  const activeEntries = useMemo(
    () => draft.entries?.filter((entry) =>
      Object.values(entry || {}).some((value) =>
        typeof value === "string" ? value.trim() !== "" : value !== undefined && value !== null
      )
    ) || [],
    [draft.entries]
  );

  const totalServiceHours = useMemo(() => {
    if (module.type !== "serviceLog") return 0;
    return draft.entries.reduce((sum, entry) => {
      const hours = parseFloat(entry.hours);
      return sum + (Number.isNaN(hours) ? 0 : hours);
    }, 0);
  }, [module.type, draft.entries]);

  return (
    <div
      key={module.id}
      style={{
        border: "1px solid #eee",
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
        background: done ? "#f6fff8" : "#fff",
        opacity: purchased ? 1 : 0.6,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h3 style={{ marginTop: 0 }}>{module.title}</h3>
          <p style={{ margin: "4px 0 8px" }}>
            <em>Estimated:</em> {module.minutes} min • <em>Type:</em> {module.type}
          </p>
        </div>
        {done && (
          <div style={{
            alignSelf: "flex-start",
            padding: "4px 8px",
            borderRadius: 8,
            background: "#2f855a",
            color: "#fff",
            fontSize: 12,
            fontWeight: 600,
          }}>
            Completed
          </div>
        )}
      </div>

      {module.instructions && <p style={{ whiteSpace: "pre-wrap" }}>{module.instructions}</p>}
      {module.prompt && (
        <p style={{
          background: "#f7fafc",
          padding: "12px 14px",
          borderRadius: 8,
          border: "1px solid #e2e8f0",
        }}>
          <strong>Prompt:</strong> {module.prompt}
        </p>
      )}

      {!purchased && (
        <div style={{ fontSize: 12, color: "#a00", marginBottom: 12 }}>
          Purchase this badge to unlock workspaces and saving.
        </div>
      )}

      {module.type === "reading" && (
        <div style={{ display: "grid", gap: 12 }}>
          <label style={{ display: "grid", gap: 4 }}>
            <span>Key ideas or takeaways</span>
            <textarea
              rows={4}
              value={draft.responses.keyPoints}
              onChange={(event) => handleResponseChange("keyPoints", event.target.value)}
              style={{ width: "100%" }}
              disabled={!purchased}
            />
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            <span>Local example, story, or application</span>
            <textarea
              rows={3}
              value={draft.responses.example}
              onChange={(event) => handleResponseChange("example", event.target.value)}
              style={{ width: "100%" }}
              disabled={!purchased}
            />
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            <span>Link to notes or supporting document (optional)</span>
            <input
              type="url"
              value={draft.responses.supportLink}
              onChange={(event) => handleResponseChange("supportLink", event.target.value)}
              placeholder="https://"
              disabled={!purchased}
            />
          </label>
        </div>
      )}

      {module.type === "project" && (
        <div style={{ display: "grid", gap: 12 }}>
          <label style={{ display: "grid", gap: 4 }}>
            <span>Plan outline or approach</span>
            <textarea
              rows={4}
              value={draft.responses.plan}
              onChange={(event) => handleResponseChange("plan", event.target.value)}
              disabled={!purchased}
              style={{ width: "100%" }}
            />
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            <span>Materials, partners, or resources</span>
            <textarea
              rows={3}
              value={draft.responses.materials}
              onChange={(event) => handleResponseChange("materials", event.target.value)}
              disabled={!purchased}
              style={{ width: "100%" }}
            />
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            <span>Link to upload, document, or photo evidence</span>
            <input
              type="url"
              value={draft.responses.proofLink}
              onChange={(event) => handleResponseChange("proofLink", event.target.value)}
              placeholder="https://"
              disabled={!purchased}
            />
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            <span>Reflection on what worked</span>
            <textarea
              rows={3}
              value={draft.responses.reflection}
              onChange={(event) => handleResponseChange("reflection", event.target.value)}
              disabled={!purchased}
              style={{ width: "100%" }}
            />
          </label>
        </div>
      )}

      {module.type === "reflection" && (
        <div style={{ display: "grid", gap: 12 }}>
          <label style={{ display: "grid", gap: 4 }}>
            <span>Your response</span>
            <textarea
              rows={4}
              value={draft.responses.reflection}
              onChange={(event) => handleResponseChange("reflection", event.target.value)}
              disabled={!purchased}
              style={{ width: "100%" }}
            />
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            <span>Next step or action you will take (optional)</span>
            <input
              type="text"
              value={draft.responses.nextSteps}
              onChange={(event) => handleResponseChange("nextSteps", event.target.value)}
              disabled={!purchased}
            />
          </label>
        </div>
      )}

      {module.type === "report" && (
        <div style={{ display: "grid", gap: 12 }}>
          <label style={{ display: "grid", gap: 4 }}>
            <span>Summary of what you documented</span>
            <textarea
              rows={4}
              value={draft.responses.summary}
              onChange={(event) => handleResponseChange("summary", event.target.value)}
              disabled={!purchased}
              style={{ width: "100%" }}
            />
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            <span>Share a link to your file or upload location</span>
            <input
              type="url"
              value={draft.responses.link}
              onChange={(event) => handleResponseChange("link", event.target.value)}
              placeholder="https://"
              disabled={!purchased}
            />
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            <span>Notes for your counselor (optional)</span>
            <textarea
              rows={2}
              value={draft.responses.notes}
              onChange={(event) => handleResponseChange("notes", event.target.value)}
              disabled={!purchased}
              style={{ width: "100%" }}
            />
          </label>
        </div>
      )}

      {module.type === "catalog" && (
        <div style={{ display: "grid", gap: 12 }}>
          <label style={{ display: "grid", gap: 4 }}>
            <span>Author search – call number & location</span>
            <input
              type="text"
              value={draft.responses.author}
              onChange={(event) => handleResponseChange("author", event.target.value)}
              disabled={!purchased}
            />
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            <span>Title search – call number & location</span>
            <input
              type="text"
              value={draft.responses.title}
              onChange={(event) => handleResponseChange("title", event.target.value)}
              disabled={!purchased}
            />
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            <span>Subject search – call number & location</span>
            <input
              type="text"
              value={draft.responses.subject}
              onChange={(event) => handleResponseChange("subject", event.target.value)}
              disabled={!purchased}
            />
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            <span>Notes on how you found the items (optional)</span>
            <textarea
              rows={2}
              value={draft.responses.location || ""}
              onChange={(event) => handleResponseChange("location", event.target.value)}
              disabled={!purchased}
            />
          </label>
        </div>
      )}

      {module.type === "readingLog" && (
        <div style={{ display: "grid", gap: 16 }}>
          {draft.entries.map((entry, index) => (
            <div key={index} style={{ border: "1px solid #ddd", borderRadius: 10, padding: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <strong>Book {index + 1}</strong>
                {draft.entries.length > 1 && purchased && (
                  <button type="button" onClick={() => handleRemoveEntry(index)}>
                    Remove
                  </button>
                )}
              </div>
              <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                <label style={{ display: "grid", gap: 4 }}>
                  <span>Title</span>
                  <input
                    type="text"
                    value={entry.title}
                    onChange={(event) => handleEntryChange(index, "title", event.target.value)}
                    disabled={!purchased}
                  />
                </label>
                <label style={{ display: "grid", gap: 4 }}>
                  <span>Author</span>
                  <input
                    type="text"
                    value={entry.author}
                    onChange={(event) => handleEntryChange(index, "author", event.target.value)}
                    disabled={!purchased}
                  />
                </label>
                <label style={{ display: "grid", gap: 4 }}>
                  <span>Format or genre</span>
                  <input
                    type="text"
                    value={entry.format}
                    onChange={(event) => handleEntryChange(index, "format", event.target.value)}
                    disabled={!purchased}
                    placeholder="e.g., biography, audiobook"
                  />
                </label>
                <label style={{ display: "grid", gap: 4 }}>
                  <span>Pages (or minutes)</span>
                  <input
                    type="text"
                    value={entry.pages}
                    onChange={(event) => handleEntryChange(index, "pages", event.target.value)}
                    disabled={!purchased}
                  />
                </label>
                <label style={{ display: "grid", gap: 4 }}>
                  <span>Why you chose it</span>
                  <textarea
                    rows={2}
                    value={entry.why}
                    onChange={(event) => handleEntryChange(index, "why", event.target.value)}
                    disabled={!purchased}
                  />
                </label>
                <label style={{ display: "grid", gap: 4 }}>
                  <span>3–5 sentence takeaway</span>
                  <textarea
                    rows={3}
                    value={entry.takeaway}
                    onChange={(event) => handleEntryChange(index, "takeaway", event.target.value)}
                    disabled={!purchased}
                  />
                </label>
              </div>
            </div>
          ))}
          {purchased && (
            <button type="button" onClick={handleAddEntry} style={{ alignSelf: "flex-start" }}>
              + Add another book
            </button>
          )}
        </div>
      )}

      {module.type === "research" && (
        <div style={{ display: "grid", gap: 16 }}>
          {draft.entries.map((entry, index) => (
            <div key={index} style={{ border: "1px solid #ddd", borderRadius: 10, padding: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <strong>Source {index + 1}</strong>
                {draft.entries.length > 1 && purchased && (
                  <button type="button" onClick={() => handleRemoveEntry(index)}>
                    Remove
                  </button>
                )}
              </div>
              <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                <label style={{ display: "grid", gap: 4 }}>
                  <span>Title</span>
                  <input
                    type="text"
                    value={entry.title}
                    onChange={(event) => handleEntryChange(index, "title", event.target.value)}
                    disabled={!purchased}
                  />
                </label>
                <label style={{ display: "grid", gap: 4 }}>
                  <span>Format (book, article, video, etc.)</span>
                  <input
                    type="text"
                    value={entry.format}
                    onChange={(event) => handleEntryChange(index, "format", event.target.value)}
                    disabled={!purchased}
                  />
                </label>
                <label style={{ display: "grid", gap: 4 }}>
                  <span>Link or where you found it</span>
                  <input
                    type="text"
                    value={entry.url}
                    onChange={(event) => handleEntryChange(index, "url", event.target.value)}
                    disabled={!purchased}
                  />
                </label>
                <label style={{ display: "grid", gap: 4 }}>
                  <span>Summary of key points</span>
                  <textarea
                    rows={3}
                    value={entry.summary}
                    onChange={(event) => handleEntryChange(index, "summary", event.target.value)}
                    disabled={!purchased}
                  />
                </label>
                <label style={{ display: "grid", gap: 4 }}>
                  <span>Credibility notes (why it can be trusted)</span>
                  <textarea
                    rows={2}
                    value={entry.credibility}
                    onChange={(event) => handleEntryChange(index, "credibility", event.target.value)}
                    disabled={!purchased}
                  />
                </label>
              </div>
            </div>
          ))}
          {purchased && (
            <button type="button" onClick={handleAddEntry} style={{ alignSelf: "flex-start" }}>
              + Add another source
            </button>
          )}
          <label style={{ display: "grid", gap: 4 }}>
            <span>Notes for your counselor (optional)</span>
            <textarea
              rows={2}
              value={draft.responses.notes || ""}
              onChange={(event) => handleResponseChange("notes", event.target.value)}
              disabled={!purchased}
            />
          </label>
        </div>
      )}

      {module.type === "serviceLog" && (
        <div style={{ display: "grid", gap: 16 }}>
          {draft.entries.map((entry, index) => (
            <div key={index} style={{ border: "1px solid #ddd", borderRadius: 10, padding: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <strong>Session {index + 1}</strong>
                {draft.entries.length > 1 && purchased && (
                  <button type="button" onClick={() => handleRemoveEntry(index)}>
                    Remove
                  </button>
                )}
              </div>
              <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                <label style={{ display: "grid", gap: 4 }}>
                  <span>Date</span>
                  <input
                    type="date"
                    value={entry.date}
                    onChange={(event) => handleEntryChange(index, "date", event.target.value)}
                    disabled={!purchased}
                  />
                </label>
                <label style={{ display: "grid", gap: 4 }}>
                  <span>Hours</span>
                  <input
                    type="number"
                    min="0"
                    step="0.25"
                    value={entry.hours}
                    onChange={(event) => handleEntryChange(index, "hours", event.target.value)}
                    disabled={!purchased}
                  />
                </label>
                <label style={{ display: "grid", gap: 4 }}>
                  <span>Activity description</span>
                  <textarea
                    rows={3}
                    value={entry.activity}
                    onChange={(event) => handleEntryChange(index, "activity", event.target.value)}
                    disabled={!purchased}
                  />
                </label>
                <label style={{ display: "grid", gap: 4 }}>
                  <span>Notes or partner signature</span>
                  <textarea
                    rows={2}
                    value={entry.notes}
                    onChange={(event) => handleEntryChange(index, "notes", event.target.value)}
                    disabled={!purchased}
                  />
                </label>
                <label style={{ display: "grid", gap: 4 }}>
                  <span>Link to proof (photo, doc, etc.)</span>
                  <input
                    type="url"
                    value={entry.evidence}
                    onChange={(event) => handleEntryChange(index, "evidence", event.target.value)}
                    placeholder="https://"
                    disabled={!purchased}
                  />
                </label>
              </div>
            </div>
          ))}
          {purchased && (
            <button type="button" onClick={handleAddEntry} style={{ alignSelf: "flex-start" }}>
              + Add another session
            </button>
          )}
          <div style={{ fontSize: 12, color: "#22543d" }}>
            Logged hours: <strong>{totalServiceHours.toFixed(2)}</strong>
          </div>
          <label style={{ display: "grid", gap: 4 }}>
            <span>Service goal or reminder (optional)</span>
            <input
              type="text"
              value={draft.responses.goal || ""}
              onChange={(event) => handleResponseChange("goal", event.target.value)}
              disabled={!purchased}
            />
          </label>
        </div>
      )}

      {module.type === "quiz" && Array.isArray(module.quiz) && (
        <div style={{ display: "grid", gap: 12 }}>
          {module.quiz.map((question, index) => {
            const answerValue = draft.responses.answers?.[index] || "";
            const revealed = revealedAnswers[index];
            return (
              <div key={index} style={{ border: "1px solid #ddd", borderRadius: 10, padding: 12 }}>
                <strong>Question {index + 1}</strong>
                <p style={{ marginTop: 4 }}>{question.q}</p>
                {Array.isArray(question.choices) ? (
                  <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
                    {question.choices.map((choice) => (
                      <label key={choice} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <input
                          type="radio"
                          name={`${module.id}-q-${index}`}
                          value={choice}
                          checked={answerValue === choice}
                          onChange={(event) => handleResponseChange(
                            "answers",
                            {
                              ...(draft.responses.answers || {}),
                              [index]: event.target.value,
                            }
                          )}
                          disabled={!purchased}
                        />
                        <span>{choice}</span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <textarea
                    rows={question.q.length > 120 ? 4 : 3}
                    value={answerValue}
                    onChange={(event) => handleResponseChange(
                      "answers",
                      {
                        ...(draft.responses.answers || {}),
                        [index]: event.target.value,
                      }
                    )}
                    disabled={!purchased}
                    style={{ width: "100%", marginTop: 8 }}
                  />
                )}
                <button
                  type="button"
                  onClick={() => toggleReveal(index)}
                  style={{ marginTop: 8 }}
                >
                  {revealed ? "Hide model answer" : "Reveal model answer"}
                </button>
                {revealed && (
                  <div style={{
                    marginTop: 8,
                    background: "#f0fff4",
                    padding: 8,
                    borderRadius: 8,
                    border: "1px solid #c6f6d5",
                    fontSize: 14,
                  }}>
                    <strong>Suggested answer:</strong> {question.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 16 }}>
        <button type="button" onClick={handleSave} disabled={!purchased}>
          Save Progress
        </button>
        <button type="button" onClick={handleComplete} disabled={!purchased || done}>
          {done ? "Completed" : "Mark Complete"}
        </button>
        {done && (
          <button type="button" onClick={handleReopen}>
            Reopen
          </button>
        )}
      </div>
      <div style={{ fontSize: 12, color: "#555", marginTop: 8 }}>
        {savedAt ? `Last saved ${savedAt}.` : "Not saved yet."}
        {isDirty && purchased && <span style={{ color: "#b7791f", marginLeft: 8 }}>Unsaved changes</span>}
      </div>
      {module.type === "readingLog" && purchased && (
        <div style={{ fontSize: 12, color: "#2c5282", marginTop: 6 }}>
          Logged books: <strong>{activeEntries.length}</strong>
        </div>
      )}
    </div>
  );
}

export default function BadgePage() {
  const router = useRouter();
  const { id } = router.query;
  const [badge, setBadge] = useState(null);
  const [progress, setProgress] = useState(getBadgeProgress(id));
  
  useEffect(() => {
    if (!id) return;
    import(`../../data/${id}.json`).then(mod => {
      setBadge(mod);
      // ensure total modules known for percent calc
      markPurchased(id, getBadgeProgress(id).purchased || false, mod.modules.length);
      setProgress(getBadgeProgress(id));
    }).catch(() => setBadge(null));
  }, [id]);

  if (!id) return null;
  if (badge === null) return <main style={{padding:24}}>Badge not found.</main>;
  const purchased = !!progress.purchased;

  const totalModules = badge.modules.length;

  const saveWork = (moduleId, updates) => {
    saveModuleWork(id, moduleId, updates);
    setProgress(getBadgeProgress(id));
  };

  const completeModule = (module, updates) => {
    const updated = updateModule(id, module.id, updates);
    setProgress(updated);
  };

  const reopenModule = (moduleId) => {
    saveModuleWork(id, moduleId, { done: false, totalModules });
    setProgress(getBadgeProgress(id));
  };

  const handlePurchase = () => {
    // placeholder; integrate Stripe later
    markPurchased(id, true, badge.modules.length);
    setProgress(getBadgeProgress(id));
    alert("Purchased for demo purposes. (Integrate Stripe here.)");
  };

  const moduleProgress = progress.modules || {};
  const moduleMap = useMemo(() => {
    const map = new Map();
    badge.modules.forEach((module) => map.set(module.id, module));
    return map;
  }, [badge.modules]);

  const checkpoints = badge.checkpoints || [];

  const checkpointDetails = checkpoints.map((checkpoint) => {
    const module = moduleMap.get(checkpoint.after);
    const done = moduleProgress[checkpoint.after]?.done;
    return {
      ...checkpoint,
      moduleTitle: module ? module.title : checkpoint.after,
      done: !!done,
    };
  });

  const nextCheckpoint = checkpointDetails.find((checkpoint) => !checkpoint.done);

  return (
    <main style={{ maxWidth: 900, margin: "40px auto", padding: "0 16px" }}>
      <Link href="/dashboard">← Back to dashboard</Link>
      <h1 style={{ marginTop: 12 }}>{badge.title}</h1>
      <p>{badge.summary}</p>
      {badge.officialUrl && (
        <p>
          <a href={badge.officialUrl} target="_blank" rel="noreferrer">
            View Official Requirements ↗
          </a>
        </p>
      )}
      {Array.isArray(badge.resources) && badge.resources.length > 0 && (
        <div style={{border:"1px solid #eee", borderRadius:12, padding:12, margin:"12px 0"}}>
          <strong>Explore More</strong>
          <ul style={{marginTop:8}}>
            {badge.resources.map((resource, index) => (
              <li key={index}>
                <a href={resource.url} target="_blank" rel="noreferrer">{resource.title}</a>
                {resource.description ? (
                  <>
                    {" "}— <span style={{color:"#555"}}>{resource.description}</span>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div style={{ margin: "16px 0" }}>
        <ProgressBar value={progress.percent || 0} />
      </div>

      <div style={{
        border: "1px solid #cbd5f5",
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
        background: "#f8fafc",
      }}>
        <h2 style={{ marginTop: 0 }}>Your plan</h2>
        <p style={{ marginBottom: 12 }}>
          Work is saved to this device when you click <strong>Save Progress</strong>.
          Come back any time to keep writing before you submit to a counselor.
        </p>
        {nextCheckpoint ? (
          <p style={{ marginBottom: 8 }}>
            Next review: <strong>{nextCheckpoint.label}</strong> after completing
            “{nextCheckpoint.moduleTitle}”.
          </p>
        ) : (
          <p style={{ marginBottom: 8 }}>All checkpoints are ready for review.</p>
        )}
      </div>

      {checkpointDetails.length > 0 && (
        <section style={{ marginBottom: 24 }}>
          <h2 style={{ marginBottom: 12 }}>Checkpoints</h2>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 12 }}>
            {checkpointDetails.map((checkpoint) => (
              <li
                key={checkpoint.id}
                style={{
                  border: "1px solid #e2e8f0",
                  borderRadius: 10,
                  padding: 12,
                  background: checkpoint.done ? "#f0fff4" : "#fff",
                }}
              >
                <strong>{checkpoint.label}</strong>
                <div style={{ fontSize: 14, marginTop: 4 }}>
                  After: {checkpoint.moduleTitle}
                </div>
                <div style={{ fontSize: 13, marginTop: 6, color: checkpoint.done ? "#2f855a" : "#c05621" }}>
                  {checkpoint.done ? "Ready for leader review" : "Complete the module to unlock this check-in."}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!purchased && (
        <div style={{border:"1px dashed #aaa", padding:12, borderRadius:10, marginBottom:16}}>
          <strong>Price:</strong> ${badge.priceUSD || 20}{" "}
          <button type="button" onClick={handlePurchase} style={{marginLeft:8}}>Purchase Access</button>
          <div style={{fontSize:12, color:"#666"}}>Discounts available for urban troops.</div>
        </div>
      )}

      {badge.modules.map((module) => (
        <ModuleCard
          key={module.id}
          module={module}
          state={moduleProgress[module.id] || {}}
          purchased={purchased}
          onSave={saveWork}
          onComplete={completeModule}
          onReopen={reopenModule}
          totalModules={totalModules}
        />
      ))}
    </main>
  );
}
