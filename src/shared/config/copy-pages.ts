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
  /**
   * Overlays that only open on interaction (wallet menu / no-wallet dialog /
   * error dialog / community menu) render these, so their strings live here
   * instead of ./copy: the trigger buttons keep the shape `copy.<section>.*`
   * but the first-screen chunk no longer carries the menu/dialog bodies.
   */
  wallet: {
    ...firstScreenCopy.wallet,
    addressLabel: '钱包地址',
    copyAddressAria: '复制钱包地址',
    copiedAddressAria: '钱包地址已复制',
    identityLabel: '身份 NFT',
    tokenBalanceLabel: (symbol: string) => `${symbol} 余额`,
    viewNft: '切换',
    goSelect: '去设置',
    goMint: '去设置',
    /** Wallet-menu identity row: every state must agree with useMemberIdentity(). */
    identityUnconfigured: '这个环境还没有部署身份 NFT 合约',
    nativeBalanceLabel: (symbol: string) => `${symbol} 余额`,
    disconnect: '断开连接',
    footer: '当前身份 NFT 保存在这台设备；换浏览器需要重新选择。',
    menuTitle: '钱包与身份 NFT',
    identityUnavailable: '身份 NFT 暂时读不到',
    identityUnavailableBody: '网络可能不稳，身份 NFT 没有变化。',
    noWalletTitle: '没有检测到钱包',
    noWalletBody: '你可以换一个入口打开本页。',
    noWalletStepInApp: '在手机钱包 App 的内置浏览器中打开本页；已经在内置浏览器里，关掉再打开。',
    noWalletStepInstall: '在电脑浏览器安装钱包扩展后刷新。',
    noWalletCopyLink: '复制本页链接',
    /** owner 2026-11-16: 全局关闭按钮统一「好的」，旧文案已退役。 */
    noWalletDismiss: '好的',
    networkErrorClose: '关闭',
    networkErrorRetry: '再试一次',
  },
  identity: {
    ...firstScreenCopy.identity,
    memberId: (id: string) => `NFT #${id}`,
    truncated: '这个钱包持有的身份 NFT 较多，这里只显示前 100 个。',
    myNftTitle: '我的 NFT',
    selectedBadge: '当前',
  },
  community: {
    ...firstScreenCopy.community,
    recent: '最近访问',
    emptyRecent: '还没有访问过其他社区。',
    parent: '父币',
    child: '子币',
    notWired: '未接入',
    switchHint: '切换社区不会切换网络。',
    searchLabel: '按 symbol 搜索代币社区',
    searchPlaceholder: '输入代币 symbol',
    searchResults: '搜索结果',
    searchEmpty: '没有找到这个 symbol 的社区。',
    searchHint: '输入完整 symbol 可直接切换；前缀相同的社区也会列出来。',
    searchLoading: '正在查找…',
    searchError: '社区列表暂时读不到。',
    searchExact: '精确匹配',
    searchCurrent: '当前',
  },
  /** M0 placeholder pages (行动 / 链群 / 我的): only titles are needed by the eager header. */
  placeholders: {
    ...firstScreenCopy.placeholders,
    act: {
      ...firstScreenCopy.placeholders.act,
      body: '链群行动、链群服务、LP 行动。',
    },
    group: {
      ...firstScreenCopy.placeholders.group,
      body: '链群是身份 NFT 组成的协作单位。',
    },
    me: {
      ...firstScreenCopy.placeholders.me,
      body: '个人中心还在做。现在可以从首页或右上角进入「我的 NFT」。',
      extra: '去我的 NFT',
    },
    nextHome: '回首页',
    badge: '即将上线',
  },
  notFound: {
    ...firstScreenCopy.notFound,
    body: '可能是链接过期或拼错了。',
    action: '回首页',
  },
  banners: {
    ...firstScreenCopy.banners,
    buildMismatchTitle: '有新版本，请刷新',
    buildMismatchBody: '当前输入会丢失。',
    buildMismatchAction: '刷新页面',
  },
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
      useSwitching: '切换中…',
      currentAction: '当前身份 NFT',
      justMinted: '刚铸造',
      justMintedStrip: (memberId: string, name: string) =>
        `已铸造 #${memberId} ${name}，已经出现在下面的列表里。`,
      transferAction: '转让',
      transferTitle: '转让身份 NFT',
      // owner 2026-11-16 纠正：历史与质押绑定在身份 NFT 上，转让时随身份 NFT
      // 一起转到对方钱包（旧句「不随钱包转走」容易被读成留在原钱包，方向反了）。
      transferWarning:
        '转让会改变这个身份 NFT 的控制者。身份 NFT 的历史与质押绑定在身份 NFT 上，会随身份 NFT 一起转到对方钱包，之后由对方控制。',
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
    },
    mint: {
      title: '铸造身份 NFT',
    },
    swap: {
      title: '兑换代币',
    },
    liquidity: {
      title: '流动性池',
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
      note: '价格随已铸造数量变化。',
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
      missingMessage: '这笔铸造已经提交，但还没有读到身份 NFT 编号，请去「我的 NFT」确认。',
    },
    states: {
      notDeployedTitle: '铸造还没有接入',
      notDeployedBody: '部署地址还没有填，暂时不能铸造身份 NFT。',
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
   * 空投铸造 (UX spec §3.4). The action is always called 空投铸造/铸造 and the
   * result 已铸造; the contract's `claim` name never reaches user-facing copy.
   * No string here may contain 领取 (GLOSSARY 文案纪律).
   *
   * Owner 2026-11-17: the status card's 「本次空投：{symbol}」 meta line is gone
   * from every state (the token is now named on the eligible card's first line),
   * the S5 card is two lines (share + unit, then the amount), the CTA says
   * 「立即铸造」, and the rules fold is expanded by default with the full
   * eligibility paragraph.
   */
  airdrop: {
    states: {
      disconnectedTitle: '连接钱包后查看你的空投份额。',
      readErrorTitle: '空投数据暂时读不到',
      readErrorBody: '你的资产没有变化。',
      snapshotErrorTitle: '空投资格暂时读不到',
      snapshotErrorBody: '你的资产没有变化。',
      notDeployedTitle: '空投铸造还没有接入',
      notDeployedBody: '部署地址还没有填。接入后会先检查资格，再显示可铸造份额。',
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
    roundGate: {
      title: '还没到可铸造轮次',
      wait: (minutes: string) => `约 ${minutes} 分钟`,
      body: '轮次到了以后，这里会出现「立即铸造」。',
    },
    eligible: {
      /**
       * Card line 1 (owner 2026-11-17): share and unit in one sentence. The
       * share percent already carries `%` (domain/airdrop-share), so this must
       * never append another one.
       */
      shareLine: (percent: string, symbol: string) =>
        `我的份额 ${percent}，预计可铸造空投 ${symbol}：`,
      /**
       * Accessible name for card line 2. The amount is rendered without the
       * symbol so the two lines never repeat it; this label restores the full
       * sentence for screen readers.
       */
      expected: (amount: string, symbol: string) => `预计可铸造空投 ${amount} ${symbol}`,
      cta: '立即铸造',
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
      /** S6 without a readable amount (no CI-014 view): never invent one. */
      unknownBody: '这次空投已经铸造过，暂时读不到具体金额。',
      unknownBodyExplorer: '这次空投已经铸造过。金额可以在区块浏览器里查看。',
      hashLabel: '交易哈希',
      explorer: '在区块浏览器里查看',
      goMint: '去铸造身份 NFT',
    },
    rules: {
      summary: '规则',
      /**
       * Owner 2026-11-17, verbatim (no rewording, no added spaces). The trailing
       * `link` below completes the paragraph after 「销毁活动：」.
       */
      body: '空投资格：从TKM链公平发射开始，参与或部分参与1年多的社群铸币实验，并参与资产销毁锁定活动的社群成员，基于每个人在每个社区的销毁锁定份额计算出本链创世代币的空投份额，具体份额计算规则详见销毁活动：',
      /** Doubles as the link's visible text, so the accessible name matches it. */
      link: 'https://love20tkm.github.io/interface/apps/burn/',
    },
    pending: {
      wallet: '铸造中…',
      chain: '确认中…',
    },
    receipt: {
      title: '铸造成功',
      received: '你得到',
      amountUnknown: '暂时读不到这次铸造的金额，可以在钱包里确认。',
      shareLabel: '空投份额',
      remainingLabel: '空投池剩余份额',
      dateLabel: '记录时间',
      hashLabel: '交易哈希',
      copyHash: '复制交易哈希',
      explorer: '在区块浏览器里查看',
      missingBody: '这笔交易已经提交，但还没有读到铸造金额。',
    },
    errors: {
      rejected: '你在钱包里点了取消，没有扣款。',
      alreadyClaimed: '这次空投份额已经铸造过了，没有重复扣款。',
      invalidProof: '这份空投资格和快照没有对上，你的份额没有变化。',
      shareExceeds: '你的份额超过了空投池的剩余份额，这次没有铸造。',
      roundNotReached: '还没到可铸造轮次，这次没有发起交易。',
      tokenNotConfigured: '这个代币还没有配置空投，暂时不能铸造。',
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
    /** Only rendered when the token precision is not the 18-digit default. */
    decimalsLabel: (digits: string) => `精度 ${digits} 位`,
    max: '全部',
    maxNativeNote: (reserve: string, native: string) =>
      `已为网络手续费预留约 ${reserve} ${native}。`,
    swapDirection: '交换方向',
    selectToken: (side: string) => `选择${side}代币`,
    /** Owner 2026-11-14: the opposite side's token cannot be picked twice. */
    excludeOtherSide: (symbol: string) =>
      `另一侧已选 ${symbol}，这里不能再选；想换过来请用中间的交换方向。`,
    tokenSheetTitle: '选择代币',
    groupNative: '原生币',
    groupWrapped: '包装原生币',
    groupCommunity: '社区代币',
    searchPlaceholder: '搜索代币符号',
    searchHint: '按代币符号精确查找。',
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
    /** Read from Stake's 1e18 ratio getters; the quote already includes it. */
    feeValue: (percent: string) => `${percent}%（已含在报价里）`,
    priceImpactHigh: '这笔兑换会明显改变池子价格，继续前请确认。',
    freshnessCountdown: (seconds: string) => `${seconds}s 后更新`,
    expired: '报价已过期',
    quoteRefreshing: '正在更新报价…',
    states: {
      connectTitle: '连接钱包后兑换。',
      connectBody: '兑换需要钱包确认，连接后可以看到余额与报价。',
      wrongChainBody: '切换到这个应用使用的网络后再兑换。',
      unconfiguredTitle: '这个环境还没有配置兑换。',
      unconfiguredBody: '部署地址还没有填。',
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
      /** R8: an explicit route-loading state instead of a dead form at 0 quote. */
      routeLoadingTitle: '正在计算兑换路径…',
      routeLoadingBody: '正在读取交易对与池子，读完后会显示报价。',
      /** R8: the loading state times out into this retryable card, never a dead form. */
      routeTimeoutTitle: '兑换路径读得太久了。',
      routeTimeoutBody: '网络可能不稳，点「重试」重新读取；你的资产没有变化。',
      amountInvalid: '请输入有效的金额。',
      amountTooPrecise: (digits: number) => `小数位不能超过 ${digits} 位。`,
      amountTooSmall: '金额太小，换不到代币。',
    },
    ladder: {
      swap: '兑换',
      swapping: '兑换中…',
      confirming: '确认中…',
      note: '报价随池子变化。',
      approvalShort: '授权额度不够这次使用，需要再授权一次。',
    },
    receipt: {
      title: '兑换完成',
      received: '你得到',
      actualNote: '这是实际到账，不是报价。',
      actualUnknown: '暂时读不到实际到账，可以在钱包里确认。',
      pathLabel: '路径',
      minLabel: '最少到账',
      minFailed: '实际到账低于最少到账，这笔交易本应被拒绝。',
      paidLabel: '实际支付',
      hashLabel: '交易哈希',
      copyHash: '复制交易哈希',
      explorer: '在区块浏览器里查看',
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
      dropped: '没有找到这笔交易，它可能已经丢失。',
      replaced: '同一个交易位置已经由另一笔交易完成，这一笔不会再上链。以钱包里的最新记录为准。',
      nonceGap:
        '这笔交易卡在钱包里，暂时不会完成。如果一直没有反应，请在钱包里清除活动记录，或先处理未完成的交易。',
    },
    actions: {
      refresh: '重新查询',
      resubmit: '重新提交',
      reload: '刷新',
      explorer: '在区块浏览器查看',
    },
    staleBlock: '钱包和当前网络对不上，刷新页面或重新连接钱包后再试。',
    nonceUnavailable: '暂时读不到网络状态，请稍后再试。',
    /** R3: an unfinished task belongs to another wallet/chain; it is never signed here. */
    ownerChanged: '钱包或网络已经切换，刚才那笔交易没有再提交。请用当前钱包重新发起。',
  },
  advanced: {
    buildId: '构建 ID',
  },
  // ───────────────────────────────────────────────────────────────────────────
  // 我的 (UX spec §3.7). Balance + account/about, a settings-ish list that never
  // spends a filled button. The identity NFT card was removed on 2026-11-14
  // (owner) — /my-nft owns identity management, so no identity keys remain here.
  // ───────────────────────────────────────────────────────────────────────────
  /**
   * 首页动态提醒卡（`pages/home/airdrop-reminder` 是动态 import 的懒加载 chunk）用到的
   * 几条文案；放在 ./copy 会白占首屏预算，所以覆盖到这里（其余 home 键仍用首屏那份）。
   */
  home: {
    ...firstScreenCopy.home,
    mintAirdrop: '空投铸造',
    /** Reminder card 2: eligible and unclaimed; drop the clause when unknown. */
    reminderAirdrop: '你有空投资格',
    reminderAirdropWithAmount: (amount: string, symbol: string) =>
      `你有空投资格，可铸造 ${amount} ${symbol}`,
  },
  me: {
    tabsAria: '我的',
    /** owner 2026-11-18 23:20：我的页两个标签 + 质押资产卡。 */
    tabs: { balance: '钱包余额', stake: '质押资产' },
    balanceTitle: '我的余额',
    balanceUnavailable: '这个环境还没有配置社区代币，暂时看不到余额。',
    swap: '兑换',
    networkLabel: '网络',
    networkValue: (name: string, chainId: number) => `${name} · chain ${chainId}`,
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
      settings: '设置',
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
      theme: {
        label: '主题',
        description: '切换浅色或深色界面配色',
      },
      transfer: {
        label: '代币转账',
        description: '把代币转到另一个地址',
      },
      batchTransfer: {
        label: '批量转账',
        description: '一次把资产转给多个收款方',
      },
      approvals: {
        label: '代币授权',
        description: '查看并撤销各个合约的代币授权',
      },
      liquidity: {
        label: '流动性池',
        description: '添加或撤出流动性，查看社区池子',
      },
    },
    unavailable: {
      airdropNotConfigured: '这个环境还没有配置空投铸造。',
      memberNftNotConfigured: '这个环境还没有配置身份 NFT 合约。',
      routerNotConfigured: '这个环境还没有配置代币兑换。',
      batchTransferNotConfigured: '这个环境还没有部署批量转账合约。',
    },
  },
  // ───────────────────────────────────────────────────────────────────────────
  // 主题 (ADR-0005). Two explicit palettes, no "follow system": the lazy /theme
  // page is the only consumer, so these strings stay out of the first screen.
  // ───────────────────────────────────────────────────────────────────────────
  theme: {
    intro: '选择一套界面配色，点一下就生效，并记住在这台设备上。',
    groupLabel: '界面配色',
    options: {
      light: '浅色',
      dark: '深色',
    },
    selected: '当前使用',
    previewLabel: (name: string) => `${name}配色小样`,
    note: '主题只改变显示，不影响资产；换设备或换浏览器需要重新选择。',
  },
  // ───────────────────────────────────────────────────────────────────────────
  // 代币转账 (owner 2026-11-14). ERC20 goes through `transfer` directly, so the
  // page never mentions 授权 and always calls the action 转账. All numbers are
  // rendered through shared/lib/format.ts; the copy never names a function or a
  // raw revert. The lazy /transfer chunk is the only consumer.
  // ───────────────────────────────────────────────────────────────────────────
  transfer: {
    intro: '把代币转给另一个地址或身份 NFT 的持有人。请先核对收款方与金额。',
    tokenPickerAria: '选择代币',
    tokenSheetTitle: '选择代币',
    groupNative: '原生币',
    groupCommunity: '社区代币',
    groupWrapped: '包装原生币',
    groupLp: '流动性凭证',
    groupCustom: '自定义代币',
    searchPlaceholder: '搜索代币符号',
    searchHint: '按代币符号精确查找。',
    searchEmpty: '没有找到这个代币符号。',
    searchLoading: '查找中…',
    loadMore: '加载更多',
    noCommunityTokens: '还没有发现社区代币。',
    customBadge: '自定义',
    customTitle: '添加自定义代币',
    customPlaceholder: '0x 开头的 40 位代币地址',
    customAdd: '添加代币',
    customChecking: '正在读取这个代币…',
    customInvalid: '这不是一个有效的代币地址，需要 0x 开头的 40 位地址。',
    customNoCode: '这个地址上没有合约，不能作为代币。',
    customUnreadable: '读不到这个代币的名称或精度，暂时不能转账。',
    customRetry: '重新读取',
    balanceLabel: (symbol: string) => `${symbol} 余额`,
    /** Owner 2026-11-16: 余额移到金额下方，用小号 muted 文字，带 symbol。 */
    balanceInline: (amount: string, symbol: string) => `余额 ${amount} ${symbol}`,
    balanceLoading: '读取余额中…',
    balanceError: '余额暂时读不到',
    decimalsLabel: (digits: string) => `精度 ${digits} 位`,
    amountLabel: '转账金额',
    amountPlaceholder: '0.0',
    max: '全部',
    maxNativeNote: (reserve: string, symbol: string) =>
      `已为网络手续费预留约 ${reserve} ${symbol}。`,
    nativeGasNote: (symbol: string) => `需要预留一点 ${symbol} 支付网络手续费。`,
    amountInvalid: '请输入有效的金额。',
    amountZero: '金额必须大于 0。',
    amountTruncated: (digits: number) => `已按精度截断到 ${digits} 位小数。`,
    insufficient: (symbol: string, shortfall: string) => `${symbol} 不够，还差 ${shortfall}`,
    recipientLabel: '收款方',
    modeLabel: '收款方类型',
    modeAddress: '按地址',
    modeMember: '按身份 NFT ID',
    modeName: '按身份 NFT 名字',
    addressPlaceholder: '0x 开头的 40 位地址',
    memberPlaceholder: '#身份 NFT 编号',
    namePlaceholder: '身份 NFT 名字',
    recipientInvalid: '收款地址格式不对，需要 0x 开头的 40 位地址。',
    recipientZero: '收款地址不能是零地址。',
    recipientSelf: '不能转给自己。',
    memberInvalid: '请输入身份 NFT 编号，例如 #12。',
    memberReading: '读取中…',
    memberNotFound: '这个身份 NFT 不存在。',
    nameReading: '正在按名称查找身份 NFT…',
    nameNotFound: '没有找到这个名称对应的身份 NFT。',
    identitySelf: '这是你自己的身份 NFT。',
    identityFailed: '这个身份 NFT 暂时查不到，网络可能不稳。',
    identityRetry: '重试',
    identityUnavailable: '这个环境还没有配置身份 NFT 合约。',
    identityTitle: (id: string, name: string) =>
      name.length > 0 ? `身份 NFT #${id} ${name}` : `身份 NFT #${id}`,
    identityConfirmCheckbox: (id: string) => `我确认 #${id} 及上面的收款地址都正确`,
    actionsLabel: '转账操作',
    submit: '确认转账',
    submitting: '转账中…',
    receiptTitle: '转账完成',
    receiptSent: '已转出',
    receiptTo: '收款人',
    receiptHash: '交易哈希',
    copyHash: '复制交易哈希',
    explorer: '在区块浏览器里查看',
    stripTitle: '转账完成',
    stripAmount: (amount: string) => `已转出 ${amount}`,
    /** The CTA explanation while a submitted transfer is still in flight (D1/D2). */
    pendingNote: '这笔转账还在确认中，确认后可以再转下一笔。',
    pendingStuckNote: '上面这笔还没有结果，请先用上面的「重新提交」或「重新查询」处理。',
    /** The CTA explanation while the balance could not be read (D3). */
    balanceUnreadableNote: '余额暂时读不到，稍后重试。',
    balanceRetry: '重新读取余额',
    /** D7: the identity confirmation gate waits for `memberName` before it can tick. */
    identityNameReading: '正在读取身份名字…',
    states: {
      connectTitle: '连接钱包后转账。',
      connectBody: '转账需要钱包确认。连接后可以先看到余额。',
      wrongChainBody: '切换到这个应用使用的网络后再转账。',
      backHome: '回首页',
      retry: '重试',
    },
    errors: {
      rejected: '你在钱包里点了取消，没有转出。',
      insufficientFunds: (native: string) => `${native} 不够付手续费。请先转一点 ${native} 进来。`,
      balanceShort: (symbol: string) => `${symbol} 不够，这次没有转出。`,
      reverted: '交易上链了，但没有成功。你的资产没有变化。',
    },
  },
  // ───────────────────────────────────────────────────────────────────────────
  // 智能资产保护 (owner 2026-11-16). One switch, one preference and one wording on
  // every transfer surface (代币转账 / 身份 NFT 转让 / 批量转账): 开启时收款方是
  // 已知协议合约就被拦截，关闭开关才可强制转账；任意合约只警告。
  // owner 2026-11-16 收口：关闭开关只跳过「是不是地址簿已知合约」这一项检测，
  // 不拦截、不要求勾选、不出现「这是 X 合约」；地址/金额/余额/任意合约警告、
  // 批量逐行解析与身份 NFT 确认门禁全部保留。
  // ───────────────────────────────────────────────────────────────────────────
  assetProtection: {
    title: '智能资产保护',
    toggleAria: '智能资产保护开关',
    onHint: '转给已知合约地址时会先拦下来，要先关闭这个开关才能强制转账。',
    offHint: '已关闭：不再检测收款方是否已知合约，转给合约地址只提示、不拦截。',
    /** 开启 + 命中已知协议合约：拦截，页内没有勾选（唯一出口是关开关）。 */
    blockedTitle: (label: string) => `智能资产保护已拦截：这是「${label}」合约地址`,
    blockedBody: '转进合约的资产很可能取不回来。要强制转账，请先关闭「智能资产保护」。',
    /** 任意有 bytecode 的合约（开关关闭时已知合约也走这条）：只警告，不拦截。 */
    contractTitle: '这个地址是一个合约',
    contractBody: '转进合约的资产可能取不回来，请确认你清楚它的用途。',
    /** 批量转账：已知合约与其它合约合并成一个块，标题点明各自行数。 */
    batchBlockedTitle: (knownCount: number, otherContractCount: number) =>
      otherContractCount > 0
        ? `有 ${knownCount} 行是协议合约、${otherContractCount} 行是其它合约地址，智能资产保护已拦截`
        : `有 ${knownCount} 行是协议合约，智能资产保护已拦截`,
    batchBlockedBody: '转进合约的资产很可能取不回来。要强制转账，请先关闭「智能资产保护」。',
    batchKnownLine: (line: number, label: string) => `第 ${line} 行：这是「${label}」合约地址`,
    /** 合并块里非地址簿的合约行：只点名「是合约」，不冒充已知合约。 */
    batchContractLine: (line: number) => `第 ${line} 行：这是一个合约地址`,
  },
  // ───────────────────────────────────────────────────────────────────────────
  // 批量转账 (owner 2026-11-14). One atomic batch through the BatchTransfer
  // contract: native or one ERC20, one approve of the batch total, per-recipient
  // gas budget. Concentrate on "one failure = nothing arrives" and on the
  // per-line address/amount registry. The lazy /batch-transfer chunk is the only
  // consumer.
  // ───────────────────────────────────────────────────────────────────────────
  batchTransfer: {
    intro: '一次把一种资产转给多个收款方。先粘贴收款名单，逐行核对后再提交。',
    notConfigured: '这个环境还没有部署批量转账合约，暂时不能批量转账。你的资产没有变化。',
    modeLabel: '转出资产',
    modeNative: '原生币',
    modeToken: '代币',
    tokenLabel: '代币',
    tokenSheetTitle: '选择代币',
    groupCommunity: '社区代币',
    groupWrapped: '包装原生币',
    groupLp: '流动性凭证',
    groupCustom: '自定义代币',
    noCommunityTokens: '还没有发现社区代币。',
    balanceLabel: (symbol: string) => `${symbol} 余额`,
    balanceLoading: '读取余额中…',
    balanceError: '余额暂时读不到',
    /** Token mode before the catalog resolves: never fall back to the native symbol (D9). */
    tokenBalanceUnreadable: '代币余额暂时读不到，换个代币或重试读取。',
    /** Balance unknown while the batch total is non-zero: submission is blocked (D8). */
    balanceUnknown: '余额暂时读不到，还不能判断够不够转，请先重试读取。',
    retry: '重新读取',
    amountDecimals: (digits: number) => `精度 ${digits} 位`,
    recipientsLabel: '收款方与金额',
    recipientsHint: '每行一个收款方：地址在前、金额在后，空格或逗号分隔。',
    recipientsPlaceholder: '0x… 0.1\n0x… 0.2',
    emptyRows: '还没有可用的收款方。按上面的格式每行填一个。',
    lineError: (line: number, reason: string) => `第 ${line} 行：${reason}`,
    reasons: {
      emptyLine: '',
      invalidLine: '这一行看不懂，需要「地址 金额」。',
      missingAmount: '缺少金额。',
      invalidAddress: '地址格式不对，需要 0x 开头的 40 位地址。',
      invalidAmount: '金额格式不对。',
      zeroAmount: '金额必须大于 0。',
      truncatedToZero: '小数位超过精度，按精度截断后为 0。',
      zeroAddress: '收款地址不能是零地址。',
      selfAddress: '不能转给自己。',
      batchContract: '不能转给批量转账合约本身。',
    },
    amountTruncated: (digits: number) => `金额已按精度截断到 ${digits} 位小数。`,
    duplicateLine: (line: number, firstLine: number) =>
      `第 ${line} 行：与第 ${firstLine} 行重复，这一行先不计入，请删掉其中一行。`,
    summary: (lines: string, recipients: string) => `${lines} 行，${recipients} 个收款方`,
    totalLabel: '合计',
    receivedLabel: '合计到账',
    insufficient: (symbol: string, shortfall: string) => `${symbol} 不够，还差 ${shortfall}`,
    nativeGasNote: (symbol: string) => `需要预留一点 ${symbol} 支付网络手续费。`,
    preBalanceTitle: '收款方当前余额',
    /** owner 2026-11-17: the table header's permanent refresh action (D6 recovery too). */
    preBalanceRefreshAria: '刷新收款方当前余额',
    preBalanceError: '收款方余额暂时读不到，提交后仍会逐行核对到账差额。',
    preBalanceHeaderRecipient: '收款方',
    preBalanceHeaderAmount: '金额',
    preBalanceHeaderBalance: '当前余额',
    contractWarningTitle: '有收款方是合约地址',
    contractWarningBody:
      '转进合约的资产可能取不回来。合约地址不一定能收下这笔转账，失败时整批都会回滚。',
    rowContractBadge: '合约',
    atomicNote: '整批一起执行：有一笔失败，全部都不会到账。',
    actionsLabel: '批量转账操作',
    gasTitle: '高级选项：每行执行预算',
    gasLabel: '每行执行预算',
    gasHint: (min: string, max: string) =>
      `默认值适合普通地址。收款方是合约时可以调高；范围 ${min}–${max}，数值越大手续费越高。`,
    gasInvalid: '每行执行预算必须是整数。',
    gasBelowMin: (min: string) => `每行执行预算至少 ${min}。`,
    gasAboveMax: (max: string) => `每行执行预算最多 ${max}。`,
    gasOverBlock: '这批交易的计算上限超过一个区块的容量，请减少收款方或调低每行执行预算。',
    allowanceLabel: '批量转账额度',
    allowanceLine: (allowed: string, needed: string, symbol: string) =>
      `已允许批量转账合约使用 ${allowed} / 本次需要 ${needed} ${symbol}`,
    allowanceLoading: '读取批量转账额度中…',
    allowanceError: '批量转账额度暂时读不到',
    /** Allowance unknown: a third state, never 「已足够」 or 「需要授权」 (D2). */
    allowanceUnknown: '额度暂时读不到，无法判断是否需要授权，请重试读取。',
    allowanceNeed: '这笔批量转账需要先授权一次，授权确认后再提交批量转账。',
    /** 默认使用长期授权开启时，这次授权写 maxUint256（owner 2026-11-16）。 */
    allowanceNeedLongTerm: '这笔批量转账会先授权长期额度（几乎无限），授权确认后再提交批量转账。',
    allowanceReady: '额度已足够，不需要再次授权。',
    allowanceLongTerm: (needed: string, symbol: string) =>
      `已长期授权，本次需要 ${needed} ${symbol}，不需要再次授权。`,
    ctaApprovePending: '等待授权完成…',
    ctaBatch: '批量转账',
    ctaNative: '确认批量转账',
    submitting: '等待钱包确认…',
    pendingApprove: '授权确认中…',
    pendingBatch: '批量转账确认中…',
    finalizing: '正在核对该批到账金额…',
    receiptTitle: '批量转账完成',
    receiptTotal: '合计转出',
    receiptRecipients: '收款方',
    receiptRecipientCount: (count: string) => `${count} 个收款方`,
    receiptRowsNote: '下表按提交时的余额基线逐行核对到账差额。',
    receiptHeaders: {
      recipient: '收款方',
      amount: '金额',
      before: '到账前',
      after: '到账后',
      delta: '差额',
    },
    deltaPlus: (amount: string) => `+${amount}`,
    deltaUnchanged: '未变化',
    deltaAnomaly: (amount: string) => `${amount}（异常）`,
    deltaUnknown: '—',
    receiptHash: '交易哈希',
    copyHash: '复制交易哈希',
    explorer: '在区块浏览器里查看',
    atomicReceipt: '整批一起执行：上表每一行都已到账。',
    /** D1: the audit is incomplete (a balance re-read failed) — never claim 已到账. */
    receiptUnverified: (count: string) =>
      `到账核对不完整：有 ${count} 行余额读取失败，未能核对，请到区块浏览器确认交易结果。`,
    /** D1: the audit completed but a row's delta disagreed with the promised amount. */
    receiptMismatch: (count: string) =>
      `到账核对发现异常：有 ${count} 行的差额与应到账额对不上，请到区块浏览器确认。`,
    /** D7: approving the original total then submitting a smaller list leaves an approval. */
    receiptResidualAllowance: (amount: string, symbol: string) =>
      `还留着 ${amount} ${symbol} 的授权，可到「代币授权」页撤销。`,
    stripTitle: '批量转账完成',
    stripAmount: (amount: string) => `已转出 ${amount}`,
    states: {
      connectTitle: '连接钱包后批量转账。',
      connectBody: '批量转账需要钱包确认。连接后可以先看到余额。',
      wrongChainTitle: '网络不对。',
      wrongChainBody: '切换到这个应用使用的网络后再批量转账。',
      backHome: '回首页',
    },
    errors: {
      rejected: '你在钱包里点了取消，这一批没有转出。',
      insufficientFunds: (native: string) => `${native} 不够付手续费。请先转一点 ${native} 进来。`,
      balanceShort: (symbol: string) => `${symbol} 不够，整批没有转出。`,
      allowanceShort: (symbol: string) => `批量转账额度还不够 ${symbol}，请先完成授权再提交。`,
      gasRow: (line: number) =>
        `第 ${line} 行的执行预算不够，这一批没有转出。可以在高级选项里调高每行执行预算。`,
      recipientRejected: (line: number, symbol: string) =>
        `第 ${line} 行收款方拒收了这笔转账（对方可能是不接收 ${symbol} 的合约）。整批没有转出，你的资产没有变化。`,
      nativeValueMismatch: '金额合计和实际发送的数量对不上，这一批没有转出。请刷新页面后重试。',
      invalidRow: (line: number) => `第 ${line} 行的收款方或金额不合法，整批没有转出。`,
      emptyBatch: '还没有可以转账的收款方。',
      tokenNotContract: '这个代币地址上没有合约，暂时不能批量转账。',
      tokenUnreadable: '这个代币暂时读不到余额或授权额度，换一个代币再试。',
      approveReverted: '授权没有完成，额度没有变化。请重新确认一次。',
      reverted: '交易上链了，但没有成功。整批没有到账，你的资产没有变化。',
    },
  },
  // ───────────────────────────────────────────────────────────────────────────
  // 代币授权 (owner 2026-11-14). Covers the legacy approvals page: one token,
  // a reviewed spender list read from the address book, a custom spender query,
  // and the local-only "prefer long-term" memory. The page never says
  // allowance/approve; every risk sentence is written for a non-crypto user.
  // The lazy /approvals chunk is the only consumer.
  // ───────────────────────────────────────────────────────────────────────────
  approvals: {
    intro:
      '授权是允许某个合约在你需要时从钱包里扣这个代币，最多扣到你给的额度。这里能查看每个合约的当前额度，也能随时撤销。',
    tokenLabel: '代币',
    tokenSheetTitle: '选择代币',
    groupCommunity: '社区代币',
    groupWrapped: '包装原生币',
    groupLp: '流动性凭证',
    groupCustom: '自定义代币',
    searchPlaceholder: '搜索代币符号',
    searchHint: '按代币符号精确查找。',
    searchEmpty: '没有找到这个代币符号。',
    searchLoading: '查找中…',
    loadMore: '加载更多',
    noCommunityTokens: '还没有发现社区代币。',
    noTokenTitle: '还没有可以查看的代币',
    noTokenBody: '先在代币选择里添加一个 ERC20 代币地址。',
    catalogLoading: '正在读取代币列表…',
    // D3: the chain could not be read at all. Say so instead of reporting "no
    // tokens", and give one actionable way back.
    networkErrorTitle: '暂时读不到网络数据',
    networkErrorBody:
      '网络连接不稳，代币和授权额度都还没读出来。这不是没有代币，请检查网络后重新读取。',
    networkRetry: '重新读取',
    customBadge: '自定义',
    customTitle: '添加自定义代币',
    customPlaceholder: '0x 开头的 40 位代币地址',
    customAdd: '添加代币',
    customChecking: '正在读取这个代币…',
    customAlreadyListed: (symbol: string, group: string) =>
      `${symbol} 已经在「${group}」里，不用重复添加。`,
    customInvalid: '这不是一个有效的代币地址，需要 0x 开头的 40 位地址。',
    customNoCode: '这个地址上没有合约，不能作为代币。',
    customUnreadable: '读不到这个代币的名称或精度，暂时不能查看授权。',
    customRetry: '重新读取',
    balanceLabel: (symbol: string) => `${symbol} 余额`,
    balanceLoading: '读取余额中…',
    balanceError: '余额暂时读不到',
    decimalsLabel: (digits: string) => `精度 ${digits} 位`,
    knownTitle: '常用合约',
    knownBody:
      '这些是社区里会用到你代币的合约。每行显示当前额度，点合约地址就能复制；长期授权和撤销都要你在钱包里再确认一次。',
    knownLoading: '读取授权额度中…',
    knownError: '授权额度暂时读不到',
    knownRetry: '重新读取',
    knownEmpty: '这个环境还没有配置常用合约。',
    states: {
      unapproved: '未授权',
      unlimited: '长期授权',
      belowMinimum: (minimum: string, symbol: string) => `< ${minimum} ${symbol}`,
    },
    copyAddress: (label: string) => `复制地址：${label}`,
    addressCopied: '已复制',
    copyFailed: '复制失败，请手动选中地址',
    revoke: '撤销',
    unlimitedAction: '长期授权',
    preferenceLabel: '默认使用长期授权',
    preferenceBody:
      '开启后，各个页面（兑换、铸造、流动性、批量转账）的授权按钮都会写长期额度，按钮也会写成「长期授权」；关闭后只授权这一笔实际需要的额度。这个选择只记在这台设备上。',
    riskTitle: '先弄懂「授权」',
    riskWhy: '额度由你控制，随时可以撤销（改回 0）。撤销不会影响已经完成的交易。',
    riskDanger:
      '长期授权的额度几乎无限。如果这个合约有漏洞，代币可能被全部转走，所以只给长期使用、你信任的合约开启。',
    riskAdvice: '不用的授权及时撤销；不认识的地址先用下方「自定义地址」查一查额度。',
    customSpenderTitle: '自定义地址',
    customSpenderBody: '查一个不在常用合约里的地址：先看额度，再决定要不要长期授权或撤销。',
    customSpenderPlaceholder: '0x 开头的 40 位地址',
    customSpenderInvalid: '这是一个无效的地址，需要 0x 开头的 40 位地址。',
    customSpenderZero: '授权地址不能是零地址。',
    customSpenderSelf: '这是你自己的钱包地址，授权给自己没有意义。',
    customSpenderChecking: '正在查这个地址的额度…',
    customNoAllowance: '这个地址没有授权额度。',
    customSpenderReadFailed: '这个地址的额度暂时读不到，网络可能不稳。',
    customSpenderRetry: '重新读取',
    customSpenderLabel: '自定义地址',
    confirmUnlimitedTitle: (label: string) => `把「${label}」设为长期授权？`,
    confirmRevokeTitle: (label: string) => `撤销「${label}」的授权？`,
    confirmUnlimitedBody: (label: string, symbol: string) =>
      `确认后，「${label}」可以随时从你的钱包扣走 ${symbol}，额度没有上限。只给长期使用、你信任的合约开启。`,
    confirmRevokeBody: (label: string, symbol: string) =>
      `确认后，「${label}」不能再从你的钱包扣走 ${symbol}。已经完成的交易不受影响，你随时可以再授权。`,
    confirmSpender: '这个地址',
    confirmCurrent: '当前额度',
    confirmNext: '确认后',
    confirmUnlimitedSubmit: '确认长期授权',
    confirmRevokeSubmit: '确认撤销',
    confirmCancel: '取消',
    confirmSubmitting: '等待钱包确认…',
    // D2: a failed send (wallet rejection, revert, …) is shown inside the open
    // confirmation sheet, not only under the page where the mask hides it.
    confirmErrorHint: '这次没有产生交易。可以再点一次上面的按钮重试，或点「取消」先关掉这个窗口。',
    stripUnlimited: (label: string) => `已把「${label}」设为长期授权，可随时撤销。`,
    stripRevoked: (label: string) => `已撤销「${label}」的授权。`,
    stripClose: '好的',
    footerNote: '授权只改变可用额度，不会立刻扣走代币；撤销也不会影响已经完成的交易。',
    errors: {
      rejected: '你在钱包里点了取消，这次授权没有改动。',
      insufficientFunds: (native: string) =>
        `${native} 不够付网络手续费。请先转一点 ${native} 进来。`,
      reverted: '交易上链了，但没有成功。授权状态没有变化。',
    },
    spenders: {
      router: {
        label: '兑换路由',
        purpose: '兑换代币时，按成交价从你的钱包划转代币。',
      },
      stake: { label: '质押', purpose: '质押、赎回时划转你质押的代币。' },
      vote: { label: '投票', purpose: '投票时划转你支持的那部分代币。' },
      submit: { label: '提交行动', purpose: '提交行动时划转你承诺的代币。' },
      mint: { label: '铸造', purpose: '铸造代币时划转你支付的代币。' },
      launch: { label: '发射', purpose: '发射新代币时划转你注入的代币。' },
      hub: { label: '一键加池', purpose: '加池或单边加流动性时划转你的代币。' },
      lpExecutor: { label: '扩展 LP', purpose: '参与扩展 LP 时划转你的代币。' },
      batchTransfer: {
        label: '批量转账',
        purpose: '一次把代币转给多个地址时划转你的代币。',
      },
      groupChat: { label: '链群聊天', purpose: '在链群聊天里收发代币时划转你的代币。' },
    },
    statesCard: {
      connectTitle: '连接钱包后查看授权。',
      connectBody: '授权需要钱包确认。连接后就能看到每个合约的当前额度。',
      wrongChainBody: '切换到这个应用使用的网络后再查看授权。',
      backHome: '回首页',
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
  /**
   * 回执唯一按钮。owner 2026-11-16：统一为「好的」（更轻、不暗示「你早该
   * 知道」）。六类回执（swap / mint / airdrop / transfer / batch / liquidity）
   * 共用这一个键。
   *
   * 行为：mint 回执点「好的」关闭后自动进入 /my-nft 并高亮刚铸造的身份
   * （owner 2026-11-16）；其余五类仍是「关掉回执、留在当前页」，导航交给
   * 页头返回与底部标签栏。
   */
  receiptDismiss: {
    dismiss: '好的',
    swapStripTitle: '兑换完成',
    swapStripAmount: (amount: string) => `已到账 ${amount}`,
  },
  /**
   * 全局授权文案 (owner 2026-11-14 09:30): every page that asks for a token
   * allowance renders the same sentence — only the token symbol changes.
   * 「授权 {symbol}」 is the actionable button; 「长期授权」 is what the approvals
   * page writes; 「已长期授权」 is the read-only state every page must keep
   * showing once the allowance is long-term (needs no action).
   */
  approve: {
    action: (symbol: string) => `授权 ${symbol}`,
    longTermAction: (symbol: string) => `长期授权 ${symbol}`,
    longTermActive: '已长期授权',
    loading: '读取授权额度中…',
    /** 这一笔根本用不到代币（原生币单边 / 数量为 0）：不能写成「已授权」（QA D8）。 */
    notNeeded: '这一笔不需要代币授权',
    approving: '授权中…',
    confirming: '确认中…',
    approved: '已授权',
    note: (symbol: string) => `第一次只是允许合约扣走最多这么多的 ${symbol}，不会立刻扣钱。`,
    /**
     * 默认使用长期授权开启时，授权按钮写 `maxUint256`：提示必须说清「这次会授权
     * 长期额度」，不能沿用精确额度那句（owner 2026-11-16）。
     */
    longTermApproveNote: (symbol: string) =>
      `这次会授权长期额度（几乎无限）：合约以后可以从你的钱包扣走 ${symbol}，不用每次再授权。只给你信任的合约开。`,
    /** 流动性撤出的授权对象是「流动性凭证」，没有代币 symbol（owner 2026-11-16）. */
    longTermActionLp: '长期授权 流动性凭证',
    longTermApproveNoteLp:
      '这次会授权长期额度（几乎无限）：合约以后可以拿走这份流动性凭证，不用每次再授权。只给你信任的合约开。',
    approvedNote: '这次要用的额度已经够，不需要再授权。',
    longTermNote: '这个代币已经长期授权，不需要再操作。',
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
        airdropDistributor: '空投分发器',
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
  // ───────────────────────────────────────────────────────────────────────────
  // 应用·流动性池 (owner 2026-11-14). 添加走 Hub 的一键单边（只填一侧、合约自动
  // 配平），没有 Hub / 空池时降级为「两侧都填」走 Router；撤出走 Router 的
  // removeLiquidityETH。界面不出现函数名、ABI 或 allowance，滑点统一写
  // 「最多可接受的价格变化」。lazy /liquidity chunk 是唯一消费者。
  // ───────────────────────────────────────────────────────────────────────────
  liquidity: {
    tabs: {
      add: '添加流动性',
      mine: '我的流动性',
      query: '社区流动性',
    },
    tokenLabel: '当前社区代币',
    customTitle: '换个代币地址',
    customCollapse: '收起',
    customBadge: '自定义',
    customPlaceholder: '0x 开头的 40 位代币地址',
    customAdd: '读取这个代币',
    customChecking: '正在读取这个代币…',
    customInvalid: '这不是一个有效的代币地址，需要 0x 开头的 40 位地址。',
    customNoCode: '这个地址上没有合约，不能作为代币。',
    customUnreadable: '读不到这个代币的名称或精度，暂时不能加池。',
    balanceLabel: (symbol: string) => `${symbol} 余额`,
    balanceLoading: '读取余额中…',
    decimalsLabel: (digits: string) => `精度 ${digits} 位`,
    settings: {
      title: '交易设置',
      slippageLabel: '最多可接受的价格变化',
      slippageCustom: '自定义',
      customPlaceholder: '0.5',
      customUnit: '%',
      rangeError: '自定义值需要在 0.01% 到 50% 之间。',
      deadlineLabel: '有效期',
      deadlineValue: '提交后 20 分钟内有效',
      deadlineNote: '超过有效期这笔交易会失败，不会扣钱。',
      deadlineMinutes: (minutes: string) => `（${minutes} 分钟）`,
      done: '完成',
    },
    add: {
      smartModeLabel: '智能模式',
      smartOnHint: '只填一侧，或两侧都填：池子会自动配平，不够的一侧先兑换补齐。',
      smartOffHint: '填哪一侧，另一侧就按池子比例自动填好，不用自己算。',
      smartOffEmptyHint: '这个代币还没有池子：两侧数量决定初始价格，两侧都要填。',
      amountTokenLabel: '社区代币数量',
      amountNativeLabel: (symbol: string) => `${symbol} 数量`,
      linkedNote: '另一侧已按池子比例自动填好；点一下那一侧的输入框，就改成由它来算。',
      amountPlaceholder: '0.0',
      /** 加池区抬头（旧库 LOVE20TKM `Liquidity.tsx`）：底池总LP / 我的LP / 撤出。 */
      poolTotalLp: '底池总LP',
      poolMyLp: '我的LP',
      poolWithdraw: '撤出',
      /** 池价格（旧库同一面板）：当前池价格 + 方向切换；Hub 换币时才显示添加后价格。 */
      priceCurrent: '当前池价格',
      priceAfter: '添加后价格',
      priceToggle: '切换价格显示',
      max: '最高',
      maxNativeNote: (reserve: string, symbol: string) =>
        `已为网络手续费预留约 ${reserve} ${symbol}。`,
      amountInvalid: '请输入有效的金额。',
      amountZero: '金额必须大于 0。',
      /** QA D6：已经填了一侧，缺的是另一侧——不能说成「金额必须大于 0」。 */
      missingOtherSide: '另一侧的数量还需要填写。',
      amountTooPrecise: (digits: number) => `小数位不能超过 ${digits} 位。`,
      insufficient: (symbol: string, shortfall: string) => `${symbol} 不够，还差 ${shortfall}`,
      quoteLiquidity: (amount: string) => `预计获得 ${amount} 流动性凭证`,
      detailsToggle: '详情',
      detailsHide: '收起详情',
      quoteSwap: (amount: string, symbol: string, out: string, outSymbol: string) =>
        `其中 ${amount} ${symbol} 会先换成 ${out} ${outSymbol}。`,
      quoteNoSwap: '两侧正好配平，不需要兑换。',
      quotePrepared: (a: string, aSymbol: string, b: string, bSymbol: string) =>
        `实际进池 ${a} ${aSymbol} + ${b} ${bSymbol}`,
      quoteMin: (a: string, aSymbol: string, b: string, bSymbol: string) =>
        `最少进池 ${a} ${aSymbol} + ${b} ${bSymbol}`,
      /** Hub 路径（协议 2026-11-15 起）只保护流动性凭证数量，不再给两侧最少进池。 */
      quoteMinLiquidity: (amount: string) => `至少获得 ${amount} 流动性凭证`,
      quoteFirstMint: (price: string, token: string, native: string) =>
        `第一次建池：1 ${native} = ${price} ${token}`,
      quoteErrorTitle: '这一笔暂时算不出来。',
      quoteErrorBody: '池子可能刚被别的交易改动，或者网络不稳。你的资产没有变化。',
      quoteErrorRetry: '重新计算',
      fallbackTitle: '智能模式暂时用不了：',
      /** QA D3：池子还没读回来时只说读取中，不断言「还没有池子」。 */
      poolReading: '正在读取池子…',
      fallbackEmptyPool: '这个代币还没有池子，第一次建池只能两侧都填。',
      hubMissing: '这个环境没有配置智能加池的合约，可以用两侧都填的方式加池。',
      quoteFailed: '智能模式的报价暂时算不出来，可以关掉智能模式自己填两侧。',
      disableSmartMode: '关掉智能模式，自己填两侧',
      approveToken: (symbol: string) => `授权 ${symbol}`,
      approvedToken: (symbol: string) => `已授权 ${symbol}`,
      approveNote: '第一次只是允许合约扣走最多这么多的代币，不会立刻扣钱。',
      submit: '确认添加',
      submitting: '添加中…',
      receiptTitle: '流动性添加完成',
      receiptRefreshHint: '份额已更新；价格按这笔交易之后的池子显示。',
    },
    mine: {
      title: '我的流动性',
      emptyTitle: '你还没有这个池子的流动性。',
      emptyBody: '添加后这里会显示你的份额和撤出的数量。',
      emptyAdd: '去添加流动性',
      lpLabel: '我的流动性凭证',
      shareLabel: '我的占比',
      shareValue: (percent: string) => `${percent}%`,
      withdrawLabel: '撤出',
      withdrawLpLabel: '撤出数量',
      withdrawLpPlaceholder: '0.0',
      withdrawLpUnit: '流动性凭证',
      lpAvailable: (amount: string) => `持有 ${amount}`,
      badge: '流动性凭证',
      presetMax: '最高',
      lpInvalid: '请输入有效的流动性凭证数量。',
      lpTooMuch: (max: string) => `超过你持有的 ${max} 流动性凭证。`,
      receiveLabel: '预计收到约',
      receiveValue: (a: string, aSymbol: string, b: string, bSymbol: string) =>
        `${a} ${aSymbol} + ${b} ${bSymbol}`,
      approveLp: '授权 流动性凭证',
      approveLpNote: '第一次只是允许合约拿回这份流动性凭证，不会立刻撤出。',
      withdraw: '确认撤出',
      withdrawing: '撤出中…',
      receiptTitle: '流动性撤出完成',
      receiptAmount: (a: string, aSymbol: string, b: string, bSymbol: string) =>
        `已撤出 ${a} ${aSymbol} + ${b} ${bSymbol}`,
      refreshHint: '份额与余额已更新。',
    },
    /**
     * 社区流动性查询（对齐旧库 LOVE20TKM `components/Dex/LiquidityQuery.tsx` 的四块
     * 结构，owner 2026-11-16）：选择交易对 → 交易对统计 → 查询地址 → 查询结果。
     * 查询是纯 view，未连接钱包也能查任意地址；文案纪律不变（不写合约函数名）。
     */
    query: {
      pairTitle: '选择交易对：',
      baseLabel: '社区代币',
      targetLabel: '目标代币',
      pickerTitle: '选择社区代币',
      searchPlaceholder: '搜索社区代币',
      searchHint: '选一个社区代币，选中就查看它在池子里的数据。',
      searchEmpty: '没有搜到这个代币。',
      searchLoading: '正在搜索…',
      loadMore: '加载更多',
      noCommunityTokens: '目录里还没有社区代币。',
      lpAddressLabel: '流动性凭证地址：',
      lpAddressMissing: '还没有流动性凭证地址',
      statsTitle: '交易对统计',
      statsLoading: '加载中…',
      statsEmpty: '交易对不存在',
      statsLpTotal: '凭证总数量',
      statsTotal: (symbol: string) => `${symbol} 总数量`,
      price: (from: string, rate: string, to: string) => `1 ${from} = ${rate} ${to}`,
      priceToggle: '切换价格显示',
      addressTitle: '查询地址',
      addressLabel: '查询地址：',
      addressPlaceholder: '请输入要查询的地址 (0x...)',
      addressInvalid: '这不是一个有效的地址，需要 0x 开头的 40 位地址。',
      submit: '查询',
      resubmit: '重新查询',
      submitting: '查询中…',
      reset: '重置',
      disconnectedHint: '⚠️ 未连接钱包，请手动输入要查询的地址',
      resultLpTitle: '该地址凭证情况：',
      resultLpAmount: '凭证数量',
      resultShare: '所占份额',
      resultConvertibleTitle: '可兑换代币数量：',
      noPoolTitle: '未找到流动性池',
      noPoolBody: (base: string, target: string) => `${base}-${target} 交易对不存在`,
      noLp: '该地址在此交易对中，没有流动性凭证',
      readFailed: '这个地址的流动性凭证暂时读不到。',
      retry: '重试',
      none: '—',
    },
    states: {
      connectTitle: '连接钱包后添加流动性。',
      connectBody: '加池与撤出都要签名；没连接也可以先在「社区流动性查询」看池子。',
      wrongChainTitle: '网络不对。',
      wrongChainBody: '切换到这个应用使用的网络后再添加流动性。',
      unconfiguredTitle: '这个环境还没有配置流动性池。',
      unconfiguredBody: '部署地址还没有填，暂时不能加池或撤出。',
      backHome: '回首页',
      retry: '重试',
      readFailed: '池子暂时读不到。',
      /** QA D4：URL 里的社区 symbol 在链上解析不到时，不能拿别的社区代币顶替。 */
      communityUnknownTitle: '读不到这个社区。',
      communityUnknownBody:
        '链接里的社区 symbol 在这个环境里找不到对应的代币。核对链接，或从右上角切换社区。',
    },
    errors: {
      rejected: '你在钱包里点了取消，没有扣款。',
      insufficientFunds: (native: string) =>
        `${native} 不够付网络手续费。请先转一点 ${native} 进来。`,
      emptyPool: '这个池子还没有流动性，单边加池暂时不可用，可以改用两侧都填。',
      expired: '这笔交易等待太久，已经过期，没有成交。',
      tokenMoved: (symbol: string) =>
        `价格变化太大，${symbol} 这一侧没有达到最少数量，交易没有成交。`,
      nativeMoved: (symbol: string) =>
        `价格变化太大，${symbol} 这一侧没有达到最少数量，交易没有成交。`,
      poolTooSmall: '池子里的流动性不够，这笔交易没有成交。',
      amountTooSmall: '这笔数量太小，池子配平后没有可用的份额。',
      reverted: '交易上链了，但没有成功。你的资产没有变化。',
    },
    receipt: {
      title: '提交成功',
      hash: '交易哈希',
      copyHash: '复制交易哈希',
      explorer: '在区块浏览器里查看',
      pendingNote: '交易已经提交，完成后份额与余额会自动更新。',
    },
  },
  // ───────────────────────────────────────────────────────────────────────────
  // 治理·质押 (owner 2026-11-17)：/gov 的第一个实装版本。两块能力——
  // 流动性质押（存社区代币 + 父币，按承诺解锁期换治理权）与加速质押（存社区
  // 代币本身，不产生治理权，只决定加速激励份额）。术语按 GLOSSARY 固定：治理权
  // / 流动性质押 / 加速质押 / 承诺解锁期 / 解锁 / 撤出 / 加速激励 / 销毁。
  // 界面不出现函数名、allowance、approve、nonce、gas、区块。lazy /gov chunk
  // 是唯一消费者。
  // ───────────────────────────────────────────────────────────────────────────
  gov: {
    intro: '流动性质押决定你的治理权；加速质押不产生治理权，只决定加速激励里你能分到多少。',
    gates: {
      connectTitle: '连接钱包后可以参与治理',
      connectBody: '治理权记在身份 NFT 上。先连接钱包，再选择一个身份 NFT。',
      wrongChainTitle: '网络不对',
      wrongChainBody: '切换到这个应用使用的网络后再参与治理。',
      unconfiguredTitle: '这个环境还没有部署质押合约',
      unconfiguredBody: '部署地址还没有填，治理功能暂时不可用。',
      noIdentityTitle: '先铸造一个身份 NFT',
      noIdentityBody: '治理权记在身份 NFT 上，没有身份 NFT 不能质押。',
      noIdentityAction: '去铸造身份 NFT',
      needsSelectionTitle: '先选择一个身份 NFT',
      needsSelectionBody: '你持有身份 NFT，但还没有选中。选中以后再来质押。',
      needsSelectionAction: '去我的 NFT',
      identityErrorTitle: '身份 NFT 暂时读不到',
      identityErrorBody: '网络可能不稳，你的身份 NFT 没有变化。',
      retry: '重试',
    },
    stats: {
      boost: '加速质押份额',
      phasesValue: (phases: string) => `${phases} 个阶段`,
      /**
       * 承诺解锁期的时间估算。阶段长度会被协议调整（`sync()`），所以永远写「约」；
       * 超过 1 天按「x.x 天」写（owner 2026-11-18 20:05）。
       */
      durationMinutes: (minutes: string) => `约 ${minutes} 分钟`,
      durationHours: (hours: string) => `约 ${hours} 小时`,
      durationDays: (days: string) => `约 ${days} 天`,
      /** 下拉选项：阶段数 + 预估时长，例如「10 个阶段 · 约 20 分钟」。 */
      phasesWithDuration: (phases: string, duration: string) => `${phases} 个阶段 · ${duration}`,
      formula: '治理权 = 流动性质押份额 × 承诺解锁期',
      boostNote: '只统计本阶段有效的加速份额',
      loading: '读取质押状态中…',
      errorTitle: '质押状态暂时读不到',
      errorBody: '网络可能不稳，你的质押没有变化。',
      retry: '重试',
      unknown: '—',
    },
    liquidity: {
      title: '流动性质押',
      body: '存入社区代币和父币，按承诺解锁期换成治理权；解锁走完之前这些代币不能撤出。',
      tokenLabel: '社区代币',
      parentLabel: '父币',
      amountPlaceholder: '0.0',
      max: '全部',
      balance: (amount: string) => `余额 ${amount}`,
      balanceLoading: '读取余额中…',
      phasesLabel: '承诺解锁期',
      phasesUnit: '个阶段',
      phasesPreset: (phases: number) => `${phases} 阶段`,
      phasesHint: '承诺得越久，治理权越多；解锁要等满这么久才能撤出。',
      phasesRange: (min: string, max: string) => `可以选 ${min}–${max} 个阶段。`,
      phasesInvalid: (min: string, max: string) => `承诺解锁期要在 ${min} 到 ${max} 个阶段之间。`,
      amountInvalid: '请输入有效的金额。',
      amountZero: '两侧数量都要大于 0。',
      amountTooPrecise: (digits: number) => `小数位不能超过 ${digits} 位。`,
      insufficient: (symbol: string, shortfall: string) => `${symbol} 不够，还差 ${shortfall}`,
      optimalHint: (token: string, tokenSymbol: string, parent: string, parentSymbol: string) =>
        `按池子比例实际存入 ${token} ${tokenSymbol} + ${parent} ${parentSymbol}。`,
      votesLabel: '预计获得治理权',
      votesValue: (votes: string) => `+${votes}`,
      votesNote: '按链上实际份额计算，成交后以回执为准。',
      submit: '质押流动性',
      submitting: '质押中…',
      approveTitle: '质押前先授权这两枚代币',
      approveTitleSingle: '质押前先授权这枚代币',
    },
    boost: {
      title: '加速质押',
      /** 加速激励质押的作用（owner 2026-11-19）：治理激励 = 投票激励 + 加速激励。 */
      aboutTitle: '加速激励质押的作用',
      aboutBody:
        '治理激励分两部分：投票激励和加速激励。加速激励质押不产生治理权，但会提高你在加速激励里的份额，让治理激励发得更快、更多。',
      aboutNote: '加速份额按本阶段统计，下一阶段会按治理权占比重新计算上限。',
      body: '存入社区代币，参与本阶段的加速激励分配；不产生治理权。',
      lockedTitle: '先完成流动性质押',
      lockedBody: '加速质押要挂在流动性质押上：先质押流动性，再回来加速。',
      lockedAction: '去质押流动性',
      capLabel: '本阶段还能加速',
      capValue: (amount: string, symbol: string) => `${amount} ${symbol}`,
      capLoading: '读取可加速额度中…',
      capExceeded: (remaining: string, symbol: string) =>
        `超过本阶段还能加速的 ${remaining} ${symbol}。`,
      usedLabel: '已加速',
      amountLabel: '加速数量',
      amountPlaceholder: '0.0',
      amountZero: '数量要大于 0。',
      amountInvalid: '请输入有效的金额。',
      insufficient: (symbol: string, shortfall: string) => `${symbol} 不够，还差 ${shortfall}`,
      submit: '加速质押',
      submitting: '加速质押中…',
    },
    mine: {
      title: '我的质押',
      emptyTitle: '这个身份 NFT 还没有质押。',
      emptyBody: '质押流动性之后，这里会显示流动性质押份额与加速激励质押量。',
      emptyAction: '去质押流动性',
      votes: '我的治理权',
      shares: '流动性质押份额',
      boost: '加速质押份额',
      phases: '承诺解锁期',
      token: '预计可取回社区代币',
      parent: '预计可取回父币',
      boostAmount: '预计可取回加速代币',
      stateStaked: '正常质押中',
      stateStakedNote: '申请解锁后，这份质押的治理权会先清零。',
      stateUnlocking: '已申请解锁',
      stateUnlockingNote: (phases: string, minutes: string | null) =>
        minutes === null
          ? `还要再等 ${phases} 个阶段才能撤出。`
          : `还要再等 ${phases} 个阶段（约 ${minutes} 分钟）才能撤出。`,
      stateWithdrawable: '可以撤出了',
      stateWithdrawableNote: '撤出后这些代币会回到钱包，治理权清零。',
      stateUnknown: '解锁状态暂时读不到。',
      /** 已申请解锁时治理页「我的」不再显示四项数据，只提示状态 + 去解锁页（owner 2026-11-19）。 */
      unlockingTitle: '已申请解锁',
      unlockingBody: '治理权已清零，等承诺解锁期走完就能撤出。',
      /** 「我的」页质押资产卡（owner 2026-11-18 23:20）：加速质押只有一种量，不分「有效」。 */
      boostStake: '加速激励质押量',
      infoAria: '查看质押份额与预计可取回代币',
      infoTitle: '质押份额与预计可取回',
      unlockProgressLink: '查看解锁进度',
      increasePhases: '提高承诺解锁期',
      increasePhasesMin: (phases: string) => `至少要提高到 ${phases} 个阶段。`,
      increasePhasesInvalid: '请输入整数阶段数。',
      increasePhasesSubmit: '确认提高',
      unstake: '申请解锁',
      unstakeHint:
        '申请后治理权立刻清零，等承诺解锁期走完才能撤出；本阶段已经投过票或推举过则要等下一个阶段。',
      unstakeTitle: '确认申请解锁？',
      unstakeBody: '申请后治理权马上清零，等承诺解锁期走完才能撤出。',
      unstakeConfirm: '确认申请解锁',
      withdraw: '撤出',
      withdrawTitle: '确认撤出？',
      withdrawBody: '撤出后这份质押结束，治理权和加速份额一起清零。',
      withdrawConfirm: '确认撤出',
      cancel: '取消',
      readError: '质押数据暂时读不到。',
      retry: '重试',
    },
    community: {
      title: '社区治理数据',
      totalVotes: '社区总治理权',
      totalShares: '社区总流动性质押份额',
      myShare: '我的占比',
      totalBoost: '本阶段社区有效加速份额',
      burned: '已销毁社区代币',
      unavailable: '社区数据暂时读不到。',
    },
    rules: {
      title: '规则',
      votes:
        '治理权 = 流动性质押份额 × 承诺解锁期。份额来自你存入的流动性；承诺解锁期可以增加，不能缩短。',
      boost:
        '加速质押不产生治理权。投票时会按当时的加速份额记入这一轮；治理激励里「加速激励」那一部分，按它占社区加速份额的比例分配。',
      unlock:
        '解锁分两步：先申请解锁（治理权立刻清零），等承诺解锁期走完，再撤出拿回代币。申请解锁的当前阶段不能已经投过票或推举过。',
      fees: '交易手续费的一部分会进入质押合约，用于回购并销毁社区代币；销毁之后协议才能再预留新的激励。',
      docs: '术语与完整规则见开源文档。',
    },
    /** 授权成功后按钮原地变成「已授权 {symbol}」（其余授权文案复用全局 copy.approve.*）。 */
    approve: {
      approved: (symbol: string) => `已授权 ${symbol}`,
    },
    tx: {
      wallet: '等待你在钱包确认',
      ownerChanged: '钱包或网络已经切换，刚才那笔交易没有再提交。请用当前钱包重新发起。',
      nonceUnavailable: '暂时读不到网络状态，请稍后再试。',
      revert: '交易上链了，但没有成功，代币没有变化。',
    },
    /** 治理域页面的可见标题（旧版 Header 不显示标题，大标题在正文里）。 */
    pageTitles: {
      home: '治理首页',
      rewards: '治理激励',
      stakeLiquidity: '流动性质押',
      stakeToken: '质押代币',
      unstake: '申请解锁',
      liquid: '流动性质押数据',
    },
    publicCard: {
      /** 验证中的行动在新协议里已不存在（owner 2026-11-18 23:52），只保留投票入口。 */
      voteActions: '投票中的行动',
    },
    /**
     * 旧库 LOVE20TKM /gov 首页：我的 / 社区 两个 tab。
     *
     * owner 2026-11-18 20:05 给了旧版两张截图，要求这两个 tab 的版面照它排：
     * 「我的」= 2×2 统计 + 两个质押入口 + 铸造治理激励；「社区」= 一个头条数字 +
     * 治理公示 + 2×2 统计 + 两个质押入口。旧版的「预估年化收益率 APY / 预计新增
     * 铸币 / SL·ST 代币」在本协议没有对应只读 view，换成同样位置的真实口径
     * （社区总治理权 / 流动性凭证总量 / 本阶段有效加速份额 / 累计销毁量），不编数。
     */
    home: {
      tabs: { mine: '我的', community: '社区' },
      /** 「我的」摘要四格。 */
      myVotes: '我的有效治理权',
      myPhases: '我承诺的解锁期',
      myShare: '我的治理权占比',
      myBoostShare: '加速质押占比',
      /** 两个质押入口（旧版「质押 获取治理票 / 质押 增加治理收益」）。 */
      liquidityLink: '增加治理权',
      boostLink: '增加加速激励',
      mintRewardAction: '铸造 治理激励',
      /** 「社区」摘要：头条数字 + 一个行动入口 + 四格。 */
      communityVotes: '社区总治理权',
      communityShares: '社区流动性质押份额',
      communityLp: '流动性凭证总量',
      communityBoost: '本阶段有效加速份额',
      communityBurned: '累计销毁社区代币',
      becomeTitle: '想给自己喜欢的提案投票？',
      becomeBody: '质押社区代币的流动性，拿到治理权后就能参与投票与激励分配。',
      becomeAction: '立即成为治理者',
      unstakeAction: '取消质押',
    },
    /** 流动性质押页：治理权的作用 + 提示合并成一张卡（owner 2026-11-19）。 */
    rulesCard: { title: '治理权的作用与提示' },
    /** 调整承诺解锁期（owner 2026-11-18：已有质押时单独调整，不在新增质押里选）。 */
    phasesAdjust: {
      title: '调整承诺解锁期',
      body: '只能提高、不能缩短；每多 1 个阶段，治理权按你的流动性质押份额增加。',
      current: (phases: string, duration: string | null) =>
        duration === null
          ? `当前承诺解锁期：${phases} 个阶段`
          : `当前承诺解锁期：${phases} 个阶段（${duration}）`,
      /** owner 2026-11-18 20:05：按钮文案从「调整」改成「提高」。 */
      action: '提高',
      cardHint: '质押期间治理权 = 流动性质押份额 × 承诺解锁期；想提高治理权就提高承诺解锁期。',
    },
    /**
     * 治理权查询（owner 2026-11-18 20:12 按 TKM 旧版截图重排）：
     * 支持「按身份 NFT」与「按钱包地址」两种查询；钱包查询会枚举该地址当前持有的
     * 全部身份 NFT（`balanceOf` + `tokenOfOwnerByIndex`）再汇总治理权。
     */
    query: {
      title: '治理权查询',
      hint: '按身份 NFT 的 ID 或名称查询治理权（输入即查询，名称会先在链上解析成 NFT 编号）。',
      /** owner 2026-11-18 23:20：去掉按地址查询，只按身份 NFT，支持 ID / 名称两种。 */
      modeLabel: '查询方式',
      modes: { id: 'NFT ID', name: 'NFT 名称' },
      idLabel: 'NFT ID',
      idPlaceholder: '例如 12',
      nameLabel: 'NFT 名称',
      namePlaceholder: '输入身份 NFT 名称',
      submit: '查询',
      reset: '重置',
      loading: '查询中…',
      invalidId: '请输入身份 NFT 的整数编号。',
      error: '治理权暂时读不到。',
      nameNotFound: '查询不到这个名称的身份 NFT。',
      notFoundNft: '这个身份 NFT 还没有质押。',
      nftId: 'NFT ID',
      nftName: 'NFT 名称',
      holder: '当前持有人地址',
      nameUnknown: '读不到名称',
      target: '查询目标地址',
      votes: '治理权',
      votesNote: '本阶段有效治理权',
      share: '占总治理权比例',
      noteTitle: '备注',
      note: '治理权按本阶段有效值统计；已经申请解锁的质押，治理权为 0。',
      copy: '复制',
      copied: '已复制',
    },
    accelerated: {
      title: '我的加速质押',
      valid: '本阶段有效的加速份额',
      used: '已加速',
      remaining: '本阶段还能加速',
      capNote: '加速份额在本阶段投票时被链上记入这一轮；上限随治理权占比变化。',
    },
    myLiquidityTitle: '我的流动性质押',
    governorIntro: {
      title: '治理权的作用',
      itemOwner: '治理权来自流动性质押：份额越多、承诺解锁期越长，治理权越大。',
      itemReward: (percent: string) => `每轮获得 ${percent}% 以上投票支持的提案，有提案激励。`,
      itemSubmit: (percent: string) => `有 ${percent}% 的治理权，每轮可推举一个提案进入投票列表。`,
    },
    smart: {
      label: '智能模式',
      onHint: '只填一侧也行：另一侧由合约先兑换再一起质押。',
      onHintNative: '只填一侧也行：原生币会先和社区代币配平，再一起质押。',
      offHint: '两侧自动按池子比例联动：改一侧，另一侧立刻跟着变；直接质押，不经过兑换。',
      offHintNative: '两侧自动按池子比例联动；父币直接用原生币，不需要封装 WETH，只需一笔授权。',
      hubMissing: '这个环境没有配置智能质押的合约，只能用两侧都填的方式。',
      swapNote: (amount: string, symbol: string, out: string, outSymbol: string) =>
        `其中 ${amount} ${symbol} 会先换成 ${out} ${outSymbol}。`,
      noSwapNote: '两侧正好配平，不需要兑换。',
      preparedNote: (a: string, aSymbol: string, b: string, bSymbol: string) =>
        `实际进池 ${a} ${aSymbol} + ${b} ${bSymbol}`,
      minSharesNote: (min: string) => `最少获得 ${min} 流动性份额`,
      quoteFailed: '智能模式的报价暂时算不出来，可以关掉智能模式自己填两侧。',
      shortfallBoth: '两侧数量都要大于 0。',
      nativeLabel: '原生币',
      nativeBalance: (amount: string) => `余额 ${amount}`,
      slippageLabel: '最多可接受的价格变化',
      slippageCustom: '自定义',
      slippageRange: '自定义值需要在 0.01% 到 50% 之间。',
      minShares: (min: string) => `最少获得 ${min} 流动性份额`,
      phasesLocked: (phases: string) =>
        `已有质押：承诺解锁期保持 ${phases} 个阶段，可在上方「调整承诺解锁期」里加大。`,
    },
    unstakePage: {
      sectionTitle: '我的治理资产',
      waiting: (phases: string, minutes: string | null) =>
        minutes === null
          ? `已申请解锁：还要再等 ${phases} 个阶段才能撤出。`
          : `已申请解锁：还要再等 ${phases} 个阶段（约 ${minutes} 分钟）才能撤出。`,
      noStake: '这个身份 NFT 还没有质押。',
      goStake: '去质押流动性',
    },
    liquidPage: {
      mineTitle: '我的流动性质押',
      totalShares: '流动性质押总份额',
      totalLp: '记在质押合约里的流动性凭证',
      withdrawableLp: '可撤出的流动性凭证',
      feeLp: '已结算的手续费凭证',
      liquidityPrincipal: '累计存入的社区代币本金',
      tokenAmount: (symbol: string) => `社区预计可取回 ${symbol}`,
      parentAmount: (symbol: string) => `社区预计可取回 ${symbol}`,
      burned: '已销毁社区代币',
      myShares: '我的流动性质押份额',
      mySharePercent: '我的占比',
      myTokenAmount: (symbol: string) => `我的预计可取回 ${symbol}`,
      myParentAmount: (symbol: string) => `我的预计可取回 ${symbol}`,
      goStake: '去质押流动性',
      feeNote: '手续费结算是流动性凭证口径：结算后用于回购并销毁社区代币。',
      empty: '这个社区还没有流动性质押。',
    },
    /** 旧库的投票 / 验证 / 推举 / 行动页面：本轮先建出来占位（ABI 未导出）。 */
    placeholders: {
      vote: {
        title: '投票',
        body: '用治理权给行动投票。投票需要 Vote 合约的 ABI 导出后接入，这里先占位。',
      },
      voteActions: {
        title: '投票中的行动',
        body: '查看本轮投票中的行动。接入投票后开放。',
      },
      voteSingle: {
        title: '行动详情',
        body: '单个行动的投票页。接入投票后开放。',
      },
      voteRecords: {
        title: '投票历史',
        body: '查看自己或他人的投票记录。接入投票后开放。',
      },
      verify: {
        title: '验证',
        body: '验证链群行动的参与结果。接入验证后开放。',
      },
      verifyActions: {
        title: '验证中的行动',
        body: '查看全部验证中的行动。接入验证后开放。',
      },
      verifyAction: {
        title: '验证',
        body: '给一个行动打分。接入验证后开放。',
      },
      verifyDetail: {
        title: '验证详情',
        body: '查看一轮验证的明细。接入验证后开放。',
      },
      submitActions: {
        title: '推举',
        body: '查看还没被推举的行动。接入推举后开放。',
      },
      submitSingle: {
        title: '行动详情',
        body: '把一个行动推举进本轮投票。接入推举后开放。',
      },
      acting: {
        title: '社区首页',
        body: '社区行动首页。接入行动后开放。',
      },
      actingJoin: {
        title: '加入行动',
        body: '加入或追加一个行动。接入行动后开放。',
      },
      actionNew: {
        title: '创建新行动',
        body: '创建新行动。接入行动后开放。',
      },
      actionInfo: {
        title: '行动详情',
        body: '行动详情。接入行动后开放。',
      },
      govRewards: {
        title: '治理激励',
        body: '逐轮铸造治理激励需要 Mint 合约的 ABI 导出；当前版本不显示激励金额。',
      },
      backToGov: '回治理首页',
      goStake: '去质押流动性',
      badge: '即将上线',
    },
    receipt: {
      liquidity: '流动性质押已提交',
      boost: '加速质押已提交',
      increasePhases: '承诺解锁期已提高',
      unstake: '已申请解锁',
      withdraw: '已撤出',
      votes: (votes: string) => `治理权 +${votes}`,
      shares: (shares: string) => `流动性质押份额 +${shares}`,
      boostAmount: (amount: string, symbol: string) => `加速质押 ${amount} ${symbol}`,
      increasePhasesNote: (phases: string) => `承诺解锁期现在是 ${phases} 个阶段。`,
      unstakeNote: '治理权已经清零，等承诺解锁期走完就可以撤出。',
      withdrawNote: (token: string, tokenSymbol: string, parent: string, parentSymbol: string) =>
        `已撤出 ${token} ${tokenSymbol} + ${parent} ${parentSymbol}`,
      hash: '交易哈希',
      copyHash: '复制交易哈希',
      copied: '已复制',
      explorer: '在区块浏览器里查看',
      close: '好的',
      refreshHint: '质押状态已重新读取。',
    },
    /**
     * 治理·投票（core `Vote`）。术语按正式词条：投票 / 提案 / 治理权；
     * 「治理票」只用于解释额度来源，界面统一写「治理权」。
     */
    vote: {
      title: '投票',
      intro: '每轮能投的票数等于你的治理权。可以一次投给多个提案，也可以分几次给同一个提案加票。',
      powerTitle: '我的投票额度',
      powerMax: '本轮治理权',
      powerUsed: '本轮已投',
      powerRemaining: '还能投',
      powerUnit: '票',
      powerNote: '治理权由流动性质押份额和承诺解锁期决定，每轮重新计算。',
      noPowerTitle: '当前身份 NFT 还没有治理权',
      noPowerBody: '治理权来自流动性质押。先质押流动性，下一轮就能投票。',
      noPowerAction: '去质押流动性',
      roundTitle: '本轮提案',
      roundHint: (round: string) => `治理第 ${round} 轮`,
      emptyTitle: '本轮还没有提案被推举',
      emptyBody: '有人把提案推举进这一轮后，这里会出现可以投票的提案。',
      emptyAction: '去推举提案',
      loading: '读取本轮提案中…',
      readFailed: '本轮提案暂时读不到。',
      retry: '重试',
      mineVotes: (votes: string) => `我已投 ${votes} 票`,
      totalVotes: (votes: string) => `本轮共 ${votes} 票`,
      targetUnsupported: '这个提案由目标合约处理，要在对应的行动页投票。',
      amountLabel: '投多少票',
      amountPlaceholder: '0',
      amountInvalid: '投票票数要是大于 0 的整数。',
      amountTooMany: (remaining: string) => `合计超过还能投的 ${remaining} 票。`,
      amountNone: '至少给一个提案分票。',
      submit: '确认投票',
      submitting: '提交中…',
      waitingWallet: '等待你在钱包确认',
      pending: '已提交，等待上链',
      revert: '交易上链了，但没有成功，票数没有变化。',
      receiptTitle: '投票结果',
      receiptLine: (id: string, votes: string) => `提案 #${id}：${votes} 票`,
      receiptTotal: (votes: string) => `本轮合计投出 ${votes} 票`,
    },
    /**
     * 治理首页「我的投票」卡：旧库 `MyVotingPanel`（已投 / 未投 + 去投票 + 轮次）
     * 与 `/vote/records`（按轮分组：编号 + 标题 + 我的投票 + 占比）合成一张卡。
     * 沿用新协议口径：主体是身份 NFT、轮次带类型前缀、不出现「占比」以外的技术词。
     */
    myVotes: {
      title: '我的投票',
      roundLabel: (round: string) => `治理第 ${round} 轮`,
      statVoted: '已投',
      statRemaining: '未投',
      unit: '票',
      goVote: '去投票',
      allVoted: '本轮票已经投完',
      noPower: '当前身份 NFT 本轮没有治理权，先质押流动性。',
      recordTitle: '我的投票记录',
      previewLink: '查看全部投票记录',
      emptyRecord: '还没有投票记录',
      emptyRecordHint: '给本轮提案投票后，这里会按轮次列出你投过的提案。',
      roundHeader: (round: string, votes: string) => `治理第 ${round} 轮 · 共投出 ${votes} 票`,
      entryLine: (id: string, title: string) => (title.length > 0 ? `#${id} ${title}` : `#${id}`),
      entryMine: (votes: string) => `我的投票 ${votes}`,
      entryShare: (percent: string) => `占该提案票数 ${percent}%`,
      loadMore: '加载更多轮次',
      loadingMore: '读取更多轮次中…',
      loading: '读取投票记录中…',
      readFailed: '投票记录暂时读不到。',
      retry: '重试',
      /** 独立页 `/vote/records`。 */
      recordsTitle: '我的投票记录',
      recordsIntro: '按轮次倒序列出你投过票的提案；占比是你在该提案的票数占该提案总票数的比例。',
      recordsEmptyAction: '去投票',
    },
    /**
     * 治理·提案（core `Submit`）。一个身份每轮只能推举一个提案；
     * 本版本只做「不回调」的提案（回调数据由目标合约定义，属于行动域）。
     */
    submit: {
      title: '提案',
      intro: '提案是提交给社区的激励事项。同一轮里一个身份只能推举一个提案，推举后当轮接受投票。',
      eligibilityTitle: '推举资格',
      eligibilityCan: '这一轮可以推举',
      eligibilityCannot: '这一轮还不能推举',
      eligibilityReason: (mine: string, required: string, ratio: string) =>
        `推举需要本轮治理权不低于 ${required}（社区总治理权的 ${ratio}），你现在是 ${mine}。`,
      eligibilityThreshold: (required: string) => `本轮推举门槛：${required} 治理权`,
      eligibilityNoCommunity: '社区本轮还没有人质押，暂时算不出推举门槛。',
      submittedTitle: '本轮已经推举',
      submittedBody: (id: string, title: string) =>
        `你在本轮推举了提案 #${id}「${title}」，同一轮不能推举第二个。`,
      formTitle: '推举新提案',
      titleLabel: '标题',
      titlePlaceholder: '一句话说清这个提案要做什么',
      detailsLabel: '详情',
      detailsPlaceholder: '背景、要做什么、期望的结果',
      targetLabel: '提案目标',
      targetPlaceholder: '0x 开头的 40 位地址',
      targetHint: '提案目标决定这个提案由谁处理，投票和激励都记在它身上。',
      noCallbackNote: '本版本只推举「不回调」的提案：目标合约不会被自动调用。',
      limitTitle: (title: string, details: string) =>
        `标题最多 ${title} 字节、详情最多 ${details} 字节（一个中文字算 3 字节）。`,
      counter: (used: string, max: string) => `${used} / ${max} 字节`,
      issueTitleEmpty: '标题不能为空。',
      issueTitleTooLong: (max: string) => `标题超过 ${max} 字节。`,
      issueDetailsTooLong: (max: string) => `详情超过 ${max} 字节。`,
      issueTargetInvalid: '提案目标要填一个 0x 开头的 40 位地址，且不能是零地址。',
      submit: '推举提案',
      submitting: '提交中…',
      waitingWallet: '等待你在钱包确认',
      pending: '已提交，等待上链',
      revert: '交易上链了，但没有成功，提案没有推举出去。',
      receiptTitle: '推举结果',
      receiptLine: (id: string, title: string) => `提案 #${id}「${title}」已经推举进本轮。`,
      receiptHint: '当轮就能开始接受投票。',
    },
    /**
     * 治理·激励铸造（core `Mint`）。逐轮铸造：投票激励按票数、加速激励按加速份额。
     * 只有**已结束**的轮次能铸；批量铸造只收确认可铸的轮次（中间任何一轮失败整笔回滚）。
     */
    rewards: {
      title: '治理激励',
      intro:
        '治理激励按轮铸造：投票激励按你投出的票数分配，加速激励按加速质押份额分配，轮次结束后才能铸造。',
      summaryTitle: '我的可铸造',
      summaryRounds: (count: string) => `${count} 轮可铸造`,
      mintAll: (count: string) => `铸造这 ${count} 轮`,
      emptyTitle: '还没有可铸造的治理激励',
      emptyBody: '参与过投票的轮次结束后，这里会出现可以铸造的激励。',
      loading: '读取治理激励中…',
      readFailed: '治理激励暂时读不到。',
      retry: '重试',
      tableRound: '轮次',
      tableVote: '投票激励',
      tableBoost: '加速激励',
      tableStatus: '状态',
      roundLabel: (round: string) => `治理第 ${round} 轮`,
      noVote: '没有投票',
      minted: '已铸造',
      mint: '铸造',
      mintingOne: '铸造中…',
      loadMore: '加载更多轮次',
      loadingMore: '读取更多轮次…',
      exhausted: '已经到底',
      waitingWallet: '等待你在钱包确认',
      pending: '已提交，等待上链',
      revert: '交易上链了，但没有成功，激励没有变化。',
      receiptTitle: '铸造结果',
      receiptLineOne: (round: string, amount: string, symbol: string) =>
        `治理第 ${round} 轮：${amount} ${symbol}`,
      receiptLineMany: (rounds: string, amount: string, symbol: string) =>
        `铸造了 ${rounds} 轮，共 ${amount} ${symbol}`,
    },
    /**
     * 治理·提案激励结算（core `Mint` 的提案侧）。core 覆盖范围内**只有读取与销毁**：
     * 达标提案的激励只能由提案目标合约铸造（`onlyProposalTarget`）。
     */
    proposalRewards: {
      title: '提案激励',
      intro:
        '提案激励按提案票数分配：票数达到本轮门槛的提案，由提案目标合约铸造；没到门槛的，任何人都可以销毁这部分激励。',
      roundHint: '选一轮已经结束的治理轮次查看结算。',
      poolLabel: '本轮提案激励池',
      totalVotesLabel: '本轮总票数',
      thresholdLabel: '本轮门槛',
      emptyTitle: '这一轮没有提案',
      emptyBody: '这一轮没有提案被推举，没有需要结算的提案激励。',
      poolEmpty: '这一轮没有预留提案激励（本轮没有人投票）。',
      loading: '读取提案激励中…',
      readFailed: '提案激励暂时读不到。',
      retry: '重试',
      tableProposal: '提案',
      tableVotes: '票数 / 门槛',
      tableAmount: '激励',
      tableStatus: '状态',
      statusPending: '待结算',
      statusMinted: '已铸造',
      statusBurned: '已销毁',
      eligibleHint: '票数已过门槛，由提案目标合约铸造。',
      ineligibleHint: '票数没到门槛，这部分激励可以被销毁。',
      noVoteHint: '这一轮它没有被投票，没有可销毁的激励。',
      burn: '销毁这部分',
      burning: '销毁中…',
      burnNote: '销毁不可撤销：这部分激励会永久离开流通。',
      waitingWallet: '等待你在钱包确认',
      pending: '已提交，等待上链',
      revert: '交易上链了，但没有成功，激励没有变化。',
      receiptTitle: '销毁结果',
      receiptLine: (id: string, amount: string, symbol: string) =>
        `提案 #${id} 的 ${amount} ${symbol} 已销毁。`,
    },
  },
};
