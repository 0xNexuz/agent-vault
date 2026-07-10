// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20Minimal {
    function transfer(address recipient, uint256 amount) external returns (bool);
}

contract AgentVault {
    address public owner;
    uint256 public dailyLimitWei;
    bool private entered;

    mapping(address => bool) public agents;
    mapping(bytes32 => bool) public allowedActions;
    mapping(bytes32 => address) public actionTargets;
    mapping(bytes32 => bytes4) public actionSelectors;

    struct SpendWindow {
        uint256 day;
        uint256 spentWei;
    }

    mapping(address => SpendWindow) private spendWindows;

    event OwnerChanged(address indexed previousOwner, address indexed nextOwner);
    event AgentUpdated(address indexed agent, bool allowed);
    event ActionUpdated(bytes32 indexed actionId, bool allowed);
    event DailyLimitUpdated(uint256 dailyLimitWei);
    event ProtocolConfigured(bytes32 indexed actionId, address indexed target, bytes4 selector, bool allowed);
    event ProtocolExecution(bytes32 indexed executionId, address indexed target, bytes4 selector, uint256 valueWei);
    event NativeWithdrawn(address indexed recipient, uint256 amountWei);
    event TokenWithdrawn(address indexed token, address indexed recipient, uint256 amount);
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

    modifier nonReentrant() {
        require(!entered, "REENTRANCY");
        entered = true;
        _;
        entered = false;
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

    function configureAction(bytes32 actionId, address target, bytes4 selector, bool allowed) external onlyOwner {
        require(target != address(0), "ZERO_TARGET");
        require(selector != bytes4(0), "ZERO_SELECTOR");
        actionTargets[actionId] = target;
        actionSelectors[actionId] = selector;
        allowedActions[actionId] = allowed;
        emit ProtocolConfigured(actionId, target, selector, allowed);
        emit ActionUpdated(actionId, allowed);
    }

    function setDailyLimit(uint256 nextDailyLimitWei) external onlyOwner {
        dailyLimitWei = nextDailyLimitWei;
        emit DailyLimitUpdated(nextDailyLimitWei);
    }

    function executeProof(bytes32 actionId, uint256 amountWei, bytes32 metadataHash) external onlyAgent returns (bytes32 executionId) {
        _recordSpend(msg.sender, actionId, amountWei);
        executionId = _executionId(msg.sender, actionId, metadataHash);
        emit AgentExecution(executionId, msg.sender, actionId, amountWei, metadataHash, block.timestamp, block.number);
    }

    function executeProtocol(
        bytes32 actionId,
        uint256 amountWei,
        uint256 valueWei,
        bytes32 metadataHash,
        bytes calldata data
    ) external onlyAgent nonReentrant returns (bytes32 executionId, bytes memory result) {
        require(data.length >= 4, "MISSING_SELECTOR");
        require(valueWei <= amountWei, "VALUE_EXCEEDS_AMOUNT");
        address target = actionTargets[actionId];
        bytes4 selector = bytes4(data[:4]);
        require(target != address(0), "TARGET_NOT_CONFIGURED");
        require(actionSelectors[actionId] == selector, "SELECTOR_BLOCKED");
        require(address(this).balance >= valueWei, "VAULT_BALANCE");
        _recordSpend(msg.sender, actionId, amountWei);
        executionId = _executionId(msg.sender, actionId, metadataHash);
        (bool success, bytes memory returnData) = target.call{value: valueWei}(data);
        require(success, "PROTOCOL_CALL_FAILED");
        emit AgentExecution(executionId, msg.sender, actionId, amountWei, metadataHash, block.timestamp, block.number);
        emit ProtocolExecution(executionId, target, selector, valueWei);
        return (executionId, returnData);
    }

    function withdrawNative(address payable recipient, uint256 amountWei) external onlyOwner nonReentrant {
        require(recipient != address(0), "ZERO_RECIPIENT");
        require(address(this).balance >= amountWei, "VAULT_BALANCE");
        (bool success, ) = recipient.call{value: amountWei}("");
        require(success, "WITHDRAW_FAILED");
        emit NativeWithdrawn(recipient, amountWei);
    }

    function withdrawToken(address token, address recipient, uint256 amount) external onlyOwner nonReentrant {
        require(token != address(0), "ZERO_TOKEN");
        require(recipient != address(0), "ZERO_RECIPIENT");
        require(IERC20Minimal(token).transfer(recipient, amount), "TOKEN_WITHDRAW_FAILED");
        emit TokenWithdrawn(token, recipient, amount);
    }

    function _recordSpend(address agent, bytes32 actionId, uint256 amountWei) internal {
        require(allowedActions[actionId], "ACTION_BLOCKED");
        uint256 currentDay = block.timestamp / 1 days;
        SpendWindow storage window = spendWindows[agent];
        if (window.day != currentDay) {
            window.day = currentDay;
            window.spentWei = 0;
        }
        require(window.spentWei + amountWei <= dailyLimitWei, "DAILY_LIMIT");
        window.spentWei += amountWei;
    }

    function _executionId(address agent, bytes32 actionId, bytes32 metadataHash) internal view returns (bytes32) {
        return keccak256(abi.encodePacked(agent, actionId, metadataHash, block.chainid, block.number, block.timestamp));
    }

    function getTodaySpent(address agent) external view returns (uint256 day, uint256 spentWei) {
        SpendWindow memory window = spendWindows[agent];
        return (window.day, window.spentWei);
    }

    receive() external payable {}
}
