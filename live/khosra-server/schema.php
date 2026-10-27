<?php
declare(strict_types=1);
if(!defined('KHOSRA_DEPLOYMENT')){http_response_code(404);exit;}
return <<<'KHOSRA_SCHEMA'
-- Run through your hosting control panel, never a public installer.
CREATE TABLE IF NOT EXISTS workspace (
 id INT PRIMARY KEY,
 version BIGINT UNSIGNED NOT NULL DEFAULT 0,
 payload LONGTEXT NOT NULL,
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS operations (
 operation_id VARCHAR(80) PRIMARY KEY,
 payload_hash CHAR(64) NOT NULL,
 result_version BIGINT UNSIGNED NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS auth_attempts (
 identity_hash CHAR(64) PRIMARY KEY,
 attempts INT NOT NULL DEFAULT 0,
 window_start BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS oauth_clients (
 client_id VARCHAR(80) PRIMARY KEY, redirect_uris TEXT NOT NULL, created_at BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS oauth_codes (
 code_hash CHAR(64) PRIMARY KEY, client_id VARCHAR(80) NOT NULL,
 redirect_uri VARCHAR(1000) NOT NULL, resource VARCHAR(1000) NOT NULL,
 scope VARCHAR(200) NOT NULL, challenge VARCHAR(128) NOT NULL, expires_at BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS oauth_tokens (
 access_hash CHAR(64) PRIMARY KEY, refresh_hash CHAR(64) UNIQUE NOT NULL,
 client_id VARCHAR(80) NOT NULL, resource VARCHAR(1000) NOT NULL, scope VARCHAR(200) NOT NULL,
 expires_at BIGINT NOT NULL, refresh_expires_at BIGINT NOT NULL, revoked TINYINT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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

KHOSRA_SCHEMA;
