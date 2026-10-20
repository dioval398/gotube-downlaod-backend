const express = require('express');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();

// SECURITY: Allow your specific Vercel Frontend to talk to this backend
const allowedOrigins = [
    'https://gotube-omega.vercel.app', 
    'http://localhost:5175' // For your local React testing
];

app.use(cors({
    origin: function(origin, callback) {
        if(!origin) return callback(null, true);
        if(allowedOrigins.indexOf(origin) === -1) {
            const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
            return callback(new Error(msg), false);
        }
        return callback(null, true);
    }
}));

app.use(express.json());

// Simple root check
app.get('/', (req, res) => {
    res.json({ status: "GoTube Backend Microservice is active and secured." });
});

// The New API Download Endpoint for React
app.get('/api/formats', (req, res) => {
    const videoId = req.query.id;
    if (!videoId) return res.status(400).json({ error: 'Video ID is required' });

    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const cookiesPath = path.join(__dirname, 'temp_cookies_fmt.txt');

    if (process.env.YOUTUBE_COOKIES) {
        fs.writeFileSync(cookiesPath, process.env.YOUTUBE_COOKIES);
    }
    const cookieFlag = fs.existsSync(cookiesPath) ? `--cookies "${cookiesPath}"` : '';

    const cmd = `yt-dlp ${cookieFlag} --extractor-args "youtube:player_client=android,ios,tv,web;player_js_variant=tv" -j --no-playlist "${videoUrl}"`;

    exec(cmd, (error, stdout, stderr) => {
        if (fs.existsSync(cookiesPath)) fs.unlinkSync(cookiesPath);

        if (error || !stdout) {
            console.error('formats error:', stderr);
            // Return static fallback so UI still shows buttons
            return res.json({ formats: [
                { value: 'mp3',  label: 'MP3',   type: 'audio', hd: false },
                { value: '1080', label: '1080p', type: 'video', hd: true  },
                { value: '720',  label: '720p',  type: 'video', hd: true  },
                { value: '480',  label: '480p',  type: 'video', hd: false },
                { value: '360',  label: '360p',  type: 'video', hd: false },
            ]});
        }

        try {
            const json = JSON.parse(stdout);
            const heights = new Set();
            (json.formats || []).forEach(f => {
                if (f.vcodec && f.vcodec !== 'none' && f.height) heights.add(f.height);
            });

            const videoFormats = [...heights].sort((a, b) => b - a).map(h => ({
                value: String(h),
                label: h >= 2160 ? '4K' : h >= 1440 ? '2K' : `${h}p`,
                type: 'video',
                hd: h >= 720,
            }));

            res.json({ formats: [
                { value: 'mp3', label: 'MP3', type: 'audio', hd: false },
                ...videoFormats,
            ]});
        } catch (e) {
            res.json({ formats: [
                { value: 'mp3',  label: 'MP3',   type: 'audio', hd: false },
                { value: '1080', label: '1080p', type: 'video', hd: true  },
                { value: '720',  label: '720p',  type: 'video', hd: true  },
                { value: '480',  label: '480p',  type: 'video', hd: false },
                { value: '360',  label: '360p',  type: 'video', hd: false },
            ]});
        }
    });
});

app.get('/api/download', (req, res) => {
    const videoId = req.query.id; 
    let formatRequested = (req.query.format || '720').replace('p', ''); 
    
    if (!videoId) return res.status(400).json({ error: 'Video ID parameter is required' });

    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const timestamp = Date.now();
    const cookiesPath = path.join(__dirname, 'temp_cookies.txt');
    
    let outputTemplate = path.join(__dirname, `gotube_%(title)s_${timestamp}.%(ext)s`);
    let formatSelector = '';
    let extraFlags = '';

    if (formatRequested === 'mp3') {
        formatSelector = '-f "bestaudio/best"';
        extraFlags = '-x --audio-format mp3 --audio-quality 0'; 
    } else {
        formatSelector = `-f "bestvideo[height<=${formatRequested}][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=${formatRequested}]+bestaudio/best[height<=${formatRequested}]/best"`;
        extraFlags = '--merge-output-format mp4';
    }

    if (process.env.YOUTUBE_COOKIES) {
        fs.writeFileSync(cookiesPath, process.env.YOUTUBE_COOKIES);
    }
    const cookieFlag = fs.existsSync(cookiesPath) ? `--cookies "${cookiesPath}"` : '';

    // UPDATED: Dropped outdated '--js node' and expanded fallback player clients (android, ios, tv, web)
    const cmd = `yt-dlp ${cookieFlag} --extractor-args "youtube:player_client=android,ios,tv,web;player_js_variant=tv" ${formatSelector} ${extraFlags} -o "${outputTemplate}" "${videoUrl}"`;

    console.log(`React Client requesting ID [${videoId}] at quality [${formatRequested}]. Running...`);

    exec(cmd, (error, stdout, stderr) => {
        if (fs.existsSync(cookiesPath)) fs.unlinkSync(cookiesPath);

        if (error) {
            console.error(`Exec error: ${error}`);
            console.error(`Stderr: ${stderr}`);
            return res.status(500).json({ error: 'Extraction failed. This resolution may not exist or the rate limit was reached.' });
        }

        const files = fs.readdirSync(__dirname);
        const downloadedFile = files.find(file => file.includes(timestamp.toString()));

        if (!downloadedFile) {
            return res.status(500).json({ error: 'Downloaded file handling error.' });
        }

        const fullFilePath = path.join(__dirname, downloadedFile);
        let clientCleanName = downloadedFile.replace(`_${timestamp}`, '');

        res.download(fullFilePath, clientCleanName, (err) => {
            if (fs.existsSync(fullFilePath)) {
                fs.unlinkSync(fullFilePath);
            }
        });
    });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`GoTube API Core listening on port ${PORT}`));