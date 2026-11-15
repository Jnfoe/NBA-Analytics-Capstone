import { db } from "./db";
import {
  games,
  gamePredictions, gameResults,
  type InsertGame, type Game,
  type InsertGamePrediction, type GamePrediction,
  type InsertGameResult, type GameResult,
} from "@shared/schema";
import { eq, and, isNull, gte, lte, desc, asc, sql } from "drizzle-orm";

export interface IStorage {
  // Games — upcoming slate + upsert for odds sync
  getUpcomingGames(): Promise<Game[]>;
  getGame(id: number): Promise<Game | undefined>;
  getGameByExternalId(externalId: string): Promise<Game | undefined>;
  createGame(game: InsertGame): Promise<Game>;
  updateGameOdds(externalId: string, updates: Partial<InsertGame>): Promise<void>;
  updateGameProbabilities(externalId: string, homeProb: number, awayProb: number): Promise<void>;
  deleteGamesWithoutExternalId(sport: string): Promise<void>;
  // Predictions — saved after each ML run
  saveGamePredictions(predictions: InsertGamePrediction[]): Promise<void>;
  lockStartedPredictions(): Promise<number>;
  getGamePredictions(filters?: {
    sport?: string;
    team?: string;
    dateFrom?: Date;
    dateTo?: Date;
    page?: number;
    limit?: number;
  }): Promise<{ predictions: GamePrediction[]; total: number }>;
  // Results — synced from nba_api for performance tracking
  upsertGameResult(result: InsertGameResult): Promise<void>;
  getGameResultByGameId(gameId: string): Promise<GameResult | undefined>;
  // Model performance summary
  getModelPerformance(): Promise<ModelPerformance>;
}

export interface ModelPerformance {
  totalPredictions: number;
  predictionsWithResult: number;
  correctPredictions: number;
  accuracy: number;
  brierScore: number;
  avgEv: number;
  avgEdge: number;
  roi: number;
  byWeek: { week: string; accuracy: number; count: number; roi: number }[];
}

export class DatabaseStorage implements IStorage {
  // ─── Games ───────────────────────────────────────────────────────────────

  async getUpcomingGames(): Promise<Game[]> {
    // Show games that are live (started up to 4 hours ago) or starting in the next 30 hours.
    // This covers tonight's full slate without showing old finished games.
    const windowStart = new Date(Date.now() - 4 * 60 * 60 * 1000);
    const windowEnd = new Date(Date.now() + 30 * 60 * 60 * 1000);
    return await db
      .select()
      .from(games)
      .where(and(gte(games.commenceTime, windowStart), lte(games.commenceTime, windowEnd)))
      .orderBy(asc(games.commenceTime));
  }

  async updateGameProbabilities(externalId: string, homeProb: number, awayProb: number): Promise<void> {
    await db
      .update(games)
      .set({
        winProbabilityHome: homeProb.toFixed(1),
        winProbabilityAway: awayProb.toFixed(1),
      })
      .where(eq(games.externalId, externalId));
  }

  async getGame(id: number): Promise<Game | undefined> {
    const [game] = await db.select().from(games).where(eq(games.id, id));
    return game;
  }

  async getGameByExternalId(externalId: string): Promise<Game | undefined> {
    const [game] = await db.select().from(games).where(eq(games.externalId, externalId));
    return game;
  }

  async createGame(game: InsertGame): Promise<Game> {
    const [newGame] = await db.insert(games).values(game).returning();
    return newGame;
  }

  async updateGameOdds(externalId: string, updates: Partial<InsertGame>): Promise<void> {
    await db.update(games).set(updates).where(eq(games.externalId, externalId));
  }

  async deleteGamesWithoutExternalId(sport: string): Promise<void> {
    await db.delete(games).where(
      and(eq(games.sport, sport), isNull(games.externalId))
    );
  }

  // ─── Prediction history — game predictions ────────────────────────────────

  async saveGamePredictions(predictions: InsertGamePrediction[]): Promise<void> {
    if (!predictions.length) return;
    const now = new Date();

    // Fetch all game_ids that already have a LOCKED prediction — never overwrite those
    const lockedRows = await db
      .select({ gameId: gamePredictions.gameId })
      .from(gamePredictions)
      .where(eq(gamePredictions.locked, true));
    const lockedIds = new Set(lockedRows.map(r => r.gameId));

    // Also skip any prediction whose game has already started (even if not yet locked in DB)
    const toInsert = predictions.filter(p => {
      if (lockedIds.has(p.gameId)) return false;                     // already locked — skip
      if (p.commenceTime && p.commenceTime <= now) return false;     // game has started — skip
      return true;
    });

    if (!toInsert.length) return;
    await db.insert(gamePredictions).values(toInsert);
  }

  async lockStartedPredictions(): Promise<number> {
    const now = new Date();
    const result = await db
      .update(gamePredictions)
      .set({ locked: true })
      .where(and(
        eq(gamePredictions.locked, false),
        sql`${gamePredictions.commenceTime} <= ${now}`
      ))
      .returning({ id: gamePredictions.id });
    return result.length;
  }

  async getGamePredictions(filters: {
    sport?: string;
    team?: string;
    dateFrom?: Date;
    dateTo?: Date;
    page?: number;
    limit?: number;
  } = {}): Promise<{ predictions: GamePrediction[]; total: number }> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 25;
    const offset = (page - 1) * limit;

    const conditions: any[] = [];
    if (filters.sport) conditions.push(eq(gamePredictions.sport, filters.sport));
    if (filters.team) {
      conditions.push(
        sql`(${gamePredictions.homeTeam} ILIKE ${'%' + filters.team + '%'} OR ${gamePredictions.awayTeam} ILIKE ${'%' + filters.team + '%'})`
      );
    }
    if (filters.dateFrom) conditions.push(gte(gamePredictions.createdAt, filters.dateFrom));
    if (filters.dateTo) conditions.push(lte(gamePredictions.createdAt, filters.dateTo));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(gamePredictions)
      .where(whereClause);

    const rows = await db
      .select()
      .from(gamePredictions)
      .where(whereClause)
      .orderBy(desc(gamePredictions.createdAt))
      .limit(limit)
      .offset(offset);

    return { predictions: rows, total: countResult?.count ?? 0 };
  }

  // ─── Game results ─────────────────────────────────────────────────────────

  async upsertGameResult(result: InsertGameResult): Promise<void> {
    await db
      .insert(gameResults)
      .values(result)
      .onConflictDoUpdate({
        target: gameResults.gameId,
        set: {
          homeScore: result.homeScore,
          awayScore: result.awayScore,
          winningTeam: result.winningTeam,
          completedAt: result.completedAt,
          syncedAt: new Date(),
        },
      });
  }

  async getGameResultByGameId(gameId: string): Promise<GameResult | undefined> {
    const [result] = await db.select().from(gameResults).where(eq(gameResults.gameId, gameId));
    return result;
  }

  /**
   * Calculates comprehensive betting model performance metrics.
   * Computes: accuracy, Brier score, EV/edge averages, ROI, weekly breakdown.
   * @returns ModelPerformance object with accuracy and profit metrics
   */
  async getModelPerformance(): Promise<ModelPerformance> {
    const allPredictions = await db
      .select()
      .from(gamePredictions)
      .orderBy(desc(gamePredictions.createdAt));

    const allResults = await db.select().from(gameResults);
    const resultMap = new Map(allResults.map(r => [r.gameId, r]));

    let totalWithResult = 0;
    let correct = 0;
    let brierSum = 0;
    let brierCount = 0;
    let totalEv = 0;
    let totalEdge = 0;
    let totalProfit = 0;
    let totalBets = 0;

    const weeklyMap = new Map<string, { correct: number; total: number; profit: number }>();

    for (const pred of allPredictions) {
      const ev = parseFloat(pred.ev ?? "0");
      const edge = parseFloat(pred.edge ?? "0");
      totalEv += ev;
      totalEdge += edge;

      const result = resultMap.get(pred.gameId);

      if (result?.winningTeam) {
        totalWithResult++;

        const modelProb = parseFloat(pred.predictedValueSide === "home"
          ? (pred.modelHomeWinProb ?? "0.5")
          : (pred.modelAwayWinProb ?? "0.5"));

        const predictedTeam = pred.predictedValueSide === "home" ? pred.homeTeam : pred.awayTeam;
        const isCorrect = predictedTeam === result.winningTeam;

        if (isCorrect) correct++;

        const actualOutcome = isCorrect ? 1 : 0;
        brierSum += Math.pow(modelProb - actualOutcome, 2);
        brierCount++;

        const betOdds = pred.predictedValueSide === "home"
          ? parseInt(String(pred.sportsbookHomeOdds ?? "-110"))
          : parseInt(String(pred.sportsbookAwayOdds ?? "-110"));
        const payout = betOdds > 0 ? betOdds / 100 : 100 / Math.abs(betOdds);
        const profit = isCorrect ? payout * 100 : -100;
        totalProfit += profit;
        totalBets++;

        const weekKey = pred.createdAt
          ? getWeekKey(pred.createdAt)
          : "unknown";

        if (!weeklyMap.has(weekKey)) weeklyMap.set(weekKey, { correct: 0, total: 0, profit: 0 });
        const week = weeklyMap.get(weekKey)!;
        week.total++;
        week.profit += profit;
        if (isCorrect) week.correct++;
      }
    }

    const byWeek = Array.from(weeklyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([week, data]) => ({
        week,
        accuracy: data.total > 0 ? data.correct / data.total : 0,
        count: data.total,
        roi: data.total > 0 ? data.profit / (data.total * 100) : 0,
      }));

    return {
      totalPredictions: allPredictions.length,
      predictionsWithResult: totalWithResult,
      correctPredictions: correct,
      accuracy: totalWithResult > 0 ? correct / totalWithResult : 0,
      brierScore: brierCount > 0 ? brierSum / brierCount : 0,
      avgEv: allPredictions.length > 0 ? totalEv / allPredictions.length : 0,
      avgEdge: allPredictions.length > 0 ? totalEdge / allPredictions.length : 0,
      roi: totalBets > 0 ? totalProfit / (totalBets * 100) : 0,
      byWeek,
    };
  }
}

/**
 * Helper function to get the ISO date string of the Monday of a given date's week.
 * Used for weekly aggregation in performance metrics.
 * @param date - Date to get the week key for
 * @returns ISO date string (YYYY-MM-DD) of that week's Monday
 */
function getWeekKey(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  return monday.toISOString().slice(0, 10);
}

export const storage = new DatabaseStorage();
