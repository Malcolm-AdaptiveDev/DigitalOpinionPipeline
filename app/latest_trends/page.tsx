import Link from "next/link";
import { LatestTrendApproval } from "@/components/latest-trend-approval";
import { LatestTrendList } from "@/components/latest-trend-list";
import { PipelineShell } from "@/components/pipeline-shell";
import { getLatestTrends } from "@/lib/latest-trends";
import { isMockMode } from "@/lib/mock-data";

export const dynamic = "force-dynamic";

export default async function LatestTrendsPage({
  searchParams,
}: {
  searchParams?: { mock?: string };
}) {
  const mockMode = isMockMode(searchParams?.mock === "1");
  const mockQuery = mockMode ? "?mock=1" : "";
  const { trends, sources, mode } = await getLatestTrends({
    mockMode,
    limit: 18,
  });

  return (
    <PipelineShell active="trends" mockMode={mockMode}>
      {mockMode && (
        <div style={{
          background: "rgba(55,138,221,0.12)",
          border: "0.5px solid rgba(158,200,255,0.35)",
          borderRadius: 10,
          padding: "10px 12px",
          marginBottom: 16,
          color: "#9EC8FF",
          fontSize: 13,
        }}>
          Mock latest trends are seeded locally for debugging.
        </div>
      )}

      <section style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 12, alignItems: "start", marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#9aa3b2", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
            Latest trends
          </div>
          <h2 style={{ margin: 0, color: "#f4f6fb", fontSize: 28, lineHeight: 1.1 }}>
            Ranked feed topics
          </h2>
          <p style={{ margin: "8px 0 0", color: "#a5adba", fontSize: 13, maxWidth: 680, lineHeight: 1.5 }}>
            Pulls the configured feeds, scores persona relevance, adds episodic-memory weight, sorts by weighted score, and marks qualifying topics as auto-approved.
          </p>
        </div>
        <LatestTrendApproval ids={trends.map((trend) => trend.id)} mockMode={mockMode} />
      </section>

      <section style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
          <div style={{ fontSize: 12, color: "#8892a3" }}>
            {sources.length} configured feeds · {mode === "mock" ? "mock data" : "live RSS"}
          </div>
          <Link href={`/${mockQuery}`} style={{ color: "#9EC8FF", fontSize: 12, textDecoration: "none" }}>
            Back to dashboard
          </Link>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {sources.map((source) => (
            <span key={source.url} title={source.url} style={{
              fontSize: 11,
              color: "#c1c7d0",
              background: "#10131a",
              border: "0.5px solid #2a2f3a",
              borderRadius: 7,
              padding: "3px 7px",
            }}>
              {source.source}: {source.tags.slice(0, 3).join(", ")}
            </span>
          ))}
        </div>
      </section>

      <LatestTrendList trends={trends} />
    </PipelineShell>
  );
}
