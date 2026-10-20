const express = require('express');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();

app.use(cors({ origin: '*' }));
app.use(express.json());

// Write cookies from env var once at startup
const COOKIES_PATH = path.join('/tmp', 'yt_cookies.txt');
if (process.env.YOUTUBE_COOKIES) {
    fs.writeFileSync(COOKIES_PATH, process.env.YOUTUBE_COOKIES, 'utf8');
    console.log('Cookies written from YOUTUBE_COOKIES env var');
}
const COOKIE_FLAG = fs.existsSync(COOKIES_PATH) ? `--cookies "${COOKIES_PATH}"` : '';
const YT_ARGS    = `${COOKIE_FLAG} --extractor-args "youtube:player_client=android,ios,tv,web;player_js_variant=tv" --no-playlist`;

app.get('/', (req, res) => {
    res.json({ status: 'online', service: 'GoTube Download Backend' });
});

/* ── /api/formats — returns available qualities for a video ── */
app.get('/api/formats', (req, res) => {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'Missing id' });

    const FALLBACK = [
        { value: 'mp3',  label: 'MP3',   type: 'audio', hd: false },
        { value: '1080', label: '1080p', type: 'video', hd: true  },
        { value: '720',  label: '720p',  type: 'video', hd: true  },
        { value: '480',  label: '480p',  type: 'video', hd: false },
        { value: '360',  label: '360p',  type: 'video', hd: false },
    ];

    const cmd = `yt-dlp ${YT_ARGS} -j "https://www.youtube.com/watch?v=${id}"`;

    exec(cmd, { timeout: 30000 }, (error, stdout, stderr) => {
        if (error || !stdout) {
            console.error('formats error:', stderr);
            return res.json({ formats: FALLBACK });
        }
        try {
            const json = JSON.parse(stdout);
            const heights = new Set();
            (json.formats || []).forEach(f => {
                if (f.vcodec && f.vcodec !== 'none' && f.height) heights.add(f.height);
            });

            if (heights.size === 0) return res.json({ formats: FALLBACK });

            const videoFormats = [...heights].sort((a, b) => b - a).map(h => ({
                value: String(h),
                label: h >= 2160 ? '4K' : h >= 1440 ? '2K' : `${h}p`,
                type: 'video',
                hd: h >= 720,
            }));

            res.json({ formats: [{ value: 'mp3', label: 'MP3', type: 'audio', hd: false }, ...videoFormats] });
        } catch (e) {
            res.json({ formats: FALLBACK });
        }
    });
});

/* ── /api/download — downloads and streams video/audio ── */
app.get('/api/download', (req, res) => {
    const { id, format, title } = req.query;
    if (!id || !format) return res.status(400).json({ error: 'Missing id or format' });

    const videoUrl  = `https://www.youtube.com/watch?v=${id}`;
    const safeTitle = (title || id).replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_').slice(0, 80);
    const timestamp = Date.now();
    const tmpDir    = '/tmp';

    let formatSelector, extraFlags, filename, ext;

    if (format === 'mp3') {
        formatSelector = '-f "bestaudio/best"';
        extraFlags     = '-x --audio-format mp3 --audio-quality 0';
        ext            = 'mp3';
        filename       = `${safeTitle}_Audio.mp3`;
    } else {
        const h        = parseInt(format, 10);
        const label    = h >= 2160 ? '4K' : h >= 1440 ? '2K' : h >= 1080 ? '1080p_HD' : h >= 720 ? '720p_HD' : `${h}p`;
        formatSelector = `-f "bestvideo[height<=${h}][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=${h}]+bestaudio/best[height<=${h}]/best"`;
        extraFlags     = '--merge-output-format mp4';
        ext            = 'mp4';
        filename       = `${safeTitle}_${label}.mp4`;
    }

    const outputTemplate = path.join(tmpDir, `gotube_${timestamp}.%(ext)s`);
    const cmd = `yt-dlp ${YT_ARGS} ${formatSelector} ${extraFlags} -o "${outputTemplate}" "${videoUrl}"`;

    console.log(`Downloading [${id}] format [${format}]`);

    exec(cmd, { timeout: 300000 }, (error, stdout, stderr) => {
        if (error) {
            console.error('yt-dlp error:', stderr);
            if (!res.headersSent) return res.status(500).json({ error: 'Download failed' });
            return;
        }

        // Find the output file
        const files = fs.readdirSync(tmpDir);
        const outFile = files.find(f => f.startsWith(`gotube_${timestamp}`));

        if (!outFile) {
            if (!res.headersSent) return res.status(500).json({ error: 'Output file not found' });
            return;
        }

        const fullPath = path.join(tmpDir, outFile);
        const stat     = fs.statSync(fullPath);

        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Type', ext === 'mp3' ? 'audio/mpeg' : 'video/mp4');
        res.setHeader('Content-Length', stat.size);

        const stream = fs.createReadStream(fullPath);
        stream.pipe(res);
        stream.on('close', () => fs.unlink(fullPath, () => {}));
    });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`GoTube Download Backend listening on port ${PORT}`));
