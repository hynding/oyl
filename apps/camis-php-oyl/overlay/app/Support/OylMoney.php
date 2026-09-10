<?php

declare(strict_types=1);

namespace App\Support;

use Illuminate\Http\JsonResponse;

/**
 * OYL rule (mirrors apps/strapi-oyl/src/utils/finance-money.ts): the `finance.money` component's
 * `minor` reaches the client as a JSON *number*.
 *
 * Strapi renders a `biginteger` as a string — a 64-bit value does not survive a JSON number — and
 * camis reproduces that faithfully (its Strapi/PHP cross-check pins the string form on both
 * sides). The OYL domain decoder does not: `Money.fromJSON` in @oyl/all-of-oyl rejects anything
 * but a number, so strapi-oyl's transaction/budget/bootstrap controllers coerce the field with
 * `sanitizeMoney` before answering. This class is that same coercion for the PHP backend, applied
 * at the only three places money leaves it: the Transaction and Budget controllers and the
 * overlay's /bootstrap route.
 *
 * Like `coerceNumeric`, a value that is not a numeric string is passed through untouched, so a
 * malformed row still reaches the client as-is rather than becoming a silent 0. Values beyond
 * 2^53 lose precision in the browser exactly as they do through strapi-oyl; OYL amounts are
 * minor currency units and never come close.
 *
 * camis mirrors this file from overlay/ on every build.
 */
final class OylMoney
{
    /** Coerce `$wire[$field]['minor']` in one serialized row. Unknown/absent field: unchanged. */
    public static function inWire(array $wire, string $field): array
    {
        $money = $wire[$field] ?? null;

        if (! is_array($money) || ! array_key_exists('minor', $money)) {
            return $wire;
        }

        $money['minor'] = self::numeric($money['minor']);
        $wire[$field] = $money;

        return $wire;
    }

    /**
     * The same coercion over a generated controller's answer, whose `data` is either one row
     * (show/store/update) or a list of them (index). A 204 or any non-array body is returned
     * untouched, so `destroy()` can be wrapped harmlessly.
     */
    public static function inResponse(JsonResponse $response, string $field): JsonResponse
    {
        $body = $response->getData(true);

        if (! is_array($body) || ! array_key_exists('data', $body) || ! is_array($body['data'])) {
            return $response;
        }

        $data = $body['data'];
        $body['data'] = array_is_list($data)
            ? array_map(fn ($row) => is_array($row) ? self::inWire($row, $field) : $row, $data)
            : self::inWire($data, $field);

        return $response->setData($body);
    }

    private static function numeric(mixed $value): mixed
    {
        if (is_int($value) || is_float($value)) {
            return $value;
        }

        if (is_string($value) && trim($value) !== '' && is_numeric(trim($value))) {
            return $value + 0;
        }

        return $value;
    }
}
