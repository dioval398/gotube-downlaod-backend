const express = require('express');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const app = express();

// 1. Updated HTML Frontend UI with Format Buttons
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Premium Video Downloader</title>
            <style>
                body { font-family: 'Segoe UI', Arial, sans-serif; text-align: center; margin-top: 50px; background: #1a1a1a; color: #fff; }
                .container { max-width: 600px; margin: auto; padding: 20px; background: #2d2d2d; border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.5); }
                input { width: 80%; padding: 12px; margin: 15px 0; border: 1px solid #444; border-radius: 4px; font-size:16px; background: #3d3d3d; color: #fff; }
                .button-group { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-top: 15px; }
                button { padding: 12px; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; font-size:14px; transition: 0.2s; }
                .btn-video { background: #00bcd4; color: white; }
                .btn-video:hover { background: #0097a7; }
                .btn-mp3 { background: #e91e63; color: white; grid-column: span 2; font-size: 16px; }
                .btn-mp3:hover { background: #c2185b; }
                #status { margin-top: 20px; color: #bbb; font-weight: bold; min-height: 24px; }
            </style>
        </head>
        <body>
            <div class="container">
                <h2>Cloud Media Downloader</h2>
                <p>Paste your link and select your preferred download format:</p>
                <input type="text" id="url" placeholder="https://www.youtube.com/watch?v=...">
                
                <div class="button-group">
                    <button class="btn-video" onclick="triggerDownload('360')">🎬 Download 360p (MP4)</button>
                    <button class="btn-video" onclick="triggerDownload('480')">🎬 Download 480p (MP4)</button>
                    <button class="btn-video" onclick="triggerDownload('720')">🎬 Download 720p (MP4)</button>
                    <button class="btn-video" onclick="triggerDownload('1080')">🎬 Download 1080p (MP4)</button>
                    <button class="btn-mp3" onclick="triggerDownload('mp3')">🎵 Extract Audio (MP3)</button>
                </div>
                <div id="status"></div>
            </div>

            <script>
                function triggerDownload(format) {
                    const url = document.getElementById('url').value;
                    if (!url) return alert('Please paste a video link first!');
                    
                    const statusDiv = document.getElementById('status');
                    statusDiv.innerText = "Processing format requests on cloud server... please wait.";
                    
                    // Directs browser to download endpoint passing both URL and format requested
                    window.location.href = \`/download?url=\${encodeURIComponent(url)}&format=\${format}\`;
                }
            </script>
        </body>
        </html>
    `);
});

// 2. Updated Dynamic Download Handler
app.get('/download', (req, res) => {
    const videoUrl = req.query.url;
    const formatRequested = req.query.format || '720'; // Default backup to 720p
    
    if (!videoUrl) return res.status(400).send('URL parameter is required');

    const timestamp = Date.now();
    const cookiesPath = path.join(__dirname, 'temp_cookies.txt');
    
    let outputFilename = `download_${timestamp}.mp4`;
    let formatSelector = '';
    let extraFlags = '';

    // Set up commands depending on what option button the user clicked
    if (formatRequested === 'mp3') {
        outputFilename = `audio_${timestamp}.mp3`;
        formatSelector = '-f "bestaudio/best"';
        extraFlags = '-x --audio-format mp3 --audio-quality 0'; // Extracts pure audio and converts to mp3
    } else {
        // Limits height format cap checks based on user selection rules
        formatSelector = `-f "bestvideo[ext=mp4][height<=${formatRequested}]+bestaudio[ext=m4a]/best[ext=mp4][height<=${formatRequested}]/best"`;
        extraFlags = '--merge-output-format mp4';
    }

    const outputPath = path.join(__dirname, outputFilename);

    if (process.env.YOUTUBE_COOKIES) {
        fs.writeFileSync(cookiesPath, process.env.YOUTUBE_COOKIES);
    }
    const cookieFlag = fs.existsSync(cookiesPath) ? `--cookies "${cookiesPath}"` : '';

    // Unified command incorporating dynamic format specifications
    const cmd = `yt-dlp ${cookieFlag} --js node --extractor-args "youtube:player_client=tv;player_js_variant=tv" ${formatSelector} ${extraFlags} -o "${outputPath}" "${videoUrl}"`;

    console.log(`User requested format [${formatRequested}]. Running: ${cmd}`);

    exec(cmd, (error, stdout, stderr) => {
        if (fs.existsSync(cookiesPath)) fs.unlinkSync(cookiesPath);

        if (error) {
            console.error(`Exec error: ${error}`);
            return res.status(500).send('Error formatting media file. Requested resolution might not be available for this specific video.');
        }

        // Delivers file to user with correct extensions
        const clientDownloadName = formatRequested === 'mp3' ? 'audio.mp3' : `video_${formatRequested}p.mp4`;
        
        res.download(outputPath, clientDownloadName, (err) => {
            if (fs.existsSync(outputPath)) {
                fs.unlinkSync(outputPath);
            }
        });
    });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));