import fs from 'node:fs';
import path from 'node:path';
import solc from 'solc';
import { ethers } from 'ethers';

const root = process.cwd();
const rpcUrl = process.env.BOT_TESTNET_RPC_URL || process.env.VITE_BOT_TESTNET_RPC_URL || 'https://rpc.bohr.life';
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

const provider = new ethers.JsonRpcProvider(rpcUrl);
const deployer = new ethers.Wallet(privateKey, provider);
const network = await provider.getNetwork();
if (network.chainId !== 968n) {
  throw new Error(`Connected to chain ${network.chainId}, expected BOT testnet 968.`);
}

const agentAddress = process.env.AGENT_ADDRESS || deployer.address;
const factory = new ethers.ContractFactory(contract.abi, contract.evm.bytecode.object, deployer);
const vault = await factory.deploy(agentAddress, ethers.parseEther(dailyLimitBot));
await vault.waitForDeployment();
const address = await vault.getAddress();
const deployment = {
  network: 'BOT Chain Testnet',
  chainId: Number(network.chainId),
  rpcUrl,
  explorer: 'https://scan.bohr.life',
  vaultAddress: address,
  owner: deployer.address,
  agentAddress,
  dailyLimitBot,
  deployedAt: new Date().toISOString(),
};

fs.mkdirSync(path.join(root, 'deployments'), { recursive: true });
fs.writeFileSync(path.join(root, 'deployments', 'bot-testnet.json'), JSON.stringify(deployment, null, 2));
console.log(JSON.stringify(deployment, null, 2));
