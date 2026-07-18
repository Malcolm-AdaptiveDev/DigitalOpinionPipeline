"use client";

import { useState, useTransition, useCallback } from "react";
import { PipelineShell } from "@/components/pipeline-shell";
import type {
  RssFeed,
  TrendSource,
  RssFeedHealthStatus,
} from "@/lib/pipeline/types";

const HEALTH_COLOR: Record<RssFeedHealthStatus, string> = {
  ok: "#1D9E75",
  error: "#E24B4A",
  timeout: "#EF9F27",
  unknown: "#555",
};

const HEALTH_LABEL: Record<RssFeedHealthStatus, string> = {
  ok: "Healthy",
  error: "Error",
  timeout: "Timeout",
  unknown: "Unknown",
};

const VALID_SOURCES: TrendSource[] = [
  "rss_news",
  "hackernews",
  "reddit",
  "x_trending",
  "google_trends",
];

function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

type FeedFormData = {
  url: string;
  name: string;
  source: TrendSource;
  tags: string;
  notes: string;
  is_active: boolean;
};

function emptyForm(): FeedFormData {
  return {
    url: "",
    name: "",
    source: "rss_news",
    tags: "",
    notes: "",
    is_active: true,
  };
}

function feedToForm(f: RssFeed): FeedFormData {
  return {
    url: f.url,
    name: f.name,
    source: f.source,
    tags: f.tags.join(", "),
    notes: f.notes ?? "",
    is_active: f.is_active,
  };
}

// ─── Feed Form Modal ──────────────────────────────────────────────────────────

function FeedFormModal({
  title,
  initial,
  onSave,
  onCancel,
  saving,
}: {
  title: string;
  initial: FeedFormData;
  onSave: (data: FeedFormData) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<FeedFormData>(initial);

  function field(key: keyof FeedFormData, value: string | boolean) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    background: "#10131a",
    border: "0.5px solid #3a4352",
    borderRadius: 8,
    padding: "8px 12px",
    color: "#edf0f6",
    fontSize: 13,
    boxSizing: "border-box",
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 12,
    color: "#8c96a8",
    display: "block",
    marginBottom: 4,
  };
  const groupStyle: React.CSSProperties = { marginBottom: 14 };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
      }}
    >
      <div
        style={{
          background: "#171a22",
          border: "0.5px solid #2a2f3a",
          borderRadius: 14,
          padding: "24px 28px",
          width: 520,
          maxWidth: "95vw",
        }}
      >
        <h3
          style={{
            margin: "0 0 20px",
            fontSize: 16,
            fontWeight: 500,
            color: "#edf0f6",
          }}
        >
          {title}
        </h3>

        <div style={groupStyle}>
          <label style={labelStyle}>Feed URL *</label>
          <input
            style={inputStyle}
            value={form.url}
            onChange={(e) => field("url", e.target.value)}
            placeholder="https://example.com/feed.rss"
          />
        </div>

        <div style={groupStyle}>
          <label style={labelStyle}>Display name *</label>
          <input
            style={inputStyle}
            value={form.name}
            onChange={(e) => field("name", e.target.value)}
            placeholder="TechCrunch"
          />
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
            marginBottom: 14,
          }}
        >
          <div>
            <label style={labelStyle}>Source type *</label>
            <select
              style={{ ...inputStyle, cursor: "pointer" }}
              value={form.source}
              onChange={(e) => field("source", e.target.value as TrendSource)}
            >
              {VALID_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {s.replace("_", " ")}
                </option>
              ))}
            </select>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              paddingBottom: 2,
            }}
          >
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                cursor: "pointer",
                fontSize: 13,
                color: "#edf0f6",
              }}
            >
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => field("is_active", e.target.checked)}
              />
              Active
            </label>
          </div>
        </div>

        <div style={groupStyle}>
          <label style={labelStyle}>Tags (comma-separated)</label>
          <input
            style={inputStyle}
            value={form.tags}
            onChange={(e) => field("tags", e.target.value)}
            placeholder="tech, ai, startups"
          />
        </div>

        <div style={groupStyle}>
          <label style={labelStyle}>Notes</label>
          <textarea
            style={{ ...inputStyle, resize: "vertical", minHeight: 60 }}
            value={form.notes}
            onChange={(e) => field("notes", e.target.value)}
            placeholder="Optional notes about this feed"
          />
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button
            onClick={onCancel}
            style={{
              padding: "8px 18px",
              borderRadius: 8,
              border: "0.5px solid #3a4352",
              background: "#11141a",
              color: "#a5adba",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            disabled={saving || !form.url || !form.name}
            onClick={() => onSave(form)}
            style={{
              padding: "8px 18px",
              borderRadius: 8,
              border: "none",
              background: saving ? "#1b2330" : "#1D9E75",
              color: "#fff",
              fontSize: 13,
              cursor: saving ? "default" : "pointer",
              opacity: !form.url || !form.name ? 0.5 : 1,
            }}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Feeds Page (Client Component) ───────────────────────────────────────────

export function RssFeedsPage({
  searchParams,
}: {
  searchParams?: { mock?: string };
}) {
  const mockParam = searchParams?.mock === "1" ? "?mock=1" : "";
  const mockMode = searchParams?.mock === "1";

  const [feeds, setFeeds] = useState<RssFeed[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<RssFeed | null>(null);
  const [checkingHealth, setCheckingHealth] = useState(false);
  const [healthMessage, setHealthMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [filterActive, setFilterActive] = useState<
    "all" | "active" | "inactive"
  >("all");
  const [, startTransition] = useTransition();

  const loadFeeds = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/rss-feeds${mockParam}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load feeds");
      setFeeds(data.feeds);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [mockParam]);

  // Load on first render
  if (feeds === null && !loading && !error) {
    startTransition(() => {
      void loadFeeds();
    });
  }

  async function handleAdd(form: FeedFormData) {
    setSaving(true);
    try {
      const tags = form.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      const body = { ...form, tags, mockMode };
      const res = await fetch("/api/rss-feeds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to add feed");
      setShowAdd(false);
      setFeeds((prev) => (prev ? [...prev, data.feed] : [data.feed]));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(form: FeedFormData) {
    if (!editing) return;
    setSaving(true);
    try {
      const tags = form.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      const body = { ...form, tags, notes: form.notes || null, mockMode };
      const res = await fetch(`/api/rss-feeds/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update feed");
      setEditing(null);
      setFeeds((prev) =>
        prev ? prev.map((f) => (f.id === editing.id ? data.feed : f)) : null,
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(feed: RssFeed) {
    try {
      const body = { is_active: !feed.is_active, mockMode };
      const res = await fetch(`/api/rss-feeds/${feed.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update feed");
      setFeeds((prev) =>
        prev ? prev.map((f) => (f.id === feed.id ? data.feed : f)) : null,
      );
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleDelete(feed: RssFeed) {
    if (!confirm(`Delete "${feed.name}"? This cannot be undone.`)) return;
    try {
      const qs = mockMode ? "?mock=1" : "";
      const res = await fetch(`/api/rss-feeds/${feed.id}${qs}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to delete feed");
      setFeeds((prev) => (prev ? prev.filter((f) => f.id !== feed.id) : null));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleHealthCheck(feedId?: string) {
    setCheckingHealth(true);
    setHealthMessage(null);
    try {
      const body = feedId ? { feedId, mockMode } : { mockMode };
      const res = await fetch("/api/rss-feeds/health-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Health check failed");

      // Refresh feed list to pick up health status changes
      await loadFeeds();

      if (feedId) {
        const r = data.results?.[0];
        setHealthMessage(
          r
            ? `${r.status === "ok" ? "✓" : "✗"} ${r.url}: ${r.status}${r.error ? ` — ${r.error}` : ""}`
            : "Check complete",
        );
      } else {
        setHealthMessage(
          `Checked ${data.total ?? 0} feeds: ${data.ok ?? 0} healthy, ${data.failed ?? 0} failed${data.autoDisabled ? `, ${data.autoDisabled} auto-disabled` : ""}`,
        );
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCheckingHealth(false);
    }
  }

  const displayFeeds = (feeds ?? []).filter((f) => {
    if (filterActive === "active") return f.is_active;
    if (filterActive === "inactive") return !f.is_active;
    return true;
  });

  const activeCount = (feeds ?? []).filter((f) => f.is_active).length;
  const inactiveCount = (feeds ?? []).filter((f) => !f.is_active).length;
  const errorCount = (feeds ?? []).filter(
    (f) =>
      f.last_health_status === "error" || f.last_health_status === "timeout",
  ).length;

  return (
    <PipelineShell active="feeds" mockMode={mockMode}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "1.5rem",
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <div>
          <h2
            style={{
              fontSize: 18,
              fontWeight: 500,
              margin: 0,
              color: "#ededed",
            }}
          >
            RSS feed management
          </h2>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#555" }}>
            Manage sources ingested by the pipeline every 15 minutes.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => handleHealthCheck()}
            disabled={checkingHealth}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 14px",
              borderRadius: 8,
              border: "0.5px solid #3a4352",
              background: "#11141a",
              color: "#a5adba",
              fontSize: 13,
              cursor: checkingHealth ? "default" : "pointer",
            }}
          >
            <i
              className="ti ti-heartbeat"
              style={{ fontSize: 15 }}
              aria-hidden="true"
            />
            {checkingHealth ? "Checking…" : "Check all"}
          </button>
          <button
            onClick={() => setShowAdd(true)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 14px",
              borderRadius: 8,
              border: "none",
              background: "#1D9E75",
              color: "#fff",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            <i
              className="ti ti-plus"
              style={{ fontSize: 15 }}
              aria-hidden="true"
            />
            Add feed
          </button>
        </div>
      </div>

      {/* Mock mode banner */}
      {mockMode && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "rgba(55,138,221,0.12)",
            border: "0.5px solid rgba(158,200,255,0.35)",
            borderRadius: 10,
            padding: "10px 14px",
            marginBottom: "1.25rem",
          }}
        >
          <span style={{ fontSize: 13, color: "#9EC8FF" }}>
            Mock mode: changes are in-memory only.
          </span>
        </div>
      )}

      {/* Health message */}
      {healthMessage && (
        <div
          style={{
            background: "rgba(29,158,117,0.08)",
            border: "0.5px solid rgba(29,158,117,0.3)",
            borderRadius: 10,
            padding: "10px 14px",
            marginBottom: "1.25rem",
            fontSize: 13,
            color: "#7FE0BA",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          {healthMessage}
          <button
            onClick={() => setHealthMessage(null)}
            style={{
              background: "none",
              border: "none",
              color: "#555",
              cursor: "pointer",
              fontSize: 16,
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div
          style={{
            background: "rgba(226,75,74,0.08)",
            border: "0.5px solid rgba(226,75,74,0.3)",
            borderRadius: 10,
            padding: "10px 14px",
            marginBottom: "1.25rem",
            fontSize: 13,
            color: "#E24B4A",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          {error}
          <button
            onClick={() => setError(null)}
            style={{
              background: "none",
              border: "none",
              color: "#555",
              cursor: "pointer",
              fontSize: 16,
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* Stats */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
          gap: 10,
          marginBottom: "1.5rem",
        }}
      >
        {[
          { label: "Total feeds", value: feeds?.length ?? 0, color: "#edf0f6" },
          { label: "Active", value: activeCount, color: "#1D9E75" },
          { label: "Inactive", value: inactiveCount, color: "#555" },
          { label: "Errors", value: errorCount, color: "#E24B4A" },
        ].map((stat) => (
          <div
            key={stat.label}
            style={{
              background: "#171a22",
              border: "0.5px solid #1e1e1e",
              borderRadius: 10,
              padding: "12px 14px",
            }}
          >
            <div style={{ fontSize: 11, color: "#9aa3b2", marginBottom: 4 }}>
              {stat.label}
            </div>
            <div style={{ fontSize: 26, fontWeight: 500, color: stat.color }}>
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: "1.25rem" }}>
        {(["all", "active", "inactive"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilterActive(f)}
            style={{
              padding: "6px 14px",
              borderRadius: 20,
              fontSize: 13,
              cursor: "pointer",
              background: filterActive === f ? "#1b2330" : "#11141a",
              border: `0.5px solid ${filterActive === f ? "#3a4352" : "#2a2f3a"}`,
              color: filterActive === f ? "#edf0f6" : "#a5adba",
            }}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
        <button
          onClick={loadFeeds}
          style={{
            marginLeft: "auto",
            padding: "6px 12px",
            borderRadius: 20,
            fontSize: 13,
            cursor: "pointer",
            background: "#11141a",
            border: "0.5px solid #2a2f3a",
            color: "#555",
            display: "flex",
            alignItems: "center",
            gap: 5,
          }}
        >
          <i
            className="ti ti-refresh"
            style={{ fontSize: 13 }}
            aria-hidden="true"
          />
          Refresh
        </button>
      </div>

      {/* Feed list */}
      {loading && (
        <div
          style={{
            fontSize: 14,
            color: "#555",
            textAlign: "center",
            padding: "3rem 0",
          }}
        >
          Loading feeds…
        </div>
      )}

      {!loading && displayFeeds.length === 0 && (
        <div
          style={{
            fontSize: 14,
            color: "#333",
            textAlign: "center",
            padding: "3rem 0",
          }}
        >
          {feeds?.length === 0
            ? "No feeds configured yet. Add one to get started."
            : `No ${filterActive} feeds.`}
        </div>
      )}

      {displayFeeds.map((feed) => (
        <div
          key={feed.id}
          style={{
            background: "#171a22",
            border: `0.5px solid ${feed.is_active ? "#2a2f3a" : "#1e1e1e"}`,
            borderLeft: `3px solid ${HEALTH_COLOR[feed.last_health_status]}`,
            borderRadius: 12,
            padding: "14px 16px",
            marginBottom: 10,
            opacity: feed.is_active ? 1 : 0.6,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div style={{ flex: 1, minWidth: 200 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 6,
                  flexWrap: "wrap",
                }}
              >
                <span
                  style={{ fontSize: 14, fontWeight: 500, color: "#edf0f6" }}
                >
                  {feed.name}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    padding: "2px 8px",
                    borderRadius: 6,
                    background: feed.is_active
                      ? "rgba(29,158,117,0.12)"
                      : "#10131a",
                    color: feed.is_active ? "#1D9E75" : "#555",
                    border: `0.5px solid ${feed.is_active ? "rgba(29,158,117,0.35)" : "#2a2f3a"}`,
                  }}
                >
                  {feed.is_active
                    ? "active"
                    : feed.auto_disabled
                      ? "auto-disabled"
                      : "inactive"}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    color: "#555",
                    background: "#10131a",
                    padding: "2px 8px",
                    borderRadius: 6,
                  }}
                >
                  {feed.source.replace("_", " ")}
                </span>
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "#444",
                  marginBottom: 6,
                  wordBreak: "break-all",
                }}
              >
                {feed.url}
              </div>

              {feed.tags.length > 0 && (
                <div
                  style={{
                    display: "flex",
                    gap: 4,
                    flexWrap: "wrap",
                    marginBottom: 6,
                  }}
                >
                  {feed.tags.map((tag) => (
                    <span
                      key={tag}
                      style={{
                        fontSize: 11,
                        color: "#8c96a8",
                        background: "#10131a",
                        padding: "2px 7px",
                        borderRadius: 5,
                        border: "0.5px solid #2a2f3a",
                      }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              <div
                style={{
                  display: "flex",
                  gap: 12,
                  fontSize: 11,
                  color: "#444",
                  flexWrap: "wrap",
                }}
              >
                <span style={{ color: HEALTH_COLOR[feed.last_health_status] }}>
                  ● {HEALTH_LABEL[feed.last_health_status]}
                </span>
                <span>Checked {timeAgo(feed.last_checked_at)}</span>
                {feed.consecutive_failures > 0 && (
                  <span style={{ color: "#EF9F27" }}>
                    {feed.consecutive_failures} consecutive failure
                    {feed.consecutive_failures !== 1 ? "s" : ""}
                  </span>
                )}
                {feed.last_health_error && (
                  <span
                    style={{ color: "#555" }}
                    title={feed.last_health_error}
                  >
                    {feed.last_health_error.length > 60
                      ? feed.last_health_error.slice(0, 60) + "…"
                      : feed.last_health_error}
                  </span>
                )}
              </div>

              {feed.notes && (
                <div
                  style={{
                    marginTop: 6,
                    fontSize: 12,
                    color: "#555",
                    fontStyle: "italic",
                  }}
                >
                  {feed.notes}
                </div>
              )}
            </div>

            {/* Actions */}
            <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
              <button
                onClick={() => handleHealthCheck(feed.id)}
                disabled={checkingHealth}
                title="Check health"
                style={{
                  padding: "6px 10px",
                  borderRadius: 8,
                  border: "0.5px solid #2a2f3a",
                  background: "#11141a",
                  color: "#555",
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                <i className="ti ti-heartbeat" aria-hidden="true" />
              </button>
              <button
                onClick={() => handleToggleActive(feed)}
                title={feed.is_active ? "Deactivate" : "Activate"}
                style={{
                  padding: "6px 10px",
                  borderRadius: 8,
                  border: "0.5px solid #2a2f3a",
                  background: "#11141a",
                  color: feed.is_active ? "#EF9F27" : "#1D9E75",
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                <i
                  className={`ti ${feed.is_active ? "ti-player-pause" : "ti-player-play"}`}
                  aria-hidden="true"
                />
              </button>
              <button
                onClick={() => setEditing(feed)}
                title="Edit"
                style={{
                  padding: "6px 10px",
                  borderRadius: 8,
                  border: "0.5px solid #2a2f3a",
                  background: "#11141a",
                  color: "#a5adba",
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                <i className="ti ti-pencil" aria-hidden="true" />
              </button>
              <button
                onClick={() => handleDelete(feed)}
                title="Delete"
                style={{
                  padding: "6px 10px",
                  borderRadius: 8,
                  border: "0.5px solid rgba(226,75,74,0.3)",
                  background: "#11141a",
                  color: "#E24B4A",
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                <i className="ti ti-trash" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      ))}

      {/* Add feed modal */}
      {showAdd && (
        <FeedFormModal
          title="Add RSS feed"
          initial={emptyForm()}
          onSave={handleAdd}
          onCancel={() => setShowAdd(false)}
          saving={saving}
        />
      )}

      {/* Edit feed modal */}
      {editing && (
        <FeedFormModal
          title={`Edit — ${editing.name}`}
          initial={feedToForm(editing)}
          onSave={handleUpdate}
          onCancel={() => setEditing(null)}
          saving={saving}
        />
      )}
    </PipelineShell>
  );
}
