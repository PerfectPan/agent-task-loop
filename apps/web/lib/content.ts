/** Real product content, sourced from the repo README, RFCs and CLI surface. */

export const FEATURES = [
  {
    title: 'Full task lifecycle',
    body: 'Drive a task from assignment through execution, review, rework, and a publish-ready pull-request handoff — one loop, many agents.',
    icon: 'loop',
  },
  {
    title: 'Reads your trackers',
    body: 'An integration layer, not a system of record. Read tasks from Feishu Base and GitHub Issues at once; writes route back to whichever backend owns each task.',
    icon: 'plug',
  },
  {
    title: 'Interactive TUI dashboard',
    body: 'A three-pane terminal dashboard — task list, detail, and a live agent-session preview — with vim-style navigation and live status.',
    icon: 'terminal',
  },
  {
    title: 'Multi-agent ready',
    body: 'First-class support for Claude, Codex, Coco and GLM runners, with per-agent task assignment and round tracking.',
    icon: 'agents',
  },
  {
    title: 'Agent discovery',
    body: 'Detects locally installed coding agents and their sessions, so the loop knows what it can dispatch work to.',
    icon: 'search',
  },
  {
    title: 'Built for CI',
    body: 'A MoonBit → JS build pipeline, OIDC trusted npm publishing, and changesets-driven releases keep the toolchain modern.',
    icon: 'ci',
  },
] as const;

export const STAGES = [
  { label: '认领', en: 'Assign', desc: 'Claim a task for an agent' },
  { label: '执行', en: 'Execute', desc: 'Agent runs the work' },
  { label: '复核', en: 'Review', desc: 'A reviewer agent checks it' },
  { label: '修复', en: 'Rework', desc: 'Iterate until it passes' },
  { label: '交付', en: 'Handoff', desc: 'Open a PR, publish-ready' },
] as const;

export const COMMANDS = [
  { cmd: 'sync', desc: 'Pull the latest tasks from the store' },
  { cmd: 'start --task TASK-101', desc: 'Claim and start running a task' },
  { cmd: 'watch --task TASK-101', desc: 'Follow a running task live' },
  { cmd: 'tui', desc: 'Open the interactive dashboard' },
  { cmd: 'resume --task TASK-101', desc: 'Resume a paused or interrupted task' },
  { cmd: 'complete --task TASK-101', desc: 'Mark a task done and hand off' },
] as const;
