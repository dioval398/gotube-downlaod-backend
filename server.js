const express = require('express');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();

app.use(cors({ origin: '*' }));
app.use(express.json());

// Double-slash resilience middleware — normalizes //api/x to /api/x
app.use((req, _res, next) => {
    req.url = req.url.replace(/\/\/+/g, '/');
    next();
});

// ── Cookies: write from env var once at startup ──
const COOKIES_PATH = '/tmp/yt_cookies.txt';
if (process.env.YOUTUBE_COOKIES) {
    fs.writeFileSync(COOKIES_PATH, process.env.YOUTUBE_COOKIES, 'utf8');
    console.log('Cookies written from YOUTUBE_COOKIES env var');
} else if (fs.existsSync(path.join(__dirname, 'cookies.txt'))) {
    fs.copyFileSync(path.join(__dirname, 'cookies.txt'), COOKIES_PATH);
    console.log('Cookies copied from cookies.txt');
}

const COOKIE_FLAG = fs.existsSync(COOKIES_PATH) ? `--cookies "${COOKIES_PATH}"` : '';

// Only use cookie-compatible clients (web supports cookies, android/ios do not)
const YT_ARGS = `${COOKIE_FLAG} --extractor-args "youtube:player_client=web" --no-playlist`;

const FALLBACK_FORMATS = [
    { value: 'mp3',  label: 'MP3',   type: 'audio', hd: false },
    { value: '1080', label: '1080p', type: 'video', hd: true  },
    { value: '720',  label: '720p',  type: 'video', hd: true  },
    { value: '480',  label: '480p',  type: 'video', hd: false },
    { value: '360',  label: '360p',  type: 'video', hd: false },
];

app.get('/', (_req, res) => {
    res.json({ status: 'online', service: 'GoTube Download Backend v3' });
});

/* ════════════════════════════════════════
   GET /api/formats
   Returns available video qualities for a given YouTube video ID.
════════════════════════════════════════ */
app.get('/api/formats', (req, res) => {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'Missing id' });

    const cmd = `yt-dlp ${YT_ARGS} -j "https://www.youtube.com/watch?v=${id}"`;
    console.log(`[formats] Fetching formats for: ${id}`);

    exec(cmd, { timeout: 60000 }, (error, stdout, stderr) => {
        if (error || !stdout) {
            console.error('[formats] yt-dlp error:', stderr);
            return res.json({ formats: FALLBACK_FORMATS });
        }
        try {
            const json = JSON.parse(stdout);
            const heights = new Set();
            (json.formats || []).forEach(f => {
                if (f.vcodec && f.vcodec !== 'none' && f.height) heights.add(f.height);
            });

            if (heights.size === 0) return res.json({ formats: FALLBACK_FORMATS });

            const videoFormats = [...heights].sort((a, b) => b - a).map(h => ({
                value: String(h),
                label: h >= 2160 ? '4K' : h >= 1440 ? '2K' : `${h}p`,
                type: 'video',
                hd: h >= 720,
            }));

            res.json({ formats: [{ value: 'mp3', label: 'MP3', type: 'audio', hd: false }, ...videoFormats] });
        } catch (e) {
            console.error('[formats] parse error:', e.message);
            res.json({ formats: FALLBACK_FORMATS });
        }
    });
});

/* ════════════════════════════════════════
   GET /api/download
   Downloads and streams a YouTube video/audio file.
   Query params: id, format (mp3 | 360 | 480 | 720 | 1080 | 1440 | 2160), title
════════════════════════════════════════ */
app.get('/api/download', (req, res) => {
    const { id, title } = req.query;
    // Normalize format: strip any trailing 'p' so "720p" and "720" both work
    const format = (req.query.format || '').replace(/p$/i, '').trim();

    if (!id || !format) return res.status(400).json({ error: 'Missing id or format' });

    const videoUrl  = `https://www.youtube.com/watch?v=${id}`;
    const safeTitle = (title || id).replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_').slice(0, 80) || id;
    const timestamp = Date.now();

    let formatSelector, extraFlags, ext, label;

    if (format === 'mp3') {
        formatSelector = '-f "bestaudio/best"';
        extraFlags     = '-x --audio-format mp3 --audio-quality 0';
        ext            = 'mp3';
        label          = 'Audio';
    } else {
        const h        = parseInt(format, 10);
        if (isNaN(h)) return res.status(400).json({ error: `Invalid format: ${format}` });
        label          = h >= 2160 ? '4K' : h >= 1440 ? '2K' : h >= 1080 ? '1080p_HD' : h >= 720 ? '720p_HD' : `${h}p`;
        formatSelector = `-f "bestvideo[height<=${h}][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=${h}]+bestaudio/best[height<=${h}]/best"`;
        extraFlags     = '--merge-output-format mp4';
        ext            = 'mp4';
    }

    const filename       = `${safeTitle}_${label}.${ext}`;
    const outputTemplate = `/tmp/gotube_${timestamp}.%(ext)s`;
    const cmd            = `yt-dlp ${YT_ARGS} ${formatSelector} ${extraFlags} -o "${outputTemplate}" "${videoUrl}"`;

    console.log(`[download] id=${id} format=${format} file=${filename}`);

    exec(cmd, { timeout: 300000 }, (error, _stdout, stderr) => {
        if (error) {
            console.error('[download] yt-dlp error:', stderr);
            if (!res.headersSent) res.status(500).json({ error: 'yt-dlp failed. Format may be unavailable.' });
            return;
        }

        const outFile = fs.readdirSync('/tmp').find(f => f.startsWith(`gotube_${timestamp}`));
        if (!outFile) {
            if (!res.headersSent) res.status(500).json({ error: 'Output file not found after download.' });
            return;
        }

        const fullPath = `/tmp/${outFile}`;
        const stat     = fs.statSync(fullPath);

        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Type', ext === 'mp3' ? 'audio/mpeg' : 'video/mp4');
        res.setHeader('Content-Length', stat.size);

        const stream = fs.createReadStream(fullPath);
        stream.pipe(res);
        stream.on('close', () => fs.unlink(fullPath, () => {}));
        stream.on('error', (err) => {
            console.error('[download] stream error:', err.message);
            fs.unlink(fullPath, () => {});
        });
    });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`GoTube Download Backend v3 on port ${PORT}`));
