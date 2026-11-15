import { useQuery } from "@tanstack/react-query";
import { api, buildUrl, type GameResponse, type GamesListResponse } from "@shared/routes";
import { z } from "zod";

/**
 * Defensive parsing: JSON serialization often turns Dates into strings,
 * and Postgres 'numeric' types into strings. If the shared schema isn't 
 * strictly expecting this, Zod might throw. We log the error but fallback
 * to casting to prevent catastrophic UI failures.
 */
function parseWithLogging<T>(schema: z.ZodSchema<T>, data: unknown, label: string): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    console.error(`[Zod] ${label} validation failed:`, result.error.format());
    // Fallback: forcefully cast it if it looks roughly correct, avoiding white screens
    return data as T; 
  }
  return result.data;
}

// GET /api/games
export function useGames() {
  return useQuery({
    queryKey: [api.games.list.path],
    queryFn: async () => {
      const res = await fetch(api.games.list.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch games");
      const json = await res.json();
      return parseWithLogging(api.games.list.responses[200], json, "games.list");
    },
  });
}

// GET /api/games/:id
export function useGame(id: number) {
  return useQuery({
    queryKey: [api.games.get.path, id],
    queryFn: async () => {
      const url = buildUrl(api.games.get.path, { id });
      const res = await fetch(url, { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch game details");
      const json = await res.json();
      return parseWithLogging(api.games.get.responses[200], json, "games.get");
    },
    enabled: !!id && !isNaN(id),
  });
}
