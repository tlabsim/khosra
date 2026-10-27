<?php
declare(strict_types=1);
if(!defined('KHOSRA_DEPLOYMENT')){http_response_code(404);exit;}
return <<<'KHOSRA_SCHEMA'
CREATE TABLE IF NOT EXISTS workspace (id INTEGER PRIMARY KEY, version INTEGER NOT NULL DEFAULT 0, payload TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS operations (operation_id TEXT PRIMARY KEY NOT NULL, payload_hash TEXT NOT NULL, result_version INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS auth_attempts (identity_hash TEXT PRIMARY KEY NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, window_start INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS oauth_clients (client_id TEXT PRIMARY KEY NOT NULL, redirect_uris TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS oauth_codes (code_hash TEXT PRIMARY KEY NOT NULL, client_id TEXT NOT NULL, redirect_uri TEXT NOT NULL, resource TEXT NOT NULL, scope TEXT NOT NULL, challenge TEXT NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS oauth_tokens (access_hash TEXT PRIMARY KEY NOT NULL, refresh_hash TEXT UNIQUE NOT NULL, client_id TEXT NOT NULL, resource TEXT NOT NULL, scope TEXT NOT NULL, expires_at INTEGER NOT NULL, refresh_expires_at INTEGER NOT NULL, revoked INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS reading_grants (id TEXT PRIMARY KEY NOT NULL, token_hash TEXT NOT NULL UNIQUE, recipient TEXT NOT NULL, book_id TEXT NOT NULL, book_title TEXT NOT NULL, chapter_count INTEGER NOT NULL, snapshot TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, revoked_at INTEGER NULL);
CREATE TABLE IF NOT EXISTS reading_sessions (session_hash TEXT PRIMARY KEY NOT NULL, grant_id TEXT NOT NULL, expires_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS reading_session_grant ON reading_sessions(grant_id);
CREATE INDEX IF NOT EXISTS reading_session_expiry ON reading_sessions(expires_at);
CREATE TABLE IF NOT EXISTS reader_comments (id TEXT PRIMARY KEY NOT NULL, grant_id TEXT NOT NULL, chapter_id TEXT NOT NULL, revision_id TEXT NOT NULL, paragraph_id TEXT NULL, chapter_title TEXT NOT NULL, paragraph_label INTEGER NULL, quote TEXT NOT NULL, comment_text TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS reader_comment_grant ON reader_comments(grant_id);

KHOSRA_SCHEMA;
