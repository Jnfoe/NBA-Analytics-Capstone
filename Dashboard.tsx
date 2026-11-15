import { useState, useEffect } from "react";
import { Link } from "wouter";
import { AppLayout } from "@/components/layout/AppLayout";

// ─── Types ────────────────────────────────────────────────────────────────

interface Game {
  id: number;
  homeTeam: string;
  awayTeam: string;
  commenceTime: string;
  bookmaker: string;
  homeSpread: string;
  awaySpread: string;
  winProbabilityHome: string;
  winProbabilityAway: string;
  openingHomeOdds: string | null;
  openingAwayOdds: string | null;
  currentHomeOdds: string | null;
  currentAwayOdds: string | null;
}

// ─── Best bets widget ─────────────────────────────────────────────────────

function BestBetsWidget() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/analytics/best-bets")
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));

    const interval = setInterval(() => {
      fetch("/api/analytics/best-bets")
        .then(r => r.json())
        .then(setData);
    }, 60000);

    return () => clearInterval(interval);
  }, []);

  const bets: any[] = data?.team_bets ?? [];

  return (
    <div style={{ border: "1px solid #222", borderRadius: 12, overflow: "hidden", marginBottom: 32, background: "#0d0d0d" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 20px", borderBottom: "1px solid #222" }}>
        <div>
          <div style={{ fontWeight: "bold", fontSize: 16 }}>⚡ Most Profitable Bets</div>
          <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>Ranked by Expected Value · NBA ML Model</div>
        </div>
        <Link href="/analytics" style={{ fontSize: 12, color: "#888" }}>Full Analytics →</Link>
      </div>

      {/* Content */}
      <div style={{ padding: 16 }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: "32px", color: "#666" }}>Loading best bets...</div>
        ) : bets.length === 0 ? (
          <div style={{ textAlign: "center", padding: "32px", color: "#666" }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🧠</div>
            <p>No team bets available yet.</p>
            <Link href="/analytics" style={{ display: "inline-block", marginTop: 8, padding: "6px 14px", border: "1px solid #333", borderRadius: 6, fontSize: 13 }}>
              Run Analysis →
            </Link>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {bets.map((bet: any, i: number) => {
              const date = new Date(bet.commence_time);
              const timeStr = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
              const dateStr = date.toLocaleDateString([], { month: "short", day: "numeric" });
              const evPct = Math.min(100, (bet.ev / Math.max(...bets.map((b: any) => b.ev), 1)) * 100);
              return (
                <div key={bet.game_id || i} style={{ padding: 14, border: "1px solid rgba(34,197,94,0.2)", borderRadius: 8, background: "rgba(34,197,94,0.03)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, color: "#666", marginBottom: 2 }}>{bet.matchup} · {dateStr} {timeStr}</div>
                      <div style={{ fontWeight: "bold", fontSize: 14 }}>
                        {bet.bet_side}
                        <span style={{ marginLeft: 8, fontSize: 12, color: "#888", padding: "1px 6px", background: "#1a1a1a", borderRadius: 4 }}>
                          {bet.bet_label} {bet.spread > 0 ? "+" : ""}{bet.spread}
                        </span>
                      </div>
                      {/* EV bar */}
                      <div style={{ height: 3, background: "#1a1a1a", borderRadius: 2, marginTop: 8, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${evPct}%`, background: "linear-gradient(to right, #22c55e, #34d399)", borderRadius: 2 }} />
                      </div>
                      <div style={{ display: "flex", gap: 12, marginTop: 6, fontSize: 12, color: "#888" }}>
                        <span>Model <strong style={{ color: "#ccc" }}>{(bet.model_prob * 100).toFixed(1)}%</strong></span>
                        <span>Mkt <strong style={{ fontFamily: "monospace" }}>{(bet.implied_prob * 100).toFixed(1)}%</strong></span>
                        <span>Edge <strong style={{ color: bet.edge > 0 ? "#4ade80" : "#f87171" }}>{bet.edge > 0 ? "+" : ""}{(bet.edge * 100).toFixed(1)}%</strong></span>
                      </div>
                    </div>
                    <div style={{ textAlign: "right", marginLeft: 12 }}>
                      <div style={{ color: "#4ade80", fontWeight: "bold", fontFamily: "monospace", fontSize: 18 }}>+${bet.ev.toFixed(1)}</div>
                      <div style={{ fontSize: 11, color: "#666" }}>per $100</div>
                      <a
                        href={`https://www.google.com/search?q=${encodeURIComponent(bet.bookmaker + " NBA betting")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ display: "inline-block", marginTop: 6, padding: "4px 10px", border: "1px solid #333", borderRadius: 5, fontSize: 11, color: "#aaa", textDecoration: "none" }}
                      >
                        {bet.bookmaker} ↗
                      </a>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Single game card ─────────────────────────────────────────────────────

function GameCard({ game }: { game: Game }) {
  const gameDate = new Date(game.commenceTime);
  const now = new Date();
  const isFinished = gameDate < new Date(now.getTime() - 3.5 * 60 * 60 * 1000);
  const isLive = !isFinished && gameDate <= now;
  const hasOdds = game.bookmaker !== "Scheduled";
  const homeProb = parseFloat(game.winProbabilityHome);
  const awayProb = parseFloat(game.winProbabilityAway);
  const homeSpread = parseFloat(game.homeSpread);
  const awaySpread = parseFloat(game.awaySpread);

  const statusBadge = isFinished
    ? <span style={{ fontSize: 11, color: "#666", padding: "2px 8px", border: "1px solid #333", borderRadius: 20 }}>FINISHED</span>
    : isLive
    ? <span style={{ fontSize: 11, color: "#4ade80", padding: "2px 8px", border: "1px solid rgba(34,197,94,0.4)", borderRadius: 20, background: "rgba(34,197,94,0.1)" }}>LIVE NOW</span>
    : <span style={{ fontSize: 11, color: "#aaa", padding: "2px 8px", border: "1px solid #333", borderRadius: 20 }}>
        {gameDate.toLocaleDateString([], { month: "short", day: "numeric" })} · {gameDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </span>;

  return (
    <Link href={`/game/${game.id}`} style={{ textDecoration: "none", color: "inherit" }}>
      <div style={{ border: "1px solid #222", borderRadius: 12, padding: 16, background: "#0d0d0d", cursor: "pointer" }}>
        {/* Header row */}
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14, alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: 1 }}>NBA</div>
            <div style={{ fontSize: 11, color: "#444", marginTop: 2 }}>{hasOdds ? game.bookmaker : "Odds Pending"}</div>
          </div>
          {statusBadge}
        </div>

        {/* Teams */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "#111", borderRadius: 8 }}>
            <span style={{ fontWeight: "bold" }}>{game.homeTeam}</span>
            {hasOdds
              ? <span style={{ fontFamily: "monospace", fontWeight: "bold", color: homeSpread > 0 ? "#4ade80" : "#f87171", padding: "2px 8px", borderRadius: 4, background: homeSpread > 0 ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)" }}>
                  {homeSpread > 0 ? "+" : ""}{homeSpread}
                </span>
              : <span style={{ color: "#444", fontSize: 11 }}>TBD</span>}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "#111", borderRadius: 8 }}>
            <span style={{ fontWeight: "bold" }}>{game.awayTeam}</span>
            {hasOdds
              ? <span style={{ fontFamily: "monospace", fontWeight: "bold", color: awaySpread > 0 ? "#4ade80" : "#f87171", padding: "2px 8px", borderRadius: 4, background: awaySpread > 0 ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)" }}>
                  {awaySpread > 0 ? "+" : ""}{awaySpread}
                </span>
              : <span style={{ color: "#444", fontSize: 11 }}>TBD</span>}
          </div>
        </div>

        {/* Win probability bar */}
        {(homeProb !== 50 || awayProb !== 50) ? (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#666", marginBottom: 4 }}>
              <span>{game.homeTeam.split(" ").pop()} {homeProb.toFixed(1)}%</span>
              <span>{awayProb.toFixed(1)}% {game.awayTeam.split(" ").pop()}</span>
            </div>
            <div style={{ height: 6, background: "#1a1a1a", borderRadius: 3, overflow: "hidden", display: "flex" }}>
              <div style={{ width: `${homeProb}%`, height: "100%", background: "#e5e5e5", borderRadius: "3px 0 0 3px" }} />
              <div style={{ width: `${awayProb}%`, height: "100%", background: "#555", borderRadius: "0 3px 3px 0" }} />
            </div>
          </div>
        ) : (
          <div style={{ textAlign: "center", fontSize: 12, color: "#444", padding: "6px", border: "1px solid #1a1a1a", borderRadius: 6 }}>
            Odds open closer to tip-off
          </div>
        )}

        {/* Footer */}
        <div style={{ marginTop: 12, fontSize: 12, color: "#555", display: "flex", justifyContent: "space-between" }}>
          <span>View Deep Analysis</span>
          <span>→</span>
        </div>
      </div>
    </Link>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  async function fetchGames() {
    try {
      const res = await fetch("/api/games");
      if (!res.ok) throw new Error("Failed to fetch games");
      const data = await res.json();
      setGames(data);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { fetchGames(); }, []);

  const filteredGames = games.filter(game =>
    game.homeTeam.toLowerCase().includes(searchTerm.toLowerCase()) ||
    game.awayTeam.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <AppLayout>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h2 className="text-4xl font-display font-bold text-foreground">
          Market Intelligence
        </h2>
        <p style={{ color: "#888", marginTop: 8 }}>
          Real-time NBA odds and algorithmic win probabilities.
        </p>
      </div>

      {/* Search + Refresh */}
      <div style={{ display: "flex", gap: 10, marginBottom: 24 }}>
        <input
          type="text"
          placeholder="Search teams..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          data-testid="input-search"
          style={{ flex: 1, maxWidth: 280, padding: "8px 14px", borderRadius: 8, border: "1px solid #333", background: "#111", color: "#fff", fontSize: 14 }}
        />
        <button
          onClick={() => { setRefreshing(true); fetchGames(); }}
          disabled={refreshing}
          data-testid="button-refresh"
          style={{ padding: "8px 18px", borderRadius: 8, border: "1px solid #333", background: "#111", color: "#aaa", cursor: "pointer", fontSize: 14 }}
        >
          {refreshing ? "Syncing..." : "↻ Refresh"}
        </button>
      </div>

      {/* Best bets widget */}
      <BestBetsWidget />

      {/* Games grid */}
      {loading ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
          {[...Array(6)].map((_, i) => (
            <div key={i} style={{ height: 200, borderRadius: 12, background: "#111", border: "1px solid #1a1a1a" }} />
          ))}
        </div>
      ) : error ? (
        <div style={{ textAlign: "center", padding: "48px 32px", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 12, background: "rgba(239,68,68,0.05)" }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>⚠️</div>
          <h3 style={{ fontWeight: "bold", marginBottom: 8 }}>Failed to load games</h3>
          <p style={{ color: "#888", marginBottom: 16 }}>{error}</p>
          <button onClick={fetchGames} style={{ padding: "8px 20px", borderRadius: 6, background: "rgba(239,68,68,0.2)", color: "#f87171", border: "none", cursor: "pointer", fontWeight: "bold" }}>
            Retry
          </button>
        </div>
      ) : filteredGames.length === 0 ? (
        <div style={{ textAlign: "center", padding: "48px 32px", border: "1px solid #222", borderRadius: 12 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🔍</div>
          <h3 style={{ fontWeight: "bold", marginBottom: 8 }}>No Games Found</h3>
          <p style={{ color: "#888" }}>
            {searchTerm ? `No games matching "${searchTerm}".` : "No upcoming games available."}
          </p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
          {filteredGames.map(game => (
            <GameCard key={game.id} game={game} />
          ))}
        </div>
      )}
    </AppLayout>
  );
}
