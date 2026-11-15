"""
Feature Engineering
===================
Builds predictive features from historical game data.
Features include:
  - Team win rate (home / away / overall)
  - Average point differential
  - Recent form (last N games)
  - Home-court advantage proxy
  - Elo rating (running estimation)
"""

import pandas as pd
import numpy as np


def compute_team_stats(df: pd.DataFrame) -> dict:
    """
    Compute per-team statistics from historical game results.
    Returns a dict keyed by team name with stat sub-dicts.
    """
    teams = set(df["home_team"]) | set(df["away_team"])
    stats = {}

    for team in teams:
        home_games = df[df["home_team"] == team].copy()
        away_games = df[df["away_team"] == team].copy()

        home_wins = home_games["home_win"].sum()
        away_wins = (1 - away_games["home_win"]).sum()
        total_games = len(home_games) + len(away_games)
        total_wins = home_wins + away_wins

        home_diff = home_games["point_diff"].mean() if len(home_games) > 0 else 0
        away_diff = (-away_games["point_diff"]).mean() if len(away_games) > 0 else 0

        # Combine home and away games sorted by time for recent form
        all_games = []
        for _, row in home_games.iterrows():
            all_games.append({
                "time": row["commence_time"],
                "win": row["home_win"],
                "diff": row["point_diff"],
                "is_home": True,
            })
        for _, row in away_games.iterrows():
            all_games.append({
                "time": row["commence_time"],
                "win": 1 - row["home_win"],
                "diff": -row["point_diff"],
                "is_home": False,
            })

        all_games.sort(key=lambda x: x["time"])
        last5 = all_games[-5:] if len(all_games) >= 5 else all_games
        recent_win_rate = np.mean([g["win"] for g in last5]) if last5 else 0.5
        recent_avg_diff = np.mean([g["diff"] for g in last5]) if last5 else 0

        stats[team] = {
            "total_games": total_games,
            "win_rate": total_wins / total_games if total_games > 0 else 0.5,
            "home_win_rate": home_wins / len(home_games) if len(home_games) > 0 else 0.5,
            "away_win_rate": away_wins / len(away_games) if len(away_games) > 0 else 0.5,
            "avg_point_diff": (home_diff + away_diff) / 2,
            "home_avg_diff": home_diff,
            "away_avg_diff": away_diff,
            "recent_win_rate": recent_win_rate,
            "recent_avg_diff": recent_avg_diff,
        }

    return stats


def compute_elo_ratings(df: pd.DataFrame, k: int = 20, base_elo: int = 1500) -> dict:
    """
    Compute Elo ratings for each team using historical results.
    K=20 is standard for sports Elo systems.
    """
    elo = {}

    # Sort by time to process games chronologically
    df_sorted = df.sort_values("commence_time")

    for _, row in df_sorted.iterrows():
        home = row["home_team"]
        away = row["away_team"]
        home_won = bool(row["home_win"])

        # Initialize Elo if not seen before
        elo.setdefault(home, base_elo)
        elo.setdefault(away, base_elo)

        r_home = elo[home]
        r_away = elo[away]

        # Expected win probability via Elo formula
        exp_home = 1 / (1 + 10 ** ((r_away - r_home) / 400))
        exp_away = 1 - exp_home

        # Update
        elo[home] += k * ((1 if home_won else 0) - exp_home)
        elo[away] += k * ((0 if home_won else 1) - exp_away)

    return elo


def build_training_features(df: pd.DataFrame, team_stats: dict, elo: dict) -> pd.DataFrame:
    """
    Build feature matrix from historical games for ML training.
    Each row represents a game with home/away team features and target (home_win).
    """
    rows = []
    for _, row in df.iterrows():
        home = row["home_team"]
        away = row["away_team"]

        hs = team_stats.get(home, {})
        as_ = team_stats.get(away, {})
        h_elo = elo.get(home, 1500)
        a_elo = elo.get(away, 1500)

        rows.append({
            # Home team features
            "home_win_rate": hs.get("win_rate", 0.5),
            "home_home_win_rate": hs.get("home_win_rate", 0.5),
            "home_avg_diff": hs.get("avg_point_diff", 0),
            "home_recent_win_rate": hs.get("recent_win_rate", 0.5),
            "home_recent_diff": hs.get("recent_avg_diff", 0),
            "home_elo": h_elo,

            # Away team features
            "away_win_rate": as_.get("win_rate", 0.5),
            "away_away_win_rate": as_.get("away_win_rate", 0.5),
            "away_avg_diff": as_.get("avg_point_diff", 0),
            "away_recent_win_rate": as_.get("recent_win_rate", 0.5),
            "away_recent_diff": as_.get("recent_avg_diff", 0),
            "away_elo": a_elo,

            # Differential features (home minus away)
            "elo_diff": h_elo - a_elo,
            "win_rate_diff": hs.get("win_rate", 0.5) - as_.get("win_rate", 0.5),
            "diff_diff": hs.get("avg_point_diff", 0) - as_.get("avg_point_diff", 0),
            "recent_diff_diff": hs.get("recent_avg_diff", 0) - as_.get("recent_avg_diff", 0),

            # Target
            "home_win": row["home_win"],
        })

    return pd.DataFrame(rows)


def build_prediction_features(odds_df: pd.DataFrame, team_stats: dict, elo: dict) -> pd.DataFrame:
    """
    Build feature matrix for upcoming games (no target label).
    """
    rows = []
    for _, row in odds_df.iterrows():
        home = row["home_team"]
        away = row["away_team"]

        hs = team_stats.get(home, {})
        as_ = team_stats.get(away, {})
        h_elo = elo.get(home, 1500)
        a_elo = elo.get(away, 1500)

        rows.append({
            "game_id": row["game_id"],
            "home_team": home,
            "away_team": away,
            "commence_time": row["commence_time"],
            "bookmaker": row["bookmaker"],
            "home_spread": row["home_spread"],
            "away_spread": row["away_spread"],
            "implied_prob_home": row["implied_prob_home"],
            "implied_prob_away": row["implied_prob_away"],
            "home_moneyline": row.get("home_moneyline"),
            "away_moneyline": row.get("away_moneyline"),

            # Features
            "home_win_rate": hs.get("win_rate", 0.5),
            "home_home_win_rate": hs.get("home_win_rate", 0.5),
            "home_avg_diff": hs.get("avg_point_diff", 0),
            "home_recent_win_rate": hs.get("recent_win_rate", 0.5),
            "home_recent_diff": hs.get("recent_avg_diff", 0),
            "home_elo": h_elo,

            "away_win_rate": as_.get("win_rate", 0.5),
            "away_away_win_rate": as_.get("away_win_rate", 0.5),
            "away_avg_diff": as_.get("avg_point_diff", 0),
            "away_recent_win_rate": as_.get("recent_win_rate", 0.5),
            "away_recent_diff": as_.get("recent_avg_diff", 0),
            "away_elo": a_elo,

            "elo_diff": h_elo - a_elo,
            "win_rate_diff": hs.get("win_rate", 0.5) - as_.get("win_rate", 0.5),
            "diff_diff": hs.get("avg_point_diff", 0) - as_.get("avg_point_diff", 0),
            "recent_diff_diff": hs.get("recent_avg_diff", 0) - as_.get("recent_avg_diff", 0),
        })

    return pd.DataFrame(rows)
