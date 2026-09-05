// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.30;

import {CoDropPass} from "../src/CoDropPass.sol";

interface Vm {
    function envUint(string calldata) external returns (uint256);
    function envAddress(string calldata) external returns (address);
    function envString(string calldata) external returns (string memory);
    function addr(uint256 privateKey) external returns (address);
    function startBroadcast(uint256) external;
    function stopBroadcast() external;
}

abstract contract Script {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
}

contract DeployCoDropPass is Script {
    uint256 internal constant MONAD_TESTNET_CHAIN_ID = 10_143;
    uint256 internal constant PRICE = 1 ether;
    uint256 internal constant INVENTORY = 5;

    function run() external returns (CoDropPass deployed) {
        require(block.chainid == MONAD_TESTNET_CHAIN_ID, "wrong chain");

        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        address organizer = vm.envAddress("ORGANIZER_ADDRESS");
        address platform = vm.envAddress("PLATFORM_ADDRESS");
        string memory metadataUri = vm.envString("PASS_METADATA_URI");
        require(deployer.balance > 0, "deployer has no MON for gas");
        require(organizer != address(0) && platform != address(0), "zero payout address");
        require(organizer != platform, "payout addresses must differ");
        require(bytes(metadataUri).length > 0, "metadata URI is empty");

        vm.startBroadcast(deployerKey);
        deployed = new CoDropPass(
            "CoDrop Pass",
            "CDP",
            PRICE,
            INVENTORY,
            organizer,
            platform,
            metadataUri
        );
        vm.stopBroadcast();
    }
}
