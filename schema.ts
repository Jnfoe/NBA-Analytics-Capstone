import { pgTable, text, serial, numeric, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ─── Games ────────────────────────────────────────────────────────────────────
export const games = pgTable("games", {
  id: serial("id").primaryKey(),
  externalId: text("external_id"),
  homeTeam: text("home_team").notNull(),
  awayTeam: text("away_team").notNull(),
  commenceTime: timestamp("commence_time").notNull(),
  sport: text("sport").notNull(),
  bookmaker: text("bookmaker").notNull(),
  homeSpread: numeric("home_spread").notNull(),
  awaySpread: numeric("away_spread").notNull(),
  winProbabilityHome: numeric("win_probability_home").notNull(),
  winProbabilityAway: numeric("win_probability_away").notNull(),
  openingHomeOdds: numeric("opening_home_odds"),
  openingAwayOdds: numeric("opening_away_odds"),
  currentHomeOdds: numeric("current_home_odds"),
  currentAwayOdds: numeric("current_away_odds"),
  closingHomeOdds: numeric("closing_home_odds"),
  closingAwayOdds: numeric("closing_away_odds"),
});

export const insertGameSchema = createInsertSchema(games).omit({ id: true });
export type InsertGame = z.infer<typeof insertGameSchema>;
export type Game = typeof games.$inferSelect;

// ─── History: game predictions ────────────────────────────────────────────
// Saved whenever POST /api/analytics/run runs a successful ML prediction.
export const gamePredictions = pgTable("game_predictions", {
  id: serial("id").primaryKey(),
  gameId: text("game_id").notNull(),
  sport: text("sport").notNull().default("basketball_nba"),
  homeTeam: text("home_team").notNull(),
  awayTeam: text("away_team").notNull(),
  modelHomeWinProb: numeric("model_home_win_prob"),
  modelAwayWinProb: numeric("model_away_win_prob"),
  sportsbookHomeOdds: integer("sportsbook_home_odds"),
  sportsbookAwayOdds: integer("sportsbook_away_odds"),
  predictedValueSide: text("predicted_value_side"),
  ev: numeric("ev"),
  edge: numeric("edge"),
  kelly: numeric("kelly"),
  bookmaker: text("bookmaker"),
  commenceTime: timestamp("commence_time"),
  locked: boolean("locked").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertGamePredictionSchema = createInsertSchema(gamePredictions).omit({ id: true, createdAt: true });
export type InsertGamePrediction = z.infer<typeof insertGamePredictionSchema>;
export type GamePrediction = typeof gamePredictions.$inferSelect;

// ─── History: game results ────────────────────────────────────────────────
// Populated by the sync job from nba_api.
export const gameResults = pgTable("game_results", {
  id: serial("id").primaryKey(),
  gameId: text("game_id").notNull().unique(),
  homeTeam: text("home_team"),
  awayTeam: text("away_team"),
  homeScore: integer("home_score"),
  awayScore: integer("away_score"),
  winningTeam: text("winning_team"),
  completedAt: timestamp("completed_at"),
  syncedAt: timestamp("synced_at").defaultNow(),
});

export const insertGameResultSchema = createInsertSchema(gameResults).omit({ id: true, syncedAt: true });
export type InsertGameResult = z.infer<typeof insertGameResultSchema>;
export type GameResult = typeof gameResults.$inferSelect;
