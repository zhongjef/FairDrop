// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {CoDropPass} from "../src/CoDropPass.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

contract RejectingRecipient {}

contract ReenteringRecipient is IERC721Receiver {
    CoDropPass private immutable target;

    constructor(CoDropPass target_) {
        target = target_;
    }

    function onERC721Received(address, address, uint256, bytes calldata) external returns (bytes4) {
        address[] memory recipients = new address[](1);
        recipients[0] = address(this);
        try target.buy{value: target.price()}(recipients) {} catch {}
        return IERC721Receiver.onERC721Received.selector;
    }

    receive() external payable {}
}

contract Payee {
    CoDropPass public target;
    bool public rejectPayment;
    bool public attemptReentry;

    function setTarget(CoDropPass target_) external {
        target = target_;
    }

    function configure(bool rejectPayment_, bool attemptReentry_) external {
        rejectPayment = rejectPayment_;
        attemptReentry = attemptReentry_;
    }

    function withdrawOrganizer() external {
        target.withdrawOrganizer();
    }

    receive() external payable {
        if (rejectPayment) revert();
        if (attemptReentry) {
            try target.withdrawOrganizer() {} catch {}
        }
    }
}

contract ForceSend {
    constructor() payable {}

    function send(address payable recipient) external {
        selfdestruct(recipient);
    }
}

contract CoDropPassTest is Test {
    address private constant BUYER = address(0xB0B);
    address private constant ALICE = address(0xA11CE);
    address private constant BOB = address(0xB0B01);
    address private constant CAROL = address(0xCA201);
    address private constant ORGANIZER = address(0x0A6);
    address private constant PLATFORM = address(0xFEE);

    CoDropPass private pass;

    function setUp() public {
        pass = new CoDropPass(1 ether, 5, ORGANIZER, PLATFORM, "https://example.test/pass.json");
        vm.deal(BUYER, 20 ether);
    }

    function testBuyThreeAndWithdraw() public {
        address[] memory recipients = _threeRecipients();
        vm.prank(BUYER);
        pass.buy{value: 3 ether}(recipients);

        assertEq(pass.ownerOf(1), ALICE);
        assertEq(pass.ownerOf(2), BOB);
        assertEq(pass.ownerOf(3), CAROL);
        assertEq(pass.sold(), 3);
        assertEq(pass.remainingSupply(), 2);
        assertEq(pass.organizerPending(), 2.97 ether);
        assertEq(pass.platformPending(), 0.03 ether);
        assertEq(address(pass).balance, 3 ether);

        vm.prank(ORGANIZER);
        pass.withdrawOrganizer();
        vm.prank(PLATFORM);
        pass.withdrawPlatform();

        assertEq(ORGANIZER.balance, 2.97 ether);
        assertEq(PLATFORM.balance, 0.03 ether);
        assertEq(address(pass).balance, 0);
        assertEq(pass.organizerPending(), 0);
        assertEq(pass.platformPending(), 0);
    }

    function testOnePayerBuysForFiveRecipients() public {
        CoDropPass fivePass = new CoDropPass(0.01 ether, 5, ORGANIZER, PLATFORM, "https://example.test/pass.json");
        address[] memory recipients = new address[](5);
        for (uint256 i; i < recipients.length; ++i) {
            recipients[i] = address(uint160(0x100 + i));
        }

        vm.prank(BUYER);
        fivePass.buy{value: 0.05 ether}(recipients);

        for (uint256 i; i < recipients.length; ++i) {
            assertEq(fivePass.ownerOf(i + 1), recipients[i]);
        }
        assertEq(fivePass.sold(), 5);
        assertEq(fivePass.remainingSupply(), 0);
        assertEq(fivePass.organizerPending(), 0.0495 ether);
        assertEq(fivePass.platformPending(), 0.0005 ether);
        assertEq(address(fivePass).balance, 0.05 ether);
    }

    function testRejectsInvalidOrdersWithoutStateChanges() public {
        address[] memory empty = new address[](0);
        vm.expectRevert(CoDropPass.EmptyRecipients.selector);
        pass.buy(empty);

        address[] memory duplicate = new address[](2);
        duplicate[0] = ALICE;
        duplicate[1] = ALICE;
        vm.expectRevert(CoDropPass.DuplicateRecipient.selector);
        pass.buy{value: 2 ether}(duplicate);

        address[] memory zero = new address[](1);
        vm.expectRevert(CoDropPass.ZeroAddress.selector);
        pass.buy{value: 1 ether}(zero);

        address[] memory six = new address[](6);
        for (uint256 i; i < six.length; ++i) {
            six[i] = address(uint160(i + 1));
        }
        vm.expectRevert(CoDropPass.TooManyRecipients.selector);
        pass.buy{value: 6 ether}(six);

        address[] memory one = new address[](1);
        one[0] = ALICE;
        vm.expectRevert(CoDropPass.IncorrectPayment.selector);
        pass.buy{value: 0.9 ether}(one);
        vm.expectRevert(CoDropPass.IncorrectPayment.selector);
        pass.buy{value: 1.1 ether}(one);

        assertEq(pass.sold(), 0);
        assertEq(address(pass).balance, 0);
        assertEq(pass.organizerPending(), 0);
        assertEq(pass.platformPending(), 0);
    }

    function testRejectsInvalidConfiguration() public {
        vm.expectRevert(CoDropPass.InvalidConfiguration.selector);
        new CoDropPass(0, 5, ORGANIZER, PLATFORM, "https://example.test/pass.json");
        vm.expectRevert(CoDropPass.InvalidConfiguration.selector);
        new CoDropPass(1 ether, 0, ORGANIZER, PLATFORM, "https://example.test/pass.json");
        vm.expectRevert(CoDropPass.InvalidConfiguration.selector);
        new CoDropPass(1 ether, 5, address(0), PLATFORM, "https://example.test/pass.json");
        vm.expectRevert(CoDropPass.InvalidConfiguration.selector);
        new CoDropPass(1 ether, 5, ORGANIZER, ORGANIZER, "https://example.test/pass.json");
        vm.expectRevert(CoDropPass.InvalidConfiguration.selector);
        new CoDropPass(1 ether, 5, ORGANIZER, PLATFORM, "");
    }

    function testInventoryFailureIsAtomic() public {
        vm.prank(BUYER);
        pass.buy{value: 3 ether}(_threeRecipients());
        uint256 organizerBefore = pass.organizerPending();
        uint256 platformBefore = pass.platformPending();

        vm.prank(BUYER);
        vm.expectRevert(CoDropPass.InsufficientInventory.selector);
        pass.buy{value: 3 ether}(_threeRecipients());

        assertEq(pass.sold(), 3);
        assertEq(pass.organizerPending(), organizerBefore);
        assertEq(pass.platformPending(), platformBefore);
        assertEq(address(pass).balance, 3 ether);
    }

    function testReceiverFailureRollsBackEarlierMints() public {
        RejectingRecipient rejecting = new RejectingRecipient();
        address[] memory recipients = new address[](3);
        recipients[0] = ALICE;
        recipients[1] = address(rejecting);
        recipients[2] = BOB;

        vm.prank(BUYER);
        vm.expectRevert();
        pass.buy{value: 3 ether}(recipients);

        assertEq(pass.balanceOf(ALICE), 0);
        assertEq(pass.sold(), 0);
        assertEq(address(pass).balance, 0);
    }

    function testBuyReentryCannotOversell() public {
        ReenteringRecipient recipient = new ReenteringRecipient(pass);
        vm.deal(address(recipient), 1 ether);
        address[] memory recipients = new address[](1);
        recipients[0] = address(recipient);

        vm.prank(BUYER);
        pass.buy{value: 1 ether}(recipients);

        assertEq(pass.sold(), 1);
        assertEq(pass.balanceOf(address(recipient)), 1);
        assertEq(address(recipient).balance, 1 ether);
        assertEq(pass.organizerPending() + pass.platformPending(), 1 ether);
    }

    function testWithdrawAuthorizationFailureAndReentry() public {
        Payee payee = new Payee();
        CoDropPass guarded = new CoDropPass(1 ether, 5, address(payee), PLATFORM, "https://example.test/pass.json");
        payee.setTarget(guarded);
        payee.configure(false, true);

        vm.prank(BUYER);
        guarded.buy{value: 1 ether}(_oneRecipient());

        vm.expectRevert(CoDropPass.Unauthorized.selector);
        guarded.withdrawOrganizer();
        payee.withdrawOrganizer();

        assertEq(address(payee).balance, 0.99 ether);
        assertEq(guarded.organizerPending(), 0);
        vm.expectRevert(CoDropPass.NothingToWithdraw.selector);
        payee.withdrawOrganizer();
    }

    function testWithdrawalFailurePreservesPendingBalance() public {
        Payee payee = new Payee();
        CoDropPass guarded = new CoDropPass(1 ether, 5, address(payee), PLATFORM, "https://example.test/pass.json");
        payee.setTarget(guarded);
        payee.configure(true, false);

        vm.prank(BUYER);
        guarded.buy{value: 1 ether}(_oneRecipient());
        vm.expectRevert(CoDropPass.TransferFailed.selector);
        payee.withdrawOrganizer();

        assertEq(guarded.organizerPending(), 0.99 ether);
        assertEq(address(guarded).balance, 1 ether);
    }

    function testRoundingTransferAndForcedFunds() public {
        CoDropPass rounded = new CoDropPass(101 wei, 5, ORGANIZER, PLATFORM, "https://example.test/pass.json");
        vm.deal(BUYER, 1 ether);
        vm.prank(BUYER);
        rounded.buy{value: 101 wei}(_oneRecipient());
        assertEq(rounded.platformPending(), 1 wei);
        assertEq(rounded.organizerPending(), 100 wei);

        vm.prank(ALICE);
        rounded.transferFrom(ALICE, BOB, 1);
        assertEq(rounded.ownerOf(1), BOB);

        ForceSend force = new ForceSend{value: 1 ether}();
        force.send(payable(address(rounded)));
        assertEq(rounded.organizerPending() + rounded.platformPending(), 101 wei);
        assertEq(address(rounded).balance, 1 ether + 101 wei);
    }

    function _oneRecipient() private pure returns (address[] memory recipients) {
        recipients = new address[](1);
        recipients[0] = ALICE;
    }

    function _threeRecipients() private pure returns (address[] memory recipients) {
        recipients = new address[](3);
        recipients[0] = ALICE;
        recipients[1] = BOB;
        recipients[2] = CAROL;
    }
}
