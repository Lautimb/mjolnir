import type { PluginManifest } from './manifest'
import type { GrantablePermissions } from './permissions'

export function pluginProviderId(pluginId: string, providerId: string): string {
  return `${pluginId}.${providerId}`
}

export function cliCommandLine(cli: { command: string; args: string[] }): string {
  return [cli.command, ...cli.args].join(' ')
}

export function requestedPermissions(manifest: PluginManifest): GrantablePermissions {
  const cli = manifest.contributes.providers.flatMap((entry) => (entry.auth.cli ? [cliCommandLine(entry.auth.cli)] : []))
  return { ...manifest.permissions, ...(cli.length > 0 && { cli }) }
}
