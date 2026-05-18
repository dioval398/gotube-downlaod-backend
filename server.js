const express = require('express');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();

// SECURITY: Allow your specific Vercel Frontend to talk to this backend
const allowedOrigins = [
    'https://gotube-omega.vercel.app', 
    'http://localhost:5173' // For your local React testing
];

app.use(cors({
    origin: function(origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
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
    const videoId = req.query.id; // Passing just the ID (e.g. YxyVGDo2PvY) is safer than full URLs
    const formatRequested = req.query.format || '720'; 
    
    if (!videoId) return res.status(400).json({ error: 'Video ID parameter is required' });

    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const timestamp = Date.now();
    const cookiesPath = path.join(__dirname, 'temp_cookies.txt');
    
    // Output template tells yt-dlp to use the REAL video title! 
    // %(title)s inserts the YouTube title automatically.
    let outputTemplate = path.join(__dirname, `gotube_%(title)s_${timestamp}.%(ext)s`);
    let formatSelector = '';
    let extraFlags = '';

    if (formatRequested === 'mp3') {
        formatSelector = '-f "bestaudio/best"';
        extraFlags = '-x --audio-format mp3 --audio-quality 0'; 
    } else {
        formatSelector = `-f "bestvideo[ext=mp4][height<=${formatRequested}]+bestaudio[ext=m4a]/best[ext=mp4][height<=${formatRequested}]/best"`;
        extraFlags = '--merge-output-format mp4';
    }

    if (process.env.YOUTUBE_COOKIES) {
        fs.writeFileSync(cookiesPath, process.env.YOUTUBE_COOKIES);
    }
    const cookieFlag = fs.existsSync(cookiesPath) ? `--cookies "${cookiesPath}"` : '';

    // Full secure execution command using Node JS challenge solving logic
    const cmd = `yt-dlp ${cookieFlag} --js node --extractor-args "youtube:player_client=tv;player_js_variant=tv" ${formatSelector} ${extraFlags} -o "${outputTemplate}" "${videoUrl}"`;

    console.log(`React Client requesting ID [${videoId}] at quality [${formatRequested}]. Running...`);

    exec(cmd, (error, stdout, stderr) => {
        if (fs.existsSync(cookiesPath)) fs.unlinkSync(cookiesPath);

        if (error) {
            console.error(`Exec error: ${error}`);
            return res.status(500).json({ error: 'Extraction failed. This resolution may not exist for this video.' });
        }

        // Find the newly downloaded file matching our unique timestamp
        const files = fs.readdirSync(__dirname);
        const downloadedFile = files.find(file => file.includes(timestamp.toString()));

        if (!downloadedFile) {
            return res.status(500).json({ error: 'Downloaded file handling error.' });
        }

        const fullFilePath = path.join(__dirname, downloadedFile);
        
        // Clean up title formatting for safe header transmission
        // Removes our internal timestamp so the user gets a pristine file name
        let clientCleanName = downloadedFile.replace(`_${timestamp}`, '');

        // Force browser file download attachment trigger
        res.download(fullFilePath, clientCleanName, (err) => {
            if (fs.existsSync(fullFilePath)) {
                fs.unlinkSync(fullFilePath); // Clean disk space immediately!
            }
        });
    });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`GoTube API Core listening on port ${PORT}`));