import type { Express } from "express";
import type { Server } from "http";
import path from "path";
import expressModule from "express";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { startLiveSync } from "./lib/odds-api";
import { runAnalyticsEngine, runSyncResults } from "./lib/python-runner";

/**
 * Transforms ML analytics betting results into database prediction records.
 * Extracts positive EV bets and converts odds formats for storage.
 * @param result - Raw ML engine output containing positive_ev_bets array
 * @param sport - Sport identifier (e.g., "basketball_nba")
 * @returns Array of GamePrediction records ready for database insert
 */
function extractGamePredictions(result: any, sport: string) {
  const preds: any[] = [];
  if (!result?.positive_ev_bets?.length) return preds;

  for (const bet of result.positive_ev_bets) {
    const bestSide = bet.is_positive_ev_home
      ? "home"
      : bet.is_positive_ev_away
      ? "away"
      : null;

    preds.push({
      gameId: bet.game_id,
      sport,
      homeTeam: bet.home_team,
      awayTeam: bet.away_team,
      modelHomeWinProb: String(bet.model_prob_home ?? 0),
      modelAwayWinProb: String(bet.model_prob_away ?? 0),
      sportsbookHomeOdds: Math.round(bet.implied_prob_home
        ? -10000 / (bet.implied_prob_home * 100 - 100)
        : -110),
      sportsbookAwayOdds: Math.round(bet.implied_prob_away
        ? -10000 / (bet.implied_prob_away * 100 - 100)
        : -110),
      predictedValueSide: bestSide,
      ev: String(bestSide === "home" ? (bet.ev_home ?? 0) : (bet.ev_away ?? 0)),
      edge: String(bestSide === "home" ? (bet.edge_home ?? 0) : (bet.edge_away ?? 0)),
      kelly: String(bestSide === "home" ? (bet.kelly_home ?? 0) : (bet.kelly_away ?? 0)),
      bookmaker: bet.bookmaker ?? null,
      commenceTime: bet.commence_time ? new Date(bet.commence_time) : null,
    });
  }
  return preds;
}

/**
 * Updates win probabilities in the database for games based on ML model output.
 * Called after each analytics run to persist model predictions.
 * @param result - ML engine output containing bets with model probabilities
 */
async function writeMLProbsToGames(result: any): Promise<void> {
  const bets: any[] = result?.bets ?? [];
  for (const bet of bets) {
    if (!bet.game_id || bet.model_prob_home == null) continue;
    const homeProb = parseFloat(bet.model_prob_home) * 100;
    const awayProb = parseFloat(bet.model_prob_away ?? (1 - bet.model_prob_home)) * 100;
    await storage.updateGameProbabilities(bet.game_id, homeProb, awayProb);
  }
  if (bets.length > 0) console.log(`[ml] Updated probabilities for ${bets.length} game(s).`);
}

/**
 * Registers all API routes and background jobs.
 * Sets up: game list/detail endpoints, analytics endpoints, result syncing,
 * auto-analytics scheduling, and prediction locking for started games.
 * @param httpServer - HTTP server instance
 * @param app - Express application
 * @returns The HTTP server
 */
export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  const chartsDir = path.join(process.cwd(), "analytics", "charts");
  app.use("/analytics-charts", expressModule.static(chartsDir));

  startLiveSync();

  app.get(api.games.list.path, async (req, res) => {
    const gamesList = await storage.getUpcomingGames();
    res.json(gamesList);
  });

  app.get(api.games.get.path, async (req, res) => {
    const gameId = Number(req.params.id);
    const game = await storage.getGame(gameId);
    if (!game) return res.status(404).json({ message: "Game not found" });
    res.json(game);
  });

  let analyticsCache: { sport: string; result: any; ts: number } | null = null;
  const CACHE_TTL_MS = 10 * 60 * 1000;

  app.post("/api/analytics/run", async (req, res) => {
    const sport = req.body?.sport || "basketball_nba";
    const now = Date.now();

    if (analyticsCache && analyticsCache.sport === sport && now - analyticsCache.ts < CACHE_TTL_MS) {
      return res.json({ ...analyticsCache.result, cached: true });
    }

    try {
      const result = await runAnalyticsEngine(sport);
      analyticsCache = { sport, result, ts: now };

      const preds = extractGamePredictions(result, sport);
      if (preds.length > 0) {
        storage.saveGamePredictions(preds).catch(err =>
          console.error("Failed to save game predictions:", err.message)
        );
      }

      writeMLProbsToGames(result).catch(err =>
        console.error("Failed to update game probabilities:", err.message)
      );

      return res.json({ ...result, cached: false });
    } catch (err: any) {
      console.error("Analytics engine error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/analytics/cached", (req, res) => {
    if (!analyticsCache) {
      return res.status(404).json({ error: "No analytics run yet. POST /api/analytics/run first." });
    }
    return res.json({ ...analyticsCache.result, cached: true });
  });

  app.get("/api/analytics/best-bets", (req, res) => {
    const limit = parseInt(String(req.query.limit ?? "6"), 10);

    const teamBets: any[] = [];
    if (analyticsCache?.result?.positive_ev_bets?.length) {
      for (const bet of analyticsCache.result.positive_ev_bets) {
        if (bet.is_positive_ev_home) {
          teamBets.push({
            game_id: bet.game_id,
            matchup: `${bet.away_team} @ ${bet.home_team}`,
            bet_side: bet.home_team,
            bet_label: "Home",
            ev: bet.ev_home,
            edge: bet.edge_home,
            kelly: bet.kelly_home,
            model_prob: bet.model_prob_home,
            implied_prob: bet.implied_prob_home,
            spread: bet.home_spread,
            bookmaker: bet.bookmaker,
            commence_time: bet.commence_time,
          });
        }
        if (bet.is_positive_ev_away) {
          teamBets.push({
            game_id: bet.game_id + "_away",
            matchup: `${bet.away_team} @ ${bet.home_team}`,
            bet_side: bet.away_team,
            bet_label: "Away",
            ev: bet.ev_away,
            edge: bet.edge_away,
            kelly: bet.kelly_away,
            model_prob: bet.model_prob_away,
            implied_prob: bet.implied_prob_away,
            spread: bet.away_spread,
            bookmaker: bet.bookmaker,
            commence_time: bet.commence_time,
          });
        }
      }
    }
    teamBets.sort((a, b) => b.ev - a.ev);

    return res.json({
      team_bets: teamBets.slice(0, limit),
      has_team_data: !!analyticsCache,
      team_total: teamBets.length,
    });
  });

  let lastSyncAt: Date | null = null;

  /**
   * Syncs completed NBA game results from nba_api and stores them in the database
   * for performance tracking. Runs: immediately (10s delay), then every 4 hours.
   */
  async function syncResults() {
    try {
      console.log("[history] Syncing game results from nba_api...");
      const results = await runSyncResults();
      let upserted = 0;
      for (const r of results) {
        await storage.upsertGameResult({
          gameId: r.game_id,
          homeTeam: r.home_team,
          awayTeam: r.away_team,
          homeScore: r.home_score,
          awayScore: r.away_score,
          winningTeam: r.winning_team,
          completedAt: r.completed_at ? new Date(r.completed_at) : null,
        });
        upserted++;
      }
      lastSyncAt = new Date();
      console.log(`[history] Synced ${upserted} game results.`);
      return upserted;
    } catch (err: any) {
      console.error("[history] Sync failed:", err.message);
      throw err;
    }
  }

  setTimeout(() => syncResults().catch(() => {}), 10_000);
  setInterval(() => syncResults().catch(() => {}), 4 * 60 * 60 * 1000);

  /**
   * Periodically runs ML analytics engine on upcoming games.
   * Caches results, saves predictions, and updates win probabilities.
   * Runs: after 45s delay, then every 12 hours.
   */
  async function autoRunAnalytics() {
    const sport = "basketball_nba";
    try {
      console.log(`[ml] Auto-running analytics for ${sport}...`);
      const result = await runAnalyticsEngine(sport);
      analyticsCache = { sport, result, ts: Date.now() };

      const preds = extractGamePredictions(result, sport);
      if (preds.length > 0) {
        await storage.saveGamePredictions(preds).catch(() => {});
      }
      await writeMLProbsToGames(result).catch(() => {});
      console.log(`[ml] Auto-analytics complete: ${result.upcoming_games ?? 0} game(s) analyzed.`);
    } catch (err: any) {
      console.log(`[ml] Auto-analytics skipped: ${err.message}`);
    }
  }
  setTimeout(() => autoRunAnalytics(), 45_000);
  setInterval(() => autoRunAnalytics(), 12 * 60 * 60 * 1000);

  /**
   * Locks predictions for games that have already started
   * to prevent mid-game prediction changes.
   * Runs: after 5s delay, then every 5 minutes.
   */
  async function lockStartedPredictions() {
    try {
      const count = await storage.lockStartedPredictions();
      if (count > 0) console.log(`[history] Locked ${count} predictions for games that have started.`);
    } catch (err: any) {
      console.error("[history] Lock job failed:", err.message);
    }
  }
  setTimeout(() => lockStartedPredictions(), 5_000);
  setInterval(() => lockStartedPredictions(), 5 * 60 * 1000);

  return httpServer;
}
