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
app.get('/api/search', async (req, res) => {
    try {
        const { q } = req.query;
        if (!q) {
            return res.status(400).json({ error: "Search query string parameter 'q' is required" });
        }

        // Fetch up to 20 search items safely using public scraping rules
        const results = await YouTube.search(q, { limit: 20, type: "video" });
        
        // Format the scraped response to perfectly match what our React components expect
        const formattedVideos = results.map(video => ({
            id: { videoId: video.id }, // Matches the structural layout of standard YouTube API response objects
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
        console.error("Render Scraper Search Error:", error);
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