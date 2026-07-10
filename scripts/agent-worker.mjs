import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import { ethers } from 'ethers';
import { buildAgentScore, buildGasHealth, isRecent, serialiseExecutionLog } from './agent-worker-lib.mjs';

const root = process.cwd();
const port = Number(process.env.PORT || process.env.AGENT_PORT || 8787);
const rpcUrl = process.env.BOT_TESTNET_RPC_URL || process.env.VITE_BOT_TESTNET_RPC_URL || 'https://rpc.bohr.life';
const explorer = process.env.BOT_TESTNET_EXPLORER_URL || process.env.VITE_BOT_TESTNET_EXPLORER_URL || 'https://scan.bohr.life';
const privateKey = process.env.AGENT_PRIVATE_KEY;
const vaultAddress = process.env.VAULT_ADDRESS;
const intervalMs = Number(process.env.AGENT_INTERVAL_MS || 60000);
const actionAmountBot = process.env.AGENT_ACTION_AMOUNT_BOT || '0';
const executionMode = process.env.AGENT_EXECUTION_MODE || 'proof';
const actionId = ethers.id(process.env.AGENT_ACTION_ID || 'BDEX_SWAP_PROOF');
const bdexActionId = ethers.id('BDEX_SWAP_V2');
const bridgeActionId = ethers.id('BOT_BRIDGE');
const wrappedBot = process.env.BDEX_WBOT || '0xD5452816194a3784dBa983426cCe7c122F4abd30';
const testnetUsdt = process.env.BDEX_TESTNET_USDT || '0x75edC9335175Fc0552D51D48439F229c10420fe3';
const executionDisabled = process.env.AGENT_DISABLE_EXECUTION === '1';
const gasThresholdWei = ethers.parseEther(process.env.AGENT_GAS_THRESHOLD_BOT || '0.05');
const indexLookbackBlocks = Number(process.env.AGENT_INDEX_LOOKBACK_BLOCKS || 25000);
const indexChunkBlocks = Number(process.env.AGENT_INDEX_CHUNK_BLOCKS || 5000);
const maxIndexedEvents = Number(process.env.AGENT_MAX_INDEXED_EVENTS || 50);
const statePath = path.join(root, 'work', 'agent-state.json');
const artifactPath = path.join(root, 'artifacts', 'AgentVault.json');

const abi = fs.existsSync(artifactPath)
  ? JSON.parse(fs.readFileSync(artifactPath, 'utf8')).abi
  : [
      'function executeProof(bytes32 actionId,uint256 amountWei,bytes32 metadataHash) returns (bytes32)',
      'event AgentExecution(bytes32 indexed executionId,address indexed agent,bytes32 indexed actionId,uint256 amountWei,bytes32 metadataHash,uint256 timestamp,uint256 blockNumber)',
    ];

const initialState = {
  status: privateKey && vaultAddress ? 'starting' : 'setup-required',
  proof: privateKey && vaultAddress
    ? 'Worker online. Preparing the next policy transaction.'
    : 'Worker online. Add the agent key and vault address in the host secrets to begin on-chain execution.',
  network: 'BOT Chain Testnet',
  chainId: 968,
  vaultAddress: vaultAddress || '',
  agentAddress: '',
  lastHeartbeatAt: '',
  lastRunAt: '',
  lastTxHash: '',
  lastExplorerUrl: '',
  lastBlockNumber: '',
  lastError: '',
  gas: { status: 'checking', balanceBot: '0.0000', thresholdBot: ethers.formatEther(gasThresholdWei), canExecute: false },
  indexedEvents: [],
  indexedAt: '',
  indexedFromBlock: '',
  latestBlock: '',
  vaultBalanceBot: '0.0000',
  vaultCodeDeployed: false,
  txCount: 0,
  agentScore: 0,
};

let state = { ...initialState };
if (fs.existsSync(statePath)) {
  try {
    state = { ...initialState, ...JSON.parse(fs.readFileSync(statePath, 'utf8')) };
  } catch {
    state = { ...initialState };
  }
}

const provider = new ethers.JsonRpcProvider(rpcUrl);
const contractInterface = new ethers.Interface(abi);
const bdexInterface = new ethers.Interface([
  'function swapExactETHForTokens(uint256 amountOutMin,address[] path,address to,uint256 deadline) payable returns (uint256[] amounts)',
]);
let refreshPromise = null;

async function indexVaultEvents(targetVaultAddress, latestBlock) {
  if (!targetVaultAddress) return { events: [], fromBlock: '' };
  const topic = contractInterface.getEvent('AgentExecution').topicHash;
  const fromBlock = Math.max(0, latestBlock - indexLookbackBlocks);
  const ranges = [];
  for (let start = fromBlock; start <= latestBlock; start += indexChunkBlocks) {
    ranges.push([start, Math.min(latestBlock, start + indexChunkBlocks - 1)]);
  }
  const batches = await Promise.all(ranges.map(([start, end]) => provider.getLogs({
      address: targetVaultAddress,
      topics: [topic],
      fromBlock: start,
      toBlock: end,
  })));
  const logs = batches.flat();
  return {
    fromBlock: String(fromBlock),
    events: logs
      .slice(-maxIndexedEvents)
      .reverse()
      .map((log) => serialiseExecutionLog(log, contractInterface.parseLog(log), explorer)),
  };
}

async function refreshRuntimeStateInternal() {
  const latestBlock = await provider.getBlockNumber();
  const agentAddress = privateKey ? new ethers.Wallet(privateKey).address : state.agentAddress;
  const [agentBalance, vaultBalance, vaultCode] = await Promise.all([
    agentAddress ? provider.getBalance(agentAddress) : Promise.resolve(0n),
    vaultAddress ? provider.getBalance(vaultAddress) : Promise.resolve(0n),
    vaultAddress ? provider.getCode(vaultAddress) : Promise.resolve('0x'),
  ]);
  const gas = buildGasHealth(agentBalance, gasThresholdWei);
  let indexedEvents = state.indexedEvents || [];
  let indexedFromBlock = '';

  if (vaultAddress && vaultCode !== '0x') {
    const indexed = await indexVaultEvents(vaultAddress, latestBlock);
    indexedFromBlock = indexed.fromBlock;
    indexedEvents = indexed.events;
  }
  const latestIndexedEvent = indexedEvents[0];

  state = {
    ...state,
    vaultAddress: vaultAddress || state.vaultAddress,
    agentAddress,
    gas,
    indexedEvents,
    indexedAt: new Date().toISOString(),
    indexedFromBlock,
    latestBlock: String(latestBlock),
    vaultBalanceBot: ethers.formatEther(vaultBalance),
    vaultCodeDeployed: vaultCode !== '0x',
    txCount: indexedEvents.length,
    lastRunAt: latestIndexedEvent?.timestamp ? new Date(latestIndexedEvent.timestamp * 1000).toISOString() : state.lastRunAt,
    lastTxHash: latestIndexedEvent?.transactionHash || state.lastTxHash,
    lastExplorerUrl: latestIndexedEvent?.explorerUrl || state.lastExplorerUrl,
    lastBlockNumber: latestIndexedEvent?.blockNumber ? String(latestIndexedEvent.blockNumber) : state.lastBlockNumber,
  };
  state.agentScore = buildAgentScore({
    active: state.status === 'active' || state.status === 'tx-submitted',
    gasStatus: gas.status,
    eventCount: indexedEvents.length,
    hasVaultCode: state.vaultCodeDeployed,
    recentHeartbeat: isRecent(state.lastHeartbeatAt, Math.max(intervalMs * 3, 120000)),
  });
  persist();
  return state;
}

async function refreshRuntimeState() {
  if (!refreshPromise) {
    refreshPromise = refreshRuntimeStateInternal().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

async function readPublicVault(targetVaultAddress) {
  const latestBlock = await provider.getBlockNumber();
  const [vaultBalance, vaultCode, indexed] = await Promise.all([
    provider.getBalance(targetVaultAddress),
    provider.getCode(targetVaultAddress),
    indexVaultEvents(targetVaultAddress, latestBlock),
  ]);
  if (vaultCode === '0x') throw new Error('No contract is deployed at this vault address.');

  const readVault = new ethers.Contract(targetVaultAddress, abi, provider);
  const owner = await readVault.owner();
  const dailyLimit = await readVault.dailyLimitWei();
  const publicAgentAddress = indexed.events[0]?.agent || '';
  const agentBalance = publicAgentAddress ? await provider.getBalance(publicAgentAddress) : 0n;
  const spent = publicAgentAddress ? await readVault.getTodaySpent(publicAgentAddress) : [0n, 0n];
  const gas = buildGasHealth(agentBalance, gasThresholdWei);
  return {
    network: 'BOT Chain Testnet',
    chainId: 968,
    vaultAddress: targetVaultAddress,
    owner,
    agentAddress: publicAgentAddress,
    dailyLimitBot: ethers.formatEther(dailyLimit),
    todaySpentBot: ethers.formatEther(spent.spentWei ?? spent[1]),
    vaultBalanceBot: ethers.formatEther(vaultBalance),
    vaultCodeDeployed: true,
    gas,
    txCount: indexed.events.length,
    agentScore: buildAgentScore({
      active: indexed.events.length > 0,
      gasStatus: gas.status,
      eventCount: indexed.events.length,
      hasVaultCode: true,
      recentHeartbeat: false,
    }),
    indexedEvents: indexed.events,
    indexedAt: new Date().toISOString(),
    indexedFromBlock: indexed.fromBlock,
    latestBlock: String(latestBlock),
    explorerUrl: `${explorer.replace(/\/$/, '')}/address/${targetVaultAddress}`,
  };
}

async function resolveVaultSnapshot(requestedAddress) {
  if (!requestedAddress || requestedAddress.toLowerCase() === String(vaultAddress || '').toLowerCase()) {
    return refreshRuntimeState();
  }
  if (!ethers.isAddress(requestedAddress)) throw new Error('Invalid vault address.');
  return readPublicVault(ethers.getAddress(requestedAddress));
}

function persist() {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
}

async function runOnce() {
  state.lastHeartbeatAt = new Date().toISOString();
  if (!privateKey || !vaultAddress) {
    state.status = 'setup-required';
    state.proof = 'Worker online. Add the agent key and vault address in the host secrets to begin on-chain execution.';
    persist();
    return state;
  }

  if (executionDisabled) {
    state.status = 'standby';
    state.proof = 'Worker API is online with transaction execution disabled for this environment.';
    return refreshRuntimeState();
  }

  const wallet = new ethers.Wallet(privateKey, provider);
  const network = await provider.getNetwork();
  if (network.chainId !== 968n) {
    throw new Error(`Agent RPC is on chain ${network.chainId}, expected 968.`);
  }

  const vault = new ethers.Contract(vaultAddress, abi, wallet);
  const metadata = {
    app: 'AgentVault',
    agent: 'background-worker',
    action: executionMode,
    policy: 'daily-limit-and-allowlist',
    timestamp: new Date().toISOString(),
  };
  const metadataHash = ethers.id(JSON.stringify(metadata));
  const amountWei = ethers.parseEther(actionAmountBot);
  let tx;
  if (executionMode === 'bdex-v2') {
    if (amountWei === 0n) throw new Error('AGENT_ACTION_AMOUNT_BOT must be greater than zero for a BDEX swap.');
    const data = bdexInterface.encodeFunctionData('swapExactETHForTokens', [
      BigInt(process.env.BDEX_AMOUNT_OUT_MIN || '0'),
      [wrappedBot, testnetUsdt],
      vaultAddress,
      Math.floor(Date.now() / 1000) + Number(process.env.BDEX_DEADLINE_SECONDS || 600),
    ]);
    tx = await vault.executeProtocol(bdexActionId, amountWei, amountWei, metadataHash, data);
  } else if (executionMode === 'bridge') {
    if (!process.env.BRIDGE_CALLDATA?.startsWith('0x')) throw new Error('BRIDGE_CALLDATA is required for bridge execution mode.');
    const bridgeValueWei = ethers.parseEther(process.env.BRIDGE_VALUE_BOT || '0');
    tx = await vault.executeProtocol(bridgeActionId, amountWei, bridgeValueWei, metadataHash, process.env.BRIDGE_CALLDATA);
  } else {
    tx = await vault.executeProof(actionId, amountWei, metadataHash);
  }
  state = {
    ...state,
    status: 'tx-submitted',
    proof: executionMode === 'proof'
      ? 'Hosted agent submitted an AgentExecution transaction without a connected browser wallet.'
      : `Hosted agent submitted a live ${executionMode} protocol transaction through the vault.`,
    agentAddress: wallet.address,
    vaultAddress,
    lastRunAt: new Date().toISOString(),
    lastTxHash: tx.hash,
    lastExplorerUrl: `${explorer.replace(/\/$/, '')}/tx/${tx.hash}`,
    lastError: '',
  };
  persist();
  const receipt = await tx.wait();
  state = {
    ...state,
    status: receipt.status === 1 ? 'active' : 'reverted',
    proof: receipt.status === 1
      ? 'Hosted agent is active: latest vault transaction confirmed on BOT Chain testnet.'
      : 'Background agent submitted a transaction, but it reverted.',
    lastBlockNumber: String(receipt.blockNumber),
  };
  await refreshRuntimeState();
  await dispatchAlerts(state);
  return state;
}

async function dispatchAlerts(snapshot) {
  if (!snapshot.lastTxHash || snapshot.lastAlertedTxHash === snapshot.lastTxHash) return;
  const message = `AgentVault confirmed ${snapshot.lastTxHash} in block ${snapshot.lastBlockNumber} on BOT Chain testnet.`;
  const requests = [];
  if (process.env.ALERT_WEBHOOK_URL) {
    requests.push(fetch(process.env.ALERT_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ event: 'agent.execution.confirmed', message, state: snapshot }),
    }));
  }
  if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
    requests.push(fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: process.env.TELEGRAM_CHAT_ID, text: `${message}\n${snapshot.lastExplorerUrl}` }),
    }));
  }
  if (process.env.RESEND_API_KEY && process.env.ALERT_EMAIL_TO) {
    requests.push(fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.ALERT_EMAIL_FROM || 'AgentVault <alerts@agentvault.app>',
        to: [process.env.ALERT_EMAIL_TO],
        subject: `AgentVault execution confirmed in block ${snapshot.lastBlockNumber}`,
        text: `${message}\n\n${snapshot.lastExplorerUrl}`,
      }),
    }));
  }
  if (!requests.length) return;
  const results = await Promise.allSettled(requests);
  state.lastAlertedTxHash = snapshot.lastTxHash;
  state.lastAlertStatus = results.every((result) => result.status === 'fulfilled') ? 'delivered' : 'partial';
  persist();
}

const app = express();
app.use(cors());
app.use(express.json());
app.get('/', (_request, response) => response.json({
  ok: true,
  service: 'AgentVault worker',
  statusUrl: '/status',
  healthUrl: '/health',
}));
app.get('/health', (_request, response) => response.json({ ok: true, status: state.status, gas: state.gas }));
app.get('/status', (_request, response) => response.json(state));
app.get('/api/status', (_request, response) => response.json(state));
app.get('/api/activity', async (request, response) => {
  try {
    const snapshot = await resolveVaultSnapshot(request.query.address);
    response.json({
      vaultAddress: snapshot.vaultAddress,
      agentAddress: snapshot.agentAddress,
      indexedAt: snapshot.indexedAt,
      indexedFromBlock: snapshot.indexedFromBlock,
      latestBlock: snapshot.latestBlock,
      count: snapshot.indexedEvents.length,
      events: snapshot.indexedEvents,
    });
  } catch (error) {
    response.status(502).json({ error: error.message, events: state.indexedEvents || [] });
  }
});
app.get('/api/vault', async (request, response) => {
  try {
    const snapshot = await resolveVaultSnapshot(request.query.address);
    if (request.query.address) {
      response.json(snapshot);
      return;
    }
    let owner = '';
    let dailyLimitBot = '';
    let todaySpentBot = '';
    if (privateKey && vaultAddress && snapshot.vaultCodeDeployed) {
      const readVault = new ethers.Contract(vaultAddress, abi, provider);
      const [vaultOwner, dailyLimit, spent] = await Promise.all([
        readVault.owner(),
        readVault.dailyLimitWei(),
        readVault.getTodaySpent(snapshot.agentAddress),
      ]);
      owner = vaultOwner;
      dailyLimitBot = ethers.formatEther(dailyLimit);
      todaySpentBot = ethers.formatEther(spent.spentWei ?? spent[1]);
    }
    response.json({
      network: snapshot.network,
      chainId: snapshot.chainId,
      vaultAddress: snapshot.vaultAddress,
      owner,
      agentAddress: snapshot.agentAddress,
      dailyLimitBot,
      todaySpentBot,
      vaultBalanceBot: snapshot.vaultBalanceBot,
      vaultCodeDeployed: snapshot.vaultCodeDeployed,
      gas: snapshot.gas,
      txCount: snapshot.txCount,
      agentScore: snapshot.agentScore,
      explorerUrl: snapshot.vaultAddress ? `${explorer.replace(/\/$/, '')}/address/${snapshot.vaultAddress}` : '',
    });
  } catch (error) {
    response.status(502).json({ error: error.message });
  }
});
app.post('/run-once', async (_request, response) => {
  try {
    response.json(await runOnce());
  } catch (error) {
    state.status = 'error';
    state.lastError = error.message;
    state.lastHeartbeatAt = new Date().toISOString();
    persist();
    response.status(500).json(state);
  }
});

app.listen(port, () => {
  state.lastHeartbeatAt = new Date().toISOString();
  persist();
  console.log(`AgentVault worker listening on http://127.0.0.1:${port}`);
});

setInterval(() => {
  refreshRuntimeState().catch((error) => {
    state.lastIndexError = error.message;
    persist();
  });
}, Math.min(Math.max(intervalMs, 15000), 60000));

setInterval(async () => {
  try {
    await runOnce();
  } catch (error) {
    state.status = 'error';
    state.lastError = error.message;
    state.lastHeartbeatAt = new Date().toISOString();
    persist();
  }
}, intervalMs);

runOnce().catch((error) => {
  state.status = 'error';
  state.lastError = error.message;
  persist();
});
