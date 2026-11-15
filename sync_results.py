"""
sync_results.py — Fetch completed 2025-26 NBA game results from nba_api
and output them as JSON for the backend to store in game_results table.

Usage: python sync_results.py
Output: JSON array of completed game records to stdout
"""
import json
import sys
import datetime

from nba_api.stats.endpoints import leaguegamefinder
from nba_api.stats.library.parameters import SeasonType

NBA_TEAM_NAME_MAP = {
    "LA Clippers": "Los Angeles Clippers",
    "GS Warriors": "Golden State Warriors",
    "NY Knicks": "New York Knicks",
    "SA Spurs": "San Antonio Spurs",
    "OKC Thunder": "Oklahoma City Thunder",
    "NO Pelicans": "New Orleans Pelicans",
}

def normalize(name: str) -> str:
    return NBA_TEAM_NAME_MAP.get(name, name)

def fetch_completed_games(season: str = "2025-26") -> list[dict]:
    try:
        finder = leaguegamefinder.LeagueGameFinder(
            season_nullable=season,
            season_type_nullable=SeasonType.regular,
            league_id_nullable="00",
        )
        df = finder.get_data_frames()[0]
    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        return []

    if df.empty:
        return []

    # Keep only finished games (WL is non-null)
    df = df[df["WL"].notna()].copy()

    # Group by GAME_ID to pair home/away
    results = []
    for game_id, group in df.groupby("GAME_ID"):
        if len(group) < 2:
            continue

        home_row = group[group["MATCHUP"].str.contains("vs\\.") == True]
        away_row = group[group["MATCHUP"].str.contains("@") == True]

        if home_row.empty or away_row.empty:
            continue

        home = home_row.iloc[0]
        away = away_row.iloc[0]

        home_team = normalize(home["TEAM_NAME"])
        away_team = normalize(away["TEAM_NAME"])
        home_score = int(home["PTS"]) if home["PTS"] is not None else None
        away_score = int(away["PTS"]) if away["PTS"] is not None else None

        if home_score is None or away_score is None:
            continue

        winning_team = home_team if home_score > away_score else away_team
        game_date = str(home["GAME_DATE"])

        # Build a stable game_id key that matches what the ML engine uses
        # Format: "AWAY_TEAM vs HOME_TEAM YYYY-MM-DD"
        stable_id = f"{away_team} @ {home_team} {game_date}"

        results.append({
            "game_id": stable_id,
            "home_team": home_team,
            "away_team": away_team,
            "home_score": home_score,
            "away_score": away_score,
            "winning_team": winning_team,
            "completed_at": game_date,
            "nba_game_id": str(game_id),
        })

    return results

if __name__ == "__main__":
    games = fetch_completed_games()
    print(json.dumps(games))
