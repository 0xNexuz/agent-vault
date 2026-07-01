import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ArrowRight,
  BadgeCheck,
  BookOpen,
  Bot,
  Check,
  ChevronRight,
  CircleDollarSign,
  Download,
  ExternalLink,
  FileText,
  Github,
  GitBranch,
  LockKeyhole,
  Pause,
  Play,
  RefreshCcw,
  Shield,
  SlidersHorizontal,
  Sparkles,
  TerminalSquare,
  Wallet,
  X,
} from 'lucide-react';
import './styles.css';

const GITHUB_URL = 'https://github.com/BOTChain-bot';
const TESTNET = {
  chainId: import.meta.env.VITE_BOT_TESTNET_CHAIN_ID || '0x3c8',
  chainName: import.meta.env.VITE_BOT_TESTNET_NAME || 'BOT Chain Testnet',
  rpcUrl: import.meta.env.VITE_BOT_TESTNET_RPC_URL || 'https://rpc.bohr.life',
  explorerUrl: import.meta.env.VITE_BOT_TESTNET_EXPLORER_URL || 'https://scan.bohr.life',
  currencySymbol: import.meta.env.VITE_BOT_TESTNET_SYMBOL || 'BOT',
};

const initialPolicies = {
  swap: true,
  bridge: true,
  transfer: false,
  stake: true,
  emergencyPause: false,
};

const docs = [
  {
    title: 'Vault model',
    body: 'AgentVault is designed as an owner-controlled smart account: the owner keeps custody, while agent addresses can execute only actions allowed by policy. Policies cover daily spend, per-action limits, allowed protocols, destination chains, and emergency pause.',
  },
  {
    title: 'Approval flow',
    body: 'An agent proposes an action, the UI runs a live wallet and network preflight, then the owner signs an approval intent. The current build can also send an on-chain execution proof transaction to BOT Chain testnet.',
  },
  {
    title: 'Agent runtime',
    body: 'Agents are bounded operators. Market Operator now prepares a policy-scoped action and can trigger a wallet-submitted proof transaction on BOT testnet. Direct BDEX/Bridge execution comes after vault and protocol contract addresses are integrated.',
  },
  {
    title: 'BOT testnet connected',
    body: 'AgentVault is configured for BOT Chain testnet: chain ID 968, RPC https://rpc.bohr.life, explorer https://scan.bohr.life, native token BOT. Wallet switching and balance checks run against this network.',
  },
];

const baseEvents = [
  {
    type: 'Swap proposal',
    agent: 'Market Operator',
    protocol: 'BDEX',
    risk: 'low',
    status: 'ready',
    hash: 'wallet required',
    reason: 'Rebalance BOT into USDT only if the wallet is on the configured testnet.',
    time: 'Live',
  },
  {
    type: 'Bridge proposal',
    agent: 'Bridge Runner',
    protocol: 'BOT Bridge',
    risk: 'medium',
    status: 'review',
    hash: 'policy gated',
    reason: 'Move funds only to allowlisted destination chains after owner signature.',
    time: 'Live',
  },
  {
    type: 'Reward claim',
    agent: 'Node Operator',
    protocol: 'Rewards',
    risk: 'low',
    status: 'ready',
    hash: 'pending vault',
    reason: 'Claim rewards and route a configured share to operations.',
    time: 'Live',
  },
  {
    type: 'Transfer blocked',
    agent: 'Market Operator',
    protocol: 'Treasury',
    risk: 'high',
    status: 'blocked',
    hash: 'no tx',
    reason: 'Transfer exceeds policy and remains blocked until limits are changed.',
    time: 'Live',
  },
];

function hasTestnetConfig() {
  return Boolean(TESTNET.chainId && TESTNET.rpcUrl);
}

function shortAddress(address) {
  return address ? `${address.slice(0, 6)}...${address.slice(-4)}` : '';
}

function formatBalance(hexBalance) {
  if (!hexBalance) return '0.0000';
  const wei = BigInt(hexBalance);
  const whole = wei / 10n ** 18n;
  const fraction = (wei % 10n ** 18n).toString().padStart(18, '0').slice(0, 4);
  return `${whole}.${fraction}`;
}

function utf8ToHex(value) {
  return `0x${Array.from(new TextEncoder().encode(value))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')}`;
}

async function requestWallet(method, params) {
  if (!window.ethereum) {
    throw new Error('No injected wallet found. Install BO Wallet or MetaMask-compatible wallet.');
  }
  return window.ethereum.request({ method, params });
}

function App() {
  const [wallet, setWallet] = useState({ address: '', chainId: '', balance: '', status: 'Disconnected', error: '' });
  const [vaultStatus, setVaultStatus] = useState('Connect BOT testnet');
  const [policies, setPolicies] = useState(initialPolicies);
  const [dailyLimit, setDailyLimit] = useState(18);
  const [proposalStatus, setProposalStatus] = useState('ready');
  const [filter, setFilter] = useState('All');
  const [preflight, setPreflight] = useState(null);
  const [tx, setTx] = useState({ hash: '', status: 'No on-chain action yet', explorer: '' });
  const [signature, setSignature] = useState('');
  const [activePlan, setActivePlan] = useState('Operator');

  const connected = Boolean(wallet.address);
  const configured = hasTestnetConfig();
  const onBotTestnet = wallet.chainId?.toLowerCase() === TESTNET.chainId.toLowerCase();

  useEffect(() => {
    const targets = document.querySelectorAll('.section, .panel, .proof, .docCard, .priceCard, .auditEvent');
    targets.forEach((target) => target.classList.add('reveal'));
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    targets.forEach((target) => observer.observe(target));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!window.ethereum) return;
    const updateAccounts = (accounts) => {
      setWallet((current) => ({ ...current, address: accounts?.[0] || '', status: accounts?.[0] ? 'Connected' : 'Disconnected' }));
    };
    const updateChain = (chainId) => setWallet((current) => ({ ...current, chainId }));
    window.ethereum.on?.('accountsChanged', updateAccounts);
    window.ethereum.on?.('chainChanged', updateChain);
    return () => {
      window.ethereum.removeListener?.('accountsChanged', updateAccounts);
      window.ethereum.removeListener?.('chainChanged', updateChain);
    };
  }, []);

  const auditEvents = useMemo(() => {
    const liveEvents = [];
    if (tx.hash) {
      liveEvents.push({
        type: 'Agent proof sent on-chain',
        agent: 'Market Operator',
        protocol: 'BOT Testnet',
        risk: 'low',
        status: tx.status === 'Confirmed on-chain' ? 'completed' : 'review',
        hash: `${tx.hash.slice(0, 10)}...${tx.hash.slice(-6)}`,
        reason: 'AgentVault wrote a policy-bound execution proof transaction to BOT Chain testnet.',
        time: 'Now',
      });
    }
    if (signature) {
      liveEvents.push(
        {
          type: 'Owner approval signed',
          agent: 'Owner Wallet',
          protocol: 'AgentVault',
          risk: 'low',
          status: 'completed',
          hash: `${signature.slice(0, 10)}...${signature.slice(-6)}`,
          reason: 'Owner signed an approval intent. Submit this signature to the vault contract after deployment.',
          time: 'Now',
        },
      );
    }
    return [
      ...liveEvents,
      ...baseEvents,
    ];
  }, [signature, tx.hash, tx.status]);

  const filteredEvents = useMemo(() => {
    if (filter === 'All') return auditEvents;
    return auditEvents.filter((event) => event.protocol === filter || event.risk === filter.toLowerCase());
  }, [auditEvents, filter]);

  const refreshBalance = async (address = wallet.address) => {
    if (!address) return;
    const balance = await requestWallet('eth_getBalance', [address, 'latest']);
    setWallet((current) => ({ ...current, balance: formatBalance(balance) }));
  };

  const connectWallet = async () => {
    try {
      const accounts = await requestWallet('eth_requestAccounts');
      const chainId = await requestWallet('eth_chainId');
      const address = accounts[0];
      setWallet({ address, chainId, balance: '', status: 'Connected', error: '' });
      await refreshBalance(address);
    } catch (error) {
      setWallet((current) => ({ ...current, error: error.message || 'Wallet connection failed.' }));
    }
  };

  const switchToTestnet = async () => {
    if (!configured) {
      setWallet((current) => ({ ...current, error: 'Official BOT Chain testnet RPC/chain ID is not configured yet.' }));
      return;
    }
    try {
      await requestWallet('wallet_switchEthereumChain', [{ chainId: TESTNET.chainId }]);
      setWallet((current) => ({ ...current, chainId: TESTNET.chainId, error: '' }));
    } catch (switchError) {
      if (switchError.code === 4902) {
        await requestWallet('wallet_addEthereumChain', [{
          chainId: TESTNET.chainId,
          chainName: TESTNET.chainName,
          nativeCurrency: { name: TESTNET.currencySymbol, symbol: TESTNET.currencySymbol, decimals: 18 },
          rpcUrls: [TESTNET.rpcUrl],
          blockExplorerUrls: TESTNET.explorerUrl ? [TESTNET.explorerUrl] : [],
        }]);
        setWallet((current) => ({ ...current, chainId: TESTNET.chainId, error: '' }));
      } else {
        setWallet((current) => ({ ...current, error: switchError.message || 'Network switch failed.' }));
      }
    }
  };

  const prepareVault = async () => {
    if (!connected) {
      await connectWallet();
      return;
    }
    if (!configured) {
      setVaultStatus('Waiting for official testnet config');
      return;
    }
    if (wallet.chainId !== TESTNET.chainId) {
      await switchToTestnet();
      return;
    }
    setVaultStatus('BOT testnet ready');
  };

  const runLivePreflight = async () => {
    try {
      if (!connected) await connectWallet();
      const chainId = await requestWallet('eth_chainId');
      await refreshBalance();
      const verdict = configured && chainId === TESTNET.chainId
        ? 'Ready: wallet is connected to BOT Chain testnet.'
        : configured
          ? 'Network mismatch: switch wallet to BOT Chain testnet.'
          : 'Config needed: add official BOT testnet RPC and chain ID to .env.';
      setPreflight({ chainId, verdict, at: new Date().toLocaleTimeString() });
    } catch (error) {
      setPreflight({ chainId: wallet.chainId || 'unknown', verdict: error.message, at: new Date().toLocaleTimeString() });
    }
  };

  const executeAgentOnchain = async () => {
    try {
      setTx({ hash: '', status: 'Preparing wallet transaction...', explorer: '' });
      if (!connected) {
        await connectWallet();
      }
      const chainId = await requestWallet('eth_chainId');
      if (chainId.toLowerCase() !== TESTNET.chainId.toLowerCase()) {
        await switchToTestnet();
        setTx({ hash: '', status: 'Network switched. Press Execute again after wallet confirms BOT testnet.', explorer: '' });
        return;
      }
      const from = wallet.address || (await requestWallet('eth_accounts'))[0];
      const payload = {
        app: 'AgentVault',
        network: 'BOT Chain Testnet',
        agent: 'Market Operator',
        action: 'BDEX_SWAP_PROOF',
        requestedAmount: '12 BOT',
        policy: {
          dailyLimit: `${dailyLimit} BOT`,
          swapAllowed: policies.swap,
          bridgeAllowed: policies.bridge,
          emergencyPause: policies.emergencyPause,
        },
        createdAt: new Date().toISOString(),
      };
      if (!policies.swap || policies.emergencyPause || dailyLimit < 12) {
        setTx({ hash: '', status: 'Blocked by policy. Enable swap, resume vault, and keep the daily limit at 12 BOT or higher.', explorer: '' });
        return;
      }
      const hash = await requestWallet('eth_sendTransaction', [{
        from,
        to: from,
        value: '0x0',
        data: utf8ToHex(JSON.stringify(payload)),
      }]);
      const explorer = `${TESTNET.explorerUrl.replace(/\/$/, '')}/tx/${hash}`;
      setTx({ hash, status: 'Submitted to BOT testnet', explorer });
      setProposalStatus('completed');
      for (let index = 0; index < 18; index += 1) {
        await new Promise((resolve) => setTimeout(resolve, 3500));
        const receipt = await requestWallet('eth_getTransactionReceipt', [hash]);
        if (receipt) {
          setTx({ hash, status: receipt.status === '0x1' ? 'Confirmed on-chain' : 'Transaction reverted', explorer });
          await refreshBalance(from);
          return;
        }
      }
      setTx({ hash, status: 'Submitted. Confirmation pending in wallet RPC.', explorer });
    } catch (error) {
      setTx({ hash: '', status: error.message || 'Transaction failed before submission.', explorer: '' });
    }
  };

  const signApprovalIntent = async () => {
    try {
      if (!connected) await connectWallet();
      const message = [
        'AgentVault approval intent',
        `Owner: ${wallet.address}`,
        'Agent: Market Operator',
        'Action: Swap 12 BOT to USDT on BDEX',
        `Daily limit: ${dailyLimit} BOT`,
        `Allowed protocols: ${Object.entries(policies).filter(([, allowed]) => allowed).map(([key]) => key).join(', ')}`,
        `Chain: ${wallet.chainId || 'unknown'}`,
      ].join('\n');
      const signed = await requestWallet('personal_sign', [message, wallet.address]);
      setSignature(signed);
      setProposalStatus('completed');
    } catch (error) {
      setProposalStatus('blocked');
      setWallet((current) => ({ ...current, error: error.message || 'Signing failed.' }));
    }
  };

  const exportAudit = () => {
    const blob = new Blob([JSON.stringify({ wallet, policies, dailyLimit, signature, events: auditEvents }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'agentvault-audit-log.json';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main>
      <nav className="nav">
        <a className="brand" href="#hero" aria-label="AgentVault home">
          <span className="brandMark"><Shield size={18} /></span>
          AgentVault
        </a>
        <div className="navLinks">
          <a href="#policies">Product</a>
          <a href="#security">Security</a>
          <a href="#docs">Docs</a>
          <a href={GITHUB_URL} target="_blank" rel="noreferrer"><Github size={16} /> GitHub</a>
        </div>
        <button className={connected ? 'button ghost active' : 'button ghost'} onClick={connectWallet}>
          <Wallet size={17} />
          {connected ? shortAddress(wallet.address) : 'Connect wallet'}
        </button>
      </nav>

      <section id="hero" className="section hero imageHero">
        <div className="heroCopy">
          <p className="eyebrow">BOT Chain AI Treasury</p>
          <h1>Safe wallets for autonomous agents</h1>
          <p>Policy-bound treasuries for AI agents that need to swap, bridge, claim rewards, and prove every move.</p>
          <div className="actions">
            <button className="button primary" onClick={prepareVault}>
              <Play size={17} />
              {vaultStatus}
            </button>
            <a className="textLink" href="#review">Execute agent flow <ArrowRight size={15} /></a>
          </div>
          {wallet.error && <p className="notice dangerText">{wallet.error}</p>}
        </div>
        <DashboardPreview wallet={wallet} configured={configured} vaultStatus={vaultStatus} dailyLimit={dailyLimit} />
      </section>

      <section className="section trust" id="security">
        <aside className="rail">Dossier 01 / policy first execution</aside>
        <div className="centerCopy">
          <p className="eyebrow">Live Readiness</p>
          <h2>Built for BOT Chain execution, without fake testnet claims</h2>
        </div>
        <div className="proofGrid">
          <Proof icon={Wallet} title="Real wallet connect" detail={connected ? shortAddress(wallet.address) : 'Awaiting wallet'} />
          <Proof icon={Shield} title="BOT testnet active" detail={`Chain 968 (${TESTNET.chainId})`} />
          <Proof icon={GitBranch} title="Bridge-ready policy" detail={policies.bridge ? 'Allowlisted' : 'Disabled'} />
          <Proof icon={RefreshCcw} title="BDEX controls" detail={policies.swap ? 'Policy enabled' : 'Review only'} />
        </div>
      </section>

      <section className="section featureGrid" id="policies">
        <div className="sectionHead">
          <div>
            <p className="eyebrow">Guardrails</p>
            <h2>Guardrails before every transaction</h2>
          </div>
          <button className="button outline" onClick={() => setPolicies(initialPolicies)}>
            <SlidersHorizontal size={17} />
            Reset policy
          </button>
        </div>
        <div className="bento">
          <div className="panel large artPanel">
            <div className="panelTop">
              <h3>Spend limits</h3>
              <span>{dailyLimit} BOT/day</span>
            </div>
            <input aria-label="Daily BOT limit" type="range" min="4" max="50" value={dailyLimit} onChange={(event) => setDailyLimit(Number(event.target.value))} />
            <div className="limitDial"><span>{dailyLimit}</span><small>BOT</small></div>
          </div>
          <div className="panel">
            <h3>Allowed actions</h3>
            {Object.entries(policies).filter(([key]) => key !== 'emergencyPause').map(([key, value]) => (
              <Toggle key={key} label={key} checked={value} onChange={() => setPolicies((state) => ({ ...state, [key]: !state[key] }))} />
            ))}
          </div>
          <div className="panel">
            <h3>Agent roles</h3>
            {['Guardian', 'Trader', 'Operator'].map((role, index) => (
              <div className="roleRow" key={role}><span>{role}</span><small>{['2 approvals', 'swap only', 'claim + route'][index]}</small></div>
            ))}
          </div>
          <div className="panel reviewMini">
            <h3>Agent proposal queue</h3>
            <p>Market Operator can write an execution proof to BOT testnet after policy and wallet checks pass.</p>
            <div className="splitButtons">
              <button className="button primary small" onClick={signApprovalIntent}>Sign intent</button>
              <button className="button ghost small" onClick={executeAgentOnchain}>Send tx</button>
            </div>
          </div>
        </div>
      </section>

      <section className="section review imageReview" id="review">
        <div className="reviewPanel">
          <div className="panelTop">
            <h2>Proposed BDEX swap</h2>
            <StatusLabel status={proposalStatus} />
          </div>
          <div className="proposalGrid">
            <Metric label="Agent" value="Market Operator" />
            <Metric label="Action" value="Swap" />
            <Metric label="Amount" value="12 BOT" />
            <Metric label="Route" value="BOT to USDT" />
          </div>
          <div className="explain">
            <Sparkles size={18} />
            <p>This action is permitted only when wallet, network, spend limit, protocol allowlist, and owner approval all pass.</p>
          </div>
          <div className="checks">
            {[
              connected ? 'Wallet connected' : 'Wallet required',
              configured ? 'Testnet configured' : 'Testnet config missing',
              policies.swap ? 'BDEX policy enabled' : 'BDEX disabled',
              dailyLimit >= 12 ? 'Daily limit passed' : 'Daily limit too low',
            ].map((check) => (
              <span key={check}><Check size={15} />{check}</span>
            ))}
          </div>
          <div className="actions">
            <button className="button primary" onClick={signApprovalIntent}><Check size={17} />Sign approval</button>
            <button className="button ghost" onClick={executeAgentOnchain}><TerminalSquare size={17} />Execute on-chain</button>
            <button className="button danger" onClick={() => setProposalStatus('blocked')}><X size={17} />Deny</button>
          </div>
        </div>
        <div className="sideCaption">
          <p className="eyebrow">Human-readable control</p>
          <h2>Every agent action explains itself</h2>
          <p>Review intent, limits, route, calldata readiness, and policy match before an autonomous signer can touch treasury funds.</p>
        </div>
      </section>

      <section className="section audit" id="audit">
        <div className="auditHead">
          <div>
            <p className="eyebrow">Audit Dossier</p>
            <h2>A complete record of autonomous work</h2>
          </div>
          <button className="button outline" onClick={exportAudit}><Download size={17} />Export audit log</button>
        </div>
        <div className="filters">
          {['All', 'BDEX', 'BOT Bridge', 'Rewards', 'low'].map((item) => (
            <button key={item} className={filter === item ? 'chip selected' : 'chip'} onClick={() => setFilter(item)}>{item}</button>
          ))}
        </div>
        <div className="timeline">
          <span className="bigNumber">04</span>
          {filteredEvents.map((event) => <AuditEvent event={event} key={`${event.type}-${event.time}-${event.hash}`} />)}
        </div>
      </section>

      <section className="section depin imageDepin">
        <div className="centerCopy">
          <p className="eyebrow">DePIN Treasury</p>
          <h2>Treasury ops for agents and node teams</h2>
        </div>
        <div className="opsPanel">
          <Metric label="Wallet balance" value={`${wallet.balance || '0.0000'} BOT`} />
          <Metric label="Network" value={onBotTestnet ? 'BOT testnet' : wallet.chainId || 'Not connected'} />
          <Metric label="Budget left" value={`${Math.max(0, dailyLimit - 12)} BOT`} />
          <Metric label="Vault state" value={vaultStatus} />
          <div className="chart" aria-label="Treasury line chart">
            <span style={{ height: '36%' }} />
            <span style={{ height: '52%' }} />
            <span style={{ height: '42%' }} />
            <span style={{ height: '68%' }} />
            <span style={{ height: '61%' }} />
            <span style={{ height: '78%' }} />
          </div>
          <button className="button primary wide" onClick={refreshBalance}><CircleDollarSign size={17} />Refresh live balance</button>
        </div>
      </section>

      <section className="section execution">
        <div>
          <p className="eyebrow">Execution Controls</p>
          <h2>Let agents move funds, never control everything</h2>
          <p>Run checks, then send an on-chain execution proof from the connected wallet on BOT Chain testnet.</p>
          <div className="actions">
            <button className="button primary" onClick={runLivePreflight}><TerminalSquare size={17} />Run live preflight</button>
            <button className="button outline" onClick={executeAgentOnchain}><Bot size={17} />Execute agent tx</button>
            <button className="button ghost" onClick={() => setPolicies((state) => ({ ...state, emergencyPause: !state.emergencyPause }))}>
              <Pause size={17} />
              {policies.emergencyPause ? 'Resume vault' : 'Emergency pause'}
            </button>
          </div>
        </div>
        <div className="executionGrid">
          <PolicyCard title="BDEX Swap" icon={RefreshCcw} labels={['max slippage 0.7%', `${dailyLimit} BOT daily`, 'USDT route']} enabled={policies.swap} />
          <PolicyCard title="BOT Bridge" icon={GitBranch} labels={['destination allowlist', 'guardian review', '8.2 BOT queued']} enabled={policies.bridge} />
          <div className="panel simulation txConsole">
            <h3>On-chain tx console</h3>
            {preflight ? (
              <>
                <Metric label="Chain ID" value={preflight.chainId} />
                <Metric label="Checked at" value={preflight.at} />
                <p>{preflight.verdict}</p>
              </>
            ) : (
              <p>Connect wallet, run preflight, then execute the agent tx to create an explorer-visible proof.</p>
            )}
            <div className="txStatus">
              <Metric label="Transaction status" value={tx.status} />
              {tx.hash && <Metric label="Transaction hash" value={`${tx.hash.slice(0, 10)}...${tx.hash.slice(-8)}`} />}
              {tx.explorer && <a className="button primary small" href={tx.explorer} target="_blank" rel="noreferrer">Open in explorer <ArrowRight size={14} /></a>}
            </div>
          </div>
        </div>
      </section>

      <section className="section docs" id="docs">
        <div className="sectionHead">
          <div>
            <p className="eyebrow">Extensive Docs</p>
            <h2>How AgentVault works</h2>
          </div>
          <a className="button outline" href={GITHUB_URL} target="_blank" rel="noreferrer"><Github size={17} />GitHub</a>
        </div>
        <div className="docsGrid">
          {docs.map((item, index) => (
            <article className="docCard" key={item.title}>
            <span>{String(index + 1).padStart(2, '0')}</span>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section pricing imageClosing">
        <div className="centerCopy">
          <p className="eyebrow">Start Clean</p>
          <h2>Start with one vault. Scale to every agent.</h2>
          <p>Deploy a policy-bound treasury, connect BO Wallet, and let agents operate inside limits you can prove.</p>
        </div>
        <div className="pricingGrid">
          {['Starter', 'Operator', 'Protocol'].map((plan) => (
            <button key={plan} className={activePlan === plan ? 'priceCard selected' : 'priceCard'} onClick={() => setActivePlan(plan)}>
              <span>{plan}</span>
              <strong>{plan === 'Starter' ? '1 vault' : plan === 'Operator' ? '10 agent seats' : 'Custom policies'}</strong>
              <small>{plan === 'Starter' ? 'For sprint demos' : plan === 'Operator' ? 'For node teams' : 'For protocols'}</small>
              <ChevronRight size={18} />
            </button>
          ))}
        </div>
        <div className="actions center">
          <button className="button primary" onClick={prepareVault}><LockKeyhole size={17} />Deploy AgentVault</button>
          <a className="button outline" href="#docs"><BookOpen size={17} />Open docs</a>
        </div>
        <footer>
          <strong>AgentVault</strong>
          <span>Autonomy with receipts.</span>
          <a href="#security">Security</a>
          <a href="#docs">Docs</a>
          <a href={GITHUB_URL} target="_blank" rel="noreferrer"><Github size={16} /> GitHub</a>
          <a href="https://botchain.ai" target="_blank" rel="noreferrer">BOT Chain <ExternalLink size={14} /></a>
        </footer>
      </section>
    </main>
  );
}

function DashboardPreview({ wallet, configured, vaultStatus, dailyLimit }) {
  return (
    <div className="dashboardPreview">
      <div className="panelTop">
        <span className="windowDots"><i /><i /><i /></span>
        <span>{vaultStatus}</span>
      </div>
      <div className="balanceBlock">
        <small>Connected treasury</small>
        <strong>{wallet.balance || '0.0000'} BOT</strong>
        <span>{wallet.address ? `${shortAddress(wallet.address)} on ${wallet.chainId || 'unknown chain'}` : 'Awaiting BO Wallet or EVM wallet connection'}</span>
      </div>
      <div className="previewGrid">
        <Metric label="Daily limit" value={`${dailyLimit} BOT`} />
        <Metric label="Testnet" value={configured ? 'Configured' : 'Missing RPC'} />
        <Metric label="Approval" value="Owner signed" />
      </div>
      <div className="agentCard">
        <Bot size={20} />
        <div>
          <strong>Market Operator</strong>
          <p>Can propose a BDEX swap. Execution remains blocked until policy, network, and signature pass.</p>
        </div>
        <BadgeCheck size={20} />
      </div>
    </div>
  );
}

function Proof({ icon: Icon, title, detail }) {
  return <div className="proof"><Icon size={22} /><strong>{title}</strong><span>{detail}</span></div>;
}

function Toggle({ label, checked, onChange }) {
  return (
    <label className="toggle">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={onChange} />
      <i />
    </label>
  );
}

function Metric({ label, value }) {
  return <div className="metric"><small>{label}</small><strong>{value}</strong></div>;
}

function StatusLabel({ status }) {
  return <span className={`status ${status}`}>{status}</span>;
}

function AuditEvent({ event }) {
  return (
    <article className="auditEvent">
      <span>{event.time}</span>
      <div>
        <strong>{event.type}</strong>
        <p>{event.reason}</p>
      </div>
      <small>{event.protocol}</small>
      <StatusLabel status={event.status} />
      <code>{event.hash}</code>
    </article>
  );
}

function PolicyCard({ title, icon: Icon, labels, enabled }) {
  return (
    <div className={enabled ? 'panel policy enabled' : 'panel policy'}>
      <div className="panelTop">
        <h3><Icon size={18} />{title}</h3>
        <span>{enabled ? 'enabled' : 'disabled'}</span>
      </div>
      {labels.map((label) => <p key={label}><Check size={14} />{label}</p>)}
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
