<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Generated\BudgetApiController as Generated;
use App\Support\OylMoney;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * OYL rule (mirrors apps/strapi-oyl): the `limit` money component's `minor` leaves this backend as
 * a JSON number, not the `biginteger` string stock Strapi renders. See App\Support\OylMoney.
 * Everything else is the generated behavior. camis mirrors this file from overlay/ on every build.
 */
class BudgetApiController extends Generated
{
    public function index(Request $request): JsonResponse
    {
        return OylMoney::inResponse(parent::index($request), 'limit');
    }

    public function show(Request $request, string $key): JsonResponse
    {
        return OylMoney::inResponse(parent::show($request, $key), 'limit');
    }

    public function store(Request $request): JsonResponse
    {
        return OylMoney::inResponse(parent::store($request), 'limit');
    }

    public function update(Request $request, string $key): JsonResponse
    {
        return OylMoney::inResponse(parent::update($request, $key), 'limit');
    }
}
