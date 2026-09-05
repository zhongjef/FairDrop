// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.30;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract CoDropPass is ERC721, ReentrancyGuard {
    uint256 public constant MAX_RECIPIENTS = 5;
    uint256 public constant PLATFORM_FEE_BPS = 100;
    uint256 private constant BPS_DENOMINATOR = 10_000;

    uint256 public immutable price;
    uint256 public immutable maxSupply;
    address payable public immutable organizer;
    address payable public immutable platform;

    uint256 public sold;
    uint256 public organizerPending;
    uint256 public platformPending;
    string private passURI;

    error EmptyRecipients();
    error TooManyRecipients();
    error ZeroAddress();
    error DuplicateRecipient();
    error InsufficientInventory();
    error IncorrectPayment();
    error Unauthorized();
    error NothingToWithdraw();
    error TransferFailed();
    error InvalidConfiguration();

    event Purchased(
        address indexed payer, address[] recipients, uint256 indexed startTokenId, uint256 amount, uint256 platformFee
    );
    event Withdrawal(address indexed payee, uint256 amount);

    constructor(uint256 price_, uint256 maxSupply_, address organizer_, address platform_, string memory passURI_)
        ERC721("CoDrop Pass", "CODROP")
    {
        if (
            price_ == 0 || maxSupply_ == 0 || organizer_ == address(0) || platform_ == address(0)
                || organizer_ == platform_ || bytes(passURI_).length == 0
        ) revert InvalidConfiguration();

        price = price_;
        maxSupply = maxSupply_;
        organizer = payable(organizer_);
        platform = payable(platform_);
        passURI = passURI_;
    }

    function remainingSupply() external view returns (uint256) {
        return maxSupply - sold;
    }

    function buy(address[] calldata recipients) external payable nonReentrant {
        uint256 count = recipients.length;
        if (count == 0) revert EmptyRecipients();
        if (count > MAX_RECIPIENTS) revert TooManyRecipients();
        if (sold + count > maxSupply) revert InsufficientInventory();

        for (uint256 i; i < count; ++i) {
            if (recipients[i] == address(0)) revert ZeroAddress();
            for (uint256 j; j < i; ++j) {
                if (recipients[i] == recipients[j]) revert DuplicateRecipient();
            }
        }

        uint256 amount = price * count;
        if (msg.value != amount) revert IncorrectPayment();

        uint256 fee = amount * PLATFORM_FEE_BPS / BPS_DENOMINATOR;
        uint256 startTokenId = sold + 1;
        sold += count;
        platformPending += fee;
        organizerPending += amount - fee;

        for (uint256 i; i < count; ++i) {
            _safeMint(recipients[i], startTokenId + i);
        }

        emit Purchased(msg.sender, recipients, startTokenId, amount, fee);
    }

    function withdrawOrganizer() external nonReentrant {
        if (msg.sender != organizer) revert Unauthorized();
        uint256 amount = organizerPending;
        if (amount == 0) revert NothingToWithdraw();
        organizerPending = 0;
        _send(organizer, amount);
    }

    function withdrawPlatform() external nonReentrant {
        if (msg.sender != platform) revert Unauthorized();
        uint256 amount = platformPending;
        if (amount == 0) revert NothingToWithdraw();
        platformPending = 0;
        _send(platform, amount);
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return passURI;
    }

    function _send(address payable recipient, uint256 amount) private {
        emit Withdrawal(recipient, amount);
        (bool sent,) = recipient.call{value: amount}("");
        if (!sent) revert TransferFailed();
    }

    receive() external payable {}
}
