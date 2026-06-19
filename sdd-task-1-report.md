# Task 1 Report — finance.money component + finance-money util (shared coerceNumeric)

**Status:** DONE

## Files created / modified

### Created
- `apps/strapi-oyl/src/components/finance/money.json` — Strapi component definition: `collectionName: components_finance_money`, fields: `minor` (biginteger), `currency` (string), `exponent` (integer).
- `apps/strapi-oyl/src/utils/coerce.ts` — exports `coerceNumeric(v: unknown): unknown` (extracted from `nutrition-facts.ts`; behavior identical).
- `apps/strapi-oyl/src/utils/finance-money.ts` — exports `AMOUNT_POPULATE`, `LIMIT_POPULATE`, and `sanitizeMoney(row, field)`.
- `apps/strapi-oyl/test/finance-money-util.test.ts` — 13 pure-function unit tests covering `coerceNumeric` and `sanitizeMoney` (+ populate constants).

### Modified
- `apps/strapi-oyl/src/utils/nutrition-facts.ts` — added `import { coerceNumeric } from './coerce.js'`; removed local `function coerceNumeric(...)` definition. Behavior is unchanged; all 8 `nutrition-facts-util` tests remain green.

## coerceNumeric extraction

The private `coerceNumeric` from `nutrition-facts.ts` was moved verbatim to `coerce.ts` as an exported function. The single import line replaces the local definition. No logic change.

## Test cases + results

| Test | Result |
|---|---|
| `coerceNumeric('150')` → `150` (number) | PASS |
| `coerceNumeric(0)` → `0` (number) | PASS |
| `coerceNumeric('0')` → `0` (number) | PASS |
| `coerceNumeric('abc')` → `'abc'` (string) | PASS |
| `coerceNumeric(12.5)` → `12.5` (number) | PASS |
| `sanitizeMoney({amount:{minor:'1500',currency:'USD',exponent:2}},'amount')` → `minor===1500 (number)` | PASS |
| negative `minor:'-1500'` → `minor===-1500` | PASS |
| `currency`/`exponent` untouched | PASS |
| `{limit:null}` field `'limit'` → row unchanged (same ref) | PASS |
| row with no money field → unchanged (same ref) | PASS |
| unrelated field not mutated | PASS |
| `AMOUNT_POPULATE === {amount:true}` | PASS |
| `LIMIT_POPULATE === {limit:true}` | PASS |

## DoD outputs

1. `pnpm --filter @oyl/strapi-oyl-app exec strapi build` — SUCCESS (TS compile + admin panel)
2. `pnpm --filter @oyl/strapi-oyl-app exec tsc --noEmit` — SUCCESS (no errors)
3. `pnpm --filter @oyl/strapi-oyl-app test` — 8 test files, **113 tests passed** (up from 100; +13 new finance-money-util tests)

## Concerns

None. All existing tests (including `nutrition-facts-util` and all booted suites) remain green. The `coerceNumeric` extraction is a pure refactor — the function body is identical and the import path uses the NodeNext `.js` extension convention required by this package.
