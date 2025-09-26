import { ACTIVE_USERS_URL, buildActiveFallback } from "./constants";
import { parseCsv } from "./csv";
import type { ActiveUsersRow } from "./types";

function toRawGithub(url: string) {
  if (url.includes("github.com/") && url.includes("/blob/")) {
    return url
      .replace("https://github.com/", "https://raw.githubusercontent.com/")
      .replace("/blob/", "/");
  }
  return url;
}

function coerceNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export async function fetchActiveUsersData(cacheBuster?: number, signal?: AbortSignal) {
  if (!ACTIVE_USERS_URL || ACTIVE_USERS_URL.startsWith("<PUT_PUBLIC_URL")) {
    throw new Error("No URL for active users data");
  }

  const base = toRawGithub(ACTIVE_USERS_URL);
  const url = cacheBuster ? `${base}${base.includes("?") ? "&" : "?"}t=${cacheBuster}` : base;
  const res = await fetch(url, { cache: "no-store", mode: "cors", signal });
  if (!res.ok) throw new Error(`Active users HTTP ${res.status}`);
  const text = await res.text();
  const raw = await parseCsv<Record<string, unknown>>(text);

  const rows: ActiveUsersRow[] = raw
    .filter((entry) => entry && entry.month !== undefined)
    .map((entry) => {
      const month = String(entry.month ?? "").split(" ")[0];
      return {
        month,
        active_subscribers: coerceNumber(entry.active_subscribers),
        active_onetime: coerceNumber(entry.active_onetime),
        active_total: coerceNumber(entry.active_total),
        is_future_vs_today: coerceNumber(entry.is_future_vs_today),
      };
    })
    .filter((entry) => entry.month.length >= 7 && entry.active_total > 0);

  if (!rows.length) {
    return buildActiveFallback();
  }

  return rows;
}
