<?php

declare(strict_types=1);

// OYL settings read through config() so they survive `php artisan config:cache` (the publish
// script runs it; env() returns null outside config files once the config is cached).
return [
    // Admin allowlist: exact addresses or `@domain`, comma/space separated; empty = nobody.
    // Mirrors strapi-oyl's OYL_ADMIN_EMAILS (apps/strapi-oyl/src/utils/admins.ts).
    'admin_emails' => env('OYL_ADMIN_EMAILS', ''),
];
