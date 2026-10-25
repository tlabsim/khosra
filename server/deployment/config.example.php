<?php
// Rename this file to khosra.config.php. Future release ZIPs never contain that name.
return [
    'origin' => 'https://khosra.example.com',
    'owner_password' => 'REPLACE_WITH_A_UNIQUE_PASSWORD_AT_LEAST_16_CHARACTERS',
    // SQLite is the default: no database account or SQL import is needed.
    // Optional: absolute directory OUTSIDE all public website folders.
    // Leave empty to select a sibling data directory automatically.
    'data_dir' => '',
    'oauth_redirect_allowlist' => ['https://chatgpt.com/connector_platform_oauth_redirect'],
    // Existing MySQL installations may retain their DSN, db_user, db_password
    // and owner_password_hash here instead. Never change an existing storage
    // location without a backup and an explicit data migration.
];
