import type { Exec } from './git'

export interface DiscoveredRepos {
  home: string
  repos: string[]
}

const SCRIPT = [
  'root="${1:-$HOME}"',
  'printf "%s\\n" "$root"',
  'find "$root" -maxdepth "$2" \\( -name node_modules -o \\( -name ".*" ! -name .git \\) \\) -prune -o -name .git -print 2>/dev/null',
  'true',
].join('\n')

export function parseDiscovered(output: string): DiscoveredRepos {
  const [home = '', ...lines] = output.split(/\r?\n/).filter(Boolean)
  const repos = [...new Set(lines.map((line) => line.replace(/\/\.git$/, '')))].sort((a, b) => a.localeCompare(b))
  return { home, repos }
}

export async function discoverRepos(exec: Exec, root = '', depth = 5): Promise<DiscoveredRepos> {
  return parseDiscovered(await exec('/', 'sh', ['-c', SCRIPT, 'sh', root, String(depth)]))
}
