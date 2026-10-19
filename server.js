const express = require("express");
const { spawn, execSync } = require("child_process");
const cors = require("cors");
const fs   = require("fs");
const path = require("path");
const os   = require("os");

const app = express();
app.use(cors());
app.use(express.json());

// Auto-update yt-dlp at startup so it never gets stale on Render
try {
  console.log("Updating yt-dlp...");
  execSync("yt-dlp -U", { stdio: "inherit" });
  console.log("yt-dlp updated.");
} catch (e) {
  console.warn("yt-dlp update failed (non-fatal):", e.message);
}

// Write cookies from env var if available, otherwise fall back to cookies.txt file
let COOKIES = path.join(__dirname, "cookies.txt");
if (process.env.YOUTUBE_COOKIES) {
  COOKIES = path.join(os.tmpdir(), "yt_cookies.txt");
  fs.writeFileSync(COOKIES, process.env.YOUTUBE_COOKIES, "utf8");
  console.log("Cookies loaded from YOUTUBE_COOKIES env var");
} else {
  console.log("Cookies loaded from cookies.txt file");
}

// Common yt-dlp flags to bypass bot detection
const COMMON_FLAGS = [
  "--cookies", COOKIES,
  "--no-playlist",
  "--extractor-args", "youtube:player_client=mweb",
];

/* =========================
   SEARCH
========================= */
app.get("/search", async (req, res) => {
  const query = req.query.q;
  if (!query) return res.status(400).json({ success: false, error: "Missing search query" });

  const yt = spawn("yt-dlp", [
    ...COMMON_FLAGS,
    "ytsearch5:" + query,
    "-j", "--flat-playlist",
  ]);

  let data = "";
  yt.stdout.on("data", (chunk) => { data += chunk.toString(); });
  yt.stderr.on("data", (chunk) => console.error("yt-dlp search:", chunk.toString()));

  yt.on("close", () => {
    try {
      const results = data.trim().split("\n").filter(Boolean).map(line => {
        const j = JSON.parse(line);
        return { title: j.title, url: j.url, id: j.id, thumbnail: j.thumbnail };
      });
      res.json({ success: true, results });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });
});

/* =========================
   FORMATS — dynamic quality list for a video
========================= */
app.get("/api/formats", (req, res) => {
  const { id } = req.query;
  if (!id) return res.status(400).json({ success: false, error: "Missing id" });

  const videoUrl = `https://www.youtube.com/watch?v=${id}`;

  const yt = spawn("yt-dlp", [
    ...COMMON_FLAGS,
    "-j", videoUrl,
  ]);

  let data = "";
  let errData = "";
  yt.stdout.on("data", (chunk) => { data += chunk.toString(); });
  yt.stderr.on("data", (chunk) => { errData += chunk.toString(); });

  yt.on("close", () => {
    if (!data) return res.status(500).json({ success: false, error: errData });

    try {
      const json = JSON.parse(data);

      // Collect unique video heights available
      const heights = new Set();
      (json.formats || []).forEach(f => {
        if (f.vcodec && f.vcodec !== "none" && f.height) {
          heights.add(f.height);
        }
      });

      // Build format list: MP3 always first, then video qualities descending
      const videoFormats = [...heights]
        .sort((a, b) => b - a)
        .map(h => ({
          value: String(h),
          label: h >= 2160 ? "4K" : h >= 1440 ? "2K" : `${h}p`,
          type: "video",
          hd: h >= 720,
        }));

      const formats = [
        { value: "mp3", label: "MP3", type: "audio", hd: false },
        ...videoFormats,
      ];

      res.json({ success: true, formats });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });
});

/* =========================
   VIDEO DETAILS
========================= */
app.get("/api/video", (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).json({ success: false, error: "Missing URL" });

  const yt = spawn("yt-dlp", [...COMMON_FLAGS, "-j", url]);

  let data = "", errData = "";
  yt.stdout.on("data", chunk => { data += chunk.toString(); });
  yt.stderr.on("data", chunk => { errData += chunk.toString(); });

  yt.on("close", () => {
    if (!data) return res.status(500).json({ success: false, error: errData });
    try {
      const json = JSON.parse(data);
      const formats = (json.formats || [])
        .filter(f => f.url && f.ext === "mp4")
        .map(f => ({ quality: f.format_note || "unknown", url: f.url, type: "mp4" }));
      const audio = (json.formats || []).find(f => f.acodec !== "none");
      if (audio) formats.push({ quality: "mp3", url: audio.url, type: "mp3" });
      res.json({ success: true, title: json.title, thumbnail: json.thumbnail, duration: json.duration, formats });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });
});

/* =========================
   DOWNLOAD (STREAM via yt-dlp)
========================= */
app.get("/api/download", (req, res) => {
  const { id, format, title } = req.query;
  if (!id || !format) return res.status(400).json({ success: false, error: "Missing id or format" });

  const videoUrl  = `https://www.youtube.com/watch?v=${id}`;
  const safeTitle = (title || id).replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "_").slice(0, 80);

  if (format === "mp3") {
    const filename = `${safeTitle}_Audio.mp3`;
    const tmpFile  = path.join(os.tmpdir(), `gotube_${id}_mp3_${Date.now()}.mp3`);

    const yt = spawn("yt-dlp", [
      ...COMMON_FLAGS,
      "-x", "--audio-format", "mp3", "--audio-quality", "0",
      "-o", tmpFile, videoUrl,
    ]);

    yt.stderr.on("data", (chunk) => console.error("yt-dlp:", chunk.toString()));
    yt.on("error", (err) => { if (!res.headersSent) res.status(500).json({ success: false, error: "Download failed" }); });

    yt.on("close", (code) => {
      if (code !== 0 || !fs.existsSync(tmpFile)) {
        if (!res.headersSent) res.status(500).json({ success: false, error: "yt-dlp mp3 failed" });
        return;
      }
      const stat = fs.statSync(tmpFile);
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Content-Length", stat.size);
      const stream = fs.createReadStream(tmpFile);
      stream.pipe(res);
      stream.on("close", () => fs.unlink(tmpFile, () => {}));
    });

    req.on("close", () => yt.kill());

  } else {
    const height   = parseInt(format, 10);
    const label    = height >= 2160 ? "4K" : height >= 1440 ? "2K" : height >= 1080 ? "1080p_HD" : height >= 720 ? "720p_HD" : `${height}p`;
    const filename = `${safeTitle}_${label}.mp4`;
    const tmpFile  = path.join(os.tmpdir(), `gotube_${id}_${format}_${Date.now()}.mp4`);

    const yt = spawn("yt-dlp", [
      ...COMMON_FLAGS,
      "-f", `bestvideo[height<=${height}][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=${height}]+bestaudio/best[height<=${height}]/best`,
      "--merge-output-format", "mp4",
      "-o", tmpFile,
      videoUrl,
    ]);

    yt.stderr.on("data", (chunk) => console.error("yt-dlp:", chunk.toString()));
    yt.on("error", (err) => { if (!res.headersSent) res.status(500).json({ success: false, error: "Download failed" }); });

    yt.on("close", (code) => {
      if (code !== 0 || !fs.existsSync(tmpFile)) {
        if (!res.headersSent) res.status(500).json({ success: false, error: "yt-dlp failed" });
        return;
      }
      const stat = fs.statSync(tmpFile);
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Content-Type", "video/mp4");
      res.setHeader("Content-Length", stat.size);
      const stream = fs.createReadStream(tmpFile);
      stream.pipe(res);
      stream.on("close", () => fs.unlink(tmpFile, () => {}));
    });

    req.on("close", () => yt.kill());
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log("GoTube FULL API running on Render");
});
