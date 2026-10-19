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