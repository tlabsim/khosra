-- Additive upgrade: run once through the hosting database panel.
CREATE TABLE IF NOT EXISTS reading_grants (
 id VARCHAR(36) PRIMARY KEY,
 token_hash CHAR(64) NOT NULL UNIQUE,
 recipient VARCHAR(200) NOT NULL,
 book_id VARCHAR(36) NOT NULL,
 book_title VARCHAR(300) NOT NULL,
 chapter_count INT NOT NULL,
 snapshot LONGTEXT NOT NULL,
 created_at BIGINT NOT NULL,
 expires_at BIGINT NOT NULL,
 revoked_at BIGINT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS reading_sessions (
 session_hash CHAR(64) PRIMARY KEY,
 grant_id VARCHAR(36) NOT NULL,
 expires_at BIGINT NOT NULL,
 INDEX reading_session_grant (grant_id),
 INDEX reading_session_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS reader_comments (
 id VARCHAR(36) PRIMARY KEY,
 grant_id VARCHAR(36) NOT NULL,
 chapter_id VARCHAR(36) NOT NULL,
 revision_id VARCHAR(36) NOT NULL,
 paragraph_id VARCHAR(36) NULL,
 chapter_title VARCHAR(300) NOT NULL,
 paragraph_label INT NULL,
 quote TEXT NOT NULL,
 comment_text TEXT NOT NULL,
 created_at BIGINT NOT NULL,
 INDEX reader_comment_grant (grant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
