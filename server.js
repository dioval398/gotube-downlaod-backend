const express = require('express');
const cors = require('cors');
const YouTube = require('youtube-sr').default;

const app = express();
const PORT = process.env.PORT || 10000;

// Enable CORS for your React Frontend
app.use(cors({
    origin: '*' // Change this to your specific Vercel URL later if you want to lock it down
}));

app.use(express.json());

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

// Start listening for client application inquiries
app.listen(PORT, () => {
    console.log(`GoTube Render Scraper engine operating efficiently on port ${PORT}`);
});