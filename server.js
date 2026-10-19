const express = require("express");
const { spawn } = require("child_process");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

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
  const { id, format } = req.query;

  if (!id || !format) {
    return res.status(400).json({ success: false, error: "Missing id or format" });
  }

  const videoUrl = `https://www.youtube.com/watch?v=${id}`;
  let args, filename, contentType;

  if (format === "mp3") {
    args = ["-x", "--audio-format", "mp3", "--audio-quality", "0", "-o", "-", videoUrl];
    filename = `${id}.mp3`;
    contentType = "audio/mpeg";
  } else {
    const height = parseInt(format, 10);
    args = [
      "-f", `bestvideo[height<=${height}]+bestaudio/best[height<=${height}]`,
      "--merge-output-format", "mp4",
      "-o", "-",
      videoUrl
    ];
    filename = `${id}_${format}p.mp4`;
    contentType = "video/mp4";
  }

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
});

/* =========================
   SERVER START
========================= */
app.listen(process.env.PORT || 3000, () => {
  console.log("GoTube FULL API running on Render");
});