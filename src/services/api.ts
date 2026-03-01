import { NewsItem, ShortItem, NewsType } from '../types';

const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:5000/api'
    : `http://${window.location.hostname}:5000/api`;

export const normalizeMediaUrl = (url: string | undefined): string => {
    if (!url) return '';
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        // Replace any IP address based URL (e.g. http://172.16.x.x:5000/uploads) with localhost
        return url.replace(/^http:\/\/[0-9.]+:5000\/uploads/, 'http://localhost:5000/uploads');
    }
    return url;
};

export const api = {
    // --- NEWS ---
    async getNews(district?: string, role?: string) {
        let url = `${API_URL}/news`;
        if (role && district) {
            url += `?role=${role}&district=${encodeURIComponent(district)}`;
        }
        const res = await fetch(url);
        if (!res.ok) throw new Error('Failed to fetch news');
        const data = await res.json();

        return data.map((item: any) => ({
            id: item.id,
            title: item.title,
            description: item.description,
            imageUrl: item.image_url,
            videoUrl: item.video_url,
            area: item.area,
            type: item.type as NewsType,
            isBreaking: item.is_breaking,
            liveLink: item.live_link,
            timestamp: item.timestamp,
            author: item.author || 'Admin',
            status: item.status as 'published' | 'pending' | 'rejected'
        })) as NewsItem[];
    },

    async createNews(news: Omit<NewsItem, 'id' | 'timestamp'>) {
        const res = await fetch(`${API_URL}/news`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: news.title,
                description: news.description,
                img_url: news.imageUrl,
                video_url: news.videoUrl,
                area: news.area,
                type: news.type,
                is_breaking: news.isBreaking,
                live_link: news.liveLink,
                author: news.author || 'Admin',
                status: news.status || 'published',
            })
        });
        if (!res.ok) throw new Error('Failed to create news');
        return await res.json();
    },

    async updateNews(id: string, news: Partial<NewsItem>) {
        const updates: any = {};
        if (news.title !== undefined) updates.title = news.title;
        if (news.description !== undefined) updates.description = news.description;
        if (news.imageUrl !== undefined) updates.image_url = news.imageUrl;
        if (news.videoUrl !== undefined) updates.video_url = news.videoUrl;
        if (news.area !== undefined) updates.area = news.area;
        if (news.type !== undefined) updates.type = news.type;
        if (news.isBreaking !== undefined) updates.is_breaking = news.isBreaking;
        if (news.liveLink !== undefined) updates.live_link = news.liveLink;
        if (news.status !== undefined) updates.status = news.status;

        const res = await fetch(`${API_URL}/news/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates)
        });
        if (!res.ok) throw new Error('Failed to update news');
        return await res.json();
    },

    async deleteNews(id: string) {
        const res = await fetch(`${API_URL}/news/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Failed to delete news');
    },

    async archiveNews() {
        const res = await fetch(`${API_URL}/admin/news/archive`);
        if (!res.ok) throw new Error('Failed to archive news');

        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Samanyudu_TV_Archive_${Date.now()}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
    },

    async wipeAllNews() {
        const res = await fetch(`${API_URL}/admin/news/wipe`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Failed to wipe all news');
    },

    // --- SHORTS ---
    async getShorts(district?: string, role?: string) {
        let url = `${API_URL}/shorts`;
        if (role && district) {
            url += `?role=${role}&district=${encodeURIComponent(district)}`;
        }
        const res = await fetch(url);
        if (!res.ok) throw new Error('Failed to fetch shorts');
        const data = await res.json();

        return data.map((item: any) => ({
            id: item.id,
            title: item.title,
            videoUrl: item.video_url,
            duration: item.duration,
            timestamp: item.timestamp,
            area: item.area,
            author: item.author
        })) as ShortItem[];
    },

    async createShort(short: Omit<ShortItem, 'id' | 'timestamp'>) {
        const res = await fetch(`${API_URL}/shorts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: short.title,
                video_url: short.videoUrl,
                duration: short.duration,
                area: short.area,
                author: short.author,
            })
        });
        if (!res.ok) throw new Error('Failed to create short');
        return await res.json();
    },

    async updateShort(id: string, short: Partial<ShortItem>) {
        const updates: any = {};
        if (short.title !== undefined) updates.title = short.title;
        if (short.videoUrl !== undefined) updates.video_url = short.videoUrl;
        if (short.duration !== undefined) updates.duration = short.duration;

        const res = await fetch(`${API_URL}/shorts/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates)
        });
        if (!res.ok) throw new Error('Failed to update short');
        return await res.json();
    },

    async deleteShort(id: string) {
        const res = await fetch(`${API_URL}/shorts/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Failed to delete short');
    },

    // --- ADVERTISEMENTS ---
    async getAdvertisements() {
        const res = await fetch(`${API_URL}/advertisements`);
        if (!res.ok) throw new Error('Failed to fetch advertisements');
        const data = await res.json();

        return data.map((item: any) => ({
            id: item.id,
            mediaUrl: item.media_url,
            intervalMinutes: item.interval_minutes,
            clickUrl: item.click_url,
            displayInterval: item.display_interval,
            isActive: item.is_active,
            timestamp: item.timestamp
        }));
    },

    async createAdvertisement(ad: Omit<any, 'id' | 'timestamp'>) {
        const res = await fetch(`${API_URL}/advertisements`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                media_url: ad.mediaUrl,
                interval_minutes: ad.intervalMinutes,
                display_interval: ad.displayInterval || 4,
                click_url: ad.clickUrl,
                is_active: ad.isActive,
            })
        });
        if (!res.ok) throw new Error('Failed to create advertisement');
        const data = await res.json();
        return {
            id: data.id,
            mediaUrl: data.media_url,
            intervalMinutes: data.interval_minutes,
            clickUrl: data.click_url,
            isActive: data.is_active,
            timestamp: data.timestamp
        };
    },

    async updateAdvertisement(id: string, ad: Partial<any>) {
        const updates: any = {};
        if (ad.mediaUrl !== undefined) updates.media_url = ad.mediaUrl;
        if (ad.intervalMinutes !== undefined) updates.interval_minutes = ad.intervalMinutes;
        if (ad.displayInterval !== undefined) updates.display_interval = ad.displayInterval;
        if (ad.clickUrl !== undefined) updates.click_url = ad.clickUrl;
        if (ad.isActive !== undefined) updates.is_active = ad.isActive;

        const res = await fetch(`${API_URL}/advertisements/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates)
        });
        if (!res.ok) throw new Error('Failed to update advertisement');
        const data = await res.json();
        return {
            id: data.id,
            mediaUrl: data.media_url,
            intervalMinutes: data.interval_minutes,
            displayInterval: data.display_interval,
            clickUrl: data.click_url,
            isActive: data.is_active,
            timestamp: data.timestamp
        };
    },

    async deleteAdvertisement(id: string) {
        const res = await fetch(`${API_URL}/advertisements/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Failed to delete advertisement');
    },

    async uploadFile(file: File, bucket: 'news-media' = 'news-media') {
        console.log("Starting upload...", file.name, bucket);

        const formData = new FormData();
        formData.append('file', file);

        // Use our new backend custom R2 upload route
        const res = await fetch(`${API_URL}/upload`, {
            method: 'POST',
            body: formData,
        });

        if (!res.ok) {
            console.error("Backend Upload Error");
            throw new Error('Upload failed');
        }

        const data = await res.json();
        console.log("Upload successful, public URL:", data.url);

        return data.url;
    },

    // --- ADMIN MANAGEMENT ---
    async adminLogin(email: string, password: string) {
        const res = await fetch(`${API_URL}/admin/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        if (!res.ok) {
            const error = await res.json();
            throw new Error(error.error || 'Login failed');
        }
        return await res.json();
    },

    async getReporters() {
        const res = await fetch(`${API_URL}/admin/reporters`);
        if (!res.ok) throw new Error('Failed to fetch reporters');
        return await res.json();
    },

    async createReporter(reporterData: any) {
        const res = await fetch(`${API_URL}/admin/reporters`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(reporterData)
        });
        if (!res.ok) {
            const error = await res.json();
            throw new Error(error.error || 'Failed to create reporter');
        }
        return await res.json();
    },

    async updateReporter(id: string, reporterData: any) {
        const res = await fetch(`${API_URL}/admin/reporters/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(reporterData)
        });
        if (!res.ok) throw new Error('Failed to update reporter');
        return await res.json();
    },

    async deleteReporter(id: string) {
        const res = await fetch(`${API_URL}/admin/reporters/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Failed to delete reporter');
    },

    // --- INTERACTIONS (Likes & Comments) ---
    async likeNews(id: string, userId: string, action: 'like' | 'unlike') {
        const res = await fetch(`${API_URL}/news/${id}/like`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId, action })
        });
        if (!res.ok) throw new Error('Failed to update news like');
        return await res.json();
    },

    async likeShort(id: string, userId: string, action: 'like' | 'unlike') {
        const res = await fetch(`${API_URL}/shorts/${id}/like`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId, action })
        });
        if (!res.ok) throw new Error('Failed to update short like');
        return await res.json();
    },

    async getComments(id: string, type: 'news' | 'shorts') {
        const res = await fetch(`${API_URL}/${type}/${id}/comments`);
        if (!res.ok) throw new Error('Failed to fetch comments');
        return await res.json();
    },

    async postComment(id: string, type: 'news' | 'shorts', commentData: { user_id: string, user_name: string, comment_text: string }) {
        const res = await fetch(`${API_URL}/${type}/comments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...commentData, [type === 'news' ? 'news_id' : 'short_id']: id })
        });
        if (!res.ok) throw new Error('Failed to post comment');
        return await res.json();
    },

    async deleteComment(id: string, type: 'news' | 'shorts') {
        const res = await fetch(`${API_URL}/${type}/comments/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Failed to delete comment');
    }
};
