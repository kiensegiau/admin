const express = require('express');
const cors = require('cors');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const app = express();

app.use(cors());
app.use(express.json());

const SEGMENT_SIZE = 5 * 1024 * 1024; // 5MB mỗi segment

// Hàm lấy thông tin file từ Google Drive
async function getFileInfo(fileId) {
    try {
        // Request đầu tiên để lấy cookie và xác nhận download
        const initialResponse = await fetch(`https://drive.google.com/uc?id=${fileId}`, {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        const text = await initialResponse.text();
        
        // Kiểm tra nếu cần xác nhận
        if (text.includes('confirm=')) {
            const confirmResponse = await fetch(`https://drive.google.com/uc?id=${fileId}&confirm=t`, {
                method: 'GET',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Cookie': initialResponse.headers.get('set-cookie')
                }
            });

            // Lấy cookie từ response xác nhận
            const cookies = confirmResponse.headers.get('set-cookie');

            // Request với range để lấy kích thước file
            const rangeResponse = await fetch(`https://drive.google.com/uc?id=${fileId}&confirm=t`, {
                headers: {
                    'Range': 'bytes=0-1',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Cookie': cookies
                }
            });

            // Lấy kích thước từ Content-Range
            const contentRange = rangeResponse.headers.get('content-range');
            console.log('Content-Range:', contentRange);
            const size = contentRange ? parseInt(contentRange.split('/')[1]) : null;

            return {
                url: `https://drive.google.com/uc?id=${fileId}&confirm=t`,
                size: size,
                cookies: cookies
            };
        } else {
            // Nếu không cần xác nhận
            const rangeResponse = await fetch(`https://drive.google.com/uc?id=${fileId}`, {
                headers: {
                    'Range': 'bytes=0-1',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });

            const contentRange = rangeResponse.headers.get('content-range');
            console.log('Content-Range:', contentRange);
            const size = contentRange ? parseInt(contentRange.split('/')[1]) : null;

            return {
                url: `https://drive.google.com/uc?id=${fileId}`,
                size: size,
                cookies: initialResponse.headers.get('set-cookie')
            };
        }
    } catch (error) {
        console.error('Error in getFileInfo:', error);
        throw error;
    }
}

// Route chính xử lý video
app.get('/proxy-stream', async (req, res) => {
    try {
        if (!req.query.url) {
            throw new Error('URL is required');
        }

        const fileId = req.query.url.match(/\/d\/(.*?)\/view/)?.[1];
        if (!fileId) throw new Error('Invalid Google Drive URL');

        const fileInfo = await getFileInfo(fileId);
        console.log('File Info:', fileInfo); // Log để debug

        if (!fileInfo.size) throw new Error('Could not get file size');

        const totalSegments = Math.ceil(fileInfo.size / SEGMENT_SIZE);

        res.json({
            fileId,
            totalSize: fileInfo.size,
            totalSegments,
            segmentSize: SEGMENT_SIZE,
            segments: Array.from({ length: totalSegments }, (_, i) => ({
                url: `/video-segment/${fileId}/${i}`,
                start: i * SEGMENT_SIZE,
                end: Math.min((i + 1) * SEGMENT_SIZE - 1, fileInfo.size - 1)
            }))
        });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: error.message, stack: error.stack });
    }
});

// Route xử lý segments
app.get('/video-segment/:fileId/:segment', async (req, res) => {
    try {
        const { fileId, segment } = req.params;
        const segmentNumber = parseInt(segment);
        
        const fileInfo = await getFileInfo(fileId);
        
        const start = segmentNumber * SEGMENT_SIZE;
        const end = Math.min(start + SEGMENT_SIZE - 1, fileInfo.size - 1);

        // Headers cho Cloudflare cache
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.setHeader('CDN-Cache-Control', 'max-age=86400');

        const response = await fetch(fileInfo.url, {
            headers: {
                'Range': `bytes=${start}-${end}`,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Cookie': fileInfo.cookies
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch video segment: ${response.status} ${response.statusText}`);
        }

        res.setHeader('Content-Type', 'video/mp4');
        res.setHeader('Content-Length', end - start + 1);
        res.setHeader('Accept-Ranges', 'bytes');
        res.status(206);

        response.body.pipe(res);

    } catch (error) {
        console.error('Stream error:', error);
        res.status(500).json({ error: error.message, stack: error.stack });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log('Debug mode enabled');
});
