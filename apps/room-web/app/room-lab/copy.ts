/**
 * Every user-visible string on the room surface, grouped by how it is read.
 *
 * - `status`  is scanned: a noun phrase that sits in a list next to a dot and a
 *             number. One of four shapes only: 已X · X中 · 待X · X失败.
 * - `action`  is acted on: a verb phrase on a button or menu item.
 * - `label`   names a place or a thing: section titles, nav, form labels.
 * - `say`     is read for meaning: a full sentence stating a fact and, where
 *             there is one, the next step.
 * - `availability` is a label keyed by a domain state, so the mapping is
 *             exhaustive rather than a lookup that can miss.
 *
 * Components import keys, never literals, so one state can only ever have one
 * word — including the strings the server writes into a room. `copy.test.ts`
 * enforces the grammar of each group and fails if a Chinese literal reappears
 * anywhere on the room surface.
 */
import type { RoomAgentAvailability } from './read-model';

export const copy = {
  status: {
    idle: '在场',
    running: '生成中',
    queued: '排队中',
    posted: '已回复',
    completed: '已回复',
    silent: '已读未答',
    held: '草稿待更新',
    error: '运行失败',
    /** count-off rows */
    answered: '已回复',
    answering: '回复中',
    waiting: '等待',
    replyFailed: '回复失败',
  },

  action: {
    send: '发送',
    sending: '发送中',
    mention: '提及',
    retryHeld: '读取更新并重答',
    viewDraft: '查看草稿',
    members: '成员',
    manageMembers: '管理成员',
    edit: '编辑',
    done: '完成',
    closeMembers: '收起成员面板',
    roomMenu: '房间菜单',
    clearChat: '清空对话',
    confirmClear: '确认清空',
    cancel: '取消',
    newRoom: '新建',
    createRoom: '创建房间',
    create: '创建',
    startCountOff: '开始报数',
    countingOff: '检查中…',
    rescan: '重新扫描',
    save: '保存',
    backToRoom: '返回房间',
    backToRooms: '返回房间列表',
    doneMembers: '完成成员编辑',
    skipToComposer: '跳到消息输入框',
    moveUp: (name: string) => `将 ${name} 上移`,
    moveDown: (name: string) => `将 ${name} 下移`,
    remove: (name: string) => `移除 ${name}`,
    add: (name: string) => `加入 ${name}`,
  },

  /** A member's CLI, keyed by what one shell lookup can answer. */
  availability: {
    runnable: '可运行',
    missing: '未安装',
  } satisfies Record<RoomAgentAvailability, string>,

  label: {
    product: 'Rivus',
    tagline: '本地工作台',
    rooms: '房间',
    agents: '智能体',
    pages: '页面',
    membersAndConnection: '成员与连接',
    members: (count: number) => `成员 · ${count}`,
    membersOrder: '成员与发言顺序',
    mentionList: '选择要提及的成员',
    speakingOrder: '发言顺序',
    joinable: '可加入',
    connection: '检查连接',
    thread: '房间对话',
    thisRound: '这一轮',
    roomName: '房间名',
    goal: '目标',
    optional: '可选',
    human: '你',
    humanMark: '我',
    everyone: '所有在场成员',
    localAgents: '本机智能体',
    systemPrompt: (name: string) => `${name} 的系统提示`,
    roomsIn: '所在房间：',
    theme: (choice: string) => `主题：${choice}`,
    themeSystem: '跟随系统',
    themeLight: '亮色',
    themeDark: '暗色',
    spent: '用时',
    composer: '向房间发送消息',
    composerPlaceholder: '说点什么',
    roomNamePlaceholder: '房间名，例如：Q3 定价方案',
    goalPlaceholder: '一句话说明目标，之后可以修改',
    newMessages: (count: number) => `${count} 条新消息`,
    memberCount: (count: number) => `${count} 位成员`,
    charCount: (used: number, limit: number) => `${used} / ${limit}`,
    countOffRecord: (runId: string) => `检查记录 ${runId}`,
    justNow: '刚刚',
    minutesAgo: (n: number) => `${n} 分钟前`,
    hoursAgo: (n: number) => `${n} 小时前`,
    daysAgo: (n: number) => `${n} 天前`,
  },

  say: {
    /** header status line while a round is live */
    roundNow: (id: string, rest: number) => rest > 0 ? `当前 ${id} · 待回复 ${rest} 位` : `当前 ${id} · 最后一位`,
    roundNext: (id: string) => `${id} 即将开始`,
    queueBehind: (id: string) => `发送后将排在 ${id} 之后`,
    composerHint: 'Enter 发送 · Shift+Enter 换行 · 不 @ 时全体成员依次回复',
    sendFailed: '发送失败，内容已保留在输入框',
    heldInThread: (id: string) => `${id} 的草稿被新消息打断，读取更新后重答（见成员栏）`,
    errorInThread: (id: string) => `${id} 本轮运行失败`,
    heldExplain: '发送前收到新消息，草稿已暂存。读取更新后将重新作答并覆盖草稿。',
    heldRetryFailed: '上次重试失败。',
    retried: (times: number) => `已重试 ${times} 次。`,
    connectionExplain: '按成员顺序依次回复一个数字，验证每位都能读写这段对话。在场不代表连接可用。',
    noCountOff: '还没有检查记录。',
    noMentionMatch: '没有匹配的成员',
    countOffPassed: (total: number) => `${total} 位全部通过`,
    countOffFailed: (n: number) => `第 ${n} 位未通过`,
    countOffWaiting: (n: number) => `等待第 ${n} 位回复`,
    crewExplain: '成员顺序即发言顺序和报数顺序。未安装的成员也可加入，被点到时才会调用本机 CLI。',
    everyoneDescription: '发给全部在场成员',
    emptyThreadTitle: '还没有消息',
    emptyThread: (count: number) => `发一条消息，在场的 ${count} 位成员会依次回复；输入 @ 可只问其中一位。`,
    clearConfirm: '清空这间房的全部对话？房间和成员保留。',
    membersSheet: '这间房的成员状态与连接检查。',
    received: (count: number, head: number) => `已收到 ${count} 条消息，最新序号 ${head}。`,
    mentioned: (names: string) => `提及：${names}`,
    promptPlaceholder: '这位智能体的系统提示。留空则使用默认调用方式。',
    savedLocally: '数据保存在本机',
    promptSaved: '保存在本机，所有房间共用。',
    createTitle: '新建房间',
    createIntro: '用要做的事命名房间。在场的 agent 会在同一条对话里依次回复。',
    agentsLink: '查看本机已安装的 agent，为每位设置系统提示。',
    agentsIntro: (total: number, runnable: number) => `本机 ${total} 位智能体，${runnable} 位可运行。系统提示会在房间调用时随请求带上。`,
    noCommand: '未在 PATH 中找到命令',
    inNoRoom: '未加入任何房间',
    roomUnavailable: '无法打开这间房',
    serviceUnavailable: '房间服务不可用',
    agentsUnavailable: '智能体页面不可用',
    metaDescription: '在本机开一间房，让几个本地 agent 在同一条对话里依次回复。',
    /** Posted into the room by the product itself, so it lives here too. */
    countOffOpen: (total: number) => `@all 报数开始：请按席位顺序只回复自己的数字（1–${total}）。`,
    runInterrupted: '上次执行被中断，不会自动重跑',
  },
} as const;

export type StatusKey = keyof typeof copy.status;
