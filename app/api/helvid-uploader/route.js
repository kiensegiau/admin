import { NextResponse } from "next/server";
import axios from "axios";
import crypto from 'crypto';

export const dynamic = "force-dynamic";

export class HelvidUploader {
    constructor() {
        this.client = axios.create({
            headers: {
                'accept': 'application/json, text/javascript, */*; q=0.01',
                'accept-language': 'vi,en-US;q=0.9,en;q=0.8,fr-FR;q=0.7,fr;q=0.6',
                'cache-control': 'no-cache',
                'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'origin': 'https://helvid.com',
                'pragma': 'no-cache',
                'priority': 'u=1, i',
                'sec-ch-ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': '"Windows"',
                'sec-fetch-dest': 'empty',
                'sec-fetch-mode': 'cors',
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                'x-requested-with': 'XMLHttpRequest'
            }
        });

        // Set cookies
        this.cookies = {
            'remember_me': 'b8a4a883f40fa423d0d5116f401759df2a36f8e28a002a01cb2355bac62da7dfa157249e5b702c04a0404acfeedbf0ef9138',
            'cscms_user_id': '1100miQrAK2tP0YW%2FsebR7XN6Gbnu1klE6MHbnlu7q4bMQ',
            'cscms_user_login': '34b1pWA%2Fhiy4Pro0WxaN%2F40q%2FXDf3XfjIeHv-oPoGCWAO-qJqaMPINfDb%2FHCB-hdVVSqC7BUNUxYJ92a2w',
            'cf_clearance': 'gdc.1khRVh8sbLKpkb_rlRmPNAiDy5ZF6jbF_ohkpIM-1739713221-1.2.1.1-pBe0zPhA3xrl18R_v8rIvtvcw_ubpJZ.YgzeAvK_qymxtL7MrxuSneRJ1h8H5Hz09dOkV6PuAVX_vCryzvkPuEHCaxdUKmwI1KIH19zjIhTmqQ81dsf3Bx9j3_WAPPpJ2lZ4G9xbvc0_nO.uJ4C9K0NWpU4CjJo7KtR0Jd57uAOi5dK.Ad2gM6NFvxMTk_EQ0Lw.Cnka.nfFCyfaMWiZ6D.X8Ps1z.u04oPkCYRpTVEoDE9DlVIWcd1dLq.Dm3oxXMmyWahsqYkQwmNxIHeYTS_VpwBw4JKRIm1eo9xrV3s'
        };
    }

    _formatCookies() {
        return Object.entries(this.cookies)
            .map(([key, value]) => `${key}=${value}`)
            .join('; ');
    }

    async getUploadKey() {
        try {
            const response = await this.client.post('https://helvid.com/upload/getkey', {
                cid: '15',
                mycid: '0',
                fid: '21',
                folder_id: ''
            }, {
                headers: {
                    'authority': 'helvid.com',
                    'referer': 'https://helvid.com/upload/loadurl',
                    'sec-fetch-site': 'same-origin',
                    'cookie': this._formatCookies()
                }
            });
            return response.data;
        } catch (error) {
            console.error('Error getting upload key:', error.message);
            throw error;
        }
    }

    async uploadFile(driveUrl, uploadKey) {
        try {
            // Tạo FormData để gửi dữ liệu
            const formData = new URLSearchParams();
            formData.append('videoUrl', driveUrl);
            formData.append('folder_id', '');

            const response = await this.client.post(
                `https://remote.helvid.com/upload.php?key=${uploadKey.data}`, // Sử dụng uploadKey.data
                formData.toString(), // Gửi dữ liệu dưới dạng form urlencoded
                {
                    headers: {
                        'authority': 'remote.helvid.com',
                        'referer': 'https://helvid.com/',
                        'sec-fetch-site': 'same-site',
                        'cookie': this._formatCookies(),
                        'content-type': 'application/x-www-form-urlencoded' // Đảm bảo content-type đúng
                    }
                }
            );
            return response.data;
        } catch (error) {
            console.error('Error uploading file:', error.message);
            throw error;
        }
    }

    async checkStatus() {
        try {
            const response = await this.client.get('https://helvid.com/index.php/ting', {
                params: { id: '0' },
                headers: {
                    'authority': 'helvid.com',
                    'accept': '*/*',
                    'referer': 'https://helvid.com/upload/loadurl',
                    'sec-fetch-site': 'same-origin',
                    'cookie': this._formatCookies()
                }
            });
            return response.data;
        } catch (error) {
            console.error('Error checking status:', error.message);
            throw error;
        }
    }

    async uploadFromDrive(driveUrl) {
        try {
            console.log('Getting upload key...');
            const uploadKey = await this.getUploadKey();
            
            console.log('Uploading file...');
            const uploadResponse = await this.uploadFile(driveUrl, uploadKey);
            
            console.log('Checking status...');
            const status = await this.checkStatus();

            // Lấy video ID từ response
            const videoId = await getVideoId.call(this, uploadResponse.did);
            
            const videoUrl = uploadResponse.code === 1 
                ? `https://helvid.net/play/index/${videoId}`
                : null;

            return {
                success: true,
                data: {
                    videoUrl,
                    originalUrl: `https://helvid.com/video/${uploadResponse.did}`,
                    debug: {
                        originalDid: uploadResponse.did,
                        videoId
                    }
                }
            };
        } catch (error) {
            console.error('Upload process failed:', error.message);
            return {
                success: false,
                error: error.message || "Upload failed"
            };
        }
    }
}

// Cập nhật hàm generateVideoHash
function generateVideoHash(did) {
    // Tạo input string với format đặc biệt
    const input = `helvid_${did}_${process.env.HELVID_SECRET || 'default_secret'}`;
    
    // Sử dụng MD5 hash
    const hash = crypto.createHash('md5')
        .update(input)
        .digest('hex');
    
    // Lấy 12 ký tự đầu tiên
    return hash.substring(0, 12);
}

async function getVideoId(did) {
    try {
        // Đợi 1-2 giây để video được xử lý
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Lấy thông tin video từ response với URL chính xác
        const response = await axios.get(`https://helvid.com/vod/index/15`, {
            headers: {
                'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                'accept-language': 'vi,en-US;q=0.9,en;q=0.8,fr-FR;q=0.7,fr;q=0.6',
                'cache-control': 'no-cache',
                'pragma': 'no-cache',
                'sec-ch-ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': '"Windows"',
                'sec-fetch-dest': 'document',
                'sec-fetch-mode': 'navigate',
                'sec-fetch-site': 'same-origin',
                'sec-fetch-user': '?1',
                'upgrade-insecure-requests': '1',
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                'Cookie': this._formatCookies(),
                'referer': 'https://helvid.com/vod'
            }
        });

        // Tìm video ID trong response data
        const match = response.data.match(new RegExp(`"id":"${did}","vid":"([^"]+)"`));
        if (match) {
            return match[1];
        }

        // Nếu không tìm thấy, thử tìm trong upl_array
        const uplArrayMatch = response.data.match(/var upl_array=(\[.*?\]);/s);
        if (uplArrayMatch) {
            const uplArray = JSON.parse(uplArrayMatch[1]);
            const video = uplArray.find(v => v.link && v.link.includes('/index/'));
            if (video) {
                const vidMatch = video.link.match(/\/index\/([a-f0-9]+)/);
                if (vidMatch) {
                    return vidMatch[1];
                }
            }
        }

        throw new Error('Could not find video ID');
    } catch (error) {
        console.error('Error getting video ID:', error);
        throw error;
    }
}

export async function POST(request) {
    try {
        const { driveUrl } = await request.json();
        if (!driveUrl) {
            return NextResponse.json(
                { error: "Missing drive URL" },
                { status: 400 }
            );
        }

        const uploader = new HelvidUploader();
        const result = await uploader.uploadFromDrive(driveUrl);

        return NextResponse.json(result);
    } catch (error) {
        console.error("Upload error:", error);
        return NextResponse.json(
            { 
                success: false, 
                error: error.message || "Upload failed" 
            },
            { status: 500 }
        );
    }
}