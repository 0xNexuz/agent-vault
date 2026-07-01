// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract AgentVault {
    address public owner;
    uint256 public dailyLimitWei;

    mapping(address => bool) public agents;
    mapping(bytes32 => bool) public allowedActions;

    struct SpendWindow {
        uint256 day;
        uint256 spentWei;
    }

    mapping(address => SpendWindow) private spendWindows;

    event OwnerChanged(address indexed previousOwner, address indexed nextOwner);
    event AgentUpdated(address indexed agent, bool allowed);
    event ActionUpdated(bytes32 indexed actionId, bool allowed);
    event DailyLimitUpdated(uint256 dailyLimitWei);
    event AgentExecution(
        bytes32 indexed executionId,
        address indexed agent,
        bytes32 indexed actionId,
        uint256 amountWei,
        bytes32 metadataHash,
        uint256 timestamp,
        uint256 blockNumber
    );

    modifier onlyOwner() {
        require(msg.sender == owner, "OWNER_ONLY");
        _;
    }

    modifier onlyAgent() {
        require(agents[msg.sender], "AGENT_ONLY");
        _;
    }

    constructor(address initialAgent, uint256 initialDailyLimitWei) {
        owner = msg.sender;
        dailyLimitWei = initialDailyLimitWei;
        allowedActions[keccak256("BDEX_SWAP_PROOF")] = true;
        allowedActions[keccak256("BRIDGE_PROOF")] = true;
        if (initialAgent != address(0)) {
            agents[initialAgent] = true;
            emit AgentUpdated(initialAgent, true);
        }
        emit OwnerChanged(address(0), msg.sender);
        emit DailyLimitUpdated(initialDailyLimitWei);
        emit ActionUpdated(keccak256("BDEX_SWAP_PROOF"), true);
        emit ActionUpdated(keccak256("BRIDGE_PROOF"), true);
    }

    function transferOwnership(address nextOwner) external onlyOwner {
        require(nextOwner != address(0), "ZERO_OWNER");
        emit OwnerChanged(owner, nextOwner);
        owner = nextOwner;
    }

    function setAgent(address agent, bool allowed) external onlyOwner {
        require(agent != address(0), "ZERO_AGENT");
        agents[agent] = allowed;
        emit AgentUpdated(agent, allowed);
    }

    function setAction(bytes32 actionId, bool allowed) external onlyOwner {
        allowedActions[actionId] = allowed;
        emit ActionUpdated(actionId, allowed);
    }

    function setDailyLimit(uint256 nextDailyLimitWei) external onlyOwner {
        dailyLimitWei = nextDailyLimitWei;
        emit DailyLimitUpdated(nextDailyLimitWei);
    }

    function executeProof(bytes32 actionId, uint256 amountWei, bytes32 metadataHash) external onlyAgent returns (bytes32 executionId) {
        require(allowedActions[actionId], "ACTION_BLOCKED");
        uint256 currentDay = block.timestamp / 1 days;
        SpendWindow storage window = spendWindows[msg.sender];
        if (window.day != currentDay) {
            window.day = currentDay;
            window.spentWei = 0;
        }
        require(window.spentWei + amountWei <= dailyLimitWei, "DAILY_LIMIT");
        window.spentWei += amountWei;

        executionId = keccak256(abi.encodePacked(msg.sender, actionId, metadataHash, block.chainid, block.number, block.timestamp));
        emit AgentExecution(executionId, msg.sender, actionId, amountWei, metadataHash, block.timestamp, block.number);
    }

    function getTodaySpent(address agent) external view returns (uint256 day, uint256 spentWei) {
        SpendWindow memory window = spendWindows[agent];
        return (window.day, window.spentWei);
    }
}
