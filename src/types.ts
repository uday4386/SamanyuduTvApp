export type NewsType = 'Political' | 'Accident' | 'Education' | 'Crime' | 'Weather' | 'Sports' | 'Business' | 'Social' | 'Classifieds' | 'Jobs' | 'Real Estate' | 'Others';

export interface NewsItem {
    id: string;
    title: string;
    description: string;
    imageUrl?: string;
    videoUrl?: string; // Note: In DB table this is snake_case 'video_url', we'll map it
    liveLink?: string;
    area: string;
    type: NewsType;
    isBreaking: boolean; // DB: is_breaking
    timestamp: string;
    author?: string;
    status?: 'published' | 'pending' | 'rejected';
    likes?: number;
    commentsCount?: number;
}

export interface ShortItem {
    id: string;
    title: string;
    videoUrl: string; // DB: video_url
    duration: number;
    timestamp: string;
    likes?: number;
    commentsCount?: number;
    area?: string;
    author?: string;
}

export interface Advertisement {
    id: string;
    mediaUrl: string; // DB: media_url
    intervalMinutes: number; // DB: interval_minutes
    displayInterval?: number; // DB: display_interval
    clickUrl?: string; // DB: click_url
    isActive: boolean; // DB: is_active
    timestamp: string;
}
