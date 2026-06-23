// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract NFTMarketplace is ReentrancyGuard {
    struct Listing {
        address seller;
        address nftAddress;
        uint256 tokenId;
        uint256 price;
        bool active;
    }

    // ListingId => Listing
    mapping(uint256 => Listing) public listings;
    uint256 private _nextListingId;

    function listNFT(address nftAddress, uint256 tokenId, uint256 price) external returns (uint256) {
        IERC721(nftAddress).transferFrom(msg.sender, address(this), tokenId);
        uint256 listingId = _nextListingId++;
        listings[listingId] = Listing(msg.sender, nftAddress, tokenId, price, true);
        return listingId;
    }

    function buyNFT(uint256 listingId) external payable nonReentrant {
        Listing storage listing = listings[listingId];
        require(listing.active, "Not active");
        require(msg.value >= listing.price, "Insufficient funds");

        listing.active = false;
        IERC721(listing.nftAddress).safeTransferFrom(address(this), msg.sender, listing.tokenId);
        payable(listing.seller).transfer(msg.value);
    }
}
