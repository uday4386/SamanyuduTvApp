CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
-- Table: users
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    first_name VARCHAR,
    last_name VARCHAR,
    email VARCHAR UNIQUE,
    phone VARCHAR UNIQUE,
    password VARCHAR,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
-- Table: admin_users
CREATE TABLE IF NOT EXISTS admin_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR UNIQUE NOT NULL,
    password VARCHAR NOT NULL,
    name VARCHAR,
    role VARCHAR NOT NULL DEFAULT 'sub_admin',
    -- 'super_admin' or 'sub_admin'
    state VARCHAR,
    district VARCHAR,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
-- Table: advertisements
CREATE TABLE IF NOT EXISTS advertisements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    media_url VARCHAR NOT NULL,
    interval_minutes INT,
    display_interval INT DEFAULT 4,
    click_url VARCHAR,
    is_active BOOLEAN DEFAULT false,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
-- Table: news
CREATE TABLE IF NOT EXISTS news (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR NOT NULL,
    description TEXT,
    area VARCHAR,
    type VARCHAR,
    image_url VARCHAR,
    video_url VARCHAR,
    is_breaking BOOLEAN DEFAULT false,
    live_link VARCHAR,
    status VARCHAR DEFAULT 'published',
    author VARCHAR,
    likes INT DEFAULT 0,
    comments_count INT DEFAULT 0,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
-- Table: news_likes
CREATE TABLE IF NOT EXISTS news_likes (
    news_id UUID REFERENCES news(id) ON DELETE CASCADE,
    user_id VARCHAR NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (news_id, user_id)
);
-- Table: news_comments
CREATE TABLE IF NOT EXISTS news_comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    news_id UUID REFERENCES news(id) ON DELETE CASCADE,
    user_id VARCHAR,
    user_name VARCHAR,
    comment_text TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
-- Table: shorts
CREATE TABLE IF NOT EXISTS shorts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR NOT NULL,
    video_url VARCHAR NOT NULL,
    duration FLOAT,
    likes INT DEFAULT 0,
    comments_count INT DEFAULT 0,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
-- Table: shorts_likes
CREATE TABLE IF NOT EXISTS shorts_likes (
    short_id UUID REFERENCES shorts(id) ON DELETE CASCADE,
    user_id VARCHAR NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (short_id, user_id)
);
-- Table: shorts_comments
CREATE TABLE IF NOT EXISTS shorts_comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    short_id UUID REFERENCES shorts(id) ON DELETE CASCADE,
    user_id VARCHAR,
    user_name VARCHAR,
    comment_text TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
-- Functions
CREATE OR REPLACE FUNCTION increment_news_likes(row_id UUID) RETURNS void AS $$ BEGIN
UPDATE news
SET likes = likes + 1
WHERE id = row_id;
END;
$$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION decrement_news_likes(row_id UUID) RETURNS void AS $$ BEGIN
UPDATE news
SET likes = GREATEST(likes - 1, 0)
WHERE id = row_id;
END;
$$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION increment_shorts_likes(row_id UUID) RETURNS void AS $$ BEGIN
UPDATE shorts
SET likes = likes + 1
WHERE id = row_id;
END;
$$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION decrement_shorts_likes(row_id UUID) RETURNS void AS $$ BEGIN
UPDATE shorts
SET likes = GREATEST(likes - 1, 0)
WHERE id = row_id;
END;
$$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION increment_shorts_views(row_id UUID) RETURNS void AS $$ BEGIN -- Dummy function for views increment
END;
$$ LANGUAGE plpgsql;