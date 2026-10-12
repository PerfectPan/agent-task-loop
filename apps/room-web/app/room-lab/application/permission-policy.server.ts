import { lstatSync, readlinkSync, realpathSync } from 'node:fs';
import path from 'node:path';
import type { PermissionDecision, PermissionRequest } from '@rivus/agent-kit/acp';
import type { TurnPermissionPolicy } from './ports';

function isInside(root: string, target: string): boolean {
  const within = path.relative(root, target);
  // `..` and `..`-prefixed components only: a name that merely starts with
  // two dots (`..foo`) is an ordinary in-root name.
  return within === '' || (within !== '..' && !within.startsWith(`..${path.sep}`) && !path.isAbsolute(within));
}

function realPathOf(target: string): string | undefined {
  try {
    return realpathSync(target);
  } catch {
    return undefined;
  }
}

/**
 * Where a call's path really points, symlinks included: every component is
 * walked and each link followed, so a link that lives inside the root but
 * points out is judged by where it points. Past the first component that
 * does not exist nothing below can exist either — there is no link left to
 * hide in — so the rest hangs off the last real directory as written.
 * Returns undefined when the walk gives up: an unreadable link, or a chain
 * long enough to be a loop — the caller denies, because handing such a path
 * to the OS is exactly how it would follow the rest of the way out.
 */
function resolvedTarget(target: string): string | undefined {
  let current = path.resolve(target);
  for (let hops = 0; hops < 40; hops += 1) {
    const parts = current.split(path.sep);
    let walked: string = path.sep;
    let followed = false;
    for (let index = 1; index < parts.length; index += 1) {
      const part = parts[index]!;
      if (!part) {
        continue;
      }
      const next = path.join(walked, part);
      let stat: { isSymbolicLink(): boolean };
      try {
        stat = lstatSync(next);
      } catch {
        return path.join(walked, ...parts.slice(index).filter(Boolean));
      }
      if (!stat.isSymbolicLink()) {
        walked = next;
        continue;
      }
      let linkTarget: string;
      try {
        linkTarget = readlinkSync(next);
      } catch {
        return undefined;
      }
      // The link's own target may hold links of its own: walk it next pass,
      // with the rest of the original path hanging off it.
      const rest = parts.slice(index + 1).filter(Boolean);
      current = path.join(path.isAbsolute(linkTarget) ? linkTarget : path.resolve(walked, linkTarget), ...rest);
      followed = true;
      break;
    }
    if (!followed) {
      return walked;
    }
  }
  return undefined;
}

/**
 * The absolute paths an agent's raw tool input names, however it names them:
 * every string value in the input that starts with `/`, collected depth
 * first with a depth and size bound so a body-sized blob cannot stall the
 * answer. The kit's permission request carries the agent's own `rawInput`
 * rather than adapter-reported locations, so the candidate paths are the
 * input's — a relative path is indistinguishable from any other string and
 * is simply not judged (and never invented as one).
 */
function rawInputPaths(raw: unknown): string[] {
  const paths: string[] = [];
  const visit = (value: unknown, depth: number): void => {
    if (paths.length >= 64 || depth > 8) {
      return;
    }
    if (typeof value === 'string') {
      if (value.length > 0 && value.length <= 4096 && value.startsWith('/')) {
        paths.push(value);
      }
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        visit(item, depth + 1);
      }
      return;
    }
    if (value !== null && typeof value === 'object') {
      for (const item of Object.values(value)) {
        visit(item, depth + 1);
      }
    }
  };
  visit(raw, 0);
  return paths;
}

/**
 * The default policy for a Room turn: writes inside `cwd` are allowed, writes
 * outside it are denied. Paths are resolved before the comparison — a symlink
 * pointing out of `cwd` is out of `cwd` — and a write-kind call whose input
 * names no path is denied rather than assumed harmless. Everything the policy
 * cannot judge, it denies: returning undefined is the kit's denial.
 */
export function cwdPermissionPolicy(cwd: string): TurnPermissionPolicy {
  const root = realPathOf(cwd) ?? cwd;
  return (request: PermissionRequest): PermissionDecision | undefined => {
    const call = request.toolCall;
    const paths = rawInputPaths(call.rawInput);
    const writeKind = call.kind === 'edit' || call.kind === 'delete' || call.kind === 'move';
    // A chain the walker gives up on is exactly where the OS would follow it
    // out of the root; it is denied.
    const outside = paths.some((candidate) => {
      const resolved = resolvedTarget(candidate);
      return resolved === undefined || !isInside(root, resolved);
    });
    const wanted =
      outside || (writeKind && paths.length === 0) ? ['reject_once', 'reject_always'] : ['allow_once', 'allow_always'];
    for (const kind of wanted) {
      const option = request.options.find((candidate) => candidate.kind === kind);
      if (option) {
        return { optionId: option.optionId };
      }
    }
    // No reject option to select: the kit denies the request for us.
    return undefined;
  };
}
