import { NETWORK } from '@/config/networks';
import { copy as firstScreenCopy } from './copy';

/**
 * Copy for lazily loaded secondary pages (my NFT / mint / airdrop / swap /
 * advanced details). These strings used to sit in ./copy, which put every page's
 * text in the first-screen bundle even though only the shell + home render before
 * paint. Page and feature chunks import this module instead; ./copy stays eager.
 *
 * It re-uses the first-screen copy object (spread below) so page code can keep a
 * single `copy.<section>` shape and still share shell strings (nav, common,
 * wallet, ...) without duplicating them per chunk.
 */

const NATIVE_SYMBOL = NETWORK.nativeCurrency.symbol;

export const copy = {
  ...firstScreenCopy,
  pages: {
    myNft: {
      intro:
        '每个身份 NFT 都是一个独立的身份，可以在多个社区使用。换钱包不会改身份 NFT，只有转让才换控制者。',
      summary: (count: string) => `持有 ${count} 个身份 NFT`,
      tableNumber: 'NFT 编号',
      tableName: '名称',
      tableActions: '操作',
      currentBadge: '当前',
      useAction: '使用此身份 NFT',
      currentAction: '当前身份 NFT',
      transferAction: '转让',
      transferTitle: '转让身份 NFT',
      transferWarning:
        '转让会改变这个身份 NFT 的控制者。身份 NFT 的历史与质押仍留在身份 NFT 上，不随钱包转走；转让不可撤销。',
      recipientLabel: '收款地址',
      recipientPlaceholder: '0x 开头的 40 位地址',
      invalidRecipient: '收款地址格式不对，需要 0x 开头的 40 位地址。',
      zeroRecipient: '收款地址不能是零地址。',
      selfRecipient: '不能转让给自己。',
      confirmTransfer: '确认转让',
      transferring: '转让中…',
      transferSuccess: (address: string) => `已转让给 ${address}`,
      busyReason: '有一个操作正在进行',
      disconnectedTitle: '连接钱包后查看你的身份 NFT。',
      disconnectedBody: '没有身份 NFT 也能先看看这里能做什么。',
      emptyTitle: '你还没有身份 NFT。',
      emptyBody: '铸造需要一个名字和少量 LOVE20。',
      emptyMint: '铸造身份 NFT',
      errorTitle: '身份 NFT 列表暂时读不到。',
      mintAnother: '铸造新身份 NFT',
      backHome: '回首页',
    },
    mint: {
      title: '铸造身份 NFT',
    },
    swap: {
      title: '兑换代币',
    },
  },
  /**
   * 铸造身份 NFT (UX spec §3.3). Kept in its own namespace so the page has a single
   * source of copy and the shared 我的 NFT / wallet strings stay untouched.
   */
  mintIdentity: {
    name: {
      label: '给身份 NFT 起个名字',
      bytes: (used: string, max: string) => `${used}/${max} 字节`,
      rule: '中文 3 字节、英文与数字 1 字节；名字越短，价格越高',
      testRule: '名称必须以 Test 开头',
      testReason: '为了让测试身份 NFT 和真实身份 NFT 一眼能分开。',
      check: {
        checking: '检查中…',
        available: '✓ 可以用',
        taken: (memberId?: string) =>
          memberId === undefined ? '✗ 这个名字已经被用了' : `✗ 这个名字已经被用了（#${memberId}）`,
        tooLong: (maxBytes: string) => `✗ 太长了（最多 ${maxBytes} 字节）`,
        invalid: '✗ 含有不可用的字符',
        prefix: '✗ 还没加 Test 前缀',
        error: '暂时检查不了这个名字',
        retry: '重新检查',
      },
    },
    cost: {
      priceLabel: '铸造价格',
      estimate: (amount: string, symbol: string) => `预计 ${amount} ${symbol}`,
      balanceLabel: (symbol: string) => `我的 ${symbol}`,
      balanceLabelFallback: '余额',
      swapLink: '去兑换代币',
      short: (amount: string, symbol: string) => `余额不足，还需要 ${amount} ${symbol}`,
      note: '价格随已铸造数量变化，提交时以链上为准。',
    },
    branch: {
      airdrop: (amount: string | undefined, symbol: string) =>
        amount === undefined
          ? '你还有空投份额可以铸造，铸造后就够了。'
          : `你还有空投份额可以铸造，预计 ${amount} ${symbol}，铸造后就够了。`,
      airdropCta: '空投铸造',
      swap: () => `可以用 ${NATIVE_SYMBOL} 换一些，再回来铸造。`,
      swapCta: `用 ${NATIVE_SYMBOL} 兑换`,
      unknown: '暂时确认不了你的空投资格。',
      retry: '重试',
      swapFirst: '先兑换',
      checking: '正在确认你的空投资格…',
    },
    ladder: {
      approve: '1. 授权',
      approving: '授权中…',
      approvePending: '确认中…',
      approved: '已授权',
      mintStep: '2. 铸造身份 NFT',
      mint: '铸造身份 NFT',
      minting: '铸造中…',
      mintPending: '确认中…',
      approvalShort: '授权额度不够这次使用，需要再授权一次。',
      why: '为什么要两次确认？',
      whyBody: '第一次只是允许合约最多扣这么多，不会立刻扣钱；第二次才是铸造。',
    },
    receipt: {
      title: '铸造成功',
      memberId: (id: string) => `NFT #${id}`,
      burnedLabel: '已销毁',
      value: (amount: string, symbol: string) => `${amount} ${symbol}`,
      hashLabel: '交易哈希',
      explorerLink: '在区块浏览器里查看',
      copyHash: '复制交易哈希',
      notSelected: '还没有设为当前身份 NFT。',
      goMyNft: '去我的 NFT 使用这个身份 NFT',
      backHome: '回首页',
      mintAnother: '再铸造一个身份 NFT',
      missingMessage: '交易已经上链，但没有读到身份 NFT 编号，请去「我的 NFT」确认。',
    },
    states: {
      notDeployedTitle: '铸造还没有接入',
      notDeployedBody: '地址簿里还没有 MemberNFT 合约。填充部署地址后才能铸造身份 NFT。',
      connectTitle: '连接钱包后铸造身份 NFT。',
      connectBody: '铸造需要一个名字和少量 LOVE20。连接后可以先看到价格和余额。',
      wrongChainBody: '切换到这个应用使用的网络后再铸造。',
      errorTitle: '铸造配置暂时读不到。',
      errorBody: '网络可能不稳，你的资产没有变化。',
      retry: '重试',
      backHome: '回首页',
      goMyNft: '我的 NFT',
    },
    errors: {
      rejected: '你在钱包里点了取消，没有扣款。',
      nameTaken: '这个名字已经被用了。',
      nameTooLong: '名字太长，请缩短。',
      nameInvalid: '含有不可用的字符，请修改名字。',
      nameEmpty: '请填写名字。',
      allowanceShort: '授权额度不够这次使用。',
      balanceShort: (symbol: string) => `${symbol} 不够。`,
      reverted: '交易上链了，但没有成功。你的资产没有变化。',
      generic: '这次操作没有完成，请稍后重试。',
    },
  },
  /**
   * 空投铸造 (UX spec §3.4). The action is always called 空投铸造 and the
   * result 已铸造; the contract's `claim` name never reaches user-facing copy.
   * No string here may contain 领取 (GLOSSARY 文案纪律).
   */
  airdrop: {
    meta: (symbol: string) => `本次空投：${symbol}`,
    metaLoading: '本次空投：读取中…',
    states: {
      disconnectedTitle: '连接钱包后查看你的空投份额。',
      readErrorTitle: '空投数据暂时读不到',
      readErrorBody: '你的资产没有变化。',
      snapshotErrorTitle: '空投资格暂时读不到',
      snapshotErrorBody: '你的资产没有变化。',
      notDeployedTitle: '空投铸造还没有接入',
      notDeployedBody: '地址簿里还没有 Airdrop 合约。接入后会先检查资格，再显示可铸造份额。',
      wrongChainBody: '切换到这个应用使用的网络后再进行空投铸造。',
      ineligibleTitle: '这个钱包不在空投名单里。',
      ineligibleBody: '空投只面向快照时的参与者，不影响你现在参与。',
      ineligibleSwap: (symbol: string) => `用 ${NATIVE_SYMBOL} 兑换 ${symbol}`,
      unavailableSwap: (symbol: string) => `先用 ${NATIVE_SYMBOL} 兑换 ${symbol}`,
      copyLink: '复制本页链接',
      copied: '已复制',
      backHome: '回首页',
      retry: '重试',
    },
    eligible: {
      expectedLabel: '预计可得',
      expected: (amount: string, symbol: string) => `预计可得 ${amount} ${symbol}`,
      note: '按铸造时的池子余额与剩余份额计算，别人铸造后金额会变。',
      share: (percent: string) => `你的份额 ${percent}`,
      cta: '空投铸造',
    },
    unavailable: {
      poolEmptyTitle: '你有一份空投，但空投池还没有代币。',
      poolEmptyBody: '等池子补充后再来；你的份额没有变化。',
      shareZeroTitle: '你的份额为 0。',
      shareZeroBody: `这份快照里没有可分到的份额；你可以先用 ${NATIVE_SYMBOL} 兑换一些。`,
      shareExceedsTitle: '你的份额超过了空投池剩余份额。',
      shareExceedsBody: '等剩余份额恢复后才能铸造；你的份额没有变化。',
      zeroAmountTitle: '可铸造金额暂时为 0。',
      zeroAmountBody: '按现在的池子余额与剩余份额算出来是 0；等池子余额增加后金额会变。',
    },
    claimed: {
      title: '已铸造',
      /** S6 with a real on-chain amount: 「已铸造 {X} LOVE20」 (spec §3.4). */
      amountLine: (amount: string, symbol: string) => `已铸造 ${amount} ${symbol}`,
      amountNote: '金额来自链上这笔交易的记录，不依赖本机缓存。',
      /** S6 without a readable amount (no CI-014 view): never invent one. */
      unknownBody: '这次空投已经铸造过，暂时读不到具体金额，以链上记录为准。',
      unknownBodyExplorer: '这次空投已经铸造过。金额可以在区块链浏览器里查看。',
      hashLabel: '交易哈希',
      explorer: '在区块链浏览器里查看',
      goMint: '去铸造身份 NFT',
    },
    rules: {
      summary: '规则',
      genesis: (symbol: string) => `这次空投发的是首币 ${symbol}，和当前选择的社区无关。`,
      snapshot: '份额来自销毁活动快照，地址和份额在部署时固定。',
    },
    pending: {
      wallet: '铸造中…',
      chain: '确认中…',
    },
    receipt: {
      title: '铸造成功',
      received: '你得到',
      amountNote: '实际铸造金额来自这笔交易的回执。',
      amountUnknown: '回执里没有读到铸造金额，请以链上余额为准。',
      shareLabel: '空投份额',
      remainingLabel: '空投池剩余份额',
      dateLabel: '记录时间',
      hashLabel: '交易哈希',
      copyHash: '复制交易哈希',
      explorer: '在区块浏览器里查看',
      goMint: '用这些代币铸造身份 NFT',
      backHome: '回首页',
      missingBody: '交易已经上链，但回执里没有读到铸造金额。刷新后会以链上状态为准。',
    },
    errors: {
      rejected: '你在钱包里点了取消，没有扣款。',
      alreadyClaimed: '这次空投份额已经铸造过了，没有重复扣款。',
      unauthorized: '这个钱包不在空投名单里，没有发起交易。',
      invalidProof: '这份空投资格与链上快照没有对上，你的份额没有变化。',
      invalidShare: '这份空投份额不正确，你的份额没有变化。',
      shareExceeds: '你的份额超过了链上空投池的剩余份额，这次没有铸造。',
      noAmount: '按现在的情况，这次可铸造金额是 0，没有发起扣款。',
      tokenFailed: '空投池暂时付不出代币，这次没有铸造。',
      reverted: '交易上链了，但没有成功。你的份额没有变化。',
      generic: '这次操作没有完成，请稍后重试。',
    },
  },
  /**
   * 通用兑换 (UX spec §3.5). 兑换 is the only verb: the page never says 领取,
   * and the price protection is 最多可接受的价格变化, never 滑点.
   */
  swap: {
    from: '从',
    to: '到',
    expected: '预计可得',
    amountPlaceholder: '0.0',
    balanceLabel: (symbol: string) => `余额 ${symbol}`,
    balanceLoading: '读取余额中…',
    max: '全部',
    maxNativeNote: (reserve: string, native: string) =>
      `已为网络手续费预留约 ${reserve} ${native}。`,
    swapDirection: '交换方向',
    selectToken: (side: string) => `选择${side}代币`,
    tokenSheetTitle: '选择代币',
    groupNative: '原生币',
    groupWrapped: '包装原生币',
    groupCommunity: '社区代币',
    searchPlaceholder: '搜索代币符号',
    searchHint: '按链上 symbol() 精确查找。',
    searchEmpty: '没有找到这个代币符号。',
    searchLoading: '查找中…',
    loadMore: '加载更多',
    noCommunityTokens: '还没有发现社区代币。',
    rate: (from: string, rate: string, to: string) => `1 ${from} ≈ ${rate} ${to}`,
    rateWrap: (from: string, to: string) => `1 ${from} = 1 ${to}（包装/解包，不经过交易对）`,
    pathLabel: '路径',
    minOutLabel: '最少到账',
    feeNone: '无手续费（1:1 包装/解包）',
    priceImpactLabel: '价格影响',
    priceImpactValue: (percent: string) => `约 ${percent}%`,
    priceImpactAck: '继续',
    slippageLabel: '最多可接受的价格变化',
    slippageCustom: '自定义',
    slippageCustomPlaceholder: '0.5',
    slippageCustomUnit: '%',
    slippageRange: '自定义值需要在 0.01% 到 50% 之间。',
    feeLabel: '手续费率',
    feeChain: '以链上费率为准',
    priceImpactHigh: '这笔兑换会明显改变池子价格，继续前请确认。',
    freshnessCountdown: (seconds: string) => `${seconds}s 后更新`,
    expired: '报价已过期',
    quoteRefreshing: '正在更新报价…',
    states: {
      connectTitle: '连接钱包后兑换。',
      connectBody: '兑换需要钱包确认。连接后先读取余额与报价。',
      wrongChainBody: '切换到这个应用使用的网络后再兑换。',
      unconfiguredTitle: '这个环境还没有配置兑换。',
      unconfiguredBody: '地址簿里还没有 Router、Factory 或 Launch。',
      insufficient: (symbol: string, shortfall: string) => `${symbol} 不够，还差约 ${shortfall}`,
      nativeGasNote: (native: string) => `需要预留一点 ${native} 支付网络手续费。`,
      noRouteTitle: '这个方向没有可用的兑换路径。',
      noRouteBody: '这个方向超过 3 跳，或者中间少了一个交易对。',
      noRouteHop: (hop: string) => `卡在 ${hop} 这一段。`,
      emptyPoolTitle: '这个兑换对还没有可兑换的流动性。',
      emptyPoolBody: '发射代币时只创建了交易对，没有注入资金，所以现在换不了。',
      emptyPoolHop: (hop: string) => `卡在 ${hop} 这一段。`,
      invalidTitle: '这个兑换对不可用。',
      invalidBody: '链接里的代币符号可能不存在，或者这个代币还没发射。',
      chooseToken: '选择代币',
      changeToken: '换个代币',
      backHome: '回首页',
      retry: '重试',
      quoteErrorTitle: '价格暂时读不到。',
      quoteErrorBody: '网络可能不稳，你的资产没有变化。',
      quoteErrorRetry: '重新报价',
      amountInvalid: '请输入有效的金额。',
      amountTooPrecise: (digits: number) => `小数位不能超过 ${digits} 位。`,
      amountTooSmall: '金额太小，换不到代币。',
    },
    ladder: {
      approve: '1 授权',
      swap: '兑换',
      swapStep: '2 兑换',
      approved: '已授权',
      approving: '授权中…',
      swapping: '兑换中…',
      confirming: '确认中…',
      note: '报价随池子变化；提交前会再读一次链上价格。',
      approvalNote: '第一次只是允许合约最多扣这么多，不会立刻扣钱；第二次才是兑换。',
      approvalShort: '授权额度不够这次使用，需要再授权一次。',
    },
    receipt: {
      title: '兑换完成',
      received: '你得到',
      actualNote: '实际到账来自这笔交易的回执，不是报价。',
      actualUnknown: '回执里没有读到实际到账，请以钱包余额为准。',
      pathLabel: '路径',
      minLabel: '最少到账',
      minFailed: '实际到账低于最少到账，这笔交易本应被拒绝；请核对链上记录。',
      paidLabel: '实际支付',
      hashLabel: '交易哈希',
      copyHash: '复制交易哈希',
      explorer: '在区块浏览器里查看',
      goHome: '回首页',
      swapAgain: '再兑换一次',
    },
    errors: {
      rejected: '你在钱包里点了取消，没有扣款。',
      insufficientFunds: (native: string) => `${native} 不够付手续费。请先转一点 ${native} 进来。`,
      priceMoved: '价格变化太大，这笔交易没有成交。',
      priceMovedNext: '重新报价并重试',
      balanceShort: (symbol: string) => `${symbol} 不够。`,
      expired: '这笔交易等待太久，已经过期，没有成交。',
      liquidity: '池子里的流动性不够，这笔交易没有成交。',
      reverted: '交易上链了，但没有成功。你的资产没有变化。',
      failedNote: '没有成交，只消耗了网络手续费。',
      quoteFailed: '价格暂时读不到，没有发起交易。',
    },
  },
  /**
   * 交易确认的有界等待 (UX spec §4.2 / §4.4). Shared by all three write flows so a
   * pending transaction can never become a dead end: inside the deadline the
   * page offers 「重新查询」, after it the role="alert" card explains what happened
   * and offers 「重新提交」 plus the wallet-activity cure for a nonce gap.
   * No gas/approve/allowance/nonce/revert words and never raw hex or RPC errors.
   */
  txWatch: {
    pending: {
      submitted: '交易已经提交，等待上链。',
      remaining: (seconds: string) => `约 ${seconds} 秒后仍未确认，可以重新提交一笔。`,
      refresh: '重新查询',
    },
    titles: {
      slow: '这笔交易还没有被确认',
      dropped: '这笔交易还没有被确认',
      replaced: '这笔交易已经被替换或取消',
      nonceGap: '这笔交易还卡在钱包里',
    },
    bodies: {
      slow: '一直没有上链，网络可能比较拥堵。',
      dropped: '链上没有找到这笔交易，它可能已经丢失。',
      replaced: '同一个交易位置已经由另一笔交易完成，这一笔不会再上链。以钱包里的最新记录为准。',
      nonceGap:
        '钱包保存的交易记录和链上没有对上，这笔交易暂时不会上链。如果一直没有反应，请在钱包里清除活动记录，或先处理未完成的交易。',
    },
    actions: {
      refresh: '重新查询',
      resubmit: '重新提交',
      reload: '刷新',
      explorer: '在区块链浏览器查看',
    },
    staleBlock: '钱包还停留在旧链的区块上，刷新页面或重新连接钱包后再试。',
    nonceUnavailable: '暂时读不到链上状态，请稍后再试。',
  },
  advanced: {
    buildId: '构建 ID',
  },
  // ───────────────────────────────────────────────────────────────────────────
  // 我的 (UX spec §3.7). Identity and balance moved here from the home page
  // (owner 2026-11-11); the page is a settings-ish list, never a filled button.
  // ───────────────────────────────────────────────────────────────────────────
  me: {
    identityTitle: '我的身份 NFT',
    identityReading: '读取身份 NFT 中…',
    identityDisconnected: '连接钱包后显示当前身份 NFT。',
    identityUnconfigured: '这个环境还没有配置身份 NFT 合约。',
    identityUnavailable: '身份 NFT 暂时读不到',
    identityEmpty: '你还没有身份 NFT',
    identityNeedsSelection: '还没有选择当前身份 NFT',
    identityInvalidated: '这个身份 NFT 已不属于当前钱包，已为你清除选择。',
    mintIdentity: '铸造身份 NFT',
    switchIdentity: '切换身份 NFT',
    transfer: '转让',
    viewAll: '查看全部',
    balanceTitle: '我的余额',
    balanceUnavailable: '这个环境还没有配置社区代币，暂时看不到余额。',
    swap: '兑换',
    accountTitle: '账户',
    walletLabel: '钱包地址',
    walletNotConnected: '未连接',
    networkLabel: '网络',
    networkValue: (name: string, chainId: number) => `${name} · chain ${chainId}`,
    aboutTitle: '关于',
    versionLabel: '版本',
    versionValue: (buildId: string, variant: string) => `${buildId} · ${variant}`,
    docs: '开源文档',
  },
  // ───────────────────────────────────────────────────────────────────────────
  // 应用目录 (UX spec §3.6). Appended as its own block: the lazy /apps page is
  // the only consumer, so these strings stay out of the first-screen chunk.
  // Keys are mirrored by src/domain/apps-catalog.ts (labelKey/descriptionKey).
  // ───────────────────────────────────────────────────────────────────────────
  apps: {
    label: '功能页目录',
    categories: {
      token: '代币',
      identity: '身份 NFT',
      about: '资料',
    },
    items: {
      airdrop: {
        label: '创世空投',
        description: '按快照份额铸造创世代币',
      },
      myNft: {
        label: '身份 NFT',
        description: '查看、切换与转让你的身份 NFT',
      },
      swap: {
        label: '代币兑换',
        description: '在任意代币之间互换',
      },
      about: {
        label: '开源文档',
        description: '文档、合约地址与链上数据',
      },
    },
    unavailable: {
      airdropNotConfigured: '这个环境还没有配置空投铸造。',
      memberNftNotConfigured: '这个环境还没有配置身份 NFT 合约。',
      routerNotConfigured: '这个环境还没有配置代币兑换。',
    },
  },
  // ───────────────────────────────────────────────────────────────────────────
  // BEGIN UX-child block: 转让身份 NFT 收款人模式 + 交易回执收起 (keep verbatim;
  // append new keys above this block only if another agent needs the same names).
  // ───────────────────────────────────────────────────────────────────────────
  transferIdentity: {
    recipientLabel: '收款人',
    modeLabel: '收款人类型',
    modeAddress: '按地址',
    modeMember: '按身份 NFT ID',
    modeName: '按身份 NFT 名字',
    memberPlaceholder: '#身份 NFT 编号',
    memberInvalid: '请输入身份 NFT 编号，例如 #12。',
    memberNotFound: '这个身份 NFT 不存在。',
    memberSelf: '这是你自己的身份 NFT。',
    memberReading: '读取中…',
    memberFailed: '暂时读不到这个身份 NFT 的持有人。',
    memberRetry: '重试',
    namePlaceholder: '身份 NFT 名字',
    nameReading: '正在按名称查找身份 NFT…',
    nameNotFound: '没有找到这个名称对应的身份 NFT。',
    nameSelf: '这个名称属于你自己的身份 NFT。',
    nameFailed: '这个名称暂时查不到，网络可能不稳。',
    nameRetry: '重试',
    nameConfirmTitle: (name: string, memberId: string) => `名称「${name}」→ 身份 NFT #${memberId}`,
    nameConfirmRecipient: (address: string) => `收款人 ${address}`,
    nameConfirmWarning:
      '名称相近或看起来相同的身份 NFT 可能存在，名称不是唯一依据；请核对上面的 NFT ID 是否就是你要转给的那一个。',
    nameConfirmCheckbox: (memberId: string) => `我确认 #${memberId} 就是正确的身份 NFT`,
    resolvedRecipient: (address: string) => `收款人：${address}`,
  },
  receiptDismiss: {
    stayHere: '留在此页',
    mintStripTitle: (id: string, name: string) => `已铸造 #${id} ${name}`,
    mintStripGoMyNft: '查看我的 NFT',
    swapStripTitle: '兑换完成',
    swapStripAmount: (amount: string) => `已到账 ${amount}`,
    swapStripAgain: '再兑换一次',
  },
  // ───────────────────────────────────────────────────────────────────────────
  // END UX-child block
  // ───────────────────────────────────────────────────────────────────────────
  // ───────────────────────────────────────────────────────────────────────────
  // BEGIN about-page block (owner 2026-11-12): 关于 / 开源文档. Unique anchor:
  // ABOUT_PAGE_COPY_BLOCK. The lazy /about chunk is the only consumer, so these
  // strings never enter the first-screen bundle. 未配置 is the honest state for a
  // deployment slot that is still the zero address.
  // ───────────────────────────────────────────────────────────────────────────
  about: {
    intro: '开源文档、合约地址和链上数据都集中在这里，方便核对与排查。',
    docsLink: '打开开源文档',
    docsNote: '文档托管在 GitHub Pages，会在新标签页打开。',
    tabsLabel: '关于内容',
    tabs: {
      contracts: '合约地址',
      data: '数据',
    },
    addresses: {
      chainInfoLabel: '网络信息',
      chainId: '链 ID',
      rpc: 'RPC',
      notConfigured: '未配置',
      copyAddress: (label: string) => `复制地址：${label}`,
      copied: '已复制',
      explorer: (label: string) => `在区块浏览器查看${label}`,
      groups: {
        core: '核心',
        tokenIdentity: '代币与身份',
        trade: '交易',
        groupChat: '群聊',
        other: '其他',
      },
      labels: {
        tokenAddress: '社区代币',
        firstTokenAddress: '首币',
        memberNFT: '身份 NFT',
        stake: '质押',
        submit: '提交',
        vote: '投票',
        mint: '铸造',
        phase: '阶段',
        launch: '发射',
        actionTarget: '行动目标',
        groupActionExecutor: '链群行动执行器',
        groupServiceExecutor: '链群服务执行器',
        lpExecutor: 'LP 执行器',
        groupChat: '链群聊天',
        groupChatMember: '链群成员',
        groupChatAdmin: '链群管理',
        weth: '包装原生币',
        factory: '交易对工厂',
        router: '兑换路由',
        multicall3: '批量读取',
        airdrop: '空投',
        pair: '交易对',
      },
    },
    data: {
      chainId: '链 ID',
      rpc: 'RPC',
      deploymentBlock: '部署区块',
      communityToken: '当前社区代币',
      communitySupply: '当前社区代币总量',
      memberNftSupply: '身份 NFT 总供应量',
      airdropPool: '空投池余额',
      phase: '当前阶段',
      appVersion: '应用版本',
      buildNumber: '构建号',
      notConfigured: '未配置',
    },
  },
  // ───────────────────────────────────────────────────────────────────────────
  // END about-page block
  // ───────────────────────────────────────────────────────────────────────────
};
