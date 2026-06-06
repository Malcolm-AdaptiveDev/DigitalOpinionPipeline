"use client";

import { useState } from "react";

export function LatestTrendApproval({
  ids,
  mockMode = false,
}: {
  ids: string[];
  mockMode?: boolean;
}) {
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const [message, setMessage] = useState("");

  async function approve() {
    setStatus("saving");
    setMessage("");
    try {
      const res = await fetch(`/api/latest_trends${mockMode ? "?mock=1" : ""}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, mock: mockMode }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Approval failed");
      setStatus("saved");
      setMessage(`${body.approved_count ?? 0} topics approved`);
    } catch (error) {
      setStatus("error");
      setMessage((error as Error).message);
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <button
        type="button"
        onClick={approve}
        disabled={status === "saving" || ids.length === 0}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 7,
          border: "0.5px solid #2f6d54",
          background: status === "saving" ? "#17221e" : "#1D9E75",
          color: status === "saving" ? "#7FE0BA" : "#06140f",
          borderRadius: 8,
          padding: "8px 12px",
          fontSize: 13,
          fontWeight: 600,
          cursor: status === "saving" ? "wait" : "pointer",
        }}
      >
        <i className="ti ti-check" aria-hidden="true" />
        {status === "saving" ? "Approving" : "Approve auto-ranked"}
      </button>
      {message && (
        <span
          style={{
            fontSize: 12,
            color: status === "error" ? "#E24B4A" : "#7FE0BA",
          }}
        >
          {message}
        </span>
      )}
    </div>
  );
}
