<?php

declare(strict_types=1);

namespace App\Support;

/**
 * OYL rule (mirrors apps/strapi-oyl/src/utils/admins.ts — change both together): a user is an
 * admin when their email is on the `OYL_ADMIN_EMAILS` allowlist (config/oyl.php). An entry is
 * an exact address or `@domain` for every address on exactly that domain; matching ignores
 * case. Unset means nobody. Feeds GET /access, which the app reads to show the Status screen.
 */
final class OylAdmins
{
    /** @return list<string> */
    public static function parse(?string $raw): array
    {
        $parts = preg_split('/[\s,]+/', strtolower(trim((string) $raw))) ?: [];

        return array_values(array_filter($parts, fn (string $s) => $s !== ''));
    }

    public static function isAdmin(?string $email, ?string $raw): bool
    {
        $address = strtolower(trim((string) $email));
        $at = strrpos($address, '@');
        if ($at === false || $at === 0 || $at === strlen($address) - 1) {
            return false;
        }
        $domain = substr($address, $at);
        foreach (self::parse($raw) as $entry) {
            if ($entry === $address || (strlen($entry) > 1 && $entry[0] === '@' && $entry === $domain)) {
                return true;
            }
        }

        return false;
    }
}
