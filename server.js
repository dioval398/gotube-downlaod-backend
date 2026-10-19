const express = require("express");
const { spawn } = require("child_process");
const cors = require("cors");

const fs   = require("fs");
const path = require("path");
const os   = require("os");

const app = express();
app.use(cors());
app.use(express.json());

// Write cookies from env var if available, otherwise fall back to cookies.txt file
let COOKIES = path.join(__dirname, "cookies.txt");
if (process.env.YOUTUBE_COOKIES) {
  COOKIES = path.join(os.tmpdir(), "yt_cookies.txt");
  fs.writeFileSync(COOKIES, process.env.YOUTUBE_COOKIES, "utf8");
  console.log("Cookies loaded from YOUTUBE_COOKIES env var");
} else {
  console.log("Cookies loaded from cookies.txt file");
}

/* =========================
   SEARCH (NEW FEATURE)
========================= */
app.get("/search", async (req, res) => {
  const query = req.query.q;

  if (!query) {
    return res.status(400).json({
      success: false,
      error: "Missing search query"
    });
  }

  const yt = spawn("yt-dlp", [
    "--cookies", COOKIES,
    "ytsearch5:" + query,
    "-j",
    "--flat-playlist"
  ]);

  let data = "";

  yt.stdout.on("data", (chunk) => {
    data += chunk.toString();
  });

  yt.on("close", () => {
    try {
      const lines = data.trim().split("\n").filter(Boolean);
      const results = lines.map(line => {
        const json = JSON.parse(line);
        return {
          title: json.title,
          url: json.url,
          id: json.id,
          thumbnail: json.thumbnail
        };
      });

      res.json({
        success: true,
        results
      });

    } catch (e) {
      res.status(500).json({
        success: false,
        error: e.message
      });
    }
  });
});

/* =========================
   VIDEO DETAILS + DOWNLOAD
========================= */
app.get("/api/video", (req, res) => {
  const url = req.query.url;

  if (!url) {
    return res.status(400).json({
      success: false,
      error: "Missing URL"
    });
  }

  const yt = spawn("yt-dlp", [
    "--cookies", COOKIES,
    "-j",
    "--no-playlist",
    url
  ]);

  let data = "";
  let error = "";

  yt.stdout.on("data", chunk => {
    data += chunk.toString();
  });

  yt.stderr.on("data", chunk => {
    error += chunk.toString();
  });

  yt.on("close", () => {
    if (!data) {
      return res.status(500).json({
        success: false,
        error
      });
    }

    try {
      const json = JSON.parse(data);

      const formats = (json.formats || [])
        .filter(f => f.url && f.ext === "mp4")
        .map(f => ({
          quality: f.format_note || "unknown",
          url: f.url,
          type: "mp4"
        }));

      const audio = (json.formats || [])
        .find(f => f.acodec !== "none");

      if (audio) {
        formats.push({
          quality: "mp3",
          url: audio.url,
          type: "mp3"
        });
      }

      res.json({
        success: true,
        title: json.title,
        thumbnail: json.thumbnail,
        duration: json.duration,
        formats
      });

    } catch (e) {
      res.status(500).json({
        success: false,
        error: e.message
      });
    }
  });
});

/* =========================
   DOWNLOAD (STREAM via yt-dlp)
========================= */

app.get("/api/download", (req, res) => {
  const { id, format, title } = req.query;

  if (!id || !format) {
    return res.status(400).json({ success: false, error: "Missing id or format" });
  }

  const videoUrl  = `https://www.youtube.com/watch?v=${id}`;
  const safeTitle = (title || id).replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "_").slice(0, 80);

  let args, filename, contentType, tmpFile;

  if (format === "mp3") {
    // mp3: audio-only, can pipe stdout directly
    filename    = `${safeTitle}_Audio.mp3`;
    contentType = "audio/mpeg";
    args = ["--cookies", COOKIES, "--no-playlist", "-x", "--audio-format", "mp3", "--audio-quality", "0", "-o", "-", videoUrl];

    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", contentType);

    const yt = spawn("yt-dlp", args);
    yt.stdout.pipe(res);
    yt.stderr.on("data", (chunk) => console.error("yt-dlp:", chunk.toString()));
    yt.on("error", (err) => {
      console.error("spawn error:", err);
      if (!res.headersSent) res.status(500).json({ success: false, error: "Download failed" });
    });
    req.on("close", () => yt.kill());

  } else {
    // video: must write to temp file first because mp4 muxing requires seekable output
    const height  = parseInt(format, 10);
    const label   = height === 1080 ? "1080p_HD" : height === 720 ? "720p_HD" : `${height}p`;
    filename    = `${safeTitle}_${label}.mp4`;
    contentType = "video/mp4";
    tmpFile     = path.join(os.tmpdir(), `gotube_${id}_${format}_${Date.now()}.mp4`);

    args = [
      "--cookies", COOKIES,
      "-f", `bestvideo[height<=${height}][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=${height}]+bestaudio/best[height<=${height}]/best`,
      "--merge-output-format", "mp4",
      "--no-playlist",
      "-o", tmpFile,
      videoUrl
    ];

    const yt = spawn("yt-dlp", args);
    yt.stderr.on("data", (chunk) => console.error("yt-dlp:", chunk.toString()));

    yt.on("error", (err) => {
      console.error("spawn error:", err);
      if (!res.headersSent) res.status(500).json({ success: false, error: "Download failed" });
    });

    yt.on("close", (code) => {
      if (code !== 0 || !fs.existsSync(tmpFile)) {
        if (!res.headersSent) res.status(500).json({ success: false, error: "yt-dlp failed" });
        return;
      }

      const stat = fs.statSync(tmpFile);
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Length", stat.size);

      const stream = fs.createReadStream(tmpFile);
      stream.pipe(res);
      stream.on("close", () => fs.unlink(tmpFile, () => {}));
    });

    req.on("close", () => yt.kill());
  }
});

/* =========================
   SERVER START
========================= */
app.listen(process.env.PORT || 3000, () => {
  console.log("GoTube FULL API running on Render");
});