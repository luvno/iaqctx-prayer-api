import express from "express";
import * as cheerio from "cheerio";

const app = express();
const PORT = 3000;


const WIDGET_URL = "https://widgets.connectmazjid.com/calendar?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhc3NldFR5cGUiOiJzYWxhaCIsIm1hc2ppZElkIjoiNjhiZGYzYzZjYzJjZWI5MDIxOWZiMjRhIiwidXNlcklkIjoiNjQyZDgyOTU5YzUyNzIyOTA5N2RiMjI5In0.sRKpm_UtrRj_fE-UApLRta9XwLIm4VBViLWqVUtZXak&lat=33.054258&lon=-96.565045&entityType=MASJID";

function pad2(n) {
  return String(n).padStart(2, "0");
}

app.get("/times", async (req, res) => {
  try {
    const today = new Date();
    const day = pad2(today.getDate());

    const response = await fetch(WIDGET_URL);
    const html = await response.text();
    const $ = cheerio.load(html);

    let row;

    $("table tr").each((_, tr) => {
      const cells = $(tr).find("td");
      if (!cells.length) return;

      const firstCell = $(cells[0]).text().trim();
      if (firstCell === day) {
        row = tr;
      }
    });

    if (!row) {
      return res.status(404).json({ error: "Today's row not found" });
    }

    const tds = $(row).find("td");

    const result = {
      fajr: { adhan: $(tds[2]).text().trim(), iqamah: $(tds[3]).text().trim() },
      dhuhr: { adhan: $(tds[5]).text().trim(), iqamah: $(tds[6]).text().trim() },
      asr: { adhan: $(tds[7]).text().trim(), iqamah: $(tds[8]).text().trim() },
      maghrib: { adhan: $(tds[9]).text().trim(), iqamah: $(tds[10]).text().trim() },
      isha: { adhan: $(tds[11]).text().trim(), iqamah: $(tds[12]).text().trim() }
    };

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log("Server running on http://localhost:3000");
});
