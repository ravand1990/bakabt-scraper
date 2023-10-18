import axios, { AxiosResponse } from "axios";
import cheerio from "cheerio";
import express from "express";
import RSS from "rss";
import dotenv from "dotenv";
import * as fs from "fs";
import randomUA from "random-useragent"; // For user-agent rotation
import serveIndex from "serve-index";

if (!fs.existsSync(".env")) fs.writeFileSync(".env", "cookie=\nbaseUrl=");

dotenv.config(); // Load environment variables from .env file

if (!process.env.cookie) {
  console.log('"cookie" variable not set in .env');
  process.exit();
}

const BASE_URL = process.env.baseUrl;
const TRACKER_BASE_URL: string = "https://bakabt.me";
const TORRENTS_FOLDER: string = "./torrents"; // Folder to store downloaded torrent files

// Create the "torrents" folder if it doesn't exist
if (!fs.existsSync(TORRENTS_FOLDER)) {
  fs.mkdirSync(TORRENTS_FOLDER);
}

const publicDirectoryPath = "torrents";

const app = express();
const port = 3000;

// Serve static files
app.use("/torrents", express.static(publicDirectoryPath));

// Allow directory browsing
app.use(
  "/torrents",
  serveIndex(publicDirectoryPath, {
    icons: true, // show icons before filenames
  })
);

let feed = new RSS({
  title: "Freeleech Torrents",
  description: "List of freeleech torrents from Bakabt",
  feed_url: `http://localhost:${port}/rss`,
  site_url: TRACKER_BASE_URL,
});

// Declare a set to keep track of added torrent URLs
const addedTorrents = new Set();

// Function to get a random delay (for instance between 1-5 seconds)
function getRandomDelay() {
  return Math.random() * 4000 + 1000;
}

async function updateFeed(): Promise<void> {
  try {
    const response: AxiosResponse<string> = await axios.get(
      `${TRACKER_BASE_URL}/browse.php`,
      {
        headers: {
          "User-Agent": randomUA.getRandom(),
          Cookie: "bbtid=" + process.env.cookie,
        },
        timeout: 5000, // 5 seconds timeout
      }
    );

    const $ = cheerio.load(response.data);

    $("td.name").each(async (index, element) => {
      const freeleechIcon = $(element).find(".icon.freeleech");
      if (freeleechIcon.length) {
        const torrentLink = $(element).find(".title").attr("href");
        const torrentName = $(element).find(".title").text().trim();
        const torrentNameSanitized = sanitizeFilename(torrentName);

        if (torrentLink && !addedTorrents.has(torrentLink)) {
          const detailPageLink = TRACKER_BASE_URL + torrentLink;

          const torrentPageResponse: AxiosResponse<string> = await axios.get(
            detailPageLink,
            {
              headers: {
                "User-Agent": randomUA.getRandom(),
                Cookie: "bbtid=" + process.env.cookie,
              },
              timeout: 5000, // 5 seconds timeout
            }
          );

          const torrentPage$ = cheerio.load(torrentPageResponse.data);
          const downloadLink = torrentPage$('a[href$=".torrent"]').attr("href");
          const date = new Date(
            Number(
              torrentPage$("span[data-timestamp]").attr("data-timestamp")
            ) * 1000
          );

          if (downloadLink) {
            const torrentFilePath = `${TORRENTS_FOLDER}/${torrentNameSanitized}.torrent`;

            // Download and save the torrent file
            const torrentFileResponse = await axios.get(
              TRACKER_BASE_URL + downloadLink,
              {
                headers: {
                  "User-Agent": randomUA.getRandom(),
                  Cookie: "bbtid=" + process.env.cookie,
                },
                responseType: "stream",
              }
            );
            const writeStream = fs.createWriteStream(torrentFilePath);
            torrentFileResponse.data.pipe(writeStream);

            feed.item({
              title: torrentName,
              description: torrentName,
              url: detailPageLink,
              enclosure: {
                url: encodeURI(
                  `${BASE_URL}/torrents/${torrentNameSanitized}.torrent`
                ), // Updated URL to point to the saved torrent file
                type: "application/x-bittorrent",
              },
              date: date,
            });

            addedTorrents.add(torrentLink); // Mark the torrent as added
          }

          // Random delay between each request to the torrent detail pages
          await new Promise((resolve) => setTimeout(resolve, getRandomDelay()));
        }
      }
    });
  } catch (error) {
    console.error("Error updating feed:", error);
  }
}

function sanitizeFilename(filename: String) {
  // Replace characters that are not allowed in filenames with underscores
  return filename.replace(/[/\\?%*:|"<> ]/g, "_");
}

app.get("/", (req, res) => {
  res.redirect("/rss");
});

app.get("/rss", (req, res) => {
  res.type("application/rss+xml");
  res.send(feed.xml());
});

app.listen(port, () => {
  console.log(`Server started on http://localhost:${port}`);

  // Using setTimeout for controlled intervals
  async function periodicUpdate() {
    await updateFeed();
    setTimeout(periodicUpdate, 1000 * 60 * 5 + getRandomDelay()); // Update every 5 minutes + random delay
  }

  periodicUpdate(); // Initial call
});
