import { app } from 'electron'
import { createNodeDetectContext, detectProfiles, hostKey, resolveLocation, type Host, type TerminalProfile } from '@mjolnir/core'

export interface Environment {
  appHost: Host
  profiles: TerminalProfile[]
  repoHosts: Host[]
}

export function detectEnvironment(): Environment {
  const profiles = detectProfiles(createNodeDetectContext())
  const appHost = resolveLocation(process.platform, process.env, app.getPath('home')).host
  const repoHosts =
    process.platform === 'win32' ? [...new Map(profiles.map((profile) => [hostKey(profile.host), profile.host])).values()] : [appHost]
  return { appHost, profiles, repoHosts }
}
