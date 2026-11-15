import time
import requests
import pandas as pd

API_KEY = None
BASE_URL = "https://api.the-odds-api.com/v4/sports"
SPORT = "basketball_nba"


def fetch_live_odds(sport: str = "basketball_nba") -> pd.DataFrame:
    try:
        from os import getenv
        api_key = getenv("THE_ODDS_API_KEY")
        if not api_key:
            return pd.DataFrame()

        response = requests.get(
            f"{BASE_URL}/{sport}/odds",
            params={
                "apiKey": api_key,
                "regions": "us",
                "markets": "spreads,h2h",
                "oddsFormat": "american",
            },
            timeout=15,
        )
        if response.status_code != 200:
            return pd.DataFrame()

        rows = []
        for game in response.json() or []:
            bookmakers = game.get("bookmakers") or []
            primary = bookmakers[0] if bookmakers else None
            if not primary:
                continue

            spread_market = next((m for m in primary.get("markets", []) if m.get("key") == "spreads"), None)
            h2h_market = next((m for m in primary.get("markets", []) if m.get("key") == "h2h"), None)

            home_team = game.get("home_team")
            away_team = game.get("away_team")
            home_spread = 0
            away_spread = 0
            home_ml = None
            away_ml = None

            if spread_market:
                home_outcome = next((o for o in spread_market.get("outcomes", []) if o.get("name") == home_team), None)
                away_outcome = next((o for o in spread_market.get("outcomes", []) if o.get("name") == away_team), None)
                home_spread = float(home_outcome.get("point", 0)) if home_outcome else 0
                away_spread = float(away_outcome.get("point", 0)) if away_outcome else 0

            if h2h_market:
                home_ml_outcome = next((o for o in h2h_market.get("outcomes", []) if o.get("name") == home_team), None)
                away_ml_outcome = next((o for o in h2h_market.get("outcomes", []) if o.get("name") == away_team), None)
                home_ml = home_ml_outcome.get("price") if home_ml_outcome else None
                away_ml = away_ml_outcome.get("price") if away_ml_outcome else None

            rows.append({
                "game_id": game.get("id"),
                "home_team": home_team,
                "away_team": away_team,
                "commence_time": game.get("commence_time"),
                "bookmaker": primary.get("title") or "Scheduled",
                "home_spread": home_spread,
                "away_spread": away_spread,
                "home_moneyline": home_ml,
                "away_moneyline": away_ml,
                "implied_prob_home": 0.5,
                "implied_prob_away": 0.5,
            })

        return pd.DataFrame(rows)
    except Exception as e:
        print(f"  WARNING: fetch_live_odds failed: {e}")
        return pd.DataFrame()


def fetch_upcoming_games_from_db(sport: str = "basketball_nba") -> pd.DataFrame:
    """
    Fallback: reads upcoming games from PostgreSQL when the Odds API quota is exhausted.
    Returns a DataFrame matching the schema expected by build_prediction_features().
    Games without real odds will have implied_prob = 0.5 and moneylines = None.
    The engine will detect this and skip EV analysis, showing Elo-only predictions.
    """
    try:
        import psycopg2
        from datetime import datetime, timedelta
        from os import getenv

        db_url = getenv("DATABASE_URL")
        if not db_url:
            print("  WARNING: DATABASE_URL not set — cannot load games from DB.")
            return pd.DataFrame()

        conn = psycopg2.connect(db_url)
        cur = conn.cursor()

        now = datetime.utcnow()
        win_start = now - timedelta(hours=4)
        win_end = now + timedelta(hours=48)

        cur.execute(
            """
            SELECT external_id, home_team, away_team, commence_time,
                   bookmaker, home_spread, away_spread,
                   current_home_odds, current_away_odds
            FROM games
            WHERE sport = %s AND commence_time BETWEEN %s AND %s
            ORDER BY commence_time
            """,
            (sport, win_start, win_end),
        )

        rows = cur.fetchall()
        conn.close()

        if not rows:
            print("  No upcoming games found in database for this window.")
            return pd.DataFrame()

        records = []
        for row in rows:
            (ext_id, home, away, commence, bookmaker, h_spread, a_spread, h_ml, a_ml) = row

            h_spread = float(h_spread or 0)
            a_spread = float(a_spread or 0)
            h_ml = float(h_ml) if h_ml is not None else None
            a_ml = float(a_ml) if a_ml is not None else None

            # Derive implied probability from best available source:
            # 1. Real moneylines (most accurate)
            # 2. Point spread estimate (mirror of server/lib/odds-api.ts spreadToWinProb)
            # 3. 50/50 neutral (no odds at all)
            if h_ml is not None and a_ml is not None:
                raw_home = (100 / (h_ml + 100)) if h_ml > 0 else (abs(h_ml) / (abs(h_ml) + 100))
                raw_away = (100 / (a_ml + 100)) if a_ml > 0 else (abs(a_ml) / (abs(a_ml) + 100))
                total = raw_home + raw_away  # > 1 due to vig
                impl_home = raw_home / total  # normalize to remove vig
                impl_away = raw_away / total
            elif h_spread != 0:
                impl_home = max(0.05, min(0.95, 0.5 - h_spread * 0.028))
                impl_away = 1.0 - impl_home
            else:
                impl_home = 0.5
                impl_away = 0.5

            records.append({
                "game_id":           ext_id or "",
                "home_team":         home,
                "away_team":         away,
                "commence_time":     str(commence),
                "bookmaker":         bookmaker,
                "home_spread":       h_spread,
                "away_spread":       a_spread,
                "home_moneyline":    h_ml,
                "away_moneyline":    a_ml,
                "implied_prob_home": impl_home,
                "implied_prob_away": impl_away,
            })

        print(f"  Loaded {len(records)} upcoming games from database.")
        return pd.DataFrame(records)

    except Exception as e:
        print(f"  WARNING: fetch_upcoming_games_from_db failed: {e}")
        import traceback
        traceback.print_exc()
        return pd.DataFrame()


def fetch_nba_game_log(season: str = "2025-26") -> pd.DataFrame:
    try:
        from nba_api.stats.endpoints import leaguegamefinder
    except ImportError:
        print("  WARNING: nba_api not installed — cannot fetch NBA game log.")
        return pd.DataFrame()

    try:
        finder = leaguegamefinder.LeagueGameFinder(
            season_nullable=season,
            season_type_nullable="Regular Season",
            league_id_nullable="00",
            timeout=30,
        )
        df = finder.get_data_frames()[0]
        time.sleep(0.6)
    except Exception as e:
        print(f"  WARNING: nba_api LeagueGameFinder failed: {e}")
        return pd.DataFrame()

    if df.empty:
        print("  WARNING: nba_api returned empty game log.")
        return pd.DataFrame()

    home_rows = df[df["MATCHUP"].str.contains(r"vs\.", na=False)].copy()
    away_rows = df[df["MATCHUP"].str.contains(r"@", na=False)].copy()

    if home_rows.empty or away_rows.empty:
        return pd.DataFrame()

    home_rows["GAME_ID"] = home_rows["GAME_ID"].astype(str)
    away_rows["GAME_ID"] = away_rows["GAME_ID"].astype(str)

    merged = home_rows.merge(
        away_rows[["GAME_ID", "PTS", "TEAM_NAME"]],
        on="GAME_ID",
        suffixes=("_home", "_away"),
    )

    records = []
    for _, row in merged.iterrows():
        home_score = int(row["PTS_home"])
        away_score = int(row["PTS_away"])
        records.append({
            "game_id": row["GAME_ID"],
            "sport": "basketball_nba",
            "home_team": row["TEAM_NAME_home"],
            "away_team": row["TEAM_NAME_away"],
            "home_score": home_score,
            "away_score": away_score,
            "home_win": home_score > away_score,
            "point_diff": home_score - away_score,
            "commence_time": row.get("GAME_DATE") or row.get("GAME_DATE_home") or row.get("GAME_DATE_away"),
        })

    return pd.DataFrame(records)
