<?php

declare(strict_types=1);

// Hand-written OYL routes. camis mirrors this file from overlay/ on every build; it is
// required inside the generated StrapiErrors group, so errors here carry the Strapi envelope.

use App\Http\Serializers\AccountSerializer;
use App\Http\Serializers\ActivitySerializer;
use App\Http\Serializers\ActivitySessionSerializer;
use App\Http\Serializers\BudgetSerializer;
use App\Http\Serializers\ConsumableProductSerializer;
use App\Http\Serializers\ConsumableSerializer;
use App\Http\Serializers\ConsumptionSerializer;
use App\Http\Serializers\GoalSerializer;
use App\Http\Serializers\MeasurementSerializer;
use App\Http\Serializers\NoteSerializer;
use App\Http\Serializers\TransactionSerializer;
use App\Models\Account;
use App\Models\Activity;
use App\Models\ActivitySession;
use App\Models\Budget;
use App\Models\Consumable;
use App\Models\ConsumableProduct;
use App\Models\Consumption;
use App\Models\Goal;
use App\Models\Measurement;
use App\Models\Note;
use App\Models\Transaction;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

/**
 * One boot read: every backed collection in scope for the signed-in user, keyed by the
 * REST plural path the client routes by (apps/vanilla-oyl/src/storage/bootstrap.js
 * PATH_BY_COLLECTION). Rows go through the same `forUser` scope, the same per-row
 * `can('view')` check, and the same serializer as each collection's own index(), so they
 * decode identically whichever path fetched them. Unlike index(), this closure does not
 * run the class-level `viewAny` check — every grant that reads a type also permits viewAny
 * today, so this is a no-op in practice; if a role-gated type is ever added, add
 * `Gate::authorize('viewAny', $model)` per collection above.
 */
Route::middleware('auth:sanctum')->get('/bootstrap', function (Request $request) {
    $user = $request->user();
    $collections = [
        'notes' => Note::class,
        'consumptions' => Consumption::class,
        'transactions' => Transaction::class,
        'measurements' => Measurement::class,
        'activity-sessions' => ActivitySession::class,
        'accounts' => Account::class,
        'budgets' => Budget::class,
        'goals' => Goal::class,
        'activities' => Activity::class,
        'consumables' => Consumable::class,
        'consumable-products' => ConsumableProduct::class,
    ];
    $serializers = [
        Note::class => NoteSerializer::class,
        Consumption::class => ConsumptionSerializer::class,
        Transaction::class => TransactionSerializer::class,
        Measurement::class => MeasurementSerializer::class,
        ActivitySession::class => ActivitySessionSerializer::class,
        Account::class => AccountSerializer::class,
        Budget::class => BudgetSerializer::class,
        Goal::class => GoalSerializer::class,
        Activity::class => ActivitySerializer::class,
        Consumable::class => ConsumableSerializer::class,
        ConsumableProduct::class => ConsumableProductSerializer::class,
    ];

    $data = [];
    foreach ($collections as $path => $model) {
        $serializer = $serializers[$model];
        $data[$path] = $model::query()
            ->forUser($user)
            ->get()
            ->filter(fn (Model $m) => $user->can('view', $m))
            ->map(fn (Model $m) => $serializer::toWire($m))
            ->values()
            ->all();
    }

    return response()->json(['data' => $data, 'meta' => []]);
});

/** Pre-auth probe from the client; Google OAuth is not part of this backend. */
Route::get('/google/config', fn () => response()->json(['configured' => false]));
