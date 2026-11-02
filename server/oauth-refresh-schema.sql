-- Additive only. Normally created automatically by a valid refresh or owner sign-in.
CREATE TABLE IF NOT EXISTS oauth_refresh_rotations (parent_access_hash CHAR(64) PRIMARY KEY, successor_access_hash CHAR(64) UNIQUE NOT NULL, family_hash CHAR(64) NOT NULL, nonce CHAR(64) NOT NULL, rotated_at BIGINT NOT NULL, INDEX oauth_refresh_family (family_hash)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
