import { DEFAULT_NAME_CONFIG, validateNameConfig, type NameConfig } from '@oyl/all-of-oyl'

export interface OcariConfig {
  ollamaUrl: string
  model: string
  name: NameConfig
  out?: string
  rename: boolean
  dryRun: boolean
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConfigError'
  }
}

export interface ConfigInputs {
  flags: Partial<{
    model: string
    out: string
    rename: boolean
    'dry-run': boolean
    'name-template': string
    'name-prefix': string
    'date-format': string
    'time-format': string
  }>
  env: Record<string, string | undefined>
  /** Raw contents of the untracked root .env; '' when absent. Parsed per-key, never sourced. */
  dotenv: string
}

/** Extract one KEY=value from .env text (deploy-pi pattern): last wins, CR and one layer of matching quotes stripped. */
function dotenvKey(dotenv: string, key: string): string | undefined {
  let found: string | undefined
  for (const line of dotenv.split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*(?:#.*)?$/.exec(line.replace(/\r$/, ''))
    if (m && m[1] === key) found = m[2]!.replace(/^(["'])(.*)\1$/, '$2')
  }
  return found
}

export function loadConfig(inputs: ConfigInputs): OcariConfig {
  const setting = (flag: string | undefined, envKey: string, fallback: string): string =>
    flag ?? inputs.env[envKey] ?? dotenvKey(inputs.dotenv, envKey) ?? fallback

  const name: NameConfig = {
    template: setting(inputs.flags['name-template'], 'OYL_OCARI_NAME_TEMPLATE', DEFAULT_NAME_CONFIG.template),
    prefix: setting(inputs.flags['name-prefix'], 'OYL_OCARI_NAME_PREFIX', DEFAULT_NAME_CONFIG.prefix),
    dateFormat: setting(inputs.flags['date-format'], 'OYL_OCARI_DATE_FORMAT', DEFAULT_NAME_CONFIG.dateFormat),
    timeFormat: setting(inputs.flags['time-format'], 'OYL_OCARI_TIME_FORMAT', DEFAULT_NAME_CONFIG.timeFormat),
  }
  const problems = validateNameConfig(name)
  if (problems.length > 0) throw new ConfigError(problems.join('\n'))

  return {
    ollamaUrl: setting(undefined, 'OYL_OCARI_OLLAMA_URL', 'http://localhost:11434'),
    model: setting(inputs.flags.model, 'OYL_OCARI_MODEL', 'qwen2.5-vl:7b'),
    name,
    ...(inputs.flags.out !== undefined ? { out: inputs.flags.out } : {}),
    rename: inputs.flags.rename ?? false,
    dryRun: inputs.flags['dry-run'] ?? false,
  }
}
