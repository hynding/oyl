import type { ExtractedDocument } from './extracted-document.js'

export interface NameConfig {
  template: string
  prefix: string
  dateFormat: string
  timeFormat: string
}

export const DEFAULT_NAME_CONFIG: NameConfig = {
  template: '<date>_<business>_<total>.<ext>',
  prefix: '',
  dateFormat: 'YYYY-MM-DD',
  timeFormat: 'HHmm',
}

const VARIABLES = [
  'date',
  'time',
  'business',
  'category',
  'CATEGORY',
  'transaction_type',
  'payment_method',
  'payment_account_suffix',
  'total',
  'ext',
] as const
type Variable = (typeof VARIABLES)[number]

const VAR_RE = /<([^<>]+)>/g

/** Filename-safe hyphen slug (distinct from core toSlug, which is underscore-based for metric keys). */
function toNameSlug(value: string): string {
  return value
    .replace(/'/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Human-readable config problems; [] means valid. CLI fails fast on non-empty. */
export function validateNameConfig(config: NameConfig): string[] {
  const problems: string[] = []
  for (const source of [config.template, config.prefix]) {
    for (const match of source.matchAll(VAR_RE)) {
      if (!(VARIABLES as readonly string[]).includes(match[1]!)) {
        problems.push(`unknown variable <${match[1]}> — valid: ${VARIABLES.map((v) => `<${v}>`).join(', ')}`)
      }
    }
  }
  if (!config.template.includes('<ext>')) {
    problems.push('template must end with the file extension: include <ext>')
  }
  if (!/^(?=.*YYYY)(?=.*MM)(?=.*DD)[YMD\-_.]+$/.test(config.dateFormat)) {
    problems.push(`date format must use YYYY, MM and DD with only -_. separators, got "${config.dateFormat}"`)
  }
  if (!/^(?=.*HH)(?=.*mm)[Hm\-_.]+$/.test(config.timeFormat)) {
    problems.push(`time format must use HH and mm with only -_. separators, got "${config.timeFormat}"`)
  }
  return problems
}

function formatDate(value: string, format: string): string {
  const [y = '', m = '', d = ''] = value.split('-')
  return format.replace('YYYY', y).replace('MM', m).replace('DD', d)
}

function formatTime(value: string, format: string): string {
  const [h = '', m = ''] = value.split(':')
  return format.replace('HH', h).replace('mm', m)
}

function moneyToDecimal(minor: number, exponent: number): string {
  const negative = minor < 0
  const abs = Math.abs(minor).toString().padStart(exponent + 1, '0')
  const cut = abs.length - exponent
  return `${negative ? '-' : ''}${abs.slice(0, cut)}${exponent > 0 ? `.${abs.slice(cut)}` : ''}`
}

/**
 * Render the configured filename for an extraction. Assumes validateNameConfig
 * passed. Returns the rendered name plus which required variables fell back to
 * "unknown" (callers force needs_review when non-empty).
 */
export function renderFileName(
  doc: ExtractedDocument,
  ext: string,
  config: NameConfig,
): { name: string; missing: string[] } {
  const missing = new Set<string>()

  const valueOf = (variable: Variable): string => {
    switch (variable) {
      case 'date':
        return doc.date !== undefined ? formatDate(doc.date.value, config.dateFormat) : fallback('date')
      case 'time':
        return doc.time !== undefined ? formatTime(doc.time, config.timeFormat) : ''
      case 'business':
        return doc.merchant !== undefined ? toNameSlug(doc.merchant.name) : fallback('business')
      case 'category':
        return doc.docType
      case 'CATEGORY':
        return doc.docType.toUpperCase()
      case 'transaction_type':
        return doc.transactionType ?? ''
      case 'payment_method':
        return doc.payment !== undefined ? toNameSlug(doc.payment.method) : ''
      case 'payment_account_suffix':
        return doc.payment?.accountSuffix !== undefined ? doc.payment.accountSuffix.replace(/[^0-9a-z]/gi, '') : ''
      case 'total':
        return doc.total !== undefined ? moneyToDecimal(doc.total.minor, doc.total.exponent) : fallback('total')
      case 'ext':
        return ext.toLowerCase().replace(/^\.+/, '')
    }
  }

  function fallback(name: string): string {
    missing.add(name)
    return 'unknown'
  }

  const rendered = (config.prefix + config.template).replace(VAR_RE, (_, v: string) => valueOf(v as Variable))
  const name = rendered
    .replace(/[_-]{2,}/g, (run) => run[0]!) // collapse separator runs left by empty variables
    .replace(/[_-]+(?=\.)/g, '') // no dangling separator before the extension dot
    .replace(/^[_-]+/, '')
  return { name, missing: [...missing] }
}
