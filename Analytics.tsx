import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { glossary } from "@/lib/glossary";

const SPORT = "basketball_nba";

const CHART_NAMES: Record<string, string> = {
  "feature_importance.png": "Feature Importance",
  "model_accuracy.png": "Model Performance",
};

const GLOSSARY_TERMS = ["ev", "edge", "impliedProbability", "kelly", "brierScore", "eloRating"];

// ─── Simple collapsible glossary ──────────────────────────────────────────

function GlossaryPanel() {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ border: "1px solid #333", borderRadius: 8, overflow: "hidden" }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{ width: "100%", padding: "10px 16px", textAlign: "left", background: "#111", cursor: "pointer", color: "#aaa", display: "flex", justifyContent: "space-between" }}
        data-testid="toggle-glossary"
      >
        <span> Learn the Metrics ({GLOSSARY_TERMS.length} terms)</span>
        <span>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div style={{ padding: 16, background: "#0d0d0d", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
          {GLOSSARY_TERMS.map(term => {
            const entry = glossary[term];
            if (!entry) return null;
            return (
              <div key={term} style={{ padding: 12, border: "1px solid #222", borderRadius: 6, background: "#111" }}>
                <div style={{ fontWeight: "bold", marginBottom: 4 }}>{entry.title}</div>
                <div style={{ fontSize: 12, color: "#aaa", lineHeight: 1.5 }}>{entry.description}</div>
                {entry.formula && (
                  <pre style={{ fontSize: 11, background: "#0a0a0a", padding: "6px 8px", borderRadius: 4, marginTop: 6, color: "#ccc" }}>{entry.formula}</pre>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Bet row (expandable) ─────────────────────────────────────────────────

function BetRow({ bet, showAll, noLiveOdds }: { bet: any; showAll: boolean; noLiveOdds: boolean }) {
  const hasPosEV = bet.is_positive_ev_home || bet.is_positive_ev_away;
  const [open, setOpen] = useState(false);
  // In Elo-only mode always show all games; in normal mode respect the filter
  if (!noLiveOdds && !showAll && !hasPosEV) return null;

  // In Elo-only mode, determine predicted winner by model probability
  const modelFavourHome = bet.model_prob_home >= bet.model_prob_away;
  const modelFavourAway = !modelFavourHome;

  return (
    <div
      style={{
        border: `1px solid ${hasPosEV ? "rgba(34,197,94,0.3)" : noLiveOdds ? "rgba(99,179,237,0.25)" : "#222"}`,
        borderRadius: 8,
        marginBottom: 8,
        background: hasPosEV ? "rgba(34,197,94,0.04)" : "#0d0d0d",
        overflow: "hidden",
      }}
      data-testid={`bet-row-${bet.game_id}`}
    >
      <button
        onClick={() => setOpen(o => !o)}
        style={{ width: "100%", padding: "12px 16px", textAlign: "left", background: "transparent", cursor: "pointer", color: "#fff", display: "flex", justifyContent: "space-between", alignItems: "center", border: "none" }}
      >
        <div>
          <span style={{ fontWeight: "bold" }}>{bet.away_team} @ {bet.home_team}</span>
          <span style={{ marginLeft: 8, fontSize: 12, color: "#888", padding: "2px 6px", background: "#1a1a1a", borderRadius: 4 }}>{bet.bookmaker}</span>
          {hasPosEV && <span style={{ marginLeft: 6, fontSize: 12, color: "#4ade80", padding: "2px 6px", background: "rgba(34,197,94,0.15)", borderRadius: 4 }}>+EV Found</span>}
          {noLiveOdds && <span style={{ marginLeft: 6, fontSize: 12, color: "#60a5fa", padding: "2px 6px", background: "rgba(96,165,250,0.1)", borderRadius: 4 }}>Elo Prediction</span>}
        </div>
        {noLiveOdds ? (
          <span style={{ fontFamily: "monospace", fontSize: 13, color: "#60a5fa" }}>
            {(bet.model_prob_home * 100).toFixed(0)}% / {(bet.model_prob_away * 100).toFixed(0)}% &nbsp;{open ? "▲" : "▼"}
          </span>
        ) : (
          <span style={{ fontWeight: "bold", color: bet.ev_home > 0 ? "#4ade80" : "#f87171", fontFamily: "monospace" }}>
            {bet.ev_home > 0 ? "+" : ""}{bet.ev_home?.toFixed(1)} EV &nbsp;{open ? "▲" : "▼"}
          </span>
        )}
      </button>

      {open && (
        <div style={{ borderTop: "1px solid #222", padding: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            {/* Home */}
            <div style={{
              padding: 12,
              background: noLiveOdds
                ? (modelFavourHome ? "rgba(96,165,250,0.07)" : "#111")
                : (bet.is_positive_ev_home ? "rgba(34,197,94,0.08)" : "#111"),
              border: `1px solid ${noLiveOdds
                ? (modelFavourHome ? "rgba(96,165,250,0.2)" : "#222")
                : (bet.is_positive_ev_home ? "rgba(34,197,94,0.2)" : "#222")}`,
              borderRadius: 6,
            }}>
              <div style={{ fontSize: 11, color: "#888", fontWeight: "bold", marginBottom: 8, textTransform: "uppercase" }}>{bet.home_team} (Home)</div>
              <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
                <tbody>
                  <tr><td style={{ color: "#888" }}>Model Win %</td><td style={{ textAlign: "right", fontFamily: "monospace", fontWeight: "bold", color: "#60a5fa" }}>{(bet.model_prob_home * 100).toFixed(1)}%</td></tr>
                  {bet.elo_prob_home !== undefined && <tr><td style={{ color: "#888" }}>Elo Win %</td><td style={{ textAlign: "right", fontFamily: "monospace" }}>{(bet.elo_prob_home * 100).toFixed(1)}%</td></tr>}
                  {!noLiveOdds && <>
                    <tr><td style={{ color: "#888" }}>Implied</td><td style={{ textAlign: "right", fontFamily: "monospace" }}>{(bet.implied_prob_home * 100).toFixed(1)}%</td></tr>
                    <tr><td style={{ color: "#888" }}>Edge</td><td style={{ textAlign: "right", fontFamily: "monospace", fontWeight: "bold", color: bet.edge_home > 0 ? "#4ade80" : "#f87171" }}>{bet.edge_home > 0 ? "+" : ""}{(bet.edge_home * 100).toFixed(1)}%</td></tr>
                    <tr><td style={{ color: "#888" }}>EV/$100</td><td style={{ textAlign: "right", fontFamily: "monospace", fontWeight: "bold", color: bet.ev_home > 0 ? "#4ade80" : "#f87171" }}>${bet.ev_home > 0 ? "+" : ""}{bet.ev_home?.toFixed(2)}</td></tr>
                    <tr><td style={{ color: "#888" }}>Spread</td><td style={{ textAlign: "right", fontFamily: "monospace" }}>{bet.home_spread > 0 ? "+" : ""}{bet.home_spread}</td></tr>
                    {bet.home_moneyline && <tr><td style={{ color: "#888" }}>ML</td><td style={{ textAlign: "right", fontFamily: "monospace" }}>{bet.home_moneyline > 0 ? "+" : ""}{bet.home_moneyline}</td></tr>}
                  </>}
                </tbody>
              </table>
            </div>
            {/* Away */}
            <div style={{
              padding: 12,
              background: noLiveOdds
                ? (modelFavourAway ? "rgba(96,165,250,0.07)" : "#111")
                : (bet.is_positive_ev_away ? "rgba(34,197,94,0.08)" : "#111"),
              border: `1px solid ${noLiveOdds
                ? (modelFavourAway ? "rgba(96,165,250,0.2)" : "#222")
                : (bet.is_positive_ev_away ? "rgba(34,197,94,0.2)" : "#222")}`,
              borderRadius: 6,
            }}>
              <div style={{ fontSize: 11, color: "#888", fontWeight: "bold", marginBottom: 8, textTransform: "uppercase" }}>{bet.away_team} (Away)</div>
              <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
                <tbody>
                  <tr><td style={{ color: "#888" }}>Model Win %</td><td style={{ textAlign: "right", fontFamily: "monospace", fontWeight: "bold", color: "#60a5fa" }}>{(bet.model_prob_away * 100).toFixed(1)}%</td></tr>
                  {bet.elo_prob_away !== undefined && <tr><td style={{ color: "#888" }}>Elo Win %</td><td style={{ textAlign: "right", fontFamily: "monospace" }}>{(bet.elo_prob_away * 100).toFixed(1)}%</td></tr>}
                  {!noLiveOdds && <>
                    <tr><td style={{ color: "#888" }}>Implied</td><td style={{ textAlign: "right", fontFamily: "monospace" }}>{(bet.implied_prob_away * 100).toFixed(1)}%</td></tr>
                    <tr><td style={{ color: "#888" }}>Edge</td><td style={{ textAlign: "right", fontFamily: "monospace", fontWeight: "bold", color: bet.edge_away > 0 ? "#4ade80" : "#f87171" }}>{bet.edge_away > 0 ? "+" : ""}{(bet.edge_away * 100).toFixed(1)}%</td></tr>
                    <tr><td style={{ color: "#888" }}>EV/$100</td><td style={{ textAlign: "right", fontFamily: "monospace", fontWeight: "bold", color: bet.ev_away > 0 ? "#4ade80" : "#f87171" }}>${bet.ev_away > 0 ? "+" : ""}{bet.ev_away?.toFixed(2)}</td></tr>
                    <tr><td style={{ color: "#888" }}>Spread</td><td style={{ textAlign: "right", fontFamily: "monospace" }}>{bet.away_spread > 0 ? "+" : ""}{bet.away_spread}</td></tr>
                    {bet.away_moneyline && <tr><td style={{ color: "#888" }}>ML</td><td style={{ textAlign: "right", fontFamily: "monospace" }}>{bet.away_moneyline > 0 ? "+" : ""}{bet.away_moneyline}</td></tr>}
                  </>}
                </tbody>
              </table>
            </div>
            {/* Right panel: recommendation or game info */}
            <div style={{ padding: 12, background: "#111", border: "1px solid #222", borderRadius: 6, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 11, color: "#888", fontWeight: "bold", textTransform: "uppercase" }}>
                {noLiveOdds ? "Game Info" : "Recommendation"}
              </div>
              <div style={{ fontSize: 13, color: "#aaa" }}>
                {new Date(bet.commence_time).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                <span style={{ marginLeft: 6, color: "#666" }}>
                  {new Date(bet.commence_time).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                </span>
              </div>
              {noLiveOdds ? (
                <div style={{ padding: "8px 12px", borderRadius: 6, background: "rgba(96,165,250,0.08)", color: "#93c5fd", fontSize: 13 }}>
                  ML predicts: <strong>{modelFavourHome ? bet.home_team : bet.away_team}</strong> ({modelFavourHome ? (bet.model_prob_home * 100).toFixed(0) : (bet.model_prob_away * 100).toFixed(0)}%)
                </div>
              ) : (
                <div style={{ padding: "8px 12px", borderRadius: 6, background: hasPosEV ? "rgba(34,197,94,0.12)" : "#1a1a1a", color: hasPosEV ? "#4ade80" : "#888", fontWeight: "bold", fontSize: 13 }}>
                  {hasPosEV ? "✓" : "✗"} {bet.suggestion}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────

export default function Analytics() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAllBets, setShowAllBets] = useState(false);

  async function runAnalysis() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/analytics/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sport: SPORT }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Failed to run analytics");
      setResult(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppLayout>
      <div style={{ maxWidth: 960, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <h2 className="text-4xl font-display font-bold text-foreground">
            ML Analytics Engine
          </h2>
          <p style={{ color: "#888", marginTop: 8 }}>
            NBA team-level ML predictions — powered by live odds, Elo ratings, and historical data.
          </p>
        </div>

        {/* Glossary */}
        <div style={{ marginBottom: 16 }}>
          <GlossaryPanel />
        </div>

        {/* Run button */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 24 }}>
          <button
            onClick={runAnalysis}
            disabled={loading}
            data-testid="button-run-analysis"
            style={{ padding: "10px 24px", borderRadius: 8, background: loading ? "#333" : "#e5e5e5", color: "#000", fontWeight: "bold", cursor: loading ? "not-allowed" : "pointer", border: "none", fontSize: 14 }}
          >
            {loading ? "⏳ Running Pipeline..." : "▶ Run Analysis"}
          </button>
        </div>

        {/* Empty state */}
        {!result && !loading && !error && (
          <div style={{ textAlign: "center", padding: "64px 32px", border: "1px solid #222", borderRadius: 12, background: "#0d0d0d" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🧠</div>
            <h3 style={{ fontSize: 20, fontWeight: "bold", marginBottom: 8 }}>Ready to Analyze</h3>
            <p style={{ color: "#888", maxWidth: 400, margin: "0 auto" }}>
              Click <strong>Run Analysis</strong> to train the model, detect positive EV bets, and compute Kelly Criterion sizing. First run may take 20–30 seconds.
            </p>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div style={{ textAlign: "center", padding: "64px 32px", border: "1px solid #222", borderRadius: 12, background: "#0d0d0d" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⏳</div>
            <h3 style={{ fontSize: 20, fontWeight: "bold", marginBottom: 12 }}>Running ML Pipeline...</h3>
            <div style={{ color: "#888", fontSize: 14, lineHeight: 2 }}>
              <div>Fetching live NBA odds from sportsbooks...</div>
              <div>Loading historical game results from nba_api...</div>
              <div>Engineering features and computing Elo ratings...</div>
              <div>Training model and predicting win probabilities...</div>
              <div>Detecting positive EV bets and computing Kelly sizing...</div>
            </div>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div style={{ padding: "32px", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 12, background: "rgba(239,68,68,0.05)", textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>⚠️</div>
            <h3 style={{ fontWeight: "bold", marginBottom: 8 }}>Engine Error</h3>
            <pre style={{ color: "#f87171", fontSize: 12, whiteSpace: "pre-wrap", maxWidth: 600, margin: "0 auto" }}>{error}</pre>
            <button onClick={runAnalysis} style={{ marginTop: 16, padding: "8px 20px", borderRadius: 6, background: "rgba(239,68,68,0.2)", color: "#f87171", border: "none", cursor: "pointer", fontWeight: "bold" }}>
              Retry
            </button>
          </div>
        )}

        {/* Results */}
        {result && !loading && (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {result.cached && (
              <div style={{ fontSize: 13, color: "#888", padding: "8px 14px", background: "#111", borderRadius: 6, display: "inline-block" }}>
                🔄 Showing cached results. Click Run Analysis to refresh.
              </div>
            )}

            {/* No live odds banner */}
            {result.no_live_odds && (
              <div style={{ padding: "14px 18px", border: "1px solid rgba(251,191,36,0.3)", borderRadius: 8, background: "rgba(251,191,36,0.06)", display: "flex", gap: 12, alignItems: "flex-start" }} data-testid="banner-no-live-odds">
                <span style={{ fontSize: 20 }}>⚡</span>
                <div>
                  <div style={{ fontWeight: "bold", color: "#fbbf24", marginBottom: 4 }}>Elo-Only Mode — Live Odds Unavailable</div>
                  <div style={{ fontSize: 13, color: "#a16207", lineHeight: 1.6 }}>
                    The Odds API monthly quota is exhausted. The ML model is still running predictions using Elo ratings and historical win rates from {result.training_samples?.toLocaleString() || "1,000+"} NBA games.
                    EV and Kelly sizing will resume automatically when live odds return.
                  </div>
                </div>
              </div>
            )}

            {/* Summary stats */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
              {[
                { label: "Model", value: result.model_metrics?.model_name?.split(" ")[0] || "Elo" },
                { label: "Training Samples", value: result.training_samples },
                { label: "Upcoming Games", value: result.upcoming_games },
                { label: "+EV Bets", value: result.positive_ev_bets?.length ?? 0 },
              ].map(s => (
                <div key={s.label} style={{ padding: 16, border: "1px solid #222", borderRadius: 8, background: "#0d0d0d" }}>
                  <div style={{ fontSize: 11, color: "#666", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>{s.label}</div>
                  <div style={{ fontSize: 28, fontWeight: "bold", fontFamily: "monospace" }}>{s.value}</div>
                </div>
              ))}
            </div>

            {/* Model metrics */}
            {result.model_metrics && Object.keys(result.model_metrics).length > 0 && (
              <div style={{ padding: 16, border: "1px solid #222", borderRadius: 8, background: "#0d0d0d" }}>
                <h3 style={{ fontSize: 13, fontWeight: "bold", color: "#888", textTransform: "uppercase", marginBottom: 12 }}>Model Evaluation</h3>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12, fontSize: 13 }}>
                  {result.model_metrics.cv_brier_score !== undefined && (
                    <div>
                      <div style={{ color: "#666" }}>CV Brier Score</div>
                      <div style={{ fontFamily: "monospace", fontWeight: "bold" }}>{result.model_metrics.cv_brier_score}</div>
                    </div>
                  )}
                  {result.model_metrics.train_accuracy !== undefined && (
                    <div>
                      <div style={{ color: "#666" }}>Train Accuracy</div>
                      <div style={{ fontFamily: "monospace", fontWeight: "bold" }}>{(result.model_metrics.train_accuracy * 100).toFixed(1)}%</div>
                    </div>
                  )}
                  {result.model_metrics.lr_cv_brier !== undefined && (
                    <div>
                      <div style={{ color: "#666" }}>LR Brier</div>
                      <div style={{ fontFamily: "monospace" }}>{result.model_metrics.lr_cv_brier}</div>
                    </div>
                  )}
                  {result.model_metrics.rf_cv_brier !== undefined && (
                    <div>
                      <div style={{ color: "#666" }}>RF Brier</div>
                      <div style={{ fontFamily: "monospace" }}>{result.model_metrics.rf_cv_brier}</div>
                    </div>
                  )}
                  {result.model_metrics.note && (
                    <div style={{ gridColumn: "1 / -1", color: "#666", fontSize: 12 }}>{result.model_metrics.note}</div>
                  )}
                </div>
              </div>
            )}

            {/* Bet recommendations / Elo predictions */}
            {result.bets && result.bets.length > 0 && (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <h3 style={{ fontSize: 18, fontWeight: "bold" }}>
                    {result.no_live_odds ? "Win Probability Predictions" : "Bet Recommendations"}
                    {!result.no_live_odds && result.positive_ev_bets?.length > 0 && (
                      <span style={{ fontSize: 14, color: "#4ade80", fontWeight: "normal", marginLeft: 8 }}>
                        ({result.positive_ev_bets.length} positive EV)
                      </span>
                    )}
                    {result.no_live_odds && (
                      <span style={{ fontSize: 13, color: "#60a5fa", fontWeight: "normal", marginLeft: 8 }}>
                        ({result.bets.length} games — Elo + ML model)
                      </span>
                    )}
                  </h3>
                  {!result.no_live_odds && (
                    <button
                      onClick={() => setShowAllBets(v => !v)}
                      data-testid="toggle-all-bets"
                      style={{ padding: "6px 14px", borderRadius: 6, border: "1px solid #333", background: "transparent", color: "#888", cursor: "pointer", fontSize: 13 }}
                    >
                      {showAllBets ? "Show +EV Only" : "Show All Games"}
                    </button>
                  )}
                </div>
                {result.bets.map((bet: any, i: number) => (
                  <BetRow key={bet.game_id || i} bet={bet} showAll={showAllBets} noLiveOdds={!!result.no_live_odds} />
                ))}
              </div>
            )}

            {/* Charts */}
            {result.charts && result.charts.length > 0 && (
              <div>
                <h3 style={{ fontSize: 18, fontWeight: "bold", marginBottom: 12 }}>Visualizations</h3>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(400px, 1fr))", gap: 16 }}>
                  {result.charts.map((chartPath: string, i: number) => {
                    const fileName = chartPath.split("/").pop() || "";
                    const title = CHART_NAMES[fileName] || fileName.replace(/_/g, " ").replace(".png", "");
                    return (
                      <div key={i} style={{ border: "1px solid #222", borderRadius: 8, overflow: "hidden", background: "#0d0d0d" }}>
                        <div style={{ padding: "8px 12px", borderBottom: "1px solid #222", fontSize: 12, color: "#888", textTransform: "uppercase" }}>{title}</div>
                        <img
                          src={`/analytics-charts/${fileName}?t=${Date.now()}`}
                          alt={title}
                          style={{ width: "100%", display: "block" }}
                          onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Debug raw JSON */}
            <div>
              <h3 style={{ fontSize: 16, fontWeight: "bold", marginBottom: 8, color: "#888" }}>🔍 Raw API Response (debug)</h3>
              <pre style={{
                background: "#0a0a0a",
                border: "1px solid #222",
                borderRadius: 8,
                padding: 16,
                fontSize: 11,
                color: "#aaa",
                overflowX: "auto",
                maxHeight: 400,
                overflowY: "auto",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}>
                {JSON.stringify(result, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
