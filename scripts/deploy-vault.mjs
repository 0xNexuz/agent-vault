import fs from 'node:fs';
import path from 'node:path';
import solc from 'solc';
import { ethers } from 'ethers';

const root = process.cwd();
const expectedChainId = BigInt(process.env.BOT_CHAIN_ID || process.env.BOT_TESTNET_CHAIN_ID || '968');
const networkName = process.env.BOT_NETWORK_NAME || (expectedChainId === 677n ? 'BOT Chain Mainnet' : 'BOT Chain Testnet');
const rpcUrl = process.env.BOT_RPC_URL || process.env.BOT_TESTNET_RPC_URL || process.env.VITE_BOT_TESTNET_RPC_URL || 'https://rpc.bohr.life';
const explorerUrl = process.env.BOT_EXPLORER_URL || process.env.BOT_TESTNET_EXPLORER_URL || process.env.VITE_BOT_TESTNET_EXPLORER_URL || (expectedChainId === 677n ? 'https://scan.botchain.ai' : 'https://scan.bohr.life');
const privateKey = process.env.DEPLOYER_PRIVATE_KEY || process.env.PRIVATE_KEY;
const dailyLimitBot = process.env.VAULT_DAILY_LIMIT_BOT || '50';

const sourcePath = path.join(root, 'contracts', 'AgentVault.sol');
const source = fs.readFileSync(sourcePath, 'utf8');
const input = {
  language: 'Solidity',
  sources: { 'AgentVault.sol': { content: source } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } },
  },
};

const output = JSON.parse(solc.compile(JSON.stringify(input)));
if (output.errors) {
  const fatal = output.errors.filter((error) => error.severity === 'error');
  output.errors.forEach((error) => console.error(error.formattedMessage));
  if (fatal.length) process.exit(1);
}

const contract = output.contracts['AgentVault.sol'].AgentVault;
fs.mkdirSync(path.join(root, 'artifacts'), { recursive: true });
fs.writeFileSync(path.join(root, 'artifacts', 'AgentVault.json'), JSON.stringify(contract, null, 2));

if (process.env.COMPILE_ONLY === '1') {
  console.log('Compiled artifacts/AgentVault.json');
  process.exit(0);
}

if (!privateKey) {
  throw new Error('Compiled AgentVault.json. Missing DEPLOYER_PRIVATE_KEY, so deployment was not attempted.');
}

const rpcRequest = new ethers.FetchRequest(rpcUrl);
rpcRequest.timeout = Number(process.env.BOT_RPC_TIMEOUT_MS || 120000);
const provider = new ethers.JsonRpcProvider(rpcRequest);
const deployer = new ethers.Wallet(privateKey, provider);
const network = await provider.getNetwork();
if (network.chainId !== expectedChainId) {
  throw new Error(`Connected to chain ${network.chainId}, expected ${networkName} ${expectedChainId}.`);
}

const agentAddress = process.env.AGENT_ADDRESS || deployer.address;
const factory = new ethers.ContractFactory(contract.abi, contract.evm.bytecode.object, deployer);
const txOverrides = {};
if (process.env.DEPLOY_GAS_LIMIT) txOverrides.gasLimit = BigInt(process.env.DEPLOY_GAS_LIMIT);
if (process.env.DEPLOY_GAS_PRICE_GWEI) txOverrides.gasPrice = ethers.parseUnits(process.env.DEPLOY_GAS_PRICE_GWEI, 'gwei');
const vault = await factory.deploy(agentAddress, ethers.parseEther(dailyLimitBot), txOverrides);
await vault.waitForDeployment();
const address = await vault.getAddress();
const deployment = {
  network: networkName,
  chainId: Number(network.chainId),
  rpcUrl,
  explorer: explorerUrl,
  vaultAddress: address,
  owner: deployer.address,
  agentAddress,
  dailyLimitBot,
  deployedAt: new Date().toISOString(),
};

fs.mkdirSync(path.join(root, 'deployments'), { recursive: true });
const deploymentFile = expectedChainId === 677n ? 'bot-mainnet.json' : 'bot-testnet.json';
fs.writeFileSync(path.join(root, 'deployments', deploymentFile), JSON.stringify(deployment, null, 2));
console.log(JSON.stringify(deployment, null, 2));
