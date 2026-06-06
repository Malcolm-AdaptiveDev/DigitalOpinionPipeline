import type { ScoredTrendItem } from "@/lib/pipeline/types";

const urgencyColor: Record<string, string> = {
  high: "#EF9F27",
  medium: "#378ADD",
  low: "#8892a3",
};

function pct(value = 0): string {
  return `${Math.round(value * 100)}%`;
}

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function LatestTrendList({
  trends,
  compact = false,
}: {
  trends: ScoredTrendItem[];
  compact?: boolean;
}) {
  if (trends.length === 0) {
    return (
      <div style={{ color: "#8892a3", fontSize: 13 }}>
        No current feed topics scored above the relevance threshold.
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: compact ? 8 : 12 }}>
      {trends.map((trend, index) => {
        const memoryTotal = Object.values(trend.tag_memory_counts ?? {}).reduce(
          (sum, count) => sum + count,
          0,
        );

        return (
          <article
            key={trend.id}
            style={{
              display: "grid",
              gridTemplateColumns: compact ? "52px minmax(0, 1fr)" : "70px minmax(0, 1fr)",
              gap: 12,
              background: "#171a22",
              border: "0.5px solid #2a2f3a",
              borderRadius: 10,
              padding: compact ? "10px 12px" : "14px",
            }}
          >
            <div>
              <div style={{ fontSize: 11, color: "#8892a3", marginBottom: 4 }}>
                #{index + 1}
              </div>
              <div style={{ fontSize: compact ? 20 : 28, fontWeight: 700, color: "#7FE0BA", lineHeight: 1 }}>
                {pct(trend.weighted_score)}
              </div>
              <div style={{ fontSize: 11, color: "#8892a3", marginTop: 5 }}>
                weighted
              </div>
            </div>

            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}>
                <span style={{ fontSize: 11, color: "#c1c7d0", background: "#10131a", borderRadius: 6, padding: "2px 7px" }}>
                  {trend.source}
                </span>
                <span style={{ fontSize: 11, color: urgencyColor[trend.urgency] ?? "#8892a3" }}>
                  {trend.urgency} urgency
                </span>
                <span style={{ fontSize: 11, color: "#8892a3" }}>{timeAgo(trend.published_at)}</span>
                <span style={{ fontSize: 11, color: "#7FE0BA", marginLeft: "auto" }}>
                  {trend.approval_status?.replace("_", " ") ?? "auto approved"}
                </span>
              </div>

              <a
                href={trend.url}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: "block",
                  color: "#edf0f6",
                  fontSize: compact ? 14 : 16,
                  fontWeight: 600,
                  lineHeight: 1.35,
                  textDecoration: "none",
                  marginBottom: 8,
                }}
              >
                {trend.topic}
              </a>

              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: compact ? 0 : 8 }}>
                {trend.tags.slice(0, compact ? 5 : 9).map((tag) => {
                  const count = trend.tag_memory_counts?.[tag] ?? 0;
                  return (
                    <span
                      key={tag}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 5,
                        fontSize: 11,
                        color: count > 0 ? "#7FE0BA" : "#9EC8FF",
                        background: count > 0 ? "rgba(29,158,117,0.14)" : "rgba(55,138,221,0.14)",
                        border: `0.5px solid ${count > 0 ? "rgba(127,224,186,0.35)" : "rgba(158,200,255,0.3)"}`,
                        borderRadius: 7,
                        padding: "2px 7px",
                      }}
                    >
                      {tag}
                      <span style={{ color: count > 0 ? "#7FE0BA" : "#687386" }}>
                        {count}
                      </span>
                    </span>
                  );
                })}
                {memoryTotal > 0 && (
                  <span style={{ fontSize: 11, color: "#7FE0BA", padding: "2px 0" }}>
                    {memoryTotal} episodic memories
                  </span>
                )}
              </div>

              {!compact && (
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", color: "#8892a3", fontSize: 12 }}>
                  <span>Relevance {pct(Math.max(...Object.values(trend.relevance_scores)))}</span>
                  <span>Memory {pct(trend.memory_score)}</span>
                  <span>{trend.assigned_personas.join(", ")}</span>
                </div>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
