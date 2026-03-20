import express from "express";
import * as cheerio from "cheerio";

const app = express();
const PORT = process.env.PORT || 3000;


const WIDGET_URL = "https://widgets.connectmazjid.com/calendar?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhc3NldFR5cGUiOiJzYWxhaCIsIm1hc2ppZElkIjoiNjhiZGYzYzZjYzJjZWI5MDIxOWZiMjRhIiwidXNlcklkIjoiNjQyZDgyOTU5YzUyNzIyOTA5N2RiMjI5In0.sRKpm_UtrRj_fE-UApLRta9XwLIm4VBViLWqVUtZXak&lat=33.054258&lon=-96.565045&entityType=MASJID";


let lastGoodTimes = null;

app.get("/times", async (req, res) => {
  try {
    const today = new Date();
    const day = today.getDate();

    const response = await fetch(WIDGET_URL);
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

    if (!row) {
      const allRows = $("table tr").filter((_, tr) => $(tr).find("td").length > 0);

      if (allRows.length > 0) {
        row = allRows.last();
      } else if (lastGoodTimes) {
        return res.json(lastGoodTimes);
      } else {
        return res.status(404).json({ error: "No prayer rows found" });
      }
    }

    const tds = $(row).find("td");
    const returnedDate = $(tds[0]).text().trim();

    const result = {
      date: returnedDate,
      fajr: { adhan: $(tds[2]).text().trim(), iqamah: $(tds[3]).text().trim() },
      dhuhr: { adhan: $(tds[5]).text().trim(), iqamah: $(tds[6]).text().trim() },
      asr: { adhan: $(tds[7]).text().trim(), iqamah: $(tds[8]).text().trim() },
      maghrib: { adhan: $(tds[9]).text().trim(), iqamah: $(tds[10]).text().trim() },
      isha: { adhan: $(tds[11]).text().trim(), iqamah: $(tds[12]).text().trim() }
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

    result.jumuah = jumuahTimes;

    lastGoodTimes = result;
    res.json(result);

  } catch (err) {
    if (lastGoodTimes) return res.json(lastGoodTimes);
    res.status(500).json({ error: err.message });
  }
});


app.get("/events", async (req, res) => {
  res.json({
    message: "Events endpoint is working"
  });
});

app.listen(PORT, () => {
  console.log("Server running on http://localhost:3000");
});
