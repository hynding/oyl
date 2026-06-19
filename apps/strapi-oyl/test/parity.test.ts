/**
 * Parity test: asserts that Strapi content-type schema.json files match
 * the @oyl/all-of-oyl manifest's intent for each reference entity.
 *
 * Does NOT boot Strapi — just reads JSON files and checks structure.
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { kindOf } from '@oyl/all-of-oyl'

const SRC_DIR = path.resolve(__dirname, '..', 'src')

function loadSchema(singularName: string): Record<string, unknown> {
  const p = path.join(SRC_DIR, 'api', singularName, 'content-types', singularName, 'schema.json')
  return JSON.parse(fs.readFileSync(p, 'utf-8')) as Record<string, unknown>
}

function attributes(schema: Record<string, unknown>): Record<string, unknown> {
  return schema['attributes'] as Record<string, unknown>
}

describe('parity: consumption schema ↔ manifest (personal kind)', () => {
  it('kindOf("consumptions") is personal', () => {
    expect(kindOf('consumptions')).toBe('personal')
  })

  const schema = loadSchema('consumption')
  const attrs = attributes(schema)

  it('consumption schema has recordId (required + unique string)', () => {
    const f = attrs['recordId'] as Record<string, unknown>
    expect(f).toBeDefined()
    expect(f['type']).toBe('string')
    expect(f['required']).toBe(true)
    expect(f['unique']).toBe(true)
  })

  it('consumption schema has occurredAt (datetime, required)', () => {
    const f = attrs['occurredAt'] as Record<string, unknown>
    expect(f).toBeDefined()
    expect(f['type']).toBe('datetime')
    expect(f['required']).toBe(true)
  })

  it('consumption schema has servings (decimal)', () => {
    const f = attrs['servings'] as Record<string, unknown>
    expect(f).toBeDefined()
    expect(f['type']).toBe('decimal')
  })

  it('consumption schema has consumableId (string)', () => {
    const f = attrs['consumableId'] as Record<string, unknown>
    expect(f).toBeDefined()
    expect(f['type']).toBe('string')
  })

  it('consumption schema has consumableProductId (string)', () => {
    const f = attrs['consumableProductId'] as Record<string, unknown>
    expect(f).toBeDefined()
    expect(f['type']).toBe('string')
  })

  it('consumption schema has loggedAmount (json)', () => {
    const f = attrs['loggedAmount'] as Record<string, unknown>
    expect(f).toBeDefined()
    expect(f['type']).toBe('json')
  })

  it('consumption schema has nutrients component referencing nutrition.nutrition-facts', () => {
    const f = attrs['nutrients'] as Record<string, unknown>
    expect(f).toBeDefined()
    expect(f['type']).toBe('component')
    expect(f['repeatable']).toBe(false)
    expect(f['component']).toBe('nutrition.nutrition-facts')
  })

  it('consumption schema has owner manyToOne relation (personal shape)', () => {
    const owner = attrs['owner'] as Record<string, unknown>
    expect(owner).toBeDefined()
    expect(owner['type']).toBe('relation')
    expect(owner['relation']).toBe('manyToOne')
    expect(owner['target']).toBe('plugin::users-permissions.user')
  })

  it('consumption schema does NOT have catalog fields (creator, visibility)', () => {
    expect(attrs['creator']).toBeUndefined()
    expect(attrs['visibility']).toBeUndefined()
  })
})

describe('parity: note schema ↔ manifest (personal kind)', () => {
  it('kindOf per-kind entry collections is personal', () => {
    expect(kindOf('notes')).toBe('personal')
  })

  const schema = loadSchema('note')
  const attrs = attributes(schema)

  it('note schema has recordId (required + unique string)', () => {
    const f = attrs['recordId'] as Record<string, unknown>
    expect(f).toBeDefined()
    expect(f['type']).toBe('string')
    expect(f['required']).toBe(true)
    expect(f['unique']).toBe(true)
  })

  it('note schema has text attribute', () => {
    expect(attrs['text']).toBeDefined()
  })

  it('note schema has tags attribute', () => {
    expect(attrs['tags']).toBeDefined()
  })

  it('note schema has occurredAt attribute', () => {
    expect(attrs['occurredAt']).toBeDefined()
  })

  it('note schema has note attribute', () => {
    expect(attrs['note']).toBeDefined()
  })

  it('note schema has owner manyToOne relation to users-permissions user (personal shape)', () => {
    const owner = attrs['owner'] as Record<string, unknown>
    expect(owner).toBeDefined()
    expect(owner['type']).toBe('relation')
    expect(owner['relation']).toBe('manyToOne')
    expect(owner['target']).toBe('plugin::users-permissions.user')
  })

  it('note schema does NOT have catalog fields (creator, visibility)', () => {
    expect(attrs['creator']).toBeUndefined()
    expect(attrs['visibility']).toBeUndefined()
  })
})

describe('parity: account schema ↔ manifest (personal kind)', () => {
  it('kindOf("accounts") is personal', () => {
    expect(kindOf('accounts')).toBe('personal')
  })

  const schema = loadSchema('account')
  const attrs = attributes(schema)

  it('account schema has recordId (required + unique string)', () => {
    const f = attrs['recordId'] as Record<string, unknown>
    expect(f).toBeDefined()
    expect(f['type']).toBe('string')
    expect(f['required']).toBe(true)
    expect(f['unique']).toBe(true)
  })

  it('account schema has name attribute', () => {
    expect(attrs['name']).toBeDefined()
  })

  it('account schema has currency attribute', () => {
    expect(attrs['currency']).toBeDefined()
  })

  it('account schema has owner manyToOne relation (personal shape)', () => {
    const owner = attrs['owner'] as Record<string, unknown>
    expect(owner).toBeDefined()
    expect(owner['type']).toBe('relation')
    expect(owner['relation']).toBe('manyToOne')
    expect(owner['target']).toBe('plugin::users-permissions.user')
  })

  it('account schema does NOT have catalog fields (creator, visibility)', () => {
    expect(attrs['creator']).toBeUndefined()
    expect(attrs['visibility']).toBeUndefined()
  })
})

describe('parity: activity schema ↔ manifest (catalog kind)', () => {
  it('kindOf("activities") is catalog', () => {
    expect(kindOf('activities')).toBe('catalog')
  })

  const schema = loadSchema('activity')
  const attrs = attributes(schema)

  it('activity schema has recordId (required + unique string)', () => {
    const f = attrs['recordId'] as Record<string, unknown>
    expect(f).toBeDefined()
    expect(f['type']).toBe('string')
    expect(f['required']).toBe(true)
    expect(f['unique']).toBe(true)
  })

  it('activity schema has name attribute', () => {
    expect(attrs['name']).toBeDefined()
  })

  it('activity schema has slug attribute', () => {
    expect(attrs['slug']).toBeDefined()
  })

  it('activity schema has defaultUnit attribute', () => {
    expect(attrs['defaultUnit']).toBeDefined()
  })

  it('activity schema has areaId attribute', () => {
    expect(attrs['areaId']).toBeDefined()
  })

  it('activity schema has creator relation (catalog shape)', () => {
    const creator = attrs['creator'] as Record<string, unknown>
    expect(creator).toBeDefined()
    expect(creator['type']).toBe('relation')
    expect(creator['relation']).toBe('manyToOne')
  })

  it('activity schema has visibility enum (catalog shape)', () => {
    const vis = attrs['visibility'] as Record<string, unknown>
    expect(vis).toBeDefined()
    expect(vis['type']).toBe('enumeration')
    expect(Array.isArray(vis['enum'])).toBe(true)
    expect((vis['enum'] as string[]).length).toBeGreaterThan(0)
  })

  it('activity schema does NOT have personal-only field (owner)', () => {
    // catalog shape uses creator+visibility, not owner
    expect(attrs['owner']).toBeUndefined()
  })
})

describe('parity: consumable schema ↔ manifest (catalog kind)', () => {
  it('kindOf("consumables") is catalog', () => {
    expect(kindOf('consumables')).toBe('catalog')
  })

  const schema = loadSchema('consumable')
  const attrs = attributes(schema)

  it('consumable schema has recordId (required + unique string)', () => {
    const f = attrs['recordId'] as Record<string, unknown>
    expect(f).toBeDefined()
    expect(f['type']).toBe('string')
    expect(f['required']).toBe(true)
    expect(f['unique']).toBe(true)
  })

  it('consumable schema has name attribute', () => {
    expect(attrs['name']).toBeDefined()
  })

  it('consumable schema has slug attribute', () => {
    expect(attrs['slug']).toBeDefined()
  })

  it('consumable schema has a facts component attribute referencing nutrition.nutrition-facts', () => {
    const facts = attrs['facts'] as Record<string, unknown>
    expect(facts).toBeDefined()
    expect(facts['type']).toBe('component')
    expect(facts['repeatable']).toBe(false)
    expect(facts['component']).toBe('nutrition.nutrition-facts')
  })

  it('consumable schema has top-level ingredients (json)', () => {
    const ingredients = attrs['ingredients'] as Record<string, unknown>
    expect(ingredients).toBeDefined()
    expect(ingredients['type']).toBe('json')
  })

  it('consumable schema has top-level allergens (json)', () => {
    const allergens = attrs['allergens'] as Record<string, unknown>
    expect(allergens).toBeDefined()
    expect(allergens['type']).toBe('json')
  })

  it('consumable schema has creator relation (catalog shape)', () => {
    const creator = attrs['creator'] as Record<string, unknown>
    expect(creator).toBeDefined()
    expect(creator['type']).toBe('relation')
    expect(creator['relation']).toBe('manyToOne')
    expect(creator['target']).toBe('plugin::users-permissions.user')
  })

  it('consumable schema has visibility enum (catalog shape)', () => {
    const vis = attrs['visibility'] as Record<string, unknown>
    expect(vis).toBeDefined()
    expect(vis['type']).toBe('enumeration')
    expect(Array.isArray(vis['enum'])).toBe(true)
    const enumValues = vis['enum'] as string[]
    expect(enumValues).toContain('private')
    expect(enumValues).toContain('public')
  })

  it('consumable schema does NOT have personal-only field (owner)', () => {
    expect(attrs['owner']).toBeUndefined()
  })
})

describe('parity: consumable-product schema ↔ manifest (catalog kind)', () => {
  it('kindOf("consumableProducts") is catalog', () => {
    expect(kindOf('consumableProducts')).toBe('catalog')
  })

  const schema = loadSchema('consumable-product')
  const attrs = attributes(schema)

  it('consumable-product schema has recordId (required + unique string)', () => {
    const f = attrs['recordId'] as Record<string, unknown>
    expect(f).toBeDefined()
    expect(f['type']).toBe('string')
    expect(f['required']).toBe(true)
    expect(f['unique']).toBe(true)
  })

  it('consumable-product schema has upc (unique string)', () => {
    const f = attrs['upc'] as Record<string, unknown>
    expect(f).toBeDefined()
    expect(f['type']).toBe('string')
    expect(f['unique']).toBe(true)
  })

  it('consumable-product schema has consumableId (string)', () => {
    const f = attrs['consumableId'] as Record<string, unknown>
    expect(f).toBeDefined()
    expect(f['type']).toBe('string')
  })

  it('consumable-product schema has netWeight (json)', () => {
    const f = attrs['netWeight'] as Record<string, unknown>
    expect(f).toBeDefined()
    expect(f['type']).toBe('json')
  })

  it('consumable-product schema has servingsPerContainer (decimal)', () => {
    const f = attrs['servingsPerContainer'] as Record<string, unknown>
    expect(f).toBeDefined()
    expect(f['type']).toBe('decimal')
  })

  it('consumable-product schema has a facts component referencing nutrition.nutrition-facts', () => {
    const facts = attrs['facts'] as Record<string, unknown>
    expect(facts).toBeDefined()
    expect(facts['type']).toBe('component')
    expect(facts['repeatable']).toBe(false)
    expect(facts['component']).toBe('nutrition.nutrition-facts')
  })

  it('consumable-product schema has ingredients (json)', () => {
    const f = attrs['ingredients'] as Record<string, unknown>
    expect(f).toBeDefined()
    expect(f['type']).toBe('json')
  })

  it('consumable-product schema has allergens (json)', () => {
    const f = attrs['allergens'] as Record<string, unknown>
    expect(f).toBeDefined()
    expect(f['type']).toBe('json')
  })

  it('consumable-product schema has creator relation (catalog shape)', () => {
    const creator = attrs['creator'] as Record<string, unknown>
    expect(creator).toBeDefined()
    expect(creator['type']).toBe('relation')
    expect(creator['relation']).toBe('manyToOne')
    expect(creator['target']).toBe('plugin::users-permissions.user')
  })

  it('consumable-product schema has visibility enum (catalog shape)', () => {
    const vis = attrs['visibility'] as Record<string, unknown>
    expect(vis).toBeDefined()
    expect(vis['type']).toBe('enumeration')
    expect(Array.isArray(vis['enum'])).toBe(true)
    const enumValues = vis['enum'] as string[]
    expect(enumValues).toContain('private')
    expect(enumValues).toContain('public')
  })

  it('consumable-product schema does NOT have personal-only field (owner)', () => {
    expect(attrs['owner']).toBeUndefined()
  })
})

describe('parity: budget schema ↔ manifest (personal kind)', () => {
  it('kindOf("budgets") is personal', () => {
    expect(kindOf('budgets')).toBe('personal')
  })

  const schema = loadSchema('budget')
  const attrs = attributes(schema)

  it('budget schema has recordId (required + unique string)', () => {
    const f = attrs['recordId'] as Record<string, unknown>
    expect(f).toBeDefined()
    expect(f['type']).toBe('string')
    expect(f['required']).toBe(true)
    expect(f['unique']).toBe(true)
  })

  it('budget schema has name (optional string — NOT required)', () => {
    const f = attrs['name'] as Record<string, unknown>
    expect(f).toBeDefined()
    expect(f['type']).toBe('string')
    expect(f['required']).toBeFalsy()
  })

  it('budget schema has category (string)', () => {
    const f = attrs['category'] as Record<string, unknown>
    expect(f).toBeDefined()
    expect(f['type']).toBe('string')
  })

  it('budget schema has limit component referencing finance.money', () => {
    const f = attrs['limit'] as Record<string, unknown>
    expect(f).toBeDefined()
    expect(f['type']).toBe('component')
    expect(f['repeatable']).toBe(false)
    expect(f['component']).toBe('finance.money')
  })

  it('budget schema has owner manyToOne relation (personal shape)', () => {
    const owner = attrs['owner'] as Record<string, unknown>
    expect(owner).toBeDefined()
    expect(owner['type']).toBe('relation')
    expect(owner['relation']).toBe('manyToOne')
    expect(owner['target']).toBe('plugin::users-permissions.user')
  })

  it('budget schema does NOT have catalog fields (creator, visibility)', () => {
    expect(attrs['creator']).toBeUndefined()
    expect(attrs['visibility']).toBeUndefined()
  })

  it('budget schema does NOT have kind or occurredAt columns', () => {
    expect(attrs['kind']).toBeUndefined()
    expect(attrs['occurredAt']).toBeUndefined()
  })
})

describe('parity: measurement schema ↔ manifest (personal kind)', () => {
  it('kindOf("measurements") is personal', () => {
    expect(kindOf('measurements')).toBe('personal')
  })

  const schema = loadSchema('measurement')
  const attrs = attributes(schema)

  it('measurement schema has recordId (required + unique string)', () => {
    const f = attrs['recordId'] as Record<string, unknown>
    expect(f).toBeDefined()
    expect(f['type']).toBe('string')
    expect(f['required']).toBe(true)
    expect(f['unique']).toBe(true)
  })

  it('measurement schema has occurredAt (datetime, required)', () => {
    const f = attrs['occurredAt'] as Record<string, unknown>
    expect(f).toBeDefined()
    expect(f['type']).toBe('datetime')
    expect(f['required']).toBe(true)
  })

  it('measurement schema has metric (string)', () => {
    const f = attrs['metric'] as Record<string, unknown>
    expect(f).toBeDefined()
    expect(f['type']).toBe('string')
  })

  it('measurement schema has value (float)', () => {
    const f = attrs['value'] as Record<string, unknown>
    expect(f).toBeDefined()
    expect(f['type']).toBe('float')
  })

  it('measurement schema has owner manyToOne relation (personal shape)', () => {
    const owner = attrs['owner'] as Record<string, unknown>
    expect(owner).toBeDefined()
    expect(owner['type']).toBe('relation')
    expect(owner['relation']).toBe('manyToOne')
    expect(owner['target']).toBe('plugin::users-permissions.user')
  })

  it('measurement schema does NOT have catalog fields (creator, visibility)', () => {
    expect(attrs['creator']).toBeUndefined()
    expect(attrs['visibility']).toBeUndefined()
  })

  it('measurement schema does NOT have a kind column', () => {
    expect(attrs['kind']).toBeUndefined()
  })
})

describe('parity: transaction schema ↔ manifest (personal kind)', () => {
  it('kindOf("transactions") is personal', () => {
    expect(kindOf('transactions')).toBe('personal')
  })

  const schema = loadSchema('transaction')
  const attrs = attributes(schema)

  it('transaction schema has recordId (required + unique string)', () => {
    const f = attrs['recordId'] as Record<string, unknown>
    expect(f).toBeDefined()
    expect(f['type']).toBe('string')
    expect(f['required']).toBe(true)
    expect(f['unique']).toBe(true)
  })

  it('transaction schema has occurredAt (datetime, required)', () => {
    const f = attrs['occurredAt'] as Record<string, unknown>
    expect(f).toBeDefined()
    expect(f['type']).toBe('datetime')
    expect(f['required']).toBe(true)
  })

  it('transaction schema has amount component referencing finance.money', () => {
    const f = attrs['amount'] as Record<string, unknown>
    expect(f).toBeDefined()
    expect(f['type']).toBe('component')
    expect(f['repeatable']).toBe(false)
    expect(f['component']).toBe('finance.money')
  })

  it('transaction schema has category (string)', () => {
    const f = attrs['category'] as Record<string, unknown>
    expect(f).toBeDefined()
    expect(f['type']).toBe('string')
  })

  it('transaction schema has direction enum (expense | income)', () => {
    const f = attrs['direction'] as Record<string, unknown>
    expect(f).toBeDefined()
    expect(f['type']).toBe('enumeration')
    const enumValues = f['enum'] as string[]
    expect(enumValues).toContain('expense')
    expect(enumValues).toContain('income')
  })

  it('transaction schema has accountId (string)', () => {
    const f = attrs['accountId'] as Record<string, unknown>
    expect(f).toBeDefined()
    expect(f['type']).toBe('string')
  })

  it('transaction schema has owner manyToOne relation (personal shape)', () => {
    const owner = attrs['owner'] as Record<string, unknown>
    expect(owner).toBeDefined()
    expect(owner['type']).toBe('relation')
    expect(owner['relation']).toBe('manyToOne')
    expect(owner['target']).toBe('plugin::users-permissions.user')
  })

  it('transaction schema does NOT have catalog fields (creator, visibility)', () => {
    expect(attrs['creator']).toBeUndefined()
    expect(attrs['visibility']).toBeUndefined()
  })

  it('transaction schema does NOT have a kind column', () => {
    expect(attrs['kind']).toBeUndefined()
  })
})
