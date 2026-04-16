import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CCTO_DIR, CONFIG_FILE, type CctoConfig, DEFAULT_CONFIG } from '@ccto/shared';
import { ConfigError } from '@ccto/shared';

/**
 * Load CCTO config from <projectRoot>/.ccto/config.json.
 * Creates a default config if none exists.
 */
export function loadConfig(projectRoot: string): CctoConfig {
  const configDir = join(projectRoot, CCTO_DIR);
  const configPath = join(configDir, CONFIG_FILE);

  if (!existsSync(configPath)) {
    return { ...DEFAULT_CONFIG, projectRoot };
  }

  try {
    const raw = readFileSync(configPath, 'utf-8');
    return JSON.parse(raw) as CctoConfig;
  } catch (err) {
    throw new ConfigError(`Failed to parse config at ${configPath}`, { cause: err });
  }
}

/**
 * Write CCTO config to disk, creating .ccto/ if needed.
 */
export function saveConfig(projectRoot: string, config: CctoConfig): void {
  const configDir = join(projectRoot, CCTO_DIR);
  mkdirSync(configDir, { recursive: true });
  const configPath = join(configDir, CONFIG_FILE);
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf-8');
}
