<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Generated\ConsumableProductApiController as Generated;
use App\Http\Serializers\ConsumableProductSerializer;
use App\Models\ConsumableProduct;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * OYL rule (mirrors apps/strapi-oyl): a product with a UPC is one shared public row.
 *  - If a row with the given UPC already exists, return it (convergence; the client's own
 *    recordId yields to the shared row). Any signed-in user may read it.
 *  - A new UPC product is always public; a product without a UPC keeps the client's
 *    visibility (default private, from the schema). An empty-string UPC is treated as
 *    absent.
 *  - PUT of an existing recordId whose payload adds a UPC not yet in the table updates
 *    that row in place (via the generated update). strapi-oyl instead creates a second row
 *    sharing the recordId; that is a Strapi-side bug, not part of the sync protocol, and is
 *    intentionally not reproduced.
 * camis mirrors this file from overlay/ on every build.
 */
class ConsumableProductApiController extends Generated
{
    public function store(Request $request): JsonResponse
    {
        $existing = $this->existingByUpc($request);
        if ($existing !== null) {
            return response()->json(['data' => ConsumableProductSerializer::toWire($existing)], 200);
        }

        return parent::store($this->forcePublicWhenUpc($request));
    }

    public function update(Request $request, string $key): JsonResponse
    {
        $existing = $this->existingByUpc($request);
        if ($existing !== null) {
            return response()->json(['data' => ConsumableProductSerializer::toWire($existing)]);
        }

        return parent::update($this->forcePublicWhenUpc($request), $key);
    }

    private function upc(Request $request): ?string
    {
        $upc = $request->input('data.upc');

        return is_string($upc) && $upc !== '' ? $upc : null;
    }

    private function existingByUpc(Request $request): ?ConsumableProduct
    {
        $upc = $this->upc($request);
        if ($upc === null) {
            return null;
        }

        return ConsumableProduct::query()->where('upc', $upc)->first();
    }

    private function forcePublicWhenUpc(Request $request): Request
    {
        if ($this->upc($request) !== null) {
            $request->merge(['data' => array_merge((array) $request->input('data', []), ['visibility' => 'public'])]);
        }

        return $request;
    }
}
