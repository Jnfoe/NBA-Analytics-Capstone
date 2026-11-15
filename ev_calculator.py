"""
Expected Value (EV) Calculator
================================
Identifies positive expected value bets by comparing:
  - Model's predicted win probability
  - Sportsbook's implied probability (adjusted for vig)

Also computes Kelly Criterion bet sizing for each game.
"""

import pandas as pd
import numpy as np


def compute_ev(model_prob: float, implied_prob: float, moneyline: float) -> dict:
    """
    Compute expected value of a bet.

    EV = (model_prob * potential_profit) - ((1 - model_prob) * stake)
    Expressed as EV per $100 stake.

    Positive EV means the model believes the bet is underpriced.
    """
    # Payout per $1 stake
    if moneyline is not None:
        if moneyline > 0:
            payout = moneyline / 100  # e.g. +150 => 1.5x profit per $1
        else:
            payout = 100 / abs(moneyline)  # e.g. -200 => 0.5x profit per $1
    else:
        # Derive payout from implied probability when no moneyline is available
        if implied_prob > 0:
            payout = (1 - implied_prob) / implied_prob
        else:
            payout = 0

    ev_per_dollar = (model_prob * payout) - (1 - model_prob)
    ev_per_100 = ev_per_dollar * 100
    edge = model_prob - implied_prob  # Positive = model sees more value than the book

    return {
        "ev_per_100": round(ev_per_100, 2),
        "edge": round(edge, 4),
        "payout": round(payout, 4),
        "is_positive_ev": ev_per_100 > 0,
    }


def kelly_criterion(model_prob: float, payout: float, fraction: float = 0.25) -> float:
    """
    Kelly Criterion bet sizing.

    The Kelly formula finds the fraction of your bankroll that maximizes
    expected logarithmic growth (i.e. long-run wealth) given an edge.

    Full Kelly formula:
        f* = (b * p - q) / b
      where:
        b = net payout per $1 stake  (e.g. 0.9 for -110 odds)
        p = model's win probability
        q = model's loss probability = 1 - p

    We use FRACTIONAL Kelly (default 25%) because:
      - Full Kelly is mathematically optimal but highly volatile in practice
      - Fractional Kelly reduces bet size and drawdown risk
      - 25% is a common conservative choice for sports betting models

    Returns:
        A float between 0 and 1 representing the fraction of bankroll to wager.
        E.g. 0.04 means "bet 4% of your current bankroll on this game."
    """
    q = 1 - model_prob          # probability of losing
    full_kelly = (payout * model_prob - q) / payout  # optimal fraction per Kelly formula
    fractional_kelly = max(0, full_kelly * fraction)  # apply fraction; floor at 0 (never bet negative)
    return round(fractional_kelly, 4)


def analyze_bets(pred_df: pd.DataFrame, model_probs: np.ndarray) -> pd.DataFrame:
    """
    Analyze all upcoming games for betting value.
    Returns a DataFrame with EV, Kelly size, and recommendation for each game.
    """
    results = []

    for i, (_, row) in enumerate(pred_df.iterrows()):
        model_prob_home = float(model_probs[i])
        model_prob_away = 1 - model_prob_home
        impl_home = float(row["implied_prob_home"])
        impl_away = float(row["implied_prob_away"])
        home_ml = row.get("home_moneyline")
        away_ml = row.get("away_moneyline")

        # EV for home and away bets
        ev_home = compute_ev(model_prob_home, impl_home, home_ml)
        ev_away = compute_ev(model_prob_away, impl_away, away_ml)

        # Kelly sizing: what fraction of bankroll to bet on each side.
        # Uses the payout computed from the moneyline (or implied odds).
        kelly_home = kelly_criterion(model_prob_home, ev_home["payout"])
        kelly_away = kelly_criterion(model_prob_away, ev_away["payout"])

        # Determine the suggested bet based on which side has positive EV
        suggestion = "No Bet"
        if ev_home["is_positive_ev"] and ev_away["is_positive_ev"]:
            suggestion = "Both +EV (verify)"
        elif ev_home["is_positive_ev"]:
            suggestion = f"BET HOME ({row['home_team']})"
        elif ev_away["is_positive_ev"]:
            suggestion = f"BET AWAY ({row['away_team']})"

        results.append(
            {
                "game_id": row.get("game_id", ""),
                "home_team": row["home_team"],
                "away_team": row["away_team"],
                "commence_time": row["commence_time"],
                "bookmaker": row.get("bookmaker", ""),
                "home_spread": row.get("home_spread"),
                "away_spread": row.get("away_spread"),
                "home_moneyline": home_ml,
                "away_moneyline": away_ml,
                # Model predictions (0–1 probability)
                "model_prob_home": round(model_prob_home, 4),
                "model_prob_away": round(model_prob_away, 4),
                # Implied probabilities derived from sportsbook odds (includes vig)
                "implied_prob_home": round(impl_home, 4),
                "implied_prob_away": round(impl_away, 4),
                # EV in dollars per $100 wagered; positive = profitable bet
                "ev_home": ev_home["ev_per_100"],
                "ev_away": ev_away["ev_per_100"],
                # Edge = how much better model prob is vs implied prob (e.g. 0.06 = 6% edge)
                "edge_home": ev_home["edge"],
                "edge_away": ev_away["edge"],
                # Kelly fraction: recommended bet size as % of bankroll (e.g. 0.04 = 4%)
                "kelly_home": kelly_home,
                "kelly_away": kelly_away,
                "suggestion": suggestion,
                "is_positive_ev_home": ev_home["is_positive_ev"],
                "is_positive_ev_away": ev_away["is_positive_ev"],
            }
        )

    return pd.DataFrame(results)
