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
 * 激励/预留/销毁, 身份, 链群, 代币社区, 时间片/轮次. Never write
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
    eyebrow: '身份优先的社区协作网络',
  },
  common: {
    back: '返回',
    home: '回首页',
    retry: '重试',
    refresh: '刷新',
    copy: '复制',
    copied: '已复制',
    copyLink: '复制链接',
    close: '关闭',
    loading: '读取中…',
    unknown: '—',
    notConfigured: '未配置',
    comingSoon: '即将上线',
    readFailed: '暂时读不到',
    view: '查看',
    next: '下一步',
    learnMore: '了解',
    copyFailed: '复制失败，请长按选择内容',
    parenthesized: (text: string) => `（${text}）`,
    cancel: '取消',
    notSelected: '未选择',
    confirm: '确认',
    notStarted: '未开始',
    required: '必填',
    testnet: '测试网',
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
    meAria: '我的（即将上线）',
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
    identityLabel: '身份',
    walletMenuAria: '打开钱包与身份菜单',
    tokenBalanceLabel: (symbol: string) => `${symbol} 余额`,
    viewNft: '查看NFT',
    goSelect: '去选择',
    goMint: '去铸造',
    noIdentity: '未关联 NFT',
    noIdentitySelected: '未选择身份',
    identityReading: '读取身份中…',
    identityNotDeployed: '身份未部署',
    balanceUnavailable: '未部署',
    nativeFeeNote: `${NATIVE_SYMBOL} 用于支付网络手续费`,
    nativeBalanceLabel: (symbol: string) => `${symbol} 余额`,
    identityMismatch: '这个身份已不属于当前钱包，请重新选择。',
    disconnect: '断开连接',
    footer: '身份保存在这台设备；换浏览器需要重新选择。',
    menuTitle: '钱包与身份',
    menuDescription: '钱包地址、当前身份与余额。',
    noWalletTitle: '没有检测到钱包',
    noWalletBody: '当前浏览器没有可用的钱包。你可以换一个入口打开本页。',
    noWalletStepInApp: '在手机钱包 App 的内置浏览器中打开本页。',
    noWalletStepInstall: '或在电脑浏览器安装钱包扩展后刷新。',
    noWalletStepRefresh: '如果已经在钱包里，仍然看不到，请关闭应用内浏览器再试。',
    noWalletCopyLink: '复制本页链接',
    noWalletDismiss: '知道了',
    connectErrorTitle: '连接没有完成',
    networkErrorTitle: '网络切换没有完成',
    networkErrorClose: '关闭',
    networkErrorRetry: '再试一次',
    addChainPending: '正在把这条网络添加到钱包…',
    addChainRejected: '你取消了添加网络。',
  },
  community: {
    recent: '最近访问',
    emptyRecent: '还没有访问过其他社区。',
    parent: '父币',
    child: '子币',
    current: '当前',
    notWired: '未接入',
    switchHint: '切换社区不会切换网络，也不会刷新页面。',
    menuTitle: '代币社区',
    menuDescription: '最近访问与代币树。',
    chipAria: (symbol: string) => `当前代币社区 ${symbol}，打开社区菜单`,
    unknownTitle: '没有找到这个代币社区',
    unknownDescription: (symbol: string) =>
      `链接里的代币名「${symbol}」可能拼错了，或者这个社区代币还没有发射。`,
    unknownAction: '回到 LOVE20 社区',
    unconfiguredTitle: '社区地址未配置',
    unconfiguredDescription: '地址簿还是空的。填充部署地址后，这里会显示当前社区。',
    addressLookupFailed: '暂时读不到这个社区，请稍后重试。',
    recentUnavailable: '连接钱包后可以切换社区。',
    currentOnly: '当前地址簿只配置了一个社区。',
  },
  identity: {
    welcome: (name: string) => `你好，${name}`,
    welcomeNoName: '你好',
    memberId: (id: string) => `身份 #${id}`,
    sectionTitle: '你的身份',
    disconnectedTitle: '先连接钱包',
    disconnectedBody: '连接后我们会找出这个钱包持有的成员身份。没有身份也能先看看这里能做什么。',
    unconfiguredTitle: '身份合约还没有部署',
    unconfiguredBody: '地址簿里还没有 MemberNFT 或种子 core 合约。填充部署地址后会自动读取。',
    loadingTitle: '正在读取身份',
    loadingBody: '正在读取这个钱包持有的身份。',
    errorTitle: '暂时读不到身份',
    errorBody: '网络可能不稳，你的身份没有变化。',
    truncated: '这个钱包持有的身份较多，这里只显示前 100 个。',
    emptyTitle: '你还没有身份',
    emptyBody: '一个 NFT 就是一个成员身份。铸造后可以参与社区治理与行动。',
    emptyMint: '铸造一个身份',
    chooseTitle: '选择一个身份',
    chooseBody: '这个钱包持有多个身份。选择一个作为当前身份。',
    chooseAction: '去我的 NFT',
    selectedLabel: '当前身份',
    noSelection: '还没有选择身份',
    invalidatedTitle: '身份已失效',
    invalidatedBody: '这个身份已不属于当前钱包，已为你清除。请重新选择。',
    recheck: '重新检测',
    myNftTitle: '我的 NFT',
    myNftIntro: '一个 NFT 就是一个成员身份。转移只换控制者，不改身份与历史。',
    listTitle: '持有的身份',
    listEmpty: '这个钱包还没有身份。',
    selectAction: '设为当前身份',
    selectedAction: '当前身份',
    mintAnother: '铸造新身份',
    nameFallback: (id: string) => `身份 #${id}`,
    nameLoading: '读取名称…',
    notDeployed: '身份合约未配置',
    selectedBadge: '当前',
    switchIdentity: '切换身份',
    invalidatedNeutral: '这个身份已不属于当前钱包',
    goMyNft: '去我的 NFT',
    memberSinceUnknown: '—',
  },
  /**
   * 首页 = 提醒流 (UX spec §3.1, owner 2026-11-11). The page answers one
   * question: 「有没有需要我处理的事」. Identity and balance live on 我的
   * (§3.7); home keeps one thin line and conditional reminder cards.
   */
  home: {
    identityIntro: '一个钱包可以拥有多个身份，身份才是参与凭证。',
    greeting: (name: string) => `你好，${name}`,
    greetingNoName: '你好',
    noIdentity: '你还没有身份',
    goMyNft: '去我的 NFT',
    switchIdentity: '切换身份',
    identityInvalidated: '这个身份已不属于当前钱包',
    chooseIdentityTitle: '还没有选择当前身份',
    chooseIdentityBody: '这个钱包持有身份。去「我的 NFT」选一个作为当前身份。',
    eligibilityTitle: '你参与了销毁活动，获得空投铸造资格',
    mintAirdrop: '空投铸造',
    eligibilityUnavailable: '空投资格暂时读不到',
    /** Thin line: no current identity (or none selected). */
    thinLineNoIdentity: '还没有身份',
    /** Reminder card 1: no identity yet. */
    reminderNoIdentityTitle: '你还没有身份',
    mintIdentity: '铸造身份',
    /** Reminder card 2: eligible and unclaimed; drop the clause when unknown. */
    reminderAirdrop: '你有空投资格',
    reminderAirdropWithAmount: (amount: string, symbol: string) =>
      `你有空投资格，可铸造 ${amount} ${symbol}`,
    /** Empty state: exactly one muted sentence, nothing else. */
    nothingToDo: '现在没有需要你处理的事。',
    swap: '兑换',
    docs: '开源文档',
    technical: '技术详情',
    buildMeta: (buildId: string, environment: string, chainId: number) =>
      `版本 ${buildId} · ${environment} · chain ${chainId}`,
    errorTitle: '暂时读不到身份',
    errorBody: '网络可能不稳，你的身份没有变化。',
    balanceError: '余额暂时读不到',
  },
  /** Page titles the eager router/header needs; bodies live in ./copy-pages. */
  pageTitles: {
    myNft: '我的 NFT',
    mint: '铸造身份',
    airdrop: '空投铸造',
    swap: '兑换代币',
    apps: '应用',
  },
  placeholders: {
    gov: {
      title: '治理',
      body: '用身份对提案投票，按治理轮结算。M0 只做身份与兑换，这一页还没有内容。',
    },
    act: {
      title: '行动',
      body: '链群行动、链群服务、LP 行动将在后续版本开放。',
    },
    group: {
      title: '链群',
      body: '链群是成员身份组成的协作单位，后续版本开放。',
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
    buildMismatchTitle: '有新版本，请刷新',
    buildMismatchBody: '页面资源已经更新。刷新后继续，当前输入会丢失。',
    buildMismatchAction: '刷新页面',
    buildMismatchClose: '稍后',
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
    noProvider: '当前浏览器没有可用的钱包。',
    wrongChain: '当前钱包连接的网络不对。',
    noAccess: '当前钱包没有执行这个操作的权限。',
    copy: '复制失败，请手动选择内容。',
    // Hand-written safety net for the three M0-critical selectors; the
    // generated registry remains authoritative.
    revertPhaseNotStarted: '这一轮还没有开始，请稍后再来。',
    revertIdentityNotOwner: '这个身份不属于当前钱包，请切换到正确的钱包或身份。',
    revertCallFailed: '操作没有完成，请检查输入后重试。',
    revertInvalidData: '数据校验没有通过，请检查输入后重试。',
  },
  notFound: {
    title: '页面不存在',
    body: '这个地址没有对应的页面，可能是链接过期或拼错了。',
    action: '回首页',
  },
  build: {
    development: '开发构建',
    version: (buildId: string) => `版本 ${buildId}`,
    variant: {
      dev: '本地开发',
      test: '测试网',
      prod: '主网',
    },
  },
  dev: {
    statusTitle: '开发状态',
    statusBody: '当前是骨架构建：地址簿为空，链上读取全部处于「未配置」状态。',
    variantValue: (variant: string, chainId: number) => `${variant} · chain ${chainId}`,
  },
} as const;

export type Copy = typeof copy;
