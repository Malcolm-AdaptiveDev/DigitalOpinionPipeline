import { createClient } from "@supabase/supabase-js";

// ─── Data fetchers (run server-side on every request) ─────────────────────────

async function getPipelineStats() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;

  const sb = createClient(url, key);

  const [lastRun, queueCounts, recentPosts, relationalStates] =
    await Promise.allSettled([
      sb
        .from("pipeline_runs")
        .select(
          "run_id, started_at, completed_at, status, trends_fetched, trends_scored, items_generated, items_queued, errors",
        )
        .order("started_at", { ascending: false })
        .limit(1)
        .single(),

      sb
        .from("review_queue")
        .select("status")
        .in("status", ["pending", "approved", "rejected"]),

      sb
        .from("published_posts")
        .select("persona, platform, published_at, content")
        .order("published_at", { ascending: false })
        .limit(10),

      sb
        .from("relational_state")
        .select(
          "persona_from, persona_to, trust_score, tension_score, recent_sentiment",
        )
        .order("persona_from"),
    ]);

  return {
    lastRun: lastRun.status === "fulfilled" ? lastRun.value.data : null,
    queue: queueCounts.status === "fulfilled" ? queueCounts.value.data : [],
    recentPosts:
      recentPosts.status === "fulfilled" ? recentPosts.value.data : [],
    relationalStates:
      relationalStates.status === "fulfilled"
        ? relationalStates.value.data
        : [],
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

const PERSONA_COLOR: Record<string, string> = {
  nova: "#7F77DD",
  cynic: "#D85A30",
  oracle: "#378ADD",
  rebel: "#D4537E",
  sage: "#1D9E75",
};

const SENTIMENT_COLOR: Record<string, string> = {
  warm: "#1D9E75",
  "neutral-warm": "#639922",
  neutral: "#888780",
  cool: "#EF9F27",
  hostile: "#E24B4A",
  alliance: "#7F77DD",
};

// ─── Styles (inline — no CSS file needed) ────────────────────────────────────

const s = {
  page: {
    maxWidth: 900,
    margin: "0 auto",
    padding: "2rem 1.5rem",
  } as React.CSSProperties,
  header: {
    marginBottom: "2rem",
    borderBottom: "0.5px solid #2a2a2a",
    paddingBottom: "1.5rem",
  } as React.CSSProperties,
  title: {
    fontSize: 22,
    fontWeight: 500,
    margin: 0,
    color: "#ededed",
  } as React.CSSProperties,
  subtitle: {
    fontSize: 13,
    color: "#666",
    margin: "4px 0 0",
  } as React.CSSProperties,
  section: { marginBottom: "2rem" } as React.CSSProperties,
  sectionLabel: {
    fontSize: 11,
    fontWeight: 500,
    color: "#555",
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
    marginBottom: 10,
  },
  grid4: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    gap: 10,
    marginBottom: 16,
  } as React.CSSProperties,
  grid2: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: 10,
  } as React.CSSProperties,
  card: {
    background: "#111",
    border: "0.5px solid #222",
    borderRadius: 12,
    padding: "14px 16px",
  } as React.CSSProperties,
  metricCard: {
    background: "#111",
    border: "0.5px solid #222",
    borderRadius: 10,
    padding: "12px 14px",
  } as React.CSSProperties,
  metricLabel: {
    fontSize: 12,
    color: "#666",
    marginBottom: 4,
  } as React.CSSProperties,
  metricVal: {
    fontSize: 22,
    fontWeight: 500,
    color: "#ededed",
  } as React.CSSProperties,
  metricSub: {
    fontSize: 11,
    color: "#444",
    marginTop: 2,
  } as React.CSSProperties,
  badge: (color: string) =>
    ({
      display: "inline-block",
      fontSize: 11,
      padding: "2px 8px",
      borderRadius: 6,
      background: color + "22",
      color,
      marginRight: 4,
    }) as React.CSSProperties,
  row: {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    padding: "8px 0",
    borderBottom: "0.5px solid #1a1a1a",
  } as React.CSSProperties,
  dot: (color: string) =>
    ({
      width: 7,
      height: 7,
      borderRadius: "50%",
      background: color,
      flexShrink: 0,
      marginTop: 5,
    }) as React.CSSProperties,
  rowTitle: {
    fontSize: 13,
    fontWeight: 500,
    color: "#ddd",
    marginBottom: 2,
  } as React.CSSProperties,
  rowSub: {
    fontSize: 12,
    color: "#666",
    lineHeight: 1.5,
  } as React.CSSProperties,
  statusDot: (ok: boolean) =>
    ({
      display: "inline-block",
      width: 7,
      height: 7,
      borderRadius: "50%",
      background: ok ? "#1D9E75" : "#E24B4A",
      marginRight: 6,
      verticalAlign: "middle",
    }) as React.CSSProperties,
  noData: {
    fontSize: 13,
    color: "#444",
    padding: "16px 0",
  } as React.CSSProperties,
  relGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
    gap: 8,
  } as React.CSSProperties,
  relCard: {
    background: "#0d0d0d",
    border: "0.5px solid #1e1e1e",
    borderRadius: 8,
    padding: "10px 12px",
  } as React.CSSProperties,
};

// ─── Page component ───────────────────────────────────────────────────────────

export default async function Home() {
  const stats = await getPipelineStats();

  const pendingCount =
    stats?.queue?.filter((q: { status: string }) => q.status === "pending")
      .length ?? 0;
  const approvedCount =
    stats?.queue?.filter((q: { status: string }) => q.status === "approved")
      .length ?? 0;
  const rejectedCount =
    stats?.queue?.filter((q: { status: string }) => q.status === "rejected")
      .length ?? 0;
  const totalPublished = stats?.recentPosts?.length ?? 0;
  const lastRun = stats?.lastRun;
  const isHealthy = !!lastRun && lastRun.status !== "failed";

  // Count published posts per persona
  const personaCounts: Record<string, number> = {};
  for (const post of stats?.recentPosts ?? []) {
    const p = (post as { persona: string }).persona;
    personaCounts[p] = (personaCounts[p] ?? 0) + 1;
  }

  return (
    <main style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <h1 style={s.title}>Persona Pipeline</h1>
        <p style={s.subtitle}>
          <span style={s.statusDot(isHealthy)} />
          {isHealthy
            ? "System operational"
            : stats === null
              ? "Database not connected"
              : "Last run failed"}
          {lastRun && ` — last run ${timeAgo(lastRun.started_at)}`}
        </p>
      </div>

      {/* Top metrics */}
      <div style={s.section}>
        <div style={s.sectionLabel}>Overview</div>
        <div style={s.grid4}>
          <div style={s.metricCard}>
            <div style={s.metricLabel}>Pending review</div>
            <div style={s.metricVal}>{pendingCount}</div>
            <div style={s.metricSub}>posts awaiting approval</div>
          </div>
          <div style={s.metricCard}>
            <div style={s.metricLabel}>Approved</div>
            <div style={s.metricVal}>{approvedCount}</div>
            <div style={s.metricSub}>ready to publish</div>
          </div>
          <div style={s.metricCard}>
            <div style={s.metricLabel}>Published (recent)</div>
            <div style={s.metricVal}>{totalPublished}</div>
            <div style={s.metricSub}>last 10 posts</div>
          </div>
          <div style={s.metricCard}>
            <div style={s.metricLabel}>Last run generated</div>
            <div style={s.metricVal}>{lastRun?.items_generated ?? "—"}</div>
            <div style={s.metricSub}>
              {lastRun?.trends_scored ?? 0} trends scored
            </div>
          </div>
        </div>
      </div>

      {/* Last pipeline run */}
      <div style={s.section}>
        <div style={s.sectionLabel}>Last pipeline run</div>
        <div style={s.card}>
          {!lastRun ? (
            <p style={s.noData}>
              No pipeline runs recorded yet. Trigger one from the Inngest
              dashboard.
            </p>
          ) : (
            <>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  marginBottom: 12,
                }}
              >
                <span
                  style={s.badge(
                    lastRun.status === "completed"
                      ? "#1D9E75"
                      : lastRun.status === "running"
                        ? "#378ADD"
                        : "#E24B4A",
                  )}
                >
                  {lastRun.status}
                </span>
                <span style={{ fontSize: 12, color: "#555" }}>
                  {lastRun.run_id}
                </span>
                <span
                  style={{ fontSize: 12, color: "#555", marginLeft: "auto" }}
                >
                  {timeAgo(lastRun.started_at)}
                </span>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4, 1fr)",
                  gap: 8,
                }}
              >
                {[
                  ["Fetched", lastRun.trends_fetched],
                  ["Scored", lastRun.trends_scored],
                  ["Generated", lastRun.items_generated],
                  ["Queued", lastRun.items_queued],
                ].map(([label, val]) => (
                  <div
                    key={label as string}
                    style={{
                      background: "#0d0d0d",
                      borderRadius: 8,
                      padding: "8px 10px",
                    }}
                  >
                    <div
                      style={{ fontSize: 11, color: "#555", marginBottom: 2 }}
                    >
                      {label}
                    </div>
                    <div
                      style={{ fontSize: 18, fontWeight: 500, color: "#ddd" }}
                    >
                      {val}
                    </div>
                  </div>
                ))}
              </div>
              {lastRun.errors?.length > 0 && (
                <div
                  style={{
                    marginTop: 12,
                    background: "#1a0a0a",
                    borderRadius: 8,
                    padding: "10px 12px",
                  }}
                >
                  <div
                    style={{ fontSize: 12, color: "#E24B4A", marginBottom: 6 }}
                  >
                    {lastRun.errors.length} error(s)
                  </div>
                  {lastRun.errors
                    .slice(0, 3)
                    .map((e: { stage: string; message: string }, i: number) => (
                      <div
                        key={i}
                        style={{ fontSize: 12, color: "#666", marginBottom: 2 }}
                      >
                        <span style={{ color: "#aa4444" }}>{e.stage}:</span>{" "}
                        {e.message}
                      </div>
                    ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Persona activity */}
      <div style={s.section}>
        <div style={s.sectionLabel}>Persona activity</div>
        <div style={s.grid4}>
          {["nova", "cynic", "oracle", "rebel", "sage"].map((persona) => (
            <div
              key={persona}
              style={{
                ...s.metricCard,
                borderLeft: `3px solid ${PERSONA_COLOR[persona]}`,
              }}
            >
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: PERSONA_COLOR[persona],
                  marginBottom: 4,
                  textTransform: "capitalize",
                }}
              >
                {persona}
              </div>
              <div style={{ fontSize: 20, fontWeight: 500, color: "#ddd" }}>
                {personaCounts[persona] ?? 0}
              </div>
              <div style={{ fontSize: 11, color: "#444" }}>recent posts</div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent posts */}
      <div style={s.section}>
        <div style={s.sectionLabel}>Recent published posts</div>
        <div style={s.card}>
          {!stats?.recentPosts?.length ? (
            <p style={s.noData}>No published posts yet.</p>
          ) : (
            (
              stats.recentPosts as Array<{
                persona: string;
                platform: string;
                published_at: string;
                content: string;
              }>
            ).map((post, i) => (
              <div
                key={i}
                style={{
                  ...s.row,
                  borderBottom:
                    i < (stats.recentPosts?.length ?? 0) - 1
                      ? "0.5px solid #1a1a1a"
                      : "none",
                }}
              >
                <div style={s.dot(PERSONA_COLOR[post.persona] ?? "#888")} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: 3,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 500,
                        color: PERSONA_COLOR[post.persona] ?? "#888",
                        textTransform: "capitalize",
                      }}
                    >
                      {post.persona}
                    </span>
                    <span style={s.badge("#888")}>{post.platform}</span>
                    <span
                      style={{
                        fontSize: 11,
                        color: "#444",
                        marginLeft: "auto",
                      }}
                    >
                      {timeAgo(post.published_at)}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      color: "#999",
                      lineHeight: 1.5,
                      overflow: "hidden",
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical" as const,
                    }}
                  >
                    {post.content}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Relationship network */}
      <div style={s.section}>
        <div style={s.sectionLabel}>Relationship network</div>
        {!stats?.relationalStates?.length ? (
          <div style={{ ...s.card }}>
            <p style={s.noData}>
              No relational state data yet — will populate after first
              cross-persona interactions.
            </p>
          </div>
        ) : (
          <div style={s.relGrid}>
            {(
              stats.relationalStates as Array<{
                persona_from: string;
                persona_to: string;
                trust_score: number;
                tension_score: number;
                recent_sentiment: string;
              }>
            )
              .filter((r) => r.trust_score !== 0.5 || r.tension_score !== 0.5)
              .sort(
                (a, b) =>
                  Math.abs(b.trust_score - 0.5) - Math.abs(a.trust_score - 0.5),
              )
              .slice(0, 12)
              .map((r, i) => (
                <div key={i} style={s.relCard}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      marginBottom: 8,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 500,
                        color: PERSONA_COLOR[r.persona_from] ?? "#888",
                        textTransform: "capitalize",
                      }}
                    >
                      {r.persona_from}
                    </span>
                    <span style={{ fontSize: 11, color: "#333" }}>→</span>
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 500,
                        color: PERSONA_COLOR[r.persona_to] ?? "#888",
                        textTransform: "capitalize",
                      }}
                    >
                      {r.persona_to}
                    </span>
                    <span
                      style={{
                        ...s.badge(
                          SENTIMENT_COLOR[r.recent_sentiment] ?? "#888",
                        ),
                        marginLeft: "auto",
                        fontSize: 10,
                      }}
                    >
                      {r.recent_sentiment}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div
                        style={{ fontSize: 10, color: "#444", marginBottom: 3 }}
                      >
                        Trust
                      </div>
                      <div
                        style={{
                          height: 4,
                          background: "#1a1a1a",
                          borderRadius: 2,
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            width: `${r.trust_score * 100}%`,
                            height: "100%",
                            background: "#1D9E75",
                            borderRadius: 2,
                          }}
                        />
                      </div>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div
                        style={{ fontSize: 10, color: "#444", marginBottom: 3 }}
                      >
                        Tension
                      </div>
                      <div
                        style={{
                          height: 4,
                          background: "#1a1a1a",
                          borderRadius: 2,
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            width: `${r.tension_score * 100}%`,
                            height: "100%",
                            background: "#E24B4A",
                            borderRadius: 2,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>

      {/* API endpoints */}
      <div style={s.section}>
        <div style={s.sectionLabel}>Active endpoints</div>
        <div style={s.card}>
          {[
            {
              method: "GET/POST/PUT",
              path: "/api/inngest",
              note: "Inngest function handler — trend pipeline, scheduled posts, approval webhook",
            },
            {
              method: "POST",
              path: "/api/webhooks/post-approved",
              note: "Review dashboard → triggers memory write after operator approval",
            },
            {
              method: "POST",
              path: "/api/webhooks/engagement-update",
              note: "Analytics sync → updates engagement scores in episodic memory",
            },
          ].map((ep, i) => (
            <div
              key={i}
              style={{
                ...s.row,
                borderBottom: i < 2 ? "0.5px solid #1a1a1a" : "none",
              }}
            >
              <span style={s.badge("#7F77DD")}>{ep.method}</span>
              <div>
                <div
                  style={{
                    fontFamily: "monospace",
                    fontSize: 13,
                    color: "#ccc",
                    marginBottom: 2,
                  }}
                >
                  {ep.path}
                </div>
                <div style={{ fontSize: 12, color: "#555" }}>{ep.note}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div
        style={{
          fontSize: 11,
          color: "#333",
          textAlign: "center",
          paddingTop: "1rem",
        }}
      >
        Persona Pipeline · auto-refreshes on deploy · {new Date().toUTCString()}
      </div>
    </main>
  );
}
