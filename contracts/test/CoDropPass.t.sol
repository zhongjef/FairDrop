// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.30;

import {CoDropPass} from "../src/CoDropPass.sol";

interface Vm {
    function deal(address who, uint256 newBalance) external;
    function prank(address sender) external;
    function startPrank(address sender) external;
    function stopPrank() external;
    function expectRevert() external;
    function expectRevert(bytes4) external;
    function expectRevert(bytes calldata) external;
}

contract RejectingReceiver {
    receive() external payable {
        revert("reject");
    }

    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        revert("reject nft");
    }
}

contract ReentrantReceiver {
    CoDropPass public target;
    bool public swallow = true;
    uint256 public attempts;

    receive() external payable {}

    function setTarget(CoDropPass target_) external {
        target = target_;
    }

    function setSwallow(bool swallow_) external {
        swallow = swallow_;
    }

    function onERC721Received(address, address, uint256, bytes calldata) external returns (bytes4) {
        attempts += 1;
        address[] memory recipients = new address[](1);
        recipients[0] = address(this);
        try target.buy{value: target.price()}(recipients) {} catch {
            if (!swallow) revert("reentry");
        }
        return this.onERC721Received.selector;
    }
}

contract ReentrantPayoutReceiver {
    CoDropPass public target;
    uint8 public mode;
    bool public swallow = true;
    uint256 public attempts;

    function setTarget(CoDropPass target_, uint8 mode_) external {
        target = target_;
        mode = mode_;
    }

    function setSwallow(bool swallow_) external {
        swallow = swallow_;
    }

    receive() external payable {
        attempts += 1;
        if (mode == 1) {
            try target.withdrawOrganizer() {} catch {
                if (!swallow) revert("reentry");
            }
        } else if (mode == 2) {
            try target.withdrawPlatform() {} catch {
                if (!swallow) revert("reentry");
            }
        }
    }
}

contract ForceSender {
    constructor(address payable target) payable {
        selfdestruct(target);
    }
}

contract CoDropPassTest {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    // Keep test actors away from Monad's reserved low addresses (for example 0x1001).
    address internal constant ORGANIZER = address(0xA001);
    address internal constant PLATFORM = address(0xA002);
    address internal constant BUYER = address(0xA003);
    address internal constant ONE = address(0xA004);
    address internal constant TWO = address(0xA005);
    address internal constant THREE = address(0xA006);
    address internal constant FOUR = address(0xA007);
    address internal constant FIVE = address(0xA008);

    function testSingleRecipientPurchaseStartsAtTokenOne() external {
        CoDropPass pass = _newPass(1 ether, 5, ORGANIZER, PLATFORM);
        address[] memory recipients = _list(ONE);
        vm.deal(BUYER, 1 ether);
        vm.prank(BUYER);
        pass.buy{value: 1 ether}(recipients);

        _eq(pass.sold(), 1);
        _eq(pass.remaining(), 4);
        _eq(pass.ownerOf(1), ONE);
        _eqString(pass.tokenURI(1), "ipfs://metadata");
        vm.expectRevert();
        pass.tokenURI(2);
    }

    function testFiveRecipientPurchaseSellsOut() external {
        CoDropPass pass = _newPass(1 ether, 5, ORGANIZER, PLATFORM);
        address[] memory recipients = new address[](5);
        recipients[0] = ONE;
        recipients[1] = TWO;
        recipients[2] = THREE;
        recipients[3] = FOUR;
        recipients[4] = FIVE;
        vm.deal(BUYER, 6 ether);
        vm.prank(BUYER);
        pass.buy{value: 5 ether}(recipients);

        _eq(pass.sold(), 5);
        _eq(pass.remaining(), 0);
        _eq(pass.balanceOf(ONE), 1);
        _eq(pass.balanceOf(FIVE), 1);

        address[] memory another = _list(ONE);
        vm.prank(BUYER);
        vm.expectRevert(CoDropPass.InsufficientInventory.selector);
        pass.buy{value: 1 ether}(another);
        _eq(pass.sold(), 5);
    }

    function testMultiRecipientPurchaseAndAccounting() external {
        CoDropPass pass = _newPass(1 ether, 5, ORGANIZER, PLATFORM);
        address[] memory recipients = new address[](3);
        recipients[0] = ONE;
        recipients[1] = TWO;
        recipients[2] = THREE;
        vm.deal(BUYER, 3 ether);
        vm.prank(BUYER);
        pass.buy{value: 3 ether}(recipients);

        _eq(pass.sold(), 3);
        _eq(pass.remaining(), 2);
        _eq(pass.balanceOf(ONE), 1);
        _eq(pass.balanceOf(TWO), 1);
        _eq(pass.balanceOf(THREE), 1);
        _eq(pass.organizerPending(), 2.97 ether);
        _eq(pass.platformPending(), 0.03 ether);
        _eq(address(pass).balance, pass.organizerPending() + pass.platformPending());
    }

    function testCrossOrderDuplicateRecipientIsAllowed() external {
        CoDropPass pass = _newPass(1 ether, 5, ORGANIZER, PLATFORM);
        address[] memory recipients = _list(ONE);
        vm.deal(BUYER, 2 ether);
        vm.startPrank(BUYER);
        pass.buy{value: 1 ether}(recipients);
        pass.buy{value: 1 ether}(recipients);
        vm.stopPrank();

        _eq(pass.balanceOf(ONE), 2);
        _eq(pass.ownerOf(1), ONE);
        _eq(pass.ownerOf(2), ONE);
    }

    function testStandardTransferUpdatesOwnerAndBalances() external {
        CoDropPass pass = _newPass(1 ether, 5, ORGANIZER, PLATFORM);
        address[] memory recipients = _list(ONE);
        vm.deal(BUYER, 1 ether);
        vm.prank(BUYER);
        pass.buy{value: 1 ether}(recipients);

        vm.prank(ONE);
        pass.transferFrom(ONE, TWO, 1);
        _eq(pass.ownerOf(1), TWO);
        _eq(pass.balanceOf(ONE), 0);
        _eq(pass.balanceOf(TWO), 1);
    }

    function testInventoryShortageIsAtomic() external {
        CoDropPass pass = _newPass(1 ether, 2, ORGANIZER, PLATFORM);
        address[] memory recipients = new address[](3);
        recipients[0] = ONE;
        recipients[1] = TWO;
        recipients[2] = THREE;
        vm.deal(BUYER, 3 ether);
        vm.prank(BUYER);
        vm.expectRevert(CoDropPass.InsufficientInventory.selector);
        pass.buy{value: 3 ether}(recipients);

        _assertClean(pass);
        _eq(address(pass).balance, 0);
    }

    function testRejectingSecondReceiverRollsBackAllMints() external {
        CoDropPass pass = _newPass(1 ether, 5, ORGANIZER, PLATFORM);
        RejectingReceiver rejecting = new RejectingReceiver();
        address[] memory recipients = new address[](3);
        recipients[0] = ONE;
        recipients[1] = address(rejecting);
        recipients[2] = THREE;
        vm.deal(BUYER, 3 ether);
        vm.prank(BUYER);
        vm.expectRevert();
        pass.buy{value: 3 ether}(recipients);

        _assertClean(pass);
        _eq(pass.balanceOf(address(rejecting)), 0);
    }

    function testRejectingThirdReceiverRollsBackEarlierMints() external {
        CoDropPass pass = _newPass(1 ether, 5, ORGANIZER, PLATFORM);
        RejectingReceiver rejecting = new RejectingReceiver();
        address[] memory recipients = new address[](3);
        recipients[0] = ONE;
        recipients[1] = TWO;
        recipients[2] = address(rejecting);
        vm.deal(BUYER, 3 ether);
        vm.prank(BUYER);
        vm.expectRevert();
        pass.buy{value: 3 ether}(recipients);

        _assertClean(pass);
        _eq(pass.balanceOf(ONE), 0);
        _eq(pass.balanceOf(TWO), 0);
    }

    function testEmptyAndSixRecipientListsAreRejected() external {
        CoDropPass pass = _newPass(1 ether, 5, ORGANIZER, PLATFORM);
        address[] memory empty = new address[](0);
        vm.prank(BUYER);
        vm.expectRevert(CoDropPass.InvalidRecipientCount.selector);
        pass.buy(empty);

        address[] memory six = new address[](6);
        six[0] = ONE;
        six[1] = TWO;
        six[2] = THREE;
        six[3] = FOUR;
        six[4] = FIVE;
        six[5] = address(0xA009);
        vm.deal(BUYER, 6 ether);
        vm.prank(BUYER);
        vm.expectRevert(CoDropPass.InvalidRecipientCount.selector);
        pass.buy{value: 6 ether}(six);
        _assertClean(pass);
    }

    function testZeroDuplicateAndWrongPaymentAreRejected() external {
        CoDropPass pass = _newPass(1 ether, 5, ORGANIZER, PLATFORM);
        address[] memory zero = _list(address(0));
        vm.deal(BUYER, 1 ether);
        vm.prank(BUYER);
        vm.expectRevert(abi.encodeWithSelector(CoDropPass.InvalidRecipient.selector, address(0)));
        pass.buy{value: 1 ether}(zero);

        address[] memory duplicate = new address[](2);
        duplicate[0] = ONE;
        duplicate[1] = ONE;
        vm.deal(BUYER, 2 ether);
        vm.prank(BUYER);
        vm.expectRevert(abi.encodeWithSelector(CoDropPass.DuplicateRecipient.selector, ONE));
        pass.buy{value: 2 ether}(duplicate);

        address[] memory valid = _list(ONE);
        vm.prank(BUYER);
        vm.expectRevert(abi.encodeWithSelector(CoDropPass.IncorrectPayment.selector, 1 ether, 0.9 ether));
        pass.buy{value: 0.9 ether}(valid);
        vm.prank(BUYER);
        vm.expectRevert(abi.encodeWithSelector(CoDropPass.IncorrectPayment.selector, 1 ether, 1.1 ether));
        pass.buy{value: 1.1 ether}(valid);
        _assertClean(pass);
    }

    function testNonIntegerPriceRoundsPlatformFeeDownAndConservesRevenue() external {
        CoDropPass pass = _newPass(101, 5, ORGANIZER, PLATFORM);
        address[] memory recipients = new address[](3);
        recipients[0] = ONE;
        recipients[1] = TWO;
        recipients[2] = THREE;
        vm.deal(BUYER, 303);
        vm.prank(BUYER);
        pass.buy{value: 303}(recipients);

        _eq(pass.platformPending(), 3);
        _eq(pass.organizerPending(), 300);
        _eq(address(pass).balance, 303);
        _eq(address(pass).balance, pass.platformPending() + pass.organizerPending());
    }

    function testIndependentWithdrawalsAndZeroBalance() external {
        CoDropPass pass = _newPass(1 ether, 5, ORGANIZER, PLATFORM);
        address[] memory recipients = _list(ONE);
        vm.deal(BUYER, 1 ether);
        vm.prank(BUYER);
        pass.buy{value: 1 ether}(recipients);

        vm.prank(ORGANIZER);
        pass.withdrawOrganizer();
        _eq(pass.organizerPending(), 0);
        _eq(pass.platformPending(), 0.01 ether);
        _eq(address(pass).balance, 0.01 ether);

        vm.prank(ORGANIZER);
        vm.expectRevert(CoDropPass.NothingToWithdraw.selector);
        pass.withdrawOrganizer();

        vm.prank(PLATFORM);
        pass.withdrawPlatform();
        _eq(pass.platformPending(), 0);
        _eq(address(pass).balance, 0);
    }

    function testUnauthorizedWithdrawalsAreRejected() external {
        CoDropPass pass = _newPass(1 ether, 5, ORGANIZER, PLATFORM);
        address[] memory recipients = _list(ONE);
        vm.deal(BUYER, 1 ether);
        vm.prank(BUYER);
        pass.buy{value: 1 ether}(recipients);

        vm.prank(TWO);
        vm.expectRevert(CoDropPass.Unauthorized.selector);
        pass.withdrawOrganizer();
        vm.prank(TWO);
        vm.expectRevert(CoDropPass.Unauthorized.selector);
        pass.withdrawPlatform();
    }

    function testRejectingOrganizerTransferPreservesPendingLedger() external {
        RejectingReceiver rejecting = new RejectingReceiver();
        CoDropPass pass = _newPass(1 ether, 5, address(rejecting), PLATFORM);
        address[] memory recipients = _list(ONE);
        vm.deal(BUYER, 1 ether);
        vm.prank(BUYER);
        pass.buy{value: 1 ether}(recipients);

        vm.prank(address(rejecting));
        vm.expectRevert(CoDropPass.TransferFailed.selector);
        pass.withdrawOrganizer();
        _eq(pass.organizerPending(), 0.99 ether);
        _eq(address(pass).balance, 1 ether);
    }

    function testRejectingPlatformTransferPreservesPendingLedger() external {
        RejectingReceiver rejecting = new RejectingReceiver();
        CoDropPass pass = _newPass(1 ether, 5, ORGANIZER, address(rejecting));
        address[] memory recipients = _list(ONE);
        vm.deal(BUYER, 1 ether);
        vm.prank(BUYER);
        pass.buy{value: 1 ether}(recipients);

        vm.prank(address(rejecting));
        vm.expectRevert(CoDropPass.TransferFailed.selector);
        pass.withdrawPlatform();
        _eq(pass.platformPending(), 0.01 ether);
        _eq(address(pass).balance, 1 ether);
    }

    function testPurchaseReceiverReentryCannotOversell() external {
        ReentrantReceiver receiver = new ReentrantReceiver();
        CoDropPass pass = _newPass(1 ether, 5, ORGANIZER, PLATFORM);
        receiver.setTarget(pass);
        vm.deal(address(receiver), 1 ether);
        address[] memory recipients = _list(address(receiver));

        vm.deal(BUYER, 1 ether);
        vm.prank(BUYER);
        pass.buy{value: 1 ether}(recipients);

        _eq(receiver.attempts(), 1);
        _eq(pass.sold(), 1);
        _eq(pass.organizerPending(), 0.99 ether);
        _eq(pass.platformPending(), 0.01 ether);
        _eq(pass.ownerOf(1), address(receiver));
    }

    function testPurchaseReceiverReentryCanAbortWholeOrder() external {
        ReentrantReceiver receiver = new ReentrantReceiver();
        CoDropPass pass = _newPass(1 ether, 5, ORGANIZER, PLATFORM);
        receiver.setTarget(pass);
        receiver.setSwallow(false);
        vm.deal(address(receiver), 1 ether);
        address[] memory recipients = _list(address(receiver));

        vm.deal(BUYER, 1 ether);
        vm.prank(BUYER);
        vm.expectRevert();
        pass.buy{value: 1 ether}(recipients);
        _assertClean(pass);
    }

    function testOrganizerWithdrawalReentryIsBlocked() external {
        ReentrantPayoutReceiver receiver = new ReentrantPayoutReceiver();
        CoDropPass pass = _newPass(1 ether, 5, address(receiver), PLATFORM);
        receiver.setTarget(pass, 1);
        address[] memory recipients = _list(ONE);
        vm.deal(BUYER, 1 ether);
        vm.prank(BUYER);
        pass.buy{value: 1 ether}(recipients);

        vm.prank(address(receiver));
        pass.withdrawOrganizer();
        _eq(receiver.attempts(), 1);
        _eq(pass.organizerPending(), 0);
        _eq(address(pass).balance, 0.01 ether);
    }

    function testPlatformWithdrawalReentryIsBlocked() external {
        ReentrantPayoutReceiver receiver = new ReentrantPayoutReceiver();
        CoDropPass pass = _newPass(1 ether, 5, ORGANIZER, address(receiver));
        receiver.setTarget(pass, 2);
        address[] memory recipients = _list(ONE);
        vm.deal(BUYER, 1 ether);
        vm.prank(BUYER);
        pass.buy{value: 1 ether}(recipients);

        vm.prank(address(receiver));
        pass.withdrawPlatform();
        _eq(receiver.attempts(), 1);
        _eq(pass.platformPending(), 0);
        _eq(address(pass).balance, 0.99 ether);
    }

    function testDirectAndForcedFundsDoNotIncreasePendingLedger() external {
        CoDropPass pass = _newPass(1 ether, 5, ORGANIZER, PLATFORM);
        vm.deal(BUYER, 2 ether);

        vm.prank(BUYER);
        (bool directSuccess, ) = address(pass).call{value: 0.25 ether}("");
        require(directSuccess, "direct transfer failed");

        vm.prank(BUYER);
        new ForceSender{value: 0.5 ether}(payable(address(pass)));

        _eq(address(pass).balance, 0.75 ether);
        _eq(pass.organizerPending(), 0);
        _eq(pass.platformPending(), 0);

        address[] memory recipients = _list(ONE);
        vm.prank(BUYER);
        pass.buy{value: 1 ether}(recipients);
        _eq(pass.organizerPending() + pass.platformPending(), 1 ether);
        _eq(address(pass).balance, 1.75 ether);
    }

    function testConstructorRejectsInvalidConfiguration() external {
        vm.expectRevert(CoDropPass.ZeroValue.selector);
        new CoDropPass("CoDrop Pass", "CDP", 0, 5, ORGANIZER, PLATFORM, "ipfs://metadata");
        vm.expectRevert(CoDropPass.ZeroValue.selector);
        new CoDropPass("CoDrop Pass", "CDP", 1 ether, 0, ORGANIZER, PLATFORM, "ipfs://metadata");
        vm.expectRevert(CoDropPass.ZeroAddress.selector);
        new CoDropPass("CoDrop Pass", "CDP", 1 ether, 5, address(0), PLATFORM, "ipfs://metadata");
        vm.expectRevert(CoDropPass.ZeroAddress.selector);
        new CoDropPass("CoDrop Pass", "CDP", 1 ether, 5, ORGANIZER, address(0), "ipfs://metadata");
        vm.expectRevert(CoDropPass.EmptyMetadataUri.selector);
        new CoDropPass("CoDrop Pass", "CDP", 1 ether, 5, ORGANIZER, PLATFORM, "");
    }

    function _newPass(uint256 price_, uint256 inventory_, address organizer_, address platform_) internal returns (CoDropPass) {
        return new CoDropPass("CoDrop Pass", "CDP", price_, inventory_, organizer_, platform_, "ipfs://metadata");
    }

    function _list(address recipient) internal pure returns (address[] memory recipients) {
        recipients = new address[](1);
        recipients[0] = recipient;
    }

    function _assertClean(CoDropPass pass) internal view {
        _eq(pass.sold(), 0);
        _eq(pass.remaining(), pass.totalInventory());
        _eq(pass.balanceOf(ONE), 0);
        _eq(pass.balanceOf(TWO), 0);
        _eq(pass.balanceOf(THREE), 0);
        _eq(pass.organizerPending(), 0);
        _eq(pass.platformPending(), 0);
        _eq(address(pass).balance, 0);
    }

    function _eq(uint256 actual, uint256 expected) internal pure {
        require(actual == expected, "assertion failed");
    }

    function _eq(address actual, address expected) internal pure {
        require(actual == expected, "address assertion failed");
    }

    function _eqString(string memory actual, string memory expected) internal pure {
        require(keccak256(bytes(actual)) == keccak256(bytes(expected)), "string assertion failed");
    }
}
