import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Activity,
  ArrowRight,
  BadgeCheck,
  Bell,
  BookOpen,
  Bot,
  Check,
  ChevronRight,
  CircleDollarSign,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Fuel,
  Github,
  GitBranch,
  Gauge,
  LockKeyhole,
  Pause,
  Play,
  Rocket,
  RefreshCcw,
  Send,
  Shield,
  SlidersHorizontal,
  Sparkles,
  TerminalSquare,
  UserRound,
  Wallet,
  X,
} from 'lucide-react';
import vaultArtifact from '../artifacts/AgentVault.json';
import './styles.css';

const GITHUB_URL = 'https://github.com/0xNexuz/agent-vault';
const AGENT_STATUS_URL = import.meta.env.VITE_AGENT_STATUS_URL || 'https://agent-vault-1.onrender.com/status';
const WORKER_BASE_URL = AGENT_STATUS_URL.replace(/\/(?:api\/)?status\/?$/, '');
const FAUCET_URL = 'https://faucet.botchain.ai';
const TESTNET = {
  chainId: import.meta.env.VITE_BOT_TESTNET_CHAIN_ID || '0x3c8',
  chainName: import.meta.env.VITE_BOT_TESTNET_NAME || 'BOT Chain Testnet',
  rpcUrl: import.meta.env.VITE_BOT_TESTNET_RPC_URL || 'https://rpc.bohr.life',
  explorerUrl: import.meta.env.VITE_BOT_TESTNET_EXPLORER_URL || 'https://scan.bohr.life',
  currencySymbol: import.meta.env.VITE_BOT_TESTNET_SYMBOL || 'BOT',
};

const VERIFIED_INTEGRATIONS = [
  {
    id: 'bdex-v2',
    name: 'BDEX V2 Router',
    address: '0xD6425a02f0845B8D99e349C34D2E7A576E177345',
    type: 'Swap',
    explorerUrl: 'https://scan.bohr.life/address/0xD6425a02f0845B8D99e349C34D2E7A576E177345',
  },
  {
    id: 'bdex-v3',
    name: 'BDEX V3 Router',
    address: '0x07032d47A1b9f8460cBeE9dC17c1d3E438693929',
    type: 'Swap',
    explorerUrl: 'https://scan.bohr.life/address/0x07032d47A1b9f8460cBeE9dC17c1d3E438693929',
  },
  {
    id: 'bridge',
    name: 'BOT Bridge Router',
    address: '0x6239404Aa276ba68486E2Fa40E90CDd36ff8ec3A',
    type: 'Bridge',
    explorerUrl: 'https://scan.bohr.life/address/0x6239404Aa276ba68486E2Fa40E90CDd36ff8ec3A',
  },
];

const policyTemplates = [
  { id: 'trader', name: 'Trader', description: 'BDEX swaps only, conservative daily budget.', dailyLimit: 20, policies: { swap: true, bridge: false, transfer: false, stake: false, emergencyPause: false }, actionId: 'swap' },
  { id: 'guardian', name: 'Bridge Guardian', description: 'Bridge review with a narrow routing allowance.', dailyLimit: 12, policies: { swap: false, bridge: true, transfer: false, stake: false, emergencyPause: false }, actionId: 'bridge' },
  { id: 'rewards', name: 'Rewards Operator', description: 'Claims and returns rewards to treasury.', dailyLimit: 8, policies: { swap: false, bridge: false, transfer: false, stake: true, emergencyPause: false }, actionId: 'claim' },
  { id: 'dao', name: 'DAO Ops', description: 'Multi-path treasury operations with a lower cap.', dailyLimit: 15, policies: { swap: true, bridge: false, transfer: true, stake: true, emergencyPause: false }, actionId: 'transfer' },
];

const initialPolicies = {
  swap: true,
  bridge: true,
  transfer: false,
  stake: true,
  emergencyPause: false,
};

const agentRoles = [
  {
    id: 'guardian',
    name: 'Guardian',
    permission: '2 approvals',
    action: 'Bridge',
    protocol: 'BOT Bridge',
    route: 'BOT to Base',
    amount: 8,
    policyKey: 'bridge',
    risk: 'medium',
    description: 'Routes funds only after guardian review and destination-chain allowlist checks.',
  },
  {
    id: 'trader',
    name: 'Trader',
    permission: 'Swap only',
    action: 'Swap',
    protocol: 'BDEX',
    route: 'BOT to USDT',
    amount: 12,
    policyKey: 'swap',
    risk: 'low',
    description: 'Rebalances BOT into USDT when spend limits and BDEX policy are enabled.',
  },
  {
    id: 'operator',
    name: 'Operator',
    permission: 'Claim + route',
    action: 'Claim',
    protocol: 'Rewards',
    route: 'Rewards to treasury',
    amount: 5,
    policyKey: 'stake',
    risk: 'low',
    description: 'Claims rewards and routes a configured share back to treasury operations.',
  },
];

const actionOptions = [
  { id: 'swap', roleId: 'trader', label: 'Swap', protocol: 'BDEX', route: 'BOT to USDT', policyKey: 'swap', defaultAmount: 12, risk: 'low' },
  { id: 'bridge', roleId: 'guardian', label: 'Bridge', protocol: 'BOT Bridge', route: 'BOT to Base', policyKey: 'bridge', defaultAmount: 8, risk: 'medium' },
  { id: 'claim', roleId: 'operator', label: 'Claim', protocol: 'Rewards', route: 'Rewards to treasury', policyKey: 'stake', defaultAmount: 5, risk: 'low' },
  { id: 'transfer', roleId: 'trader', label: 'Transfer', protocol: 'Treasury', route: 'Treasury to ops', policyKey: 'transfer', defaultAmount: 3, risk: 'high' },
];

const docs = [
  {
    title: 'Vault model',
    body: 'AgentVault is designed as an owner-controlled smart account: the owner keeps custody, while agent addresses can execute only actions allowed by policy. Policies cover daily spend, per-action limits, allowed protocols, destination chains, and emergency pause.',
  },
  {
    title: 'Approval flow',
    body: 'An agent proposes an action, the UI runs a wallet and network preflight, then the owner signs an approval intent. The transaction monitor keeps the resulting vault activity visible from submission through confirmation.',
  },
  {
    title: 'Agent runtime',
    body: 'Agents are bounded operators. The hosted worker signs from the agent wallet, submits policy-scoped vault calls, and publishes the latest transaction hash, block number, and explorer link for review.',
  },
  {
    title: 'BOT testnet connected',
    body: 'AgentVault is configured for BOT Chain testnet: chain ID 968, RPC https://rpc.bohr.life, explorer https://scan.bohr.life, native token BOT. Wallet switching and balance checks run against this network.',
  },
];

const marketingFeatures = [
  {
    icon: Shield,
    title: 'Policy-first custody',
    body: 'Owners keep control while agents execute only approved actions, limits, targets, and routes.',
  },
  {
    icon: Activity,
    title: 'Public execution proof',
    body: 'Every confirmed action is indexed with block, hash, agent wallet, and explorer receipt.',
  },
  {
    icon: Gauge,
    title: 'Operator health',
    body: 'Gas, heartbeat, vault code, and transaction history roll into a visible agent score.',
  },
];

const marketingFlow = [
  ['01', 'Create a vault', 'Deploy an owner-controlled AgentVault on BOT Chain testnet.'],
  ['02', 'Choose policy', 'Pick Trader, Bridge Guardian, Rewards Operator, or DAO Ops.'],
  ['03', 'Approve intent', 'Sign once for the policy boundary the agent must obey.'],
  ['04', 'Watch receipts', 'Track live autonomous executions without keeping a wallet connected.'],
];

const marketingUseCases = [
  ['DAO treasury', 'Let approved agents rebalance and route funds within spend limits.'],
  ['DePIN rewards', 'Claim rewards, refill operators, and prove each payout path.'],
  ['Protocol ops', 'Run testnet swap and bridge flows with public activity links.'],
];

const auditTemplates = [
  {
    type: 'Swap proposal',
    roleId: 'trader',
    actionId: 'swap',
    agent: 'Trader',
    protocol: 'BDEX',
    risk: 'low',
    status: 'ready',
    hash: 'owner review',
    reason: 'Rebalance BOT into USDT when BDEX policy and daily limits allow it.',
    time: 'Live',
  },
  {
    type: 'Bridge proposal',
    roleId: 'guardian',
    actionId: 'bridge',
    agent: 'Bridge Runner',
    protocol: 'BOT Bridge',
    risk: 'medium',
    status: 'review',
    hash: 'owner review',
    reason: 'Move funds only to allowlisted destination chains after owner signature.',
    time: 'Live',
  },
  {
    type: 'Reward claim',
    roleId: 'operator',
    actionId: 'claim',
    agent: 'Node Operator',
    protocol: 'Rewards',
    risk: 'low',
    status: 'ready',
    hash: 'owner review',
    reason: 'Claim rewards and route a configured share to operations.',
    time: 'Live',
  },
  {
    type: 'Transfer blocked',
    roleId: 'trader',
    actionId: 'transfer',
    agent: 'Trader',
    protocol: 'Treasury',
    risk: 'high',
    status: 'blocked',
    hash: 'policy blocked',
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

function isEvmAddress(address) {
  return /^0x[0-9a-fA-F]{40}$/.test(String(address || ''));
}

function formatBalance(hexBalance) {
  if (!hexBalance) return '0.0000';
  const wei = BigInt(hexBalance);
  const whole = wei / 10n ** 18n;
  const fraction = (wei % 10n ** 18n).toString().padStart(18, '0').slice(0, 4);
  return `${whole}.${fraction}`;
}

function actionPhrase(action) {
  if (action === 'Bridge') return 'bridge funds';
  if (action === 'Claim') return 'claim rewards';
  return action.toLowerCase();
}

function proposalTitle(proposal) {
  if (proposal.action === 'Bridge') return `Proposed ${proposal.protocol} route`;
  if (proposal.action === 'Claim') return 'Proposed reward claim';
  return `Proposed ${proposal.protocol} ${proposal.action.toLowerCase()}`;
}

function policyTitle(proposal) {
  return proposal.protocol.toLowerCase().includes(proposal.action.toLowerCase())
    ? proposal.protocol
    : `${proposal.protocol} ${proposal.action}`;
}

function normalizeAgentStatus(status) {
  const proof = String(status?.proof || '')
    .replace('Background agent', 'Hosted agent')
    .replace('proof transaction', 'vault transaction')
    .replace('on-chain AgentExecution proof', 'AgentExecution transaction')
    .replace(/No .+VAULT_ADDRESS\./, 'Worker online. Add the agent key and vault address in the host secrets to begin on-chain execution.')
    .replace(/Agent worker .+VAULT_ADDRESS\./, 'Worker online. Add the agent key and vault address in the host secrets to begin on-chain execution.');

  return { ...status, proof };
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
  const [agentStatus, setAgentStatus] = useState({
    status: 'checking',
    proof: 'Checking hosted worker status.',
    lastHeartbeatAt: '',
    lastRunAt: '',
    lastTxHash: '',
    lastExplorerUrl: '',
    vaultAddress: '',
    agentAddress: '',
    lastBlockNumber: '',
    lastError: '',
  });
  const [signature, setSignature] = useState('');
  const [bundleSignature, setBundleSignature] = useState('');
  const [activePlan, setActivePlan] = useState('Operator');
  const [selectedRoleId, setSelectedRoleId] = useState('trader');
  const [selectedActionId, setSelectedActionId] = useState('swap');
  const [actionAmount, setActionAmount] = useState(12);
  const [selectedAuditType, setSelectedAuditType] = useState('Swap proposal');
  const [balanceStatus, setBalanceStatus] = useState('Connect wallet to read balance.');
  const [agentRefreshStatus, setAgentRefreshStatus] = useState('Auto-refreshes every 10 seconds.');
  const [productTab, setProductTab] = useState('overview');
  const [selectedTemplateId, setSelectedTemplateId] = useState('trader');
  const [deployForm, setDeployForm] = useState({ agentAddress: '', dailyLimit: 20 });
  const [deployment, setDeployment] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('agentvault-deployment') || 'null') || { status: 'Ready to deploy', address: '', hash: '', explorerUrl: '' };
    } catch {
      return { status: 'Ready to deploy', address: '', hash: '', explorerUrl: '' };
    }
  });
  const [activityFeed, setActivityFeed] = useState([]);
  const [vaultSnapshot, setVaultSnapshot] = useState(null);
  const [productRefreshStatus, setProductRefreshStatus] = useState('Loading indexed vault data.');
  const [browserAlerts, setBrowserAlerts] = useState(() => localStorage.getItem('agentvault-browser-alerts') === 'on');
  const [alertStatus, setAlertStatus] = useState('Browser alerts are off.');
  const [shareStatus, setShareStatus] = useState('Copy public vault link');
  const [profileName, setProfileName] = useState(() => localStorage.getItem('agentvault-profile-name') || 'Vault Operator');
  const [profileStatus, setProfileStatus] = useState('Profile is stored on this device.');
  const [pageView, setPageView] = useState(() => (window.location.hash === '#docs' ? 'docs' : 'app'));
  const [referralStats, setReferralStats] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('agentvault-referral-stats') || 'null') || {
        linksCopied: 0,
        referredSessions: 0,
        lastReferral: '',
        lastReferralAt: '',
      };
    } catch {
      return { linksCopied: 0, referredSessions: 0, lastReferral: '', lastReferralAt: '' };
    }
  });
  const lastNotifiedTx = useRef('');

  const connected = Boolean(wallet.address);
  const configured = hasTestnetConfig();
  const onBotTestnet = wallet.chainId?.toLowerCase() === TESTNET.chainId.toLowerCase();
  const selectedRole = agentRoles.find((role) => role.id === selectedRoleId) || agentRoles[1];
  const selectedAction = actionOptions.find((action) => action.id === selectedActionId) || actionOptions[0];
  const selectedTemplate = policyTemplates.find((template) => template.id === selectedTemplateId) || policyTemplates[0];
  const selectedProposal = {
    agent: selectedRole.name,
    action: selectedAction.label,
    protocol: selectedAction.protocol,
    route: selectedAction.route,
    amount: actionAmount,
    policyKey: selectedAction.policyKey,
    risk: selectedAction.risk,
    reason: selectedRole.description,
  };
  const dailyLimitPercent = Math.min(100, Math.max(0, (dailyLimit / 50) * 100));
  const query = new URLSearchParams(window.location.search);
  const referralSource = query.get('ref') || '';
  const requestedVaultAddress = query.get('vault') || '';
  const publicVaultAddress = requestedVaultAddress || deployment.address || vaultSnapshot?.vaultAddress || agentStatus.vaultAddress;
  const referralCode = wallet.address || agentStatus.agentAddress || profileName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'agentvault';
  const referralLink = (() => {
    const url = new URL(window.location.href);
    url.search = '';
    url.hash = 'product';
    url.searchParams.set('ref', referralCode);
    if (publicVaultAddress) url.searchParams.set('vault', publicVaultAddress);
    return url.toString();
  })();
  const gasSnapshot = vaultSnapshot?.gas || agentStatus.gas || { status: 'checking', balanceBot: '0.0000', thresholdBot: '0.0500', canExecute: false };
  const agentScore = vaultSnapshot?.agentScore ?? agentStatus.agentScore ?? (agentStatus.status === 'active' ? 70 : 0);
  const operatorLevel = agentScore >= 90 ? 'Autonomous Architect' : agentScore >= 70 ? 'Vault Commander' : agentScore >= 40 ? 'Policy Operator' : 'Rookie Agent';

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
    const handleHashChange = () => setPageView(window.location.hash === '#docs' ? 'docs' : 'app');
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  useEffect(() => {
    if (!referralSource || referralStats.lastReferral === referralSource) return;
    setReferralStats((current) => {
      const next = {
        ...current,
        referredSessions: current.referredSessions + 1,
        lastReferral: referralSource,
        lastReferralAt: new Date().toISOString(),
      };
      localStorage.setItem('agentvault-referral-stats', JSON.stringify(next));
      return next;
    });
  }, [referralSource, referralStats.lastReferral]);

  const refreshAgentStatus = async () => {
    if (!AGENT_STATUS_URL) return;
    setAgentRefreshStatus('Refreshing hosted worker...');
    try {
      const response = await fetch(AGENT_STATUS_URL, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Worker returned ${response.status}`);
      const nextStatus = normalizeAgentStatus(await response.json());
      setAgentStatus(nextStatus);
      setAgentRefreshStatus(`Updated ${new Date().toLocaleTimeString()}`);
    } catch (error) {
      setAgentStatus({
        status: 'offline',
        proof: `Hosted worker status is not reachable yet: ${error.message}`,
        lastHeartbeatAt: '',
        lastRunAt: '',
        lastTxHash: '',
        lastExplorerUrl: '',
        vaultAddress: '',
        agentAddress: '',
        lastBlockNumber: '',
        lastError: error.message,
      });
      setAgentRefreshStatus('Hosted worker refresh failed.');
    }
  };

  useEffect(() => {
    let cancelled = false;
    async function loadAgentStatus() {
      if (!AGENT_STATUS_URL) return;
      try {
        const response = await fetch(AGENT_STATUS_URL, { cache: 'no-store' });
        if (!response.ok) throw new Error(`Worker returned ${response.status}`);
        const nextStatus = normalizeAgentStatus(await response.json());
        if (!cancelled) {
          setAgentStatus(nextStatus);
          setAgentRefreshStatus(`Updated ${new Date().toLocaleTimeString()}`);
        }
      } catch (error) {
        if (!cancelled) {
          setAgentStatus({
            status: 'offline',
            proof: `Hosted worker status is not reachable yet: ${error.message}`,
            lastHeartbeatAt: '',
            lastRunAt: '',
            lastTxHash: '',
            lastExplorerUrl: '',
            vaultAddress: '',
            agentAddress: '',
            lastBlockNumber: '',
            lastError: error.message,
          });
          setAgentRefreshStatus('Hosted worker refresh failed.');
        }
      }
    }
    loadAgentStatus();
    const interval = setInterval(loadAgentStatus, 10000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const refreshProductData = async () => {
    setProductRefreshStatus('Refreshing indexed vault data...');
    const addressQuery = requestedVaultAddress && isEvmAddress(requestedVaultAddress)
      ? `?address=${encodeURIComponent(requestedVaultAddress)}`
      : '';
    const [activityResult, vaultResult] = await Promise.allSettled([
      fetch(`${WORKER_BASE_URL}/api/activity${addressQuery}`, { cache: 'no-store' }).then((response) => {
        if (!response.ok) throw new Error(`Activity API returned ${response.status}`);
        return response.json();
      }),
      fetch(`${WORKER_BASE_URL}/api/vault${addressQuery}`, { cache: 'no-store' }).then((response) => {
        if (!response.ok) throw new Error(`Vault API returned ${response.status}`);
        return response.json();
      }),
    ]);
    if (activityResult.status === 'fulfilled') setActivityFeed(activityResult.value.events || []);
    if (vaultResult.status === 'fulfilled') setVaultSnapshot(vaultResult.value);
    const available = activityResult.status === 'fulfilled' || vaultResult.status === 'fulfilled';
    setProductRefreshStatus(available ? `Indexed ${new Date().toLocaleTimeString()}` : 'Indexer is updating with the latest worker release.');
  };

  useEffect(() => {
    refreshProductData();
    const interval = setInterval(refreshProductData, 15000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const newest = activityFeed[0];
    if (!browserAlerts || !newest?.transactionHash || newest.transactionHash === lastNotifiedTx.current) return;
    lastNotifiedTx.current = newest.transactionHash;
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('AgentVault execution confirmed', {
        body: `${Number(newest.amountBot || 0).toFixed(2)} BOT policy execution in block ${newest.blockNumber}.`,
        icon: '/favicon.svg',
      });
    }
  }, [activityFeed, browserAlerts]);

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

  useEffect(() => {
    if (proposalStatus === 'completed') return;
    const allowed = policies[selectedProposal.policyKey] && !policies.emergencyPause && dailyLimit >= selectedProposal.amount;
    const nextStatus = allowed ? 'ready' : 'blocked';
    if (proposalStatus !== nextStatus) setProposalStatus(nextStatus);
  }, [dailyLimit, policies, proposalStatus, selectedProposal.amount, selectedProposal.policyKey]);

  const selectRole = (role) => {
    const matchingAction = actionOptions.find((action) => action.label === role.action) || actionOptions[0];
    setSelectedRoleId(role.id);
    setSelectedActionId(matchingAction.id);
    setActionAmount(role.amount);
    setSelectedAuditType(`${matchingAction.label === 'Claim' ? 'Reward claim' : `${matchingAction.label} proposal`}`);
    setProposalStatus(policies[matchingAction.policyKey] ? 'ready' : 'blocked');
  };

  const selectAction = (action) => {
    const matchingRole = agentRoles.find((role) => role.id === action.roleId);
    if (matchingRole) setSelectedRoleId(matchingRole.id);
    setSelectedActionId(action.id);
    setActionAmount(action.defaultAmount);
    setSelectedAuditType(`${action.label === 'Claim' ? 'Reward claim' : `${action.label} proposal`}`);
    setProposalStatus(policies[action.policyKey] ? 'ready' : 'blocked');
  };

  const loadAuditProposal = (event) => {
    const role = agentRoles.find((item) => item.id === event.roleId);
    const action = actionOptions.find((item) => item.id === event.actionId);
    if (role) setSelectedRoleId(role.id);
    if (action) {
      setSelectedActionId(action.id);
      setActionAmount(action.defaultAmount);
      setProposalStatus(policies[action.policyKey] && dailyLimit >= action.defaultAmount ? 'ready' : 'blocked');
    }
    setSelectedAuditType(event.type);
    document.getElementById('review')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const enabledPolicySummary = useMemo(() => actionOptions
    .filter((action) => policies[action.policyKey])
    .map((action) => {
      const role = agentRoles.find((item) => item.id === action.roleId);
      return `${role?.name || 'Agent'}: ${action.label} ${action.defaultAmount} BOT via ${action.protocol}`;
    }), [policies]);

  const auditEvents = useMemo(() => {
    const liveEvents = [];
    if (tx.hash) {
      liveEvents.push({
        type: 'Wallet execution submitted',
        agent: selectedProposal.agent,
        protocol: selectedProposal.protocol,
        risk: selectedProposal.risk,
        status: tx.status === 'Confirmed on-chain' ? 'completed' : 'review',
        hash: `${tx.hash.slice(0, 10)}...${tx.hash.slice(-6)}`,
        reason: `Connected wallet submitted ${selectedProposal.action.toLowerCase()} for ${selectedProposal.amount} BOT via ${selectedProposal.protocol}.`,
        time: 'Now',
        explorerUrl: tx.explorer,
      });
    }
    if (agentStatus.lastTxHash) {
      liveEvents.push({
        type: 'Autonomous agent transaction',
        agent: agentStatus.agentAddress ? shortAddress(agentStatus.agentAddress) : 'Hosted worker',
        protocol: 'AgentVault',
        risk: 'low',
        status: agentStatus.lastBlockNumber ? 'completed' : 'review',
        hash: `${agentStatus.lastTxHash.slice(0, 10)}...${agentStatus.lastTxHash.slice(-6)}`,
        reason: `Hosted worker executed through the vault${agentStatus.lastBlockNumber ? ` in block ${agentStatus.lastBlockNumber}` : ''}.`,
        time: agentStatus.lastRunAt ? new Date(agentStatus.lastRunAt).toLocaleTimeString() : 'Live',
        explorerUrl: agentStatus.lastExplorerUrl,
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
          reason: `Owner approved ${selectedProposal.agent} to ${selectedProposal.action.toLowerCase()} ${selectedProposal.amount} BOT on ${selectedProposal.protocol}.`,
          time: 'Now',
        },
      );
    }
    if (bundleSignature) {
      liveEvents.push({
        type: 'Policy bundle signed',
        agent: 'Owner Wallet',
        protocol: 'AgentVault',
        risk: 'low',
        status: 'completed',
        hash: `${bundleSignature.slice(0, 10)}...${bundleSignature.slice(-6)}`,
        reason: `Owner approved ${enabledPolicySummary.length} enabled policy paths in one signature.`,
        time: 'Now',
      });
    }
    const proposalEvents = auditTemplates.map((event) => {
      const action = actionOptions.find((item) => item.id === event.actionId);
      const isAllowed = action ? policies[action.policyKey] && !policies.emergencyPause && dailyLimit >= action.defaultAmount : false;
      return {
        ...event,
        status: event.status === 'blocked' || !isAllowed ? 'blocked' : event.status,
        hash: isAllowed ? 'load proposal' : 'policy blocked',
      };
    });
    return [
      ...liveEvents,
      ...proposalEvents,
    ];
  }, [agentStatus, bundleSignature, dailyLimit, enabledPolicySummary.length, policies, selectedProposal, signature, tx.explorer, tx.hash, tx.status]);

  const filteredEvents = useMemo(() => {
    if (filter === 'All') return auditEvents;
    return auditEvents.filter((event) => event.protocol === filter || event.risk === filter.toLowerCase());
  }, [auditEvents, filter]);

  const refreshBalance = async (address = wallet.address) => {
    try {
      const targetAddress = address || wallet.address;
      if (!targetAddress) {
        setBalanceStatus('Connect wallet first.');
        await connectWallet();
        return;
      }
      setBalanceStatus('Refreshing wallet balance...');
      const balance = await requestWallet('eth_getBalance', [targetAddress, 'latest']);
      setWallet((current) => ({ ...current, balance: formatBalance(balance), error: '' }));
      setBalanceStatus(`Balance updated ${new Date().toLocaleTimeString()}`);
    } catch (error) {
      setWallet((current) => ({ ...current, error: error.message || 'Balance refresh failed.' }));
      setBalanceStatus(error.message || 'Balance refresh failed.');
    }
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

  const disconnectWallet = () => {
    setWallet({ address: '', chainId: '', balance: '', status: 'Disconnected', error: '' });
    setVaultStatus('Connect BOT testnet');
    setPreflight(null);
    setTx({ hash: '', status: 'Wallet disconnected. Hosted agent status still refreshes below.', explorer: '' });
    setBalanceStatus('Wallet disconnected. Agent activity is still live.');
  };

  const switchToTestnet = async () => {
    if (!configured) {
      setWallet((current) => ({ ...current, error: 'BOT Chain testnet settings are unavailable in this deployment.' }));
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
      setVaultStatus('Waiting for testnet settings');
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
          : 'BOT Chain testnet settings are unavailable in this deployment.';
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
      if (!policies[selectedProposal.policyKey] || policies.emergencyPause || dailyLimit < selectedProposal.amount) {
        setTx({ hash: '', status: `Blocked by policy. Enable ${selectedProposal.action.toLowerCase()}, resume vault, and keep the daily limit at ${selectedProposal.amount} BOT or higher.`, explorer: '' });
        return;
      }
      const hash = await requestWallet('eth_sendTransaction', [{
        from,
        to: from,
        value: '0x0',
      }]);
      const explorer = `${TESTNET.explorerUrl.replace(/\/$/, '')}/tx/${hash}`;
      setTx({ hash, status: 'Owner wallet tx submitted to BOT testnet', explorer });
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
        `Agent: ${selectedProposal.agent}`,
        `Action: ${selectedProposal.action} ${selectedProposal.amount} BOT through ${selectedProposal.protocol}`,
        `Route: ${selectedProposal.route}`,
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

  const signPolicyBundle = async () => {
    try {
      if (!connected) await connectWallet();
      const message = [
        'AgentVault policy bundle approval',
        `Owner: ${wallet.address}`,
        `Daily limit: ${dailyLimit} BOT`,
        `Emergency pause: ${policies.emergencyPause ? 'on' : 'off'}`,
        'Enabled policy paths:',
        ...(enabledPolicySummary.length ? enabledPolicySummary.map((item) => `- ${item}`) : ['- none']),
        `Chain: ${wallet.chainId || 'unknown'}`,
        `Issued: ${new Date().toISOString()}`,
      ].join('\n');
      const signed = await requestWallet('personal_sign', [message, wallet.address]);
      setBundleSignature(signed);
      setProposalStatus('completed');
    } catch (error) {
      setWallet((current) => ({ ...current, error: error.message || 'Policy bundle signing failed.' }));
    }
  };

  const applyPolicyTemplate = (template) => {
    const action = actionOptions.find((item) => item.id === template.actionId) || actionOptions[0];
    setSelectedTemplateId(template.id);
    setPolicies(template.policies);
    setDailyLimit(template.dailyLimit);
    setDeployForm((current) => ({ ...current, dailyLimit: template.dailyLimit }));
    selectAction(action);
    setProposalStatus(template.policies[action.policyKey] ? 'ready' : 'blocked');
  };

  const deployNewVault = async () => {
    try {
      const { ethers } = await import('ethers');
      if (!window.ethereum) throw new Error('Install BO Wallet or an EVM-compatible wallet first.');
      setDeployment({ status: 'Checking wallet and network...', address: '', hash: '', explorerUrl: '' });
      const accounts = await requestWallet('eth_requestAccounts');
      let chainId = await requestWallet('eth_chainId');
      if (chainId.toLowerCase() !== TESTNET.chainId.toLowerCase()) {
        await switchToTestnet();
        chainId = await requestWallet('eth_chainId');
      }
      if (chainId.toLowerCase() !== TESTNET.chainId.toLowerCase()) throw new Error('Switch the wallet to BOT Chain testnet and retry.');
      const agentAddress = deployForm.agentAddress || agentStatus.agentAddress || accounts[0];
      if (!ethers.isAddress(agentAddress)) throw new Error('Enter a valid agent wallet address.');
      const limit = Number(deployForm.dailyLimit);
      if (!Number.isFinite(limit) || limit <= 0) throw new Error('Daily limit must be greater than zero.');

      const browserProvider = new ethers.BrowserProvider(window.ethereum);
      const signer = await browserProvider.getSigner();
      const bytecode = vaultArtifact.evm?.bytecode?.object;
      if (!bytecode) throw new Error('Vault deployment bytecode is unavailable.');
      const factory = new ethers.ContractFactory(vaultArtifact.abi, bytecode, signer);
      const contract = await factory.deploy(agentAddress, ethers.parseEther(String(limit)));
      const deploymentTx = contract.deploymentTransaction();
      setDeployment({
        status: 'Deployment submitted. Waiting for confirmation...',
        address: '',
        hash: deploymentTx?.hash || '',
        explorerUrl: deploymentTx?.hash ? `${TESTNET.explorerUrl}/tx/${deploymentTx.hash}` : '',
      });
      await contract.waitForDeployment();
      const address = await contract.getAddress();

      if (selectedTemplate.id === 'trader') {
        setDeployment((current) => ({ ...current, address, status: 'Vault confirmed. Configuring verified BDEX V2 policy...' }));
        const selector = ethers.id('swapExactETHForTokens(uint256,address[],address,uint256)').slice(0, 10);
        const configTx = await contract.configureAction(
          ethers.id('BDEX_SWAP_V2'),
          VERIFIED_INTEGRATIONS[0].address,
          selector,
          true,
        );
        await configTx.wait();
      }

      const nextDeployment = {
        status: selectedTemplate.id === 'trader' ? 'Vault deployed with verified BDEX V2 policy' : 'Vault deployed on BOT Chain testnet',
        address,
        hash: deploymentTx?.hash || '',
        explorerUrl: `${TESTNET.explorerUrl}/address/${address}`,
      };
      setDeployment(nextDeployment);
      localStorage.setItem('agentvault-deployment', JSON.stringify(nextDeployment));
      setWallet({ address: accounts[0], chainId, balance: wallet.balance, status: 'Connected', error: '' });
    } catch (error) {
      setDeployment((current) => ({ ...current, status: error.shortMessage || error.message || 'Vault deployment failed.' }));
    }
  };

  const toggleBrowserAlerts = async () => {
    if (!('Notification' in window)) {
      setAlertStatus('This browser does not support system notifications.');
      return;
    }
    if (browserAlerts) {
      setBrowserAlerts(false);
      localStorage.setItem('agentvault-browser-alerts', 'off');
      setAlertStatus('Browser alerts are off.');
      return;
    }
    const permission = await Notification.requestPermission();
    const enabled = permission === 'granted';
    setBrowserAlerts(enabled);
    localStorage.setItem('agentvault-browser-alerts', enabled ? 'on' : 'off');
    setAlertStatus(enabled ? 'Browser alerts are active for new indexed executions.' : 'Notification permission was not granted.');
  };

  const copyPublicVaultLink = async () => {
    await navigator.clipboard.writeText(referralLink);
    setReferralStats((current) => {
      const next = { ...current, linksCopied: current.linksCopied + 1 };
      localStorage.setItem('agentvault-referral-stats', JSON.stringify(next));
      return next;
    });
    setShareStatus('Public vault link copied');
    setTimeout(() => setShareStatus('Copy public vault link'), 2500);
  };

  const saveProfile = () => {
    const cleanName = profileName.trim().slice(0, 40) || 'Vault Operator';
    setProfileName(cleanName);
    localStorage.setItem('agentvault-profile-name', cleanName);
    setProfileStatus('Operator profile saved.');
  };

  const exportAudit = () => {
    const blob = new Blob([JSON.stringify({ wallet, policies, dailyLimit, selectedProposal, signature, bundleSignature, events: auditEvents }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'agentvault-audit-log.json';
    link.click();
    URL.revokeObjectURL(url);
  };

  const openDocsPage = (event) => {
    event?.preventDefault();
    window.history.pushState(null, '', '#docs');
    setPageView('docs');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openAppPage = (event, hash = '#hero') => {
    event?.preventDefault();
    window.history.pushState(null, '', hash);
    setPageView('app');
    setTimeout(() => document.querySelector(hash)?.scrollIntoView({ behavior: 'smooth' }), 0);
  };

  if (pageView === 'docs') {
    return (
      <main>
        <nav className="nav">
          <a className="brand" href="#hero" onClick={(event) => openAppPage(event, '#hero')} aria-label="AgentVault home">
            <span className="brandMark"><Shield size={18} /></span>
            AgentVault
          </a>
          <div className="navLinks">
            <a href="#hero" onClick={(event) => openAppPage(event, '#hero')}>Marketing</a>
            <a href="#product" onClick={(event) => openAppPage(event, '#product')}>Live app</a>
            <a href={GITHUB_URL} target="_blank" rel="noreferrer"><Github size={16} /> GitHub</a>
          </div>
          <a className="button primary" href="#product" onClick={(event) => openAppPage(event, '#product')}><Rocket size={17} />Open app</a>
        </nav>

        <section className="section docsPage">
          <div className="docsHero">
            <p className="eyebrow">AgentVault Docs</p>
            <h1>Build, run, and verify policy-bound agents.</h1>
            <p>Separate product documentation for the vault contract, hosted worker, referral flow, live testnet setup, and operator dashboard.</p>
          </div>
          <div className="docsLayout">
            <aside className="docsAside">
              {['Overview', 'Vault', 'Agent Worker', 'Referrals', 'Operations'].map((item) => <a href={`#${item.toLowerCase().replace(' ', '-')}`} key={item}>{item}</a>)}
            </aside>
            <div className="docsArticle">
              <section id="overview">
                <h2>Overview</h2>
                <p>AgentVault is an owner-controlled BOT Chain vault. Owners approve policy boundaries, while an agent wallet can execute only the actions, targets, selectors, and limits configured on-chain.</p>
              </section>
              <section id="vault">
                <h2>Vault contract</h2>
                <div className="docsGrid compactDocs">
                  {docs.map((item, index) => (
                    <article className="docCard" key={item.title}>
                      <span>{String(index + 1).padStart(2, '0')}</span>
                      <h3>{item.title}</h3>
                      <p>{item.body}</p>
                    </article>
                  ))}
                </div>
              </section>
              <section id="agent-worker">
                <h2>Agent worker</h2>
                <p>The Render worker signs with the agent key, monitors gas, indexes recent AgentExecution logs, exposes health endpoints, and posts confirmed transaction data back into the app.</p>
                <code>{AGENT_STATUS_URL}</code>
              </section>
              <section id="referrals">
                <h2>Referrals</h2>
                <p>Each operator gets a share link with a ref code and optional vault address. The current beta tracker records copied links and referred sessions in the app. A production rewards program can attach the same ref parameter to a database or contract event.</p>
              </section>
              <section id="operations">
                <h2>Operations checklist</h2>
                <ul>
                  <li>Connect a BOT Chain wallet.</li>
                  <li>Deploy or inspect a vault.</li>
                  <li>Choose a policy template.</li>
                  <li>Fund the agent wallet above the gas threshold.</li>
                  <li>Track execution receipts in the Activity panel.</li>
                </ul>
              </section>
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main>
      <nav className="nav">
        <a className="brand" href="#hero" aria-label="AgentVault home">
          <span className="brandMark"><Shield size={18} /></span>
          AgentVault
        </a>
        <div className="navLinks">
          <a href="#why">Why</a>
          <a href="#flow">Flow</a>
          <a href="#product">Live app</a>
          <a href="#docs" onClick={openDocsPage}>Docs</a>
          <a href={GITHUB_URL} target="_blank" rel="noreferrer"><Github size={16} /> GitHub</a>
        </div>
        <div className="walletControls">
          <button className={connected ? 'button ghost active' : 'button ghost'} onClick={connectWallet}>
            <Wallet size={17} />
            {connected ? shortAddress(wallet.address) : 'Connect wallet'}
          </button>
          {connected && (
            <button className="button outline iconOnly" onClick={disconnectWallet} aria-label="Disconnect wallet" title="Disconnect wallet">
              <X size={16} />
            </button>
          )}
        </div>
      </nav>

      <section id="hero" className="section hero imageHero">
        <div className="heroCopy">
          <p className="eyebrow">AgentVault on BOT Chain</p>
          <h1>Autonomous treasury work, visibly controlled.</h1>
          <p>AgentVault gives AI operators a policy-bound vault for swaps, bridge actions, rewards, and treasury tasks, with every execution backed by an on-chain receipt.</p>
          <div className="actions">
            <a className="button primary" href="#product"><Play size={17} />Open live app</a>
            <a className="button outline" href={agentStatus.lastExplorerUrl || AGENT_STATUS_URL} target="_blank" rel="noreferrer">View proof <ExternalLink size={15} /></a>
            <a className="textLink" href="#flow">See the flow <ArrowRight size={15} /></a>
          </div>
          {wallet.error && <p className="notice dangerText">{wallet.error}</p>}
        </div>
        <MarketingVisual
          agentStatus={agentStatus}
          gasSnapshot={gasSnapshot}
          activityFeed={activityFeed}
          vaultSnapshot={vaultSnapshot}
        />
      </section>

      <section className="section marketingProof" id="why">
        <aside className="rail">Dossier 01 / live proof layer</aside>
        <div className="proofStatement">
          <p className="eyebrow">What it is</p>
          <h2>A vault for agents that need permission, not custody.</h2>
          <p>AgentVault turns autonomous execution into a controlled operating model: define the boundaries, let the worker run, then verify every action from the dashboard or explorer.</p>
        </div>
        <div className="marketingFeatureGrid">
          {marketingFeatures.map(({ icon: Icon, title, body }) => (
            <article className="marketingFeature" key={title}>
              <Icon size={24} />
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section marketingFlow" id="flow">
        <div className="sectionHead">
          <div>
            <p className="eyebrow">How it works</p>
            <h2>Four steps from policy to receipt.</h2>
          </div>
          <a className="button outline" href="#product"><Rocket size={17} />Create vault</a>
        </div>
        <div className="flowRail">
          {marketingFlow.map(([step, title, body]) => (
            <article className="flowStep" key={step}>
              <span>{step}</span>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section marketingUseCases">
        <div className="useCaseHeader">
          <p className="eyebrow">Where it fits</p>
          <h2>For teams that want agent speed without treasury chaos.</h2>
        </div>
        <div className="useCaseGrid">
          {marketingUseCases.map(([title, body]) => (
            <article className="useCaseCard" key={title}>
              <span />
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section trust" id="security">
        <aside className="rail">Dossier 02 / policy first execution</aside>
        <div className="centerCopy">
          <p className="eyebrow">Live Readiness</p>
          <h2>Built for BOT Chain execution with visible receipts</h2>
        </div>
        <div className="proofGrid">
          <Proof icon={Wallet} title="Real wallet connect" detail={connected ? shortAddress(wallet.address) : 'Awaiting wallet'} />
          <Proof icon={Shield} title="BOT testnet active" detail={`Chain 968 (${TESTNET.chainId})`} />
          <Proof icon={GitBranch} title="Bridge-ready policy" detail={policies.bridge ? 'Allowlisted' : 'Disabled'} />
          <Proof icon={RefreshCcw} title={`${selectedProposal.protocol} controls`} detail={policies[selectedProposal.policyKey] ? 'Policy enabled' : 'Review only'} />
        </div>
      </section>

      <section className="section marketingHandoff">
        <div className="handoffCopy">
          <p className="eyebrow">Enter the live app</p>
          <h2>Connect, deploy, approve, and monitor from one console.</h2>
          <p>The marketing page ends here. The next section is the working AgentVault application with the live vault, deployment wizard, alerts, policies, and indexed on-chain activity.</p>
        </div>
        <div className="handoffPanel">
          <div className="showcaseMetrics">
            <Metric label="Agent score" value={`${agentScore}/100`} />
            <Metric label="Indexed receipts" value={`${activityFeed.length || agentStatus.txCount || 0}`} />
            <Metric label="Gas state" value={gasSnapshot.status} />
          </div>
          <div className="actions">
            <a className="button primary" href="#product"><Rocket size={17} />Launch main app</a>
            <a className="button outline" href="#audit">View activity <ArrowRight size={15} /></a>
          </div>
        </div>
      </section>

      <section className="section productHub" id="product">
        <div className="sectionHead">
          <div>
            <p className="eyebrow">Operator Console</p>
            <h2>Run a vault people can verify</h2>
          </div>
          <div className="segmented" role="tablist" aria-label="AgentVault product views">
            {[
              ['overview', 'Live vault'],
              ['deploy', 'Create vault'],
              ['alerts', 'Alerts & share'],
              ['referrals', 'Referrals'],
            ].map(([id, label]) => (
              <button key={id} role="tab" aria-selected={productTab === id} className={productTab === id ? 'selected' : ''} onClick={() => setProductTab(id)}>{label}</button>
            ))}
          </div>
        </div>

        {productTab === 'overview' && (
          <div className="productGrid">
            <div className="panel scorePanel">
              <div className="panelTop">
                <h3><Gauge size={18} /> Agent score</h3>
                <StatusLabel status={agentStatus.status} />
              </div>
              <div className="profileLine">
                <span><UserRound size={18} /></span>
                <div><strong>{profileName}</strong><small>{operatorLevel}</small></div>
              </div>
              <div className="scoreDial" style={{ '--score-progress': `${agentScore}%` }}>
                <strong>{agentScore}</strong>
                <span>/ 100</span>
              </div>
              <p>Score combines heartbeat, vault bytecode, indexed executions, and gas readiness.</p>
            </div>

            <div className="panel gasPanel">
              <div className="panelTop">
                <h3><Fuel size={18} /> Agent gas</h3>
                <StatusLabel status={gasSnapshot.status} />
              </div>
              <Metric label="Agent balance" value={`${gasSnapshot.balanceBot} BOT`} />
              <div className="gasTrack" aria-label={`Agent gas is ${gasSnapshot.status}`}>
                <span style={{ width: `${Math.min(100, (Number(gasSnapshot.balanceBot) / Math.max(Number(gasSnapshot.thresholdBot), 0.0001)) * 100)}%` }} />
              </div>
              <p>Execution threshold: {gasSnapshot.thresholdBot} BOT.</p>
              {!gasSnapshot.canExecute && <a className="button primary small" href={FAUCET_URL} target="_blank" rel="noreferrer">Fund from faucet <ExternalLink size={14} /></a>}
            </div>

            <div className="panel publicVaultPanel">
              <div className="panelTop">
                <h3><UserRound size={18} /> Public vault</h3>
                <span>{vaultSnapshot?.txCount ?? activityFeed.length} indexed</span>
              </div>
              <code>{publicVaultAddress || 'Waiting for vault address'}</code>
              <div className="proofRows compact">
                <Metric label="Daily limit" value={`${vaultSnapshot?.dailyLimitBot || dailyLimit} BOT`} />
                <Metric label="Spent today" value={`${vaultSnapshot?.todaySpentBot || '0.0'} BOT`} />
                <Metric label="Vault balance" value={`${Number(vaultSnapshot?.vaultBalanceBot || 0).toFixed(4)} BOT`} />
                <Metric label="Latest block" value={agentStatus.latestBlock || agentStatus.lastBlockNumber || 'Waiting'} />
              </div>
              <div className="splitButtons">
                {publicVaultAddress && <a className="button outline small" href={`${TESTNET.explorerUrl}/address/${publicVaultAddress}`} target="_blank" rel="noreferrer">Open vault <ExternalLink size={14} /></a>}
                <button className="button ghost small" onClick={refreshProductData}><RefreshCcw size={14} />Refresh index</button>
              </div>
              <p className="panelNote">{productRefreshStatus}</p>
            </div>

            <div className="panel integrationsPanel">
              <div className="panelTop">
                <h3><GitBranch size={18} /> Verified testnet integrations</h3>
                <span>Official addresses</span>
              </div>
              {VERIFIED_INTEGRATIONS.map((integration) => (
                <a className="integrationRow" href={integration.explorerUrl} target="_blank" rel="noreferrer" key={integration.id}>
                  <span><strong>{integration.name}</strong><small>{integration.type}</small></span>
                  <code>{shortAddress(integration.address)}</code>
                  <ExternalLink size={14} />
                </a>
              ))}
            </div>

            <div className="panel indexedActivity">
              <div className="panelTop">
                <h3><Activity size={18} /> Indexed executions</h3>
                <span>{activityFeed.length} recent</span>
              </div>
              <div className="activityList">
                {activityFeed.length ? activityFeed.slice(0, 6).map((event) => (
                  <a href={event.explorerUrl} target="_blank" rel="noreferrer" className="activityRow" key={`${event.transactionHash}-${event.executionId}`}>
                    <span className="activityPulse" />
                    <span><strong>{Number(event.amountBot || 0) > 0 ? `${Number(event.amountBot).toFixed(2)} BOT ${event.actionLabel || 'execution'}` : event.actionLabel || 'Policy execution receipt'}</strong><small>Block {event.blockNumber}</small></span>
                    <code>{shortAddress(event.transactionHash)}</code>
                    <ExternalLink size={14} />
                  </a>
                )) : (
                  <div className="emptyState"><RefreshCcw size={20} /><strong>Indexer warming up</strong><span>The latest confirmed agent transaction remains visible in Agent activity below.</span></div>
                )}
              </div>
            </div>
          </div>
        )}

        {productTab === 'deploy' && (
          <div className="launchpadGrid">
            <div className="templateList">
              {policyTemplates.map((template) => (
                <button className={selectedTemplateId === template.id ? 'templateCard selected' : 'templateCard'} key={template.id} onClick={() => applyPolicyTemplate(template)}>
                  <span><strong>{template.name}</strong><small>{template.dailyLimit} BOT/day</small></span>
                  <p>{template.description}</p>
                  <ChevronRight size={18} />
                </button>
              ))}
            </div>
            <div className="panel deployPanel">
              <div className="panelTop">
                <h3><Rocket size={18} /> Deploy {selectedTemplate.name}</h3>
                <span>BOT testnet</span>
              </div>
              <label className="formField">
                <span>Agent wallet</span>
                <input value={deployForm.agentAddress} onChange={(event) => setDeployForm((current) => ({ ...current, agentAddress: event.target.value }))} placeholder={agentStatus.agentAddress || '0x...'} />
                <small>Leave blank to use the hosted agent address.</small>
              </label>
              <label className="formField">
                <span>Daily spend limit</span>
                <div className="unitInput"><input type="number" min="1" max="1000" value={deployForm.dailyLimit} onChange={(event) => setDeployForm((current) => ({ ...current, dailyLimit: event.target.value }))} /><small>BOT</small></div>
              </label>
              <div className="deploySummary">
                <span><Check size={14} />Owner-controlled deployment</span>
                <span><Check size={14} />Agent and action allowlists</span>
                <span><Check size={14} />Daily on-chain accounting</span>
                <span><Check size={14} />Emergency owner controls</span>
                {selectedTemplate.id === 'trader' && <span><Check size={14} />Verified BDEX V2 router policy</span>}
              </div>
              <div className="splitButtons">
                <button className="button primary" onClick={deployNewVault}><Rocket size={16} />Deploy vault</button>
                <a className="button outline" href={FAUCET_URL} target="_blank" rel="noreferrer"><Fuel size={16} />Get test BOT</a>
              </div>
              <div className="deploymentReceipt" aria-live="polite">
                <strong>{deployment.status}</strong>
                {deployment.hash && <code>{shortAddress(deployment.hash)}</code>}
                {deployment.explorerUrl && <a href={deployment.explorerUrl} target="_blank" rel="noreferrer">View receipt <ExternalLink size={14} /></a>}
              </div>
            </div>
          </div>
        )}

        {productTab === 'alerts' && (
          <div className="alertsGrid">
            <div className="panel alertCard profileCard">
              <UserRound size={22} />
              <h3>Operator profile</h3>
              <label className="formField compactField">
                <span>Display name</span>
                <input value={profileName} maxLength="40" onChange={(event) => setProfileName(event.target.value)} />
              </label>
              <button className="button outline" onClick={saveProfile}><Check size={16} />Save profile</button>
              <span className="panelNote">{profileStatus}</span>
            </div>
            <div className="panel alertCard">
              <Bell size={22} />
              <h3>Execution alerts</h3>
              <p>Receive a browser notification when the indexer sees a new confirmed AgentExecution.</p>
              <button className={browserAlerts ? 'button primary' : 'button outline'} onClick={toggleBrowserAlerts}><Bell size={16} />{browserAlerts ? 'Alerts enabled' : 'Enable alerts'}</button>
              <span className="panelNote">{alertStatus}</span>
            </div>
            <div className="panel alertCard">
              <Send size={22} />
              <h3>Operator delivery</h3>
              <p>The hosted worker supports email, Telegram, and webhook delivery after each confirmed transaction.</p>
              <StatusLabel status={agentStatus.lastAlertStatus || 'ready'} />
            </div>
            <div className="panel alertCard shareCard">
              <Copy size={22} />
              <h3>Share public proof</h3>
              <p>Invite operators and reviewers directly into this vault’s live execution record.</p>
              <button className="button primary" onClick={copyPublicVaultLink}><Copy size={16} />{shareStatus}</button>
              {referralSource && <span className="panelNote">Referred by {shortAddress(referralSource)}</span>}
            </div>
          </div>
        )}

        {productTab === 'referrals' && (
          <div className="referralGrid">
            <div className="panel referralPrimary">
              <div className="panelTop">
                <h3><Copy size={18} /> Referral tracker</h3>
                <span>{connected ? 'Wallet active' : 'Profile mode'}</span>
              </div>
              <p>Share this link after signup. It carries your referral code and opens directly into the live AgentVault app.</p>
              <div className="referralLinkBox">
                <code>{referralLink}</code>
                <button className="button primary small" onClick={copyPublicVaultLink}><Copy size={14} />Copy</button>
              </div>
              <div className="proofRows compact">
                <Metric label="Your code" value={shortAddress(referralCode)} />
                <Metric label="Links copied" value={referralStats.linksCopied} />
                <Metric label="Referred sessions" value={referralStats.referredSessions} />
                <Metric label="Invited by" value={referralSource ? shortAddress(referralSource) : 'Direct'} />
              </div>
            </div>
            <div className="panel referralHow">
              <FileText size={22} />
              <h3>How tracking works</h3>
              <p>The beta tracker reads the ref parameter, stores your copied links, and shows referred sessions for this operator profile. For mainnet rewards, the same referral code should be written to a backend or vault event.</p>
              <a className="button outline" href="#docs" onClick={openDocsPage}><BookOpen size={16} />Open referral docs</a>
            </div>
          </div>
        )}
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
            <div className="limitDial" style={{ '--limit-progress': `${dailyLimitPercent}%` }}>
              <span>{dailyLimit}</span>
              <small>BOT daily</small>
            </div>
          </div>
          <div className="panel">
            <h3>Allowed actions</h3>
            {Object.entries(policies).filter(([key]) => key !== 'emergencyPause').map(([key, value]) => (
              <Toggle key={key} label={key} checked={value} onChange={() => setPolicies((state) => ({ ...state, [key]: !state[key] }))} />
            ))}
          </div>
          <div className="panel">
            <h3>Agent roles</h3>
            {agentRoles.map((role) => (
              <button className={selectedRoleId === role.id ? 'roleRow selected' : 'roleRow'} key={role.id} onClick={() => selectRole(role)}>
                <span>{role.name}</span>
                <small>{role.permission}</small>
              </button>
            ))}
          </div>
          <div className="panel reviewMini">
            <h3>Agent proposal queue</h3>
            <p>{selectedProposal.agent} can {actionPhrase(selectedProposal.action)} after policy, wallet, and network checks pass.</p>
            <div className="actionPicker" aria-label="Select agent action">
              {actionOptions.map((action) => (
                <button key={action.id} className={selectedActionId === action.id ? 'chip selected' : 'chip'} onClick={() => selectAction(action)}>
                  {action.label}
                </button>
              ))}
            </div>
            <label className="amountField">
              <span>Amount</span>
              <input type="number" min="1" max="50" value={actionAmount} onChange={(event) => setActionAmount(Number(event.target.value || 0))} />
              <small>BOT</small>
            </label>
            <div className="bundlePreview">
              {enabledPolicySummary.map((item) => <span key={item}>{item}</span>)}
            </div>
            <div className="splitButtons">
              <button className="button primary small" onClick={signApprovalIntent}>Sign intent</button>
              <button className="button outline small" onClick={signPolicyBundle}>Sign policy bundle</button>
              <button className="button ghost small" onClick={executeAgentOnchain}>Send tx</button>
            </div>
          </div>
        </div>
      </section>

      <section className="section review imageReview" id="review">
        <div className="reviewPanel">
          <div className="panelTop">
            <h2>{proposalTitle(selectedProposal)}</h2>
            <StatusLabel status={proposalStatus} />
          </div>
          <div className="proposalGrid">
            <Metric label="Agent" value={selectedProposal.agent} />
            <Metric label="Action" value={selectedProposal.action} />
            <Metric label="Amount" value={`${selectedProposal.amount} BOT`} />
            <Metric label="Route" value={selectedProposal.route} />
          </div>
          <div className="explain">
            <Sparkles size={18} />
            <p>{selectedProposal.reason}</p>
          </div>
          <div className="checks">
            {[
              connected ? 'Wallet connected' : 'Wallet required',
              configured ? 'Testnet configured' : 'Testnet config missing',
              policies[selectedProposal.policyKey] ? `${selectedProposal.protocol} policy enabled` : `${selectedProposal.protocol} disabled`,
              dailyLimit >= selectedProposal.amount ? 'Daily limit passed' : 'Daily limit too low',
            ].map((check) => (
              <span key={check}><Check size={15} />{check}</span>
            ))}
          </div>
          <div className="actions">
            <button className="button primary" onClick={signApprovalIntent}><Check size={17} />Sign approval</button>
            <button className="button outline" onClick={signPolicyBundle}><Shield size={17} />Sign all policies</button>
            <button className="button ghost" onClick={executeAgentOnchain}><TerminalSquare size={17} />Submit wallet tx</button>
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
          {filteredEvents.map((event) => (
            <AuditEvent
              event={event}
              key={`${event.type}-${event.time}-${event.hash}`}
              selected={selectedAuditType === event.type}
              onSelect={event.explorerUrl ? undefined : () => loadAuditProposal(event)}
            />
          ))}
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
          <Metric label="Budget left" value={`${Math.max(0, dailyLimit - selectedProposal.amount)} BOT`} />
          <Metric label="Vault state" value={vaultStatus} />
          <div className="chart" aria-label="Treasury line chart">
            <span style={{ height: '36%' }} />
            <span style={{ height: '52%' }} />
            <span style={{ height: '42%' }} />
            <span style={{ height: '68%' }} />
            <span style={{ height: '61%' }} />
            <span style={{ height: '78%' }} />
          </div>
          <button className="button primary wide" onClick={() => refreshBalance()}><CircleDollarSign size={17} />Refresh live balance</button>
          <p className="panelNote">{balanceStatus}</p>
        </div>
      </section>

      <section className="section execution">
        <div>
          <p className="eyebrow">Execution Controls</p>
          <h2>Let agents move funds, never control everything</h2>
          <p>Run checks, review the active worker, and follow every transaction from the app to the explorer.</p>
          <div className="actions">
            <button className="button primary" onClick={runLivePreflight}><TerminalSquare size={17} />Run live preflight</button>
            <button className="button outline" onClick={executeAgentOnchain}><Bot size={17} />Submit wallet tx</button>
            <button className="button ghost" onClick={() => setPolicies((state) => ({ ...state, emergencyPause: !state.emergencyPause }))}>
              <Pause size={17} />
              {policies.emergencyPause ? 'Resume vault' : 'Emergency pause'}
            </button>
          </div>
        </div>
        <div className="executionGrid">
          <PolicyCard title={policyTitle(selectedProposal)} icon={RefreshCcw} labels={[selectedProposal.route, `${dailyLimit} BOT daily`, `${selectedProposal.amount} BOT requested`]} enabled={policies[selectedProposal.policyKey]} />
          <PolicyCard title="BOT Bridge" icon={GitBranch} labels={['destination allowlist', 'guardian review', '8.2 BOT queued']} enabled={policies.bridge} />
          <div className="panel agentProof">
            <div className="panelTop">
              <h3><Bot size={18} /> Agent activity</h3>
              <StatusLabel status={agentStatus.status} />
            </div>
            <p>{agentStatus.proof}</p>
            {!connected && <p className="panelNote">Browser wallet is disconnected. These transactions are coming from the hosted agent worker.</p>}
            <div className="proofRows">
              <Metric label="Heartbeat" value={agentStatus.lastHeartbeatAt ? new Date(agentStatus.lastHeartbeatAt).toLocaleTimeString() : 'None'} />
              <Metric label="Last run" value={agentStatus.lastRunAt ? new Date(agentStatus.lastRunAt).toLocaleTimeString() : 'Waiting'} />
              <Metric label="Agent wallet" value={agentStatus.agentAddress ? shortAddress(agentStatus.agentAddress) : 'Pending'} />
              <Metric label="Vault" value={agentStatus.vaultAddress ? shortAddress(agentStatus.vaultAddress) : 'Pending'} />
              <Metric label="Latest tx" value={agentStatus.lastTxHash ? `${agentStatus.lastTxHash.slice(0, 10)}...${agentStatus.lastTxHash.slice(-8)}` : 'Waiting'} />
              <Metric label="Block" value={agentStatus.lastBlockNumber || 'Waiting'} />
            </div>
            <div className="splitButtons">
              <button className="button ghost small" onClick={refreshAgentStatus}><RefreshCcw size={14} />Refresh status</button>
              <a className="button outline small" href={AGENT_STATUS_URL} target="_blank" rel="noreferrer">Worker status <ExternalLink size={14} /></a>
              {agentStatus.lastExplorerUrl && <a className="button primary small" href={agentStatus.lastExplorerUrl} target="_blank" rel="noreferrer">Open transaction <ArrowRight size={14} /></a>}
            </div>
            <p className="panelNote">{agentRefreshStatus}</p>
            {agentStatus.lastError && <p className="notice dangerText">{agentStatus.lastError}</p>}
          </div>
          <div className="panel txConsole">
            <h3>On-chain tx console</h3>
            {preflight ? (
              <>
                <Metric label="Chain ID" value={preflight.chainId} />
                <Metric label="Checked at" value={preflight.at} />
                <p>{preflight.verdict}</p>
              </>
            ) : (
              <p>This console is for owner-submitted test transactions. The hosted agent keeps running in the Agent activity panel without a connected browser wallet.</p>
            )}
            <div className="txStatus">
              <Metric label="Transaction status" value={tx.status} />
              {tx.hash && <Metric label="Transaction hash" value={`${tx.hash.slice(0, 10)}...${tx.hash.slice(-8)}`} />}
              {tx.explorer && <a className="button primary small" href={tx.explorer} target="_blank" rel="noreferrer">Open in explorer <ArrowRight size={14} /></a>}
            </div>
          </div>
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
          <a className="button outline" href="#docs" onClick={openDocsPage}><BookOpen size={17} />Open docs</a>
        </div>
        <footer>
          <strong>AgentVault</strong>
          <span>Autonomy with receipts.</span>
          <a href="#security">Security</a>
          <a href="#docs" onClick={openDocsPage}>Docs</a>
          <a href={GITHUB_URL} target="_blank" rel="noreferrer"><Github size={16} /> GitHub</a>
          <a href="https://botchain.ai" target="_blank" rel="noreferrer">BOT Chain <ExternalLink size={14} /></a>
        </footer>
      </section>
    </main>
  );
}

function MarketingVisual({ agentStatus, gasSnapshot, activityFeed, vaultSnapshot }) {
  const latestEvent = activityFeed[0];
  const latestHash = latestEvent?.transactionHash || agentStatus.lastTxHash;
  const activeLabel = agentStatus.status === 'active' ? 'Agent live' : 'Agent watch';

  return (
    <div className="marketingVisual" aria-label="AgentVault live proof preview">
      <div className="visualTopline">
        <span><Activity size={15} />{activeLabel}</span>
        <code>{latestHash ? shortAddress(latestHash) : 'waiting for tx'}</code>
      </div>
      <div className="receiptStack">
        <article className="receiptCard mainReceipt">
          <span>Confirmed execution</span>
          <strong>{latestEvent?.actionLabel || 'Policy execution receipt'}</strong>
          <p>{latestEvent?.blockNumber ? `Block ${latestEvent.blockNumber}` : 'Indexed from BOT Chain testnet'}</p>
        </article>
        <article className="receiptCard gasReceipt">
          <Fuel size={18} />
          <span>Agent gas</span>
          <strong>{gasSnapshot.balanceBot} BOT</strong>
          <p>{gasSnapshot.status}</p>
        </article>
        <article className="receiptCard scoreReceipt">
          <Gauge size={18} />
          <span>Agent score</span>
          <strong>{vaultSnapshot?.agentScore || agentStatus.agentScore || 100}</strong>
          <p>verifiable uptime</p>
        </article>
      </div>
      <div className="visualLedger">
        {[0, 1, 2].map((index) => {
          const event = activityFeed[index];
          return (
            <span key={event?.executionId || index}>
              <i />
              <strong>{event?.actionLabel || 'Vault policy'}</strong>
              <small>{event?.blockNumber ? `#${event.blockNumber}` : 'pending index'}</small>
            </span>
          );
        })}
      </div>
    </div>
  );
}

function DashboardPreview({ wallet, configured, vaultStatus, dailyLimit, selectedProposal }) {
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
          <strong>{selectedProposal.agent}</strong>
          <p>{selectedProposal.agent} can propose to {actionPhrase(selectedProposal.action)} through {selectedProposal.protocol}. Execution waits for policy, network, and signature checks.</p>
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

function AuditEvent({ event, selected, onSelect }) {
  return (
    <article className={selected ? 'auditEvent selected' : 'auditEvent'}>
      <span>{event.time}</span>
      <div>
        <strong>{event.type}</strong>
        <p>{event.reason}</p>
      </div>
      <small>{event.protocol}</small>
      <StatusLabel status={event.status} />
      <code>{event.hash}</code>
      {event.explorerUrl ? (
        <a className="button primary small" href={event.explorerUrl} target="_blank" rel="noreferrer">Open tx</a>
      ) : (
        <button className="button outline small" onClick={onSelect}>Load</button>
      )}
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

const rootElement = document.getElementById('root');
const appRoot = window.__agentVaultRoot || createRoot(rootElement);
window.__agentVaultRoot = appRoot;
appRoot.render(<App />);
