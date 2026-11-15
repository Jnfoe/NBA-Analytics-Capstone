# NBA Analytics Dashboard

A capstone project that displays upcoming NBA matchups and sportsbook odds, estimates win probabilities, and calculates expected value. It uses React, Express, PostgreSQL, and a Python analytics engine.

## Run locally

Install Node.js 24 with npm, Python 3.14, [uv](https://docs.astral.sh/uv/getting-started/installation/), and PostgreSQL. Start PostgreSQL and create an empty database named `nba_capstone` using pgAdmin or by running `CREATE DATABASE nba_capstone;` in a PostgreSQL SQL session.

From the repository root, install the locked dependencies.

```sh
npm ci
uv sync --locked --python 3.14
```

Copy `.env.example` to `.env` using `Copy-Item .env.example .env` in PowerShell or `cp .env.example .env` on macOS or Linux. Fill in these values.

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | Your PostgreSQL connection URL. Use a role that can create tables. URL-encode special characters in the password. |
| `THE_ODDS_API_KEY` | Your [The Odds API](https://the-odds-api.com/) key for live odds and upcoming-game predictions. An empty value disables the odds sync. |
| `PYTHON_CMD` | Absolute path to the Python executable installed by uv. Use forward slashes, for example `C:/Projects/basketball-analytics/.venv/Scripts/python.exe` on Windows or `/home/me/basketball-analytics/.venv/bin/python` on Linux. On macOS, the executable also ends in `/.venv/bin/python`. |
| `PORT` | Local HTTP port. Defaults to `5000`. |

Initialize the tables and start the development server.

```sh
npm run db:push
npm run dev
```

Open [localhost:5000](http://localhost:5000). The dashboard populates as the background sync imports games. Use the Analytics page to run predictions. The engine downloads NBA data and generates its model and charts locally. Historical training and result sync use the 2025–26 NBA season.

If games are missing, check the server log, Odds API key and quota, and whether upcoming games are available. If analytics fails to start, check `PYTHON_CMD` and connectivity to the NBA data and odds services.

## Production build

Use the same database and environment configuration.

```sh
npm run check
npm run build
npm start
```

The Express server serves both the built UI and the API. GitHub hosts the source repository. Running the application requires Node, Python, and PostgreSQL.

## Repository layout

| Directory | Contents |
| --- | --- |
| `client/` | React dashboard and analytics pages |
| `server/` | Express API, data sync, and Python integration |
| `shared/` | Shared API and database schemas |
| `analytics/` | Model training, expected-value calculations, and chart generation |
| `script/` | Production build script |

## Upload to GitHub

Extract the archive and open the `basketball-analytics` folder in a terminal. Create an empty GitHub repository and replace the sample URL below with its URL.

```sh
git init -b main
git add .
git commit -m "Add NBA analytics capstone"
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPOSITORY.git
git push -u origin main
```
