// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.30;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title CoDropPass
/// @notice A fixed-supply ERC-721 pass sale with atomic multi-recipient delivery.
contract CoDropPass is ERC721, ReentrancyGuard {
    uint256 public constant MAX_RECIPIENTS = 5;
    uint256 public constant PLATFORM_FEE_BPS = 100;
    uint256 public constant BPS_DENOMINATOR = 10_000;

    uint256 public immutable price;
    uint256 public immutable totalInventory;
    address public immutable organizer;
    address public immutable platform;
    string private _metadataUri;

    uint256 public sold;
    uint256 public organizerPending;
    uint256 public platformPending;

    error ZeroAddress();
    error ZeroValue();
    error EmptyMetadataUri();
    error Unauthorized();
    error InvalidRecipientCount();
    error DuplicateRecipient(address recipient);
    error InvalidRecipient(address recipient);
    error InsufficientInventory();
    error IncorrectPayment(uint256 expected, uint256 received);
    error NothingToWithdraw();
    error TransferFailed();

    event PassesPurchased(
        address indexed payer,
        address[] recipients,
        uint256 indexed startTokenId,
        uint256 amount,
        uint256 platformFee
    );
    event OrganizerWithdrawal(address indexed recipient, uint256 amount);
    event PlatformWithdrawal(address indexed recipient, uint256 amount);

    constructor(
        string memory name_,
        string memory symbol_,
        uint256 price_,
        uint256 inventory_,
        address organizer_,
        address platform_,
        string memory metadataUri_
    ) ERC721(name_, symbol_) {
        if (price_ == 0 || inventory_ == 0) revert ZeroValue();
        if (organizer_ == address(0) || platform_ == address(0)) revert ZeroAddress();
        if (bytes(metadataUri_).length == 0) revert EmptyMetadataUri();

        price = price_;
        totalInventory = inventory_;
        organizer = organizer_;
        platform = platform_;
        _metadataUri = metadataUri_;
    }

    function remaining() public view returns (uint256) {
        return totalInventory - sold;
    }

    function metadataUri() external view returns (string memory) {
        return _metadataUri;
    }

    function buy(address[] calldata recipients) external payable nonReentrant {
        uint256 count = recipients.length;
        if (count == 0 || count > MAX_RECIPIENTS) revert InvalidRecipientCount();
        if (count > remaining()) revert InsufficientInventory();

        uint256 amount = count * price;
        if (msg.value != amount) revert IncorrectPayment(amount, msg.value);

        for (uint256 i = 0; i < count; i++) {
            address recipient = recipients[i];
            if (recipient == address(0)) revert InvalidRecipient(recipient);
            for (uint256 j = 0; j < i; j++) {
                if (recipients[j] == recipient) revert DuplicateRecipient(recipient);
            }
        }

        uint256 platformFee = (amount * PLATFORM_FEE_BPS) / BPS_DENOMINATOR;
        uint256 startTokenId = sold + 1;
        sold += count;
        organizerPending += amount - platformFee;
        platformPending += platformFee;

        for (uint256 i = 0; i < count; i++) {
            _safeMint(recipients[i], startTokenId + i);
        }

        emit PassesPurchased(msg.sender, recipients, startTokenId, amount, platformFee);
    }

    function withdrawOrganizer() external nonReentrant {
        if (msg.sender != organizer) revert Unauthorized();
        uint256 amount = organizerPending;
        if (amount == 0) revert NothingToWithdraw();
        organizerPending = 0;
        (bool success, ) = payable(organizer).call{value: amount}("");
        if (!success) {
            organizerPending = amount;
            revert TransferFailed();
        }
        emit OrganizerWithdrawal(organizer, amount);
    }

    function withdrawPlatform() external nonReentrant {
        if (msg.sender != platform) revert Unauthorized();
        uint256 amount = platformPending;
        if (amount == 0) revert NothingToWithdraw();
        platformPending = 0;
        (bool success, ) = payable(platform).call{value: amount}("");
        if (!success) {
            platformPending = amount;
            revert TransferFailed();
        }
        emit PlatformWithdrawal(platform, amount);
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        if (tokenId == 0 || tokenId > sold) {
            revert ERC721NonexistentToken(tokenId);
        }
        return _metadataUri;
    }

    /// @dev Direct MON transfers are accepted as unallocated balance. They never
    /// increase either pending ledger and cannot be withdrawn through business exits.
    receive() external payable {}
}
