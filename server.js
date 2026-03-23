import express from "express";
import * as cheerio from "cheerio";

const app = express();
const PORT = process.env.PORT || 3000;

// Monthly calendar widget (fallback source)
const WIDGET_URL =
  "https://widgets.connectmazjid.com/calendar?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhc3NldFR5cGUiOiJzYWxhaCIsIm1hc2ppZElkIjoiNjhiZGYzYzZjYzJjZWI5MDIxOWZiMjRhIiwidXNlcklkIjoiNjQyZDgyOTU5YzUyNzIyOTA5N2RiMjI5In0.sRKpm_UtrRj_fE-UApLRta9XwLIm4VBViLWqVUtZXak&lat=33.054258&lon=-96.565045&entityType=MASJID";

// Daily live prayer widget (primary source)
const DAILY_URL =
  "https://widgets.connectmazjid.com/widget/prayer-timing?lat=33.054258&lon=-96.565045&token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhc3NldFR5cGUiOiJzYWxhaCIsIm1hc2ppZElkIjoiNjhiZGYzYzZjYzJjZWI5MDIxOWZiMjRhIiwidXNlcklkIjoiNjQyZDgyOTU5YzUyNzIyOTA5N2RiMjI5In0.sRKpm_UtrRj_fE-UApLRta9XwLIm4VBViLWqVUtZXak&entityType=MASJID";

// Put your ScraperAPI key in Render environment variables as SCRAPERAPI_KEY
const SCRAPERAPI_KEY = process.env.SCRAPERAPI_KEY;

let lastGoodTimes = null;

async function getDailyPrayerTimes() {
  if (!SCRAPERAPI_KEY) {
    throw new Error("SCRAPERAPI_KEY is missing");
  }

  const params = new URLSearchParams({
    api_key: SCRAPERAPI_KEY,
    url: DAILY_URL,
    output_format: "json",
    autoparse: "true",
  });

  const response = await fetch(`https://api.scraperapi.com/?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`ScraperAPI request failed with status ${response.status}`);
  }

  const html = await response.text();

  const prayerTimesIdx = html.indexOf('\\"prayerTimes\\"');
  if (prayerTimesIdx === -1) {
    throw new Error("prayerTimes not found in daily endpoint");
  }

  const startBracket = html.indexOf("[", prayerTimesIdx);
  if (startBracket === -1) {
    throw new Error("Opening bracket not found in daily endpoint");
  }

  let bracketCount = 0;
  let jsonStr = "";

  for (let i = startBracket; i < html.length; i++) {
    if (html[i] === "[") bracketCount++;
    else if (html[i] === "]") bracketCount--;

    if (bracketCount === 0) {
      jsonStr = html.slice(startBracket, i + 1);
      break;
    }
  }

  if (!jsonStr) {
    throw new Error("Could not extract prayerTimes JSON");
  }

  jsonStr = jsonStr.replace(/\\"/g, '"');

  let prayerTimes;
  try {
    prayerTimes = JSON.parse(jsonStr);
  } catch (err) {
    throw new Error(`Failed to parse daily prayerTimes JSON: ${err.message}`);
  }

  const result = {
    source: "daily",
  };

  let jumuahTimes = [];

  for (const prayer of prayerTimes) {
    const name = prayer?.name;
    const adhan = prayer?.azanTime || "";
    const iqamah = prayer?.iqamaTime || "";

    if (name === "Fajr") {
      result.fajr = { adhan, iqamah };
    } else if (name === "Dhuhr") {
      result.dhuhr = { adhan, iqamah };
    } else if (name === "Asr") {
      result.asr = { adhan, iqamah };
    } else if (name === "Maghrib") {
      result.maghrib = { adhan, iqamah };
    } else if (name === "Isha") {
      result.isha = { adhan, iqamah };
    } else if (name === "Jummah" || name === "Jumuah") {
      if (adhan) jumuahTimes.push(adhan);
      if (iqamah && iqamah !== adhan) jumuahTimes.push(iqamah);
    }
  }

  result.jumuah = [...new Set(jumuahTimes)];

  if (!result.fajr || !result.dhuhr || !result.asr || !result.maghrib || !result.isha) {
    throw new Error("Missing one or more daily prayer times");
  }

  return result;
}

async function getMonthlyFallbackTimes() {
  const today = new Date();
  const day = today.getDate();

  const response = await fetch(WIDGET_URL);
  if (!response.ok) {
    throw new Error(`Monthly widget request failed with status ${response.status}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  let row;

  $("table tr").each((_, tr) => {
    const cells = $(tr).find("td");
    if (!cells.length) return;

    const firstCell = $(cells[0]).text().trim();
    if (parseInt(firstCell, 10) === day) {
      row = tr;
    }
  });

  // If today's row is missing, use the last available row
  if (!row) {
    const allRows = $("table tr").filter((_, tr) => $(tr).find("td").length > 0);

    if (allRows.length > 0) {
      row = allRows.last();
    } else {
      throw new Error("No prayer rows found in monthly fallback");
    }
  }

  const tds = $(row).find("td");
  const returnedDate = $(tds[0]).text().trim();

  const result = {
    source: "monthly_fallback",
    date: returnedDate,
    fajr: { adhan: $(tds[2]).text().trim(), iqamah: $(tds[3]).text().trim() },
    dhuhr: { adhan: $(tds[5]).text().trim(), iqamah: $(tds[6]).text().trim() },
    asr: { adhan: $(tds[7]).text().trim(), iqamah: $(tds[8]).text().trim() },
    maghrib: { adhan: $(tds[9]).text().trim(), iqamah: $(tds[10]).text().trim() },
    isha: { adhan: $(tds[11]).text().trim(), iqamah: $(tds[12]).text().trim() },
  };

  let jumuahTimes = [];

  $("div").each((_, el) => {
    const text = $(el).text();

    if (text.includes("Jummah") || text.includes("Jumuah")) {
      const matches = text.match(/\d{1,2}:\d{2}\s?(AM|PM)/g);
      if (matches) {
        jumuahTimes = matches;
      }
    }
  });

  result.jumuah = [...new Set(jumuahTimes)];

  return result;
}

app.get("/times", async (req, res) => {
  try {
    // Try daily source first
    try {
      const dailyResult = await getDailyPrayerTimes();
      lastGoodTimes = dailyResult;
      return res.json(dailyResult);
    } catch (dailyErr) {
      console.log("Daily source failed, falling back to monthly calendar:", dailyErr.message);
    }

    // Fallback to monthly calendar
    const monthlyResult = await getMonthlyFallbackTimes();
    lastGoodTimes = monthlyResult;
    return res.json(monthlyResult);
  } catch (err) {
    if (lastGoodTimes) {
      return res.json(lastGoodTimes);
    }
    return res.status(500).json({ error: err.message });
  }
});

app.get("/events", async (req, res) => {
  res.json({
    message: "Events endpoint is working",
  });
});

app.get("/", (req, res) => {
  res.send("IAQC prayer API is running");
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});