export type RawgRating = {
  source: string;
  audience: "players";
  originalScore: number;
  originalScale: 5;
  ratingOutOfFive: number;
  url: string;
};
export function rawgEnabled(): boolean;
export function rawgSource(status: "snapshot" | "live" | "unavailable"): {
  name: string;
  url: string;
  status: "snapshot" | "live" | "unavailable";
  detail: string;
};
export function findRawgRating(appId: string | number, name: string): Promise<RawgRating | null>;