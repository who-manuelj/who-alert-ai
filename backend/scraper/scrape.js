// backend/scraper/scrape.js
import axios from "axios";
import * as cheerio from "cheerio";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer";

const WHO_URL =
  "https://www.who.int/teams/regulation-prequalification/incidents-and-SF/full-list-of-who-medical-product-alerts";

// This is to be used for content inside the alert links

export async function scrapeAlertContent(link) {
  let browser;
  try {
    browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(link, { waitUntil: "domcontentloaded" });

    // Wait for the actual body wrapper to load
    await page.waitForSelector("article.sf-detail-body-wrapper > div", {
      timeout: 10000,
    });

    const content = await page.evaluate(() => {
      const el = document.querySelector("article.sf-detail-body-wrapper > div");
      return el ? el.innerText.trim().replace(/\s+/g, " ") : "";
    });

    if (!content) {
      console.warn("No content found for", link);
    }
    return content;
  } catch (err) {
    console.error("Failed to scrape content from", link, err.message);
    return "";
  } finally {
    if (browser) await browser.close();
  }
}

export default async function scrapeAlerts(saveToFile = false) {
  try {
    const { data } = await axios.get(WHO_URL);
    const $ = cheerio.load(data);

    const alerts = [];

    const elements = $("div.list-view--item.vertical-list-item");

    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];
      const anchor = $(el).find("a.link-container");
      const link = anchor.attr("href");
      const title = anchor.find("p.heading.text-underline").text().trim();
      const publishedDate = $(el).find("span.timestamp").text().trim(); // 🟡 Grab the published date

      if (link && title) {
        const fullLink = link.startsWith("http")
          ? link
          : `https://www.who.int${link}`;

        const content = await scrapeAlertContent(fullLink);

        alerts.push({ title, link: fullLink, publishedDate, content }); // 🔵 Include published date

        console.log(`✅ Scraped: ${title}`);
      }
    }

    if (saveToFile) {
      const __dirname = path.dirname(fileURLToPath(import.meta.url));
      const filePath = path.resolve(
        __dirname,
        "../embeddings/alert_chunks.json"
      );

      fs.writeFileSync(filePath, JSON.stringify(alerts, null, 2));
      console.log(`📁 Saved to ${filePath}`);
    }

    return alerts;
  } catch (err) {
    console.error("Scraping failed:", err.message);
    return [];
  }
}

// Run from CLI to save alerts to file
const __filename = fileURLToPath(import.meta.url);

if (process.argv[1] === __filename) {
  scrapeAlerts(true);
}
