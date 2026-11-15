import "dotenv/config";
/**
 * Runs Python analytics engines as child processes and returns JSON results.
 * Set PYTHON_CMD env var to override the python executable (default: python3).
 */
import { spawn } from "child_process";
import path from "path";

const PYTHON_CMD = process.env.PYTHON_CMD || "python3";

/**
 * Generic wrapper to spawn and execute a Python script as a child process.
 * Captures stdout/stderr and parses JSON output.
 * @param scriptPath - Absolute path to Python script
 * @param args - Command-line arguments to pass to script
 * @param timeoutMs - Execution timeout in milliseconds (default: 180s)
 * @returns Promise resolving to parsed JSON output
 */
function runPythonScript(scriptPath: string, args: string[] = [], timeoutMs = 180_000): Promise<any> {
  return new Promise((resolve, reject) => {
    const proc = spawn(PYTHON_CMD, [scriptPath, ...args], {
      cwd: path.join(process.cwd(), "analytics"),
      env: { ...process.env },
      timeout: timeoutMs,
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (d) => { stdout += d.toString(); });
    proc.stderr.on("data", (d) => { stderr += d.toString(); });

    proc.on("close", (code) => {
      const marker = "=== JSON OUTPUT ===";
      const idx = stdout.indexOf(marker);
      if (idx === -1) {
        try {
          resolve(JSON.parse(stdout.trim()));
        } catch {
          reject(new Error(`Python engine failed (code ${code}):\n${stderr}\n${stdout}`));
        }
        return;
      }

      const jsonStr = stdout.slice(idx + marker.length).trim();
      try {
        resolve(JSON.parse(jsonStr));
      } catch (e) {
        reject(new Error(`Failed to parse engine JSON: ${(e as Error).message}\n${jsonStr.slice(0, 500)}`));
      }
    });

    proc.on("error", reject);
  });
}

/**
 * Runs the ML analytics engine (analytics/engine.py) to predict game outcomes
 * and compute expected value for upcoming games.
 * @param sport - Sport identifier (default: "basketball_nba")
 * @returns Promise with ML predictions, EV calculations, and model metrics
 */
export function runAnalyticsEngine(sport = "basketball_nba"): Promise<any> {
  const enginePath = path.join(process.cwd(), "analytics", "engine.py");
  return runPythonScript(enginePath, [sport]);
}

/**
 * Runs the result sync script (analytics/sync_results.py) to fetch
 * completed NBA game results from nba_api for performance tracking.
 * @returns Promise with array of completed game results
 */
export function runSyncResults(): Promise<any[]> {
  const scriptPath = path.join(process.cwd(), "analytics", "sync_results.py");
  return new Promise((resolve, reject) => {
    const proc = spawn(PYTHON_CMD, [scriptPath], {
      cwd: path.join(process.cwd(), "analytics"),
      env: { ...process.env },
      timeout: 120_000,
    });

    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => { stdout += d.toString(); });
    proc.stderr.on("data", (d) => { stderr += d.toString(); });

    proc.on("close", (code) => {
      try {
        const data = JSON.parse(stdout.trim());
        if (Array.isArray(data)) {
          resolve(data);
        } else if (data.error) {
          reject(new Error(data.error));
        } else {
          resolve([]);
        }
      } catch (e) {
        reject(new Error(`Failed to parse sync_results output: ${stderr}\n${stdout.slice(0, 500)}`));
      }
    });

    proc.on("error", reject);
  });
}
