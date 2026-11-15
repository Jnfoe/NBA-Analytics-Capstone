import "dotenv/config";
import axios from "axios";
import { storage } from "../storage";
import { type InsertGame } from "@shared/schema";

const API_KEY = process.env.THE_ODDS_API_KEY;
const BASE_URL = "https://api.the-odds-api.com/v4/sports";
const SPORT = "basketball_nba";

function americanToImplied(odds: number): number {
  if (odds > 0) return 100 / (odds + 100);
  return Math.abs(odds) / (Math.abs(odds) + 100);
}

function spreadToWinProb(spread: number): number {
  const prob = 0.5 - spread * 0.028;
  return Math.min(0.95, Math.max(0.05, prob));
}

// ─── Sync odds for a single sport ────────────────────────────────────────────

/**
 * Fetches live NBA odds from The Odds API and syncs to database.
 * Parses spreads, moneylines, converts to win probabilities.
 * @param sport - Sport identifier (e.g., "basketball_nba")
 * @returns Number of games synced
 */
async function syncSportOdds(sport: string): Promise<number> {
  let synced = 0;
  const now = new Date();

  try {
    const response = await axios.get(`${BASE_URL}/${sport}/odds`, {
      params: {
        apiKey: API_KEY,
        regions: "us",
        markets: "spreads,h2h",
        oddsFormat: "american",
      },
      timeout: 15_000,
    });

    const gamesData: any[] = response.data;
    console.log(`[odds] ${sport}: API returned ${gamesData.length} game(s) with odds`);

    for (const game of gamesData) {
      const externalId: string = game.id;
      const commenceTime = new Date(game.commence_time);
      const hasStarted = commenceTime <= now;

      const primaryBm = game.bookmakers?.[0];
      if (!primaryBm) {
        console.log(`[odds] Skipping ${externalId} — no bookmakers in payload`);
        continue;
      }

      // Spreads (optional — some books only publish moneyline early)
      const spreadMarket = primaryBm.markets?.find((m: any) => m.key === "spreads");
      const h2hMarket = primaryBm.markets?.find((m: any) => m.key === "h2h");

      const homeSpreadOutcome = spreadMarket?.outcomes?.find((o: any) => o.name === game.home_team);
      const awaySpreadOutcome = spreadMarket?.outcomes?.find((o: any) => o.name === game.away_team);

      // FIX: do NOT skip games with missing spreads — use 0 as placeholder
      const hSpread = homeSpreadOutcome ? parseFloat(homeSpreadOutcome.point) : 0;
      const aSpread = awaySpreadOutcome ? parseFloat(awaySpreadOutcome.point) : 0;
      const hasSpreads = Boolean(homeSpreadOutcome && awaySpreadOutcome);

      if (!hasSpreads) {
        console.log(`[odds] ${externalId} (${game.away_team} @ ${game.home_team}) — no spread market, using moneyline only`);
      }

      // Moneyline
      const homeMLOutcome = h2hMarket?.outcomes?.find((o: any) => o.name === game.home_team);
      const awayMLOutcome = h2hMarket?.outcomes?.find((o: any) => o.name === game.away_team);
      const homeML = homeMLOutcome ? homeMLOutcome.price : null;
      const awayML = awayMLOutcome ? awayMLOutcome.price : null;

      // Win probability — prefer ML, fall back to spread, fall back to 50/50
      let homeProb: number;
      let awayProb: number;
      if (homeML !== null && awayML !== null) {
        const rawHome = americanToImplied(homeML);
        const rawAway = americanToImplied(awayML);
        const total = rawHome + rawAway;
        homeProb = rawHome / total;
        awayProb = rawAway / total;
      } else if (hasSpreads) {
        homeProb = spreadToWinProb(hSpread);
        awayProb = 1 - homeProb;
      } else {
        homeProb = 0.5;
        awayProb = 0.5;
      }

      // ── Upsert ─────────────────────────────────────────────────────────────
      const existing = await storage.getGameByExternalId(externalId);

      if (!existing) {
        const gameInsert: InsertGame = {
          externalId,
          homeTeam: game.home_team,
          awayTeam: game.away_team,
          commenceTime,
          sport,
          bookmaker: primaryBm.title,
          homeSpread: hSpread.toString(),
          awaySpread: aSpread.toString(),
          winProbabilityHome: (homeProb * 100).toFixed(1),
          winProbabilityAway: (awayProb * 100).toFixed(1),
          openingHomeOdds: homeML !== null ? homeML.toString() : null,
          openingAwayOdds: awayML !== null ? awayML.toString() : null,
          currentHomeOdds: homeML !== null ? homeML.toString() : null,
          currentAwayOdds: awayML !== null ? awayML.toString() : null,
        };
        await storage.createGame(gameInsert);
        console.log(`[odds] Inserted new game: ${game.away_team} @ ${game.home_team} (${commenceTime.toISOString()})`);
      } else {
        // Always update — refreshes dates, odds, and spreads
        const updates: Partial<InsertGame> = {
          commenceTime,
          bookmaker: primaryBm.title,
          homeSpread: hSpread.toString(),
          awaySpread: aSpread.toString(),
          winProbabilityHome: (homeProb * 100).toFixed(1),
          winProbabilityAway: (awayProb * 100).toFixed(1),
          currentHomeOdds: homeML !== null ? homeML.toString() : existing.currentHomeOdds,
          currentAwayOdds: awayML !== null ? awayML.toString() : existing.currentAwayOdds,
        };

        if (hasStarted && !existing.closingHomeOdds) {
          updates.closingHomeOdds = homeML !== null ? homeML.toString() : existing.currentHomeOdds;
          updates.closingAwayOdds = awayML !== null ? awayML.toString() : existing.currentAwayOdds;
        }

        await storage.updateGameOdds(externalId, updates);
      }

      synced++;
    }
  } catch (err: any) {
    if (err.response?.status === 401 || err.response?.status === 422) {
      console.log(`[odds] ${sport}: quota or auth error (${err.response?.status}) — skipping`);
    } else {
      console.error(`[odds] ${sport}: unexpected error —`, err.message);
    }
    return synced;
  }

  return synced;
}

// ─── ESPN fallback: fetch DraftKings spreads with no API key ─────────────────
// ESPN's public scoreboard API returns the consensus spread from DraftKings.
/**
 * Fallback: Fetches ESPN odds when The Odds API is unavailable.
 * Updates only "Scheduled" games that don't yet have real odds.
 * This is used when The Odds API quota is exhausted.
 * @param sport - Sport identifier
 * @returns Number of games updated
 */
async function syncESPNOdds(sport: string): Promise<number> {
  let updated = 0;
  try {
    const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard`;
    const resp = await axios.get(url, { timeout: 15_000 });
    const events: any[] = resp.data?.events ?? [];

    console.log(`[espn] ${sport}: ${events.length} game(s) found`);

    // Load all upcoming DB games for matching by team name
    const dbGames = await storage.getUpcomingGames();

    for (const event of events) {
      const comp = event.competitions?.[0];
      if (!comp) continue;

      const competitors: any[] = comp.competitors ?? [];
      const homeComp = competitors.find((c: any) => c.homeAway === "home");
      const awayComp = competitors.find((c: any) => c.homeAway === "away");
      if (!homeComp || !awayComp) continue;

      const espnHome: string = homeComp.team?.displayName ?? "";
      const espnAway: string = awayComp.team?.displayName ?? "";

      const oddsArr: any[] = comp.odds ?? [];
      if (!oddsArr.length) {
        console.log(`[espn] No odds for ${espnHome} vs ${espnAway}`);
        continue;
      }
      const o = oddsArr[0];
      const rawSpread = o.spread;
      if (rawSpread == null) continue;

      // ESPN spread is from the home team's perspective:
      // negative = home team is favored, positive = away team is favored
      const homeSpread = Number(rawSpread);
      const awaySpread = -homeSpread;

      const homeProb = spreadToWinProb(homeSpread);
      const awayProb = 1 - homeProb;

      const provider: string = o.provider?.name ?? "ESPN";

      // Find matching game in DB — only update if still "Scheduled" (no real odds yet)
      const match = dbGames.find(
        (g) =>
          g.homeTeam.toLowerCase() === espnHome.toLowerCase() &&
          g.awayTeam.toLowerCase() === espnAway.toLowerCase() &&
          g.sport === sport &&
          g.bookmaker === "Scheduled"
      );

      if (!match) {
        // Either no DB match or game already has real odds — skip
        continue;
      }

      // Only update spread/bookmaker; ESPN doesn't provide moneylines.
      const updates: Partial<InsertGame> = {
        bookmaker: provider,
        homeSpread: homeSpread.toString(),
        awaySpread: awaySpread.toString(),
        // Only update win probability if ML hasn't already set a better value
        ...(Number(match.winProbabilityHome) === 50
          ? {
              winProbabilityHome: (homeProb * 100).toFixed(1),
              winProbabilityAway: (awayProb * 100).toFixed(1),
            }
          : {}),
      };

      await storage.updateGameOdds(match.externalId!, updates);
      console.log(
        `[espn] Updated ${espnHome} vs ${espnAway}: spread ${homeSpread > 0 ? "+" : ""}${homeSpread}/${awaySpread > 0 ? "+" : ""}${awaySpread} (${provider})`
      );
      updated++;
    }
  } catch (err: any) {
    console.error(`[espn] ${sport}: error —`, err.message);
  }

  return updated;
}

// ─── Fallback: fetch scheduled events (no odds required) ─────────────────────
/**
 * Fallback: Fetches scheduled upcoming games from The Odds API
 * before betting markets open. Inserts as placeholder records.
 * Uses /events endpoint which returns upcoming games even before markets open.
 * @param sport - Sport identifier
 * @returns Number of games inserted
 */
async function syncSportEvents(sport: string): Promise<number> {
  let inserted = 0;
  try {
    const response = await axios.get(`${BASE_URL}/${sport}/events`, {
      params: {
        apiKey: API_KEY,
        daysFrom: 7,
      },
      timeout: 10_000,
    });

    const events: any[] = response.data;
    console.log(`[events] ${sport}: API returned ${events.length} scheduled event(s)`);

    for (const ev of events) {
      const existing = await storage.getGameByExternalId(ev.id);
      if (existing) continue; // odds sync already handled it

      const commenceTime = new Date(ev.commence_time);

      // Insert as a placeholder game — odds will fill in on next odds sync
      const gameInsert: InsertGame = {
        externalId: ev.id,
        homeTeam: ev.home_team,
        awayTeam: ev.away_team,
        commenceTime,
        sport,
        bookmaker: "Scheduled",
        homeSpread: "0",
        awaySpread: "0",
        winProbabilityHome: "50.0",
        winProbabilityAway: "50.0",
        openingHomeOdds: null,
        openingAwayOdds: null,
        currentHomeOdds: null,
        currentAwayOdds: null,
      };

      await storage.createGame(gameInsert);
      console.log(`[events] Inserted scheduled game: ${ev.away_team} @ ${ev.home_team} (${commenceTime.toISOString()})`);
      inserted++;
    }
  } catch (err: any) {
    if (err.response?.status === 401 || err.response?.status === 422) {
      console.log(`[events] ${sport}: quota or auth error (${err.response?.status}) — skipping fallback`);
    } else {
      console.error(`[events] ${sport}: fallback error —`, err.message);
    }
  }

  return inserted;
}

/**
 * Main entry point for odds syncing. Orchestrates odds sync, ESPN fallback,
 * and scheduled event insertion. Runs every 60 seconds.
 */
export async function fetchAndSyncOdds() {
  if (!API_KEY || API_KEY === "your_api_key_here") {
    console.log("[odds] API key not set — skipping sync.");
    return;
  }

  console.log(`[odds] Starting NBA sync`);

  // One-time cleanup of any legacy rows without an externalId
  await storage.deleteGamesWithoutExternalId(SPORT).catch(() => {});

  const totalOdds = await syncSportOdds(SPORT);

  // Fallback: fetch schedule for games not yet in the odds feed
  const totalEvents = await syncSportEvents(SPORT);

  // ESPN fallback: populate spreads for any still-"Scheduled" games
  const totalESPN = await syncESPNOdds(SPORT);

  console.log(
    `[odds] Sync complete — ${totalOdds} odds updated, ${totalEvents} new scheduled games inserted, ${totalESPN} ESPN spreads applied.`
  );
}

/**
 * Starts a live odds sync loop that continuously updates game odds.
 * Runs fetchAndSyncOdds() immediately and then every 30 minutes.
 */
export function startLiveSync() {
  fetchAndSyncOdds();
  setInterval(fetchAndSyncOdds, 30 * 60 * 1000);
}
