/**
 * Environment → REST host resolution.
 *
 * The native iOS/Android SDKs own the authoritative resolution; this is the
 * JS-visible mirror of that same mapping so hosts can derive the API base they
 * pre-create payment intents against without hardcoding hostnames. `presentSheet`
 * forwards the raw {@link ZennopayConfig} to native untouched — this helper is a
 * convenience for host backends/tests, it does not change the bridge payload.
 */
import type { ZennopayConfig, ZennopayEnvironment } from './types';

/** Resolved REST base URL per environment (spec §6). */
export const ZENNOPAY_HOSTS: Record<ZennopayEnvironment, string> = {
  sandbox: 'https://api.sandbox.zennopay.in',
  production: 'https://api.zennopay.in',
  // `staging` is a deprecated alias for `sandbox` — identical host.
  staging: 'https://api.sandbox.zennopay.in',
};

/** Environment assumed when a config omits one. */
export const DEFAULT_ENVIRONMENT: ZennopayEnvironment = 'sandbox';

/**
 * Resolve the REST base URL for a config, mirroring native resolution:
 * an explicit `apiBaseUrl` always wins (trailing slashes trimmed); otherwise
 * the host is derived from `environment`, defaulting to sandbox.
 */
export function resolveApiBaseUrl(config?: ZennopayConfig): string {
  const explicit = config?.apiBaseUrl?.trim();
  if (explicit) {
    return explicit.replace(/\/+$/, '');
  }
  const environment = config?.environment ?? DEFAULT_ENVIRONMENT;
  return ZENNOPAY_HOSTS[environment];
}
