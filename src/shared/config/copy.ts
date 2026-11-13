import { BRAND_NAME, NETWORK } from '@/config/networks';

/**
 * The chain's native coin (ETH on the local anvil, BNB on BSC). Every string
 * that names it renders this, never a hardcoded ticker (UX spec §1.3/§3.3).
 */
const NATIVE_SYMBOL = NETWORK.nativeCurrency.symbol;

/**
 * First-screen copy: shell, home and everything the identity/connect path renders.
 *
 * All user-facing Chinese copy lives in the copy module(s) (i18n framework
 * deliberately deferred). Review against GLOSSARY.md before adding a new word:
 * 激励/预留/销毁, 身份 NFT, 链群, 代币社区, 时间片/轮次. Never write
 * gas/approve/allowance/nonce/revert on the happy path.
 *
 * Copy that only lazily loaded pages render (mint, airdrop, swap, my NFT,
 * advanced) lives in ./copy-pages so the first-screen graph does not carry those
 * strings. Import that module from page/feature code, never from the shell.
 *
 * The site-level brand name is NOT duplicated here: it comes from the environment
 * package (`BRAND_NAME`), so deployments/*.json stays the single source of truth.
 */
export const copy = {
  brand: {
    /** Protocol label when no community is selected/known (GLOSSARY). */
    protocolLabel: `${BRAND_NAME}协议`,
    /** Browser tab title for a resolved community: `<page> · <symbol>`. */
    pageTitle: (page: string, symbol: string) => `${page} · ${symbol}`,
  },
  common: {
    home: '回首页',
    retry: '重试',
    refresh: '刷新',
    copy: '复制',
    copied: '已复制',
    close: '关闭',
    loading: '读取中…',
    unknown: '—',
    notConfigured: '未配置',
    comingSoon: '即将上线',
    readFailed: '暂时读不到',
    parenthesized: (text: string) => `（${text}）`,
    cancel: '取消',
  },
  nav: {
    home: '首页',
    gov: '治理',
    act: '行动',
    apps: '应用',
    me: '我的',
    homeAria: '首页',
    govAria: '治理（即将上线）',
    actAria: '行动（即将上线）',
    appsAria: '应用',
    meAria: '我的',
    mobileLabel: '主导航',
    desktopLabel: '主导航',
  },
  header: {
    backAria: '返回上一页',
    collapseSidebar: '收起侧栏',
    expandSidebar: '展开侧栏',
    brandAria: (symbol: string) => `${symbol} 首页`,
  },
  wallet: {
    connect: '连接钱包',
    connecting: '连接中…',
    checkingWallet: '检测钱包中…',
    wrongNetwork: '网络不对，点此切换',
    switchingNetwork: '切换中…',
    addressLabel: '钱包地址',
    copyAddressAria: '复制钱包地址',
    copiedAddressAria: '钱包地址已复制',
    identityLabel: '身份 NFT',
    walletMenuAria: '打开钱包与身份 NFT 菜单',
    tokenBalanceLabel: (symbol: string) => `${symbol} 余额`,
    viewNft: '查看NFT',
    goSelect: '去选择',
    goMint: '去铸造',
    noIdentity: '未关联 NFT',
    noIdentitySelected: '未选择身份 NFT',
    identityReading: '读取身份 NFT 中…',
    identityNotDeployed: '身份 NFT 未部署',
    /** Wallet-menu identity row: every state must agree with useMemberIdentity(). */
    identityUnavailable: '身份 NFT 暂时读不到',
    identityUnavailableBody: '网络可能不稳，身份 NFT 没有变化。',
    identityUnconfigured: '这个环境还没有部署身份 NFT 合约',
    nativeFeeNote: `${NATIVE_SYMBOL} 用于支付网络手续费`,
    nativeBalanceLabel: (symbol: string) => `${symbol} 余额`,
    disconnect: '断开连接',
    footer: '当前身份 NFT 保存在这台设备；换浏览器需要重新选择。',
    menuTitle: '钱包与身份 NFT',
    noWalletTitle: '没有检测到钱包',
    noWalletBody: '你可以换一个入口打开本页。',
    noWalletStepInApp: '在手机钱包 App 的内置浏览器中打开本页；已经在内置浏览器里，关掉再打开。',
    noWalletStepInstall: '在电脑浏览器安装钱包扩展后刷新。',
    noWalletCopyLink: '复制本页链接',
    noWalletDismiss: '知道了',
    connectErrorTitle: '连接没有完成',
    networkErrorTitle: '网络切换没有完成',
    networkErrorClose: '关闭',
    networkErrorRetry: '再试一次',
  },
  community: {
    recent: '最近访问',
    emptyRecent: '还没有访问过其他社区。',
    parent: '父币',
    child: '子币',
    notWired: '未接入',
    switchHint: '切换社区不会切换网络，也不会刷新页面。',
    menuTitle: '代币社区',
    chipAria: (symbol: string) => `当前代币社区 ${symbol}，打开社区菜单`,
  },
  identity: {
    memberId: (id: string) => `NFT #${id}`,
    disconnectedTitle: '先连接钱包',
    /** Shared honest line for an environment whose address book has no MemberNFT. */
    notDeployedTitle: '这个环境还没有部署身份 NFT 合约',
    notDeployedBody: '这里暂时不能铸造身份 NFT。',
    unconfiguredBody: '地址簿里还没有 MemberNFT 或种子 core 合约。填充部署地址后会自动读取。',
    truncated: '这个钱包持有的身份 NFT 较多，这里只显示前 100 个。',
    emptyBody: '每个身份 NFT 都是一个独立的身份。铸造后可以参与社区治理与行动。',
    selectedLabel: '当前身份 NFT',
    myNftTitle: '我的 NFT',
    selectedBadge: '当前',
  },
  /**
   * 首页 = 提醒流 (UX spec §3.1, owner 2026-11-11). The page answers one
   * question: 「有没有需要我处理的事」. Identity and balance live on 我的
   * (§3.7); home keeps one thin line and conditional reminder cards.
   */
  home: {
    identityIntro: '一个钱包可以拥有多个身份 NFT，身份 NFT 才是参与凭证。',
    greeting: (name: string) => `你好，${name}`,
    greetingNoName: '你好',
    /** Identity read states that must never leave the page as a bare greeting. */
    identityReading: '读取身份 NFT 中…',
    identityErrorTitle: '身份 NFT 暂时读不到',
    noIdentity: '你还没有身份 NFT',
    goMyNft: '去我的 NFT',
    switchIdentity: '切换身份 NFT',
    identityInvalidated: '这个身份 NFT 已不属于当前钱包',
    chooseIdentityTitle: '还没有选择当前身份 NFT',
    chooseIdentityBody: '这个钱包持有身份 NFT。去「我的 NFT」选一个作为当前身份 NFT。',
    eligibilityTitle: '你参与了销毁活动，获得空投铸造资格',
    mintAirdrop: '空投铸造',
    eligibilityUnavailable: '空投资格暂时读不到',
    /** Reminder card 1: no identity yet. */
    reminderNoIdentityTitle: '你还没有身份 NFT',
    mintIdentity: '铸造身份 NFT',
    /** Reminder card 2: holds identities but none selected (vs card 1, mutually exclusive). */
    reminderNeedsSelectionTitle: '你还没有选择身份 NFT',
    chooseIdentity: '选择身份 NFT',
    /** Reminder card 2: eligible and unclaimed; drop the clause when unknown. */
    reminderAirdrop: '你有空投资格',
    reminderAirdropWithAmount: (amount: string, symbol: string) =>
      `你有空投资格，可铸造 ${amount} ${symbol}`,
    /** Still rendered by 我的 (§3.7) and the shared technical-details widget. */
    docs: '开源文档',
    technical: '技术详情',
    errorTitle: '暂时读不到身份 NFT',
    errorBody: '网络可能不稳，你的身份 NFT 没有变化。',
    balanceError: '余额暂时读不到',
  },
  /** Page titles the eager router/header needs; bodies live in ./copy-pages. */
  pageTitles: {
    myNft: '我的 NFT',
    mint: '铸造身份 NFT',
    airdrop: '空投铸造',
    swap: '兑换代币',
    apps: '应用',
    about: '关于',
    theme: '主题',
    transfer: '代币转账',
  },
  placeholders: {
    gov: {
      title: '治理',
      body: '用身份 NFT 对提案投票，按治理轮结算。M0 只做身份 NFT 与兑换。',
    },
    act: {
      title: '行动',
      body: '链群行动、链群服务、LP 行动。',
    },
    group: {
      title: '链群',
      body: '链群是身份 NFT 组成的协作单位。',
    },
    me: {
      title: '我的',
      body: '个人中心还在做。现在可以从首页或右上角进入「我的 NFT」。',
      extra: '去我的 NFT',
    },
    nextHome: '回首页',
    badge: '即将上线',
  },
  banners: {
    testnet: '测试网 · 没有真实价值',
    /** HTTPS Pages build talking to a loopback RPC: the browser blocks it. */
    rpcBlockedTitle: '线上页面不能访问本地链',
    rpcBlockedBody:
      '浏览器会拦截 HTTPS 页面对本地链（127.0.0.1）的请求。请用本地开发服务打开（pnpm dev，如 http://localhost:5180），或换成可访问的链。',
    rpcBlockedDismiss: '知道了',
    buildMismatchTitle: '有新版本，请刷新',
    buildMismatchBody: '当前输入会丢失。',
    buildMismatchAction: '刷新页面',
  },
  errors: {
    generic: '操作没有完成，请稍后重试。',
    rejected: '你取消了这次操作。',
    requestPending: '钱包里还有一个请求在等待处理，请先在钱包中完成或取消。',
    unknownChain: '没有在钱包里找到这条网络，请尝试重新添加。',
    network: '网络连接不稳定，请稍后重试。',
    contractGeneric: '操作没有完成，合约没有接受这次请求。',
    contractPanic: '数据校验没有通过，请检查输入后重试。',
    insufficientFunds: '钱包余额不足以支付网络手续费。',
    noAccess: '当前钱包没有执行这个操作的权限。',
    // Hand-written safety net for the three M0-critical selectors; the
    // generated registry remains authoritative.
    revertPhaseNotStarted: '这一轮还没有开始，请稍后再来。',
    revertIdentityNotOwner: '这个身份 NFT 不属于当前钱包，请切换到正确的钱包或身份 NFT。',
    revertCallFailed: '操作没有完成，请检查输入后重试。',
    revertInvalidData: '数据校验没有通过，请检查输入后重试。',
  },
  notFound: {
    title: '页面不存在',
    body: '可能是链接过期或拼错了。',
    action: '回首页',
  },
  build: {
    version: (buildId: string) => `版本 ${buildId}`,
    variant: {
      dev: '本地开发',
      test: '测试网',
      prod: '主网',
    },
  },
} as const;

export type Copy = typeof copy;
