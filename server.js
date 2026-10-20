const express = require('express');
<<<<<<< HEAD
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
=======
const cors = require('cors');
const YouTube = require('youtube-sr').default;

const app = express();
const PORT = process.env.PORT || 10000;

// Enable CORS for your React Frontend
app.use(cors({
    origin: '*' // Change this to your specific Vercel URL later if you want to lock it down
>>>>>>> 7b2732cf2f06b5549060dafcf646dec1016dc49c
}));

app.use(express.json());

<<<<<<< HEAD
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
=======
// Base diagnostic route
app.get('/', (req, res) => {
    res.json({ status: "online", service: "GoTube Render Scraper Core" });
});

// 1. Search Videos Endpoint (Replaces YouTube API Search)
// Upgraded Ultra-Stable Search Endpoint with Fail-Safe Fallback
const { exec } = require('child_process');

// Heavy-Duty Search Endpoint with yt-dlp Backup
app.get('/api/search', async (req, res) => {
    try {
        const { q } = req.query;
        if (!q) {
            return res.status(400).json({ error: "Search query is required" });
        }

        let results = [];
        
        // --- ENGINE 1: Fast youtube-sr Scraper ---
        try {
            results = await YouTube.search(q, { limit: 15, type: "video" });
        } catch (err) {
            console.warn("youtube-sr failed or blocked, switching to engine 2...");
        }

        // --- ENGINE 2: Bulletproof yt-dlp Backup ---
        if (!results || results.length === 0) {
            console.log(`Executing yt-dlp fallback search for: "${q}"`);
            
            // This command asks yt-dlp to find the top 12 matches and print them flatly as JSON text
            const ytDlpCommand = `yt-dlp "ytsearch12:${q}" --dump-json --flat-playlist --no-playlist`;

            exec(ytDlpCommand, (error, stdout, stderr) => {
                if (error || !stdout) {
                    console.error("Both search engines failed:", stderr);
                    return res.json({ items: [] }); // Return empty array safely if both fail
                }

                try {
                    // Split the line-by-line JSON objects returned by yt-dlp
                    const lines = stdout.trim().split('\n');
                    const formattedVideos = lines.map(line => {
                        const videoData = JSON.parse(line);
                        return {
                            id: { videoId: videoData.id },
                            snippet: {
                                title: videoData.title,
                                thumbnails: {
                                    medium: {
                                        url: `https://i.ytimg.com/vi/${videoData.id}/mqdefault.jpg` // Build stable direct thumbnail URL
                                    }
                                }
                              }
                        };
                    });

                    return res.json({ items: formattedVideos });
                } catch (parseError) {
                    console.error("yt-dlp JSON parsing exception:", parseError);
                    return res.json({ items: [] });
                }
            });
            
            return; // Exit out of the main block and let exec handle the response async
        }

        // If Engine 1 worked perfectly, map and return its data instantly
        const formattedVideos = results.map(video => ({
            id: { videoId: video.id },
            snippet: {
                title: video.title,
                thumbnails: {
                    medium: {
                        url: video.thumbnail?.url || (video.thumbnails && video.thumbnails[0]?.url) || ""
                    }
                }
            }
        }));

        res.json({ items: formattedVideos });

    } catch (error) {
        console.error("Fatal exception inside search router:", error);
        res.status(500).json({ error: "Internal server error gathering video search criteria" });
    }
});

// 2. Initial Trending/Homepage Feed Endpoint (Replaces YouTube API Chart Fetch)
// Updated Initial Trending/Homepage Feed Endpoint (Ultra-Stable Scraper Fallback)
app.get('/api/trending', async (req, res) => {
    try {
        // We use a high-traffic trending search parameter fallback 
        // because YouTube heavily blocks the default raw .trending() scraper on cloud platforms.
        const fallbackQuery = "trending music new";
        const results = await YouTube.search(fallbackQuery, { limit: 16, type: "video" });
        
        if (!results || results.length === 0) {
            return res.json({ items: [] });
        }

        // Map the data to perfectly match your frontend components
        const formattedVideos = results.map(video => ({
            id: { videoId: video.id },
            snippet: {
                title: video.title,
                thumbnails: {
                    medium: {
                        url: video.thumbnail?.url || (video.thumbnails && video.thumbnails[0]?.url) || ""
                    }
                }
            }
        }));

        res.json({ items: formattedVideos });
    } catch (error) {
        console.error("Render Scraper Trending Error:", error);
        res.status(500).json({ error: "Internal server error gathering trending media charts" });
    }
});

// 3. Download Endpoint — streams video/audio via yt-dlp
app.get('/api/download', (req, res) => {
    const { id, format } = req.query;
    if (!id || !format) {
        return res.status(400).json({ error: 'Missing id or format' });
    }

    const url = `https://www.youtube.com/watch?v=${id}`;
    let ytArgs, filename, contentType;

    if (format === 'mp3') {
        ytArgs = `-x --audio-format mp3 --audio-quality 0 -o - "${url}"`;
        filename = `video_${id}.mp3`;
        contentType = 'audio/mpeg';
    } else {
        const height = parseInt(format, 10);
        ytArgs = `-f "bestvideo[height<=${height}]+bestaudio/best[height<=${height}]" --merge-output-format mp4 -o - "${url}"`;
        filename = `video_${id}_${format}p.mp4`;
        contentType = 'video/mp4';
    }

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', contentType);

    const ytProcess = exec(`yt-dlp ${ytArgs}`, { maxBuffer: 1024 * 1024 * 500 });

    ytProcess.stdout.pipe(res);

    ytProcess.stderr.on('data', (data) => console.error('yt-dlp stderr:', data));

    ytProcess.on('error', (err) => {
        console.error('yt-dlp process error:', err);
        if (!res.headersSent) res.status(500).json({ error: 'Download failed' });
    });

    req.on('close', () => ytProcess.kill());
});

// Start listening for client application inquiries
app.listen(PORT, () => {
    console.log(`GoTube Render Scraper engine operating efficiently on port ${PORT}`);
});
>>>>>>> 7b2732cf2f06b5549060dafcf646dec1016dc49c
