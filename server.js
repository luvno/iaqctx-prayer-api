import express from "express";
import { pathToFileURL } from "node:url";

const app = express();
const PORT = process.env.PORT || 3000;
const TIME_ZONE = "America/Chicago";
const CACHE_MS = 5 * 60 * 1000;

export const WEBSITE_URL = "https://iaqctx.org/prayer-times";

let cache = { data: null, date: null, fetchedAt: 0 };

function centralDateKey(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function decodeEmbeddedJson(text) {
  return text.replace(/\\\\n/g, "\n").replace(/\\\\\"/g, '"');
}

export function parseWebsiteSchedule(html) {
  const decoded = decodeEmbeddedJson(html);
  const labels = /Faj(?:a|r)r?\s*\nDhuhr\s*\nAsr\s*\nMaghrib\s*\nIsha\s*\nJumuah 1\s*\nJumuah 2/i;
  const labelsIndex = decoded.search(labels);

  if (labelsIndex === -1) {
    throw new Error("IAQC prayer labels were not found");
  }

  const nearby = decoded.slice(Math.max(0, labelsIndex - 5000), labelsIndex);
  const timeBlock = /((?:\d{1,2}:\d{2}\s*(?:AM|PM)\s*\n){7})/gi;
  const matches = [...nearby.matchAll(timeBlock)];
  const lastMatch = matches.at(-1);

  if (!lastMatch) {
    throw new Error("IAQC displayed prayer-time block was not found");
  }

  const times = lastMatch[1]
    .trim()
    .split(/\s*\n\s*/)
    .map(normalizeTime);

  if (times.length !== 7 || times.some((time) => !time)) {
    throw new Error("IAQC displayed prayer-time block was incomplete");
  }

  return {
    fajr: times[0],
    dhuhr: times[1],
    asr: times[2],
    maghrib: times[3],
    isha: times[4],
    jumuah: times.slice(5, 7),
  };
}

function normalizeTime(value = "") {
  const match = String(value).trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return "";
  return `${match[1].padStart(2, "0")}:${match[2]} ${match[3].toUpperCase()}`;
}

async function fetchText(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return response.text();
}

export async function getPrayerTimes(fetcher = fetchText) {
  const websiteHtml = await fetcher(WEBSITE_URL);
  const iqamah = parseWebsiteSchedule(websiteHtml);

  return {
    source: "iaqc_website",
    date: centralDateKey(),
    fajr: { adhan: "", iqamah: iqamah.fajr },
    dhuhr: { adhan: "", iqamah: iqamah.dhuhr },
    asr: { adhan: "", iqamah: iqamah.asr },
    maghrib: { adhan: "", iqamah: iqamah.maghrib },
    isha: { adhan: "", iqamah: iqamah.isha },
    jumuah: iqamah.jumuah,
  };
}

app.get("/times", async (_req, res) => {
  const today = centralDateKey();
  if (cache.data && cache.date === today && Date.now() - cache.fetchedAt < CACHE_MS) {
    return res.json(cache.data);
  }

  try {
    const data = await getPrayerTimes();
    cache = { data, date: today, fetchedAt: Date.now() };
    return res.json(data);
  } catch (error) {
    console.error("Prayer-time scrape failed:", error.message);
    if (cache.data && cache.date === today) {
      return res.json({ ...cache.data, stale: true });
    }
    return res.status(503).json({ error: "Today's prayer times are temporarily unavailable" });
  }
});

app.get("/events", (_req, res) => res.json({ message: "Events endpoint is working" }));
app.get("/", (_req, res) => res.send("IAQC prayer API is running"));

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

export { app, centralDateKey };
