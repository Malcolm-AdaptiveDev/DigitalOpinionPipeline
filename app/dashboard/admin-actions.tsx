"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface AdminActionsProps {
  pendingCount: number;
  trendingCount: number;
  mockMode?: boolean;
}

type ConfirmState = "idle" | "confirm_reviews" | "confirm_trends" | "working";
type ResultState = {
  reviews?: number;
  trends?: { rawTrends: number; scoredTrends: number };
} | null;

export function AdminActions({
  pendingCount,
  trendingCount,
  mockMode = false,
}: AdminActionsProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [confirm, setConfirm] = useState<ConfirmState>("idle");
  const [result, setResult] = useState<ResultState>(null);
  const [error, setError] = useState<string | null>(null);

  async function execute(action: "pending_reviews" | "trending_queues") {
    setConfirm("working");
    setError(null);
    try {
      const res = await fetch("/api/admin/clear-queues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, mockMode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setResult((prev) => ({
        ...prev,
        ...(action === "pending_reviews"
          ? { reviews: data.reviewsCleared }
          : { trends: data.trendsCleared }),
      }));
      setConfirm("idle");
      startTransition(() => router.refresh());
    } catch (e) {
      setError((e as Error).message);
      setConfirm("idle");
    }
  }

  const btnBase: React.CSSProperties = {
    fontSize: 12,
    padding: "5px 14px",
    borderRadius: 8,
    cursor: confirm === "working" ? "not-allowed" : "pointer",
    border: "0.5px solid",
    background: "transparent",
    opacity: confirm === "working" ? 0.5 : 1,
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    transition: "opacity 0.15s",
  };

  return (
    <div
      style={{
        background: "#0f1117",
        border: "0.5px solid #2a2f3a",
        borderRadius: 12,
        padding: "14px 18px",
        marginBottom: "1.5rem",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 12,
        }}
      >
        <i
          className="ti ti-shield-bolt"
          style={{ fontSize: 15, color: "#9aa3b2" }}
          aria-hidden="true"
        />
        <span
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: "#9aa3b2",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
          }}
        >
          Admin actions
        </span>
      </div>

      <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
        {/* ── Clear pending reviews ── */}
        <div>
          <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>
            Pending reviews
            <span
              style={{
                marginLeft: 8,
                color: pendingCount > 0 ? "#EF9F27" : "#444",
                fontWeight: 500,
              }}
            >
              {pendingCount}
            </span>
          </div>
          {confirm === "confirm_reviews" ? (
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, color: "#EF9F27" }}>
                Mark all pending as unapproved?
              </span>
              <button
                onClick={() => execute("pending_reviews")}
                style={{ ...btnBase, borderColor: "#EF9F27", color: "#EF9F27" }}
              >
                Confirm
              </button>
              <button
                onClick={() => setConfirm("idle")}
                style={{ ...btnBase, borderColor: "#333", color: "#555" }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirm("confirm_reviews")}
              disabled={confirm === "working" || pendingCount === 0}
              style={{
                ...btnBase,
                borderColor: pendingCount > 0 ? "#EF9F27" : "#2a2f3a",
                color: pendingCount > 0 ? "#EF9F27" : "#444",
              }}
            >
              <i
                className="ti ti-trash"
                style={{ fontSize: 13 }}
                aria-hidden="true"
              />
              Clear pending reviews
            </button>
          )}
          {result?.reviews !== undefined && (
            <div style={{ fontSize: 11, color: "#EF9F27", marginTop: 6 }}>
              ✓ {result.reviews} pending review{result.reviews !== 1 ? "s" : ""}{" "}
              marked unapproved
            </div>
          )}
        </div>

        {/* ── Clear trending queues ── */}
        <div>
          <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>
            Unprocessed trends
            <span
              style={{
                marginLeft: 8,
                color: trendingCount > 0 ? "#D85A30" : "#444",
                fontWeight: 500,
              }}
            >
              {trendingCount}
            </span>
          </div>
          {confirm === "confirm_trends" ? (
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, color: "#D85A30" }}>
                Mark all unprocessed trends as outdated/unreviewed?
              </span>
              <button
                onClick={() => execute("trending_queues")}
                style={{ ...btnBase, borderColor: "#D85A30", color: "#D85A30" }}
              >
                Confirm
              </button>
              <button
                onClick={() => setConfirm("idle")}
                style={{ ...btnBase, borderColor: "#333", color: "#555" }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirm("confirm_trends")}
              disabled={confirm === "working" || trendingCount === 0}
              style={{
                ...btnBase,
                borderColor: trendingCount > 0 ? "#D85A30" : "#2a2f3a",
                color: trendingCount > 0 ? "#D85A30" : "#444",
              }}
            >
              <i
                className="ti ti-trash"
                style={{ fontSize: 13 }}
                aria-hidden="true"
              />
              Clear trending queues
            </button>
          )}
          {result?.trends !== undefined && (
            <div style={{ fontSize: 11, color: "#D85A30", marginTop: 6 }}>
              ✓ {result.trends.scoredTrends} scored trend
              {result.trends.scoredTrends !== 1 ? "s" : ""} marked outdated
              {result.trends.rawTrends > 0 &&
                ` · ${result.trends.rawTrends} raw`}
            </div>
          )}
        </div>
      </div>

      {error && (
        <div
          style={{
            fontSize: 12,
            color: "#E24B4A",
            marginTop: 10,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <i
            className="ti ti-alert-circle"
            style={{ fontSize: 14 }}
            aria-hidden="true"
          />
          {error}
        </div>
      )}
    </div>
  );
}
