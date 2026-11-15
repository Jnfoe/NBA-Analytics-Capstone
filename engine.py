"""
Sports Betting Analytics Engine
================================
Main orchestrator. Clean separation of data sources:

  Training data  →  nba_api (completed historical NBA games)
  Betting data   →  The Odds API (live/upcoming spreads & moneylines)

Pipeline:
  1. Load upcoming/live games from The Odds API (or DB fallback)
  2. Load historical NBA game results from nba_api
  3. Build team stats and Elo ratings from nba_api data
  4. Train or load the ML model
  5. Predict win probabilities for upcoming games
  6. Compute EV and Kelly sizing for each game
  7. Generate charts (feature importance, model accuracy)
  8. Output JSON results for the Express API

Usage:
  python analytics/engine.py [sport]

Optional:
  python analytics/engine.py basketball_nba train
  -> forces retraining and saves a new model
"""

import sys
import json
import os
import traceback
import numpy as np
import pandas as pd

from data_loader import fetch_live_odds, fetch_upcoming_games_from_db, fetch_nba_game_log
from feature_engineering import (
    compute_team_stats, compute_elo_ratings,
    build_training_features, build_prediction_features,
)
from model import train_model, predict, load_model, save_model
from ev_calculator import analyze_bets
from visualizer import chart_feature_importance, chart_model_accuracy

np.random.seed(42)

MODEL_PATH = "models/nba_model.pkl"


def safe_record(row):
    rec = {}
    for k, v in row.items():
        if isinstance(v, (np.integer,)):
            rec[k] = int(v)
        elif isinstance(v, (np.floating,)):
            rec[k] = float(v)
        elif isinstance(v, (np.bool_,)):
            rec[k] = bool(v)
        elif pd.isna(v) if not isinstance(v, (list, dict)) else False:
            rec[k] = None
        else:
            rec[k] = v
    return rec


def run(sport: str = "basketball_nba", force_train: bool = False) -> dict:
    result = {
        "sport": sport,
        "model_metrics": {},
        "feature_importance": {},
        "bets": [],
        "positive_ev_bets": [],
        "charts": [],
        "training_samples": 0,
        "upcoming_games": 0,
        "error": None,
    }

    try:
        # =====================================================================
        # SECTION 1: DATA LOADING
        # =====================================================================
        print(f"\n[1/6] Loading data for sport: {sport}")

        # --- Betting markets: The Odds API (DB fallback if quota exhausted) ---
        live_odds_df = fetch_live_odds(sport)
        if live_odds_df.empty:
            print("  Odds API unavailable — falling back to DB for upcoming games...")
            live_odds_df = fetch_upcoming_games_from_db(sport)

        # --- Training data: nba_api historical game results (always) ---
        print("  Fetching historical NBA game results from nba_api...")
        scores_df = fetch_nba_game_log(season="2025-26")

        print(f"  Upcoming games (Odds API / DB): {len(live_odds_df)}")
        print(f"  Historical games (nba_api):     {len(scores_df)}")
        result["upcoming_games"] = len(live_odds_df)
        result["training_samples"] = len(scores_df)

        if live_odds_df.empty:
            result["error"] = "No upcoming games found in Odds API or database."
            return result

        # Detect whether we have real bookmaker odds or are running in Elo-only mode.
        # "Scheduled" bookmaker entries come from the ESPN fallback and carry no moneylines.
        has_real_odds = (
            live_odds_df["bookmaker"].ne("Scheduled").any()
            or live_odds_df["home_moneyline"].notna().any()
        )
        no_live_odds = not has_real_odds
        result["no_live_odds"] = no_live_odds
        if no_live_odds:
            print("  No live odds available — running in Elo-only prediction mode.")
            print("  EV and Kelly analysis will be skipped.")

        # =====================================================================
        # SECTION 2: FEATURE ENGINEERING
        # =====================================================================
        print("\n[2/6] Engineering features...")

        if not scores_df.empty:
            team_stats = compute_team_stats(scores_df)
            elo = compute_elo_ratings(scores_df)
        else:
            print("  WARNING: No historical data — using neutral team stats.")
            all_teams = set(live_odds_df["home_team"]) | set(live_odds_df["away_team"])
            team_stats = {t: {} for t in all_teams}
            elo = {t: 1500 for t in all_teams}

        # =====================================================================
        # SECTION 3: MODEL LOAD / TRAIN
        # =====================================================================
        print("\n[3/6] Loading or training ML model...")

        pipeline = None
        feature_importance = {}
        metrics = {}

        model_exists = os.path.exists(MODEL_PATH)

        if force_train:
            print("  Force-train enabled — training new model...")
            if not scores_df.empty and len(scores_df) >= 10:
                train_df = build_training_features(scores_df, team_stats, elo)
                pipeline, feature_importance, metrics = train_model(train_df)
                save_model(pipeline, feature_importance, metrics, path=MODEL_PATH)
                result["training_samples"] = len(train_df)
            else:
                print("  Not enough historical data for training. Using Elo fallback.")
                result["model_metrics"] = {
                    "model_name": "Elo Rating (fallback)",
                    "training_samples": 0,
                    "note": "Need 10+ completed games for ML model. Using Elo ratings instead."
                }

        elif model_exists:
            print(f"  Loading saved model from {MODEL_PATH}...")
            pipeline, feature_importance, metrics, _ = load_model(MODEL_PATH)

        else:
            print("  No saved model found.")
            if not scores_df.empty and len(scores_df) >= 10:
                print("  Training new model and saving it...")
                train_df = build_training_features(scores_df, team_stats, elo)
                pipeline, feature_importance, metrics = train_model(train_df)
                save_model(pipeline, feature_importance, metrics, path=MODEL_PATH)
                result["training_samples"] = len(train_df)
            else:
                print("  Not enough historical data for training. Using Elo fallback.")
                result["model_metrics"] = {
                    "model_name": "Elo Rating (fallback)",
                    "training_samples": 0,
                    "note": "Need 10+ completed games for ML model. Using Elo ratings instead."
                }

        if metrics:
            result["model_metrics"] = metrics
        if feature_importance:
            result["feature_importance"] = feature_importance

        # =====================================================================
        # SECTION 4: PREDICTION + EV
        # =====================================================================
        print("\n[4/6] Predicting win probabilities and computing EV...")

        pred_df = build_prediction_features(live_odds_df, team_stats, elo)
        model_probs = predict(pipeline, pred_df)

        if no_live_odds:
            # Elo-only mode: skip EV/Kelly — no bookmaker odds to compare against.
            # Build a minimal bets record with just win probabilities.
            bets_rows = []
            for i, (_, row) in enumerate(pred_df.iterrows()):
                model_prob_home = float(model_probs[i])
                model_prob_away = 1.0 - model_prob_home
                elo_home = float(row.get("home_elo", 1500))
                elo_away = float(row.get("away_elo", 1500))
                # Pure Elo-based probability (for reference alongside ML probability)
                elo_prob_home = round(1 / (1 + 10 ** ((elo_away - elo_home) / 400)), 4)
                bets_rows.append({
                    "game_id":          row.get("game_id", ""),
                    "home_team":        row["home_team"],
                    "away_team":        row["away_team"],
                    "commence_time":    row["commence_time"],
                    "bookmaker":        row.get("bookmaker", "Scheduled"),
                    "home_spread":      row.get("home_spread"),
                    "away_spread":      row.get("away_spread"),
                    "home_moneyline":   None,
                    "away_moneyline":   None,
                    "model_prob_home":  round(model_prob_home, 4),
                    "model_prob_away":  round(model_prob_away, 4),
                    "elo_prob_home":    elo_prob_home,
                    "elo_prob_away":    round(1 - elo_prob_home, 4),
                    "implied_prob_home": 0.5,
                    "implied_prob_away": 0.5,
                    # EV fields omitted — no live odds
                    "ev_home":          None,
                    "ev_away":          None,
                    "edge_home":        None,
                    "edge_away":        None,
                    "kelly_home":       None,
                    "kelly_away":       None,
                    "suggestion":       "No live odds — Elo prediction only",
                    "is_positive_ev_home": False,
                    "is_positive_ev_away": False,
                })
            bets_df = pd.DataFrame(bets_rows)
            pos_ev = pd.DataFrame()
            print(f"  Win probability predictions generated: {len(bets_df)}")
            print("  EV/Kelly skipped (no live odds).")
        else:
            bets_df = analyze_bets(pred_df, model_probs)
            pos_ev = bets_df[
                bets_df["is_positive_ev_home"] | bets_df["is_positive_ev_away"]
            ]
            print(f"  Positive EV bets found: {len(pos_ev)}")

        result["bets"] = [safe_record(r) for _, r in bets_df.iterrows()]
        result["positive_ev_bets"] = [safe_record(r) for _, r in pos_ev.iterrows()]

        # =====================================================================
        # SECTION 5: VISUALIZATIONS
        # =====================================================================
        print("\n[5/5] Generating charts...")

        charts = []

        if feature_importance:
            c = chart_feature_importance(feature_importance, metrics.get("model_name", "Model"))
            if c:
                charts.append(c)

        if metrics:
            c = chart_model_accuracy(metrics)
            if c:
                charts.append(c)

        result["charts"] = [c for c in charts if c]
        print(f"  Charts generated: {len(result['charts'])}")

    except Exception as e:
        result["error"] = str(e)
        traceback.print_exc()

    return result


if __name__ == "__main__":
    sport = sys.argv[1] if len(sys.argv) > 1 else "basketball_nba"
    force_train = len(sys.argv) > 2 and sys.argv[2].lower() == "train"

    output = run(sport, force_train=force_train)
    print("\n=== JSON OUTPUT ===")
    print(json.dumps(output, default=str))
