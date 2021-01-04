// SPDX-License-Identifier: MIT
pragma solidity >=0.4.22 <0.8.0;
import "./ERC20.sol";
import "./Address.sol";

contract Exchange{

  constructor() public {
  }

  mapping (address => Token) private tokensData;

  struct Token{
    uint price;
    string symbol;
  }

  function createPool(address token, uint _price, string memory _symbol) public{
    // check if given address is a token
    require(isContract(token), 'Token contract address is not a contract');
    tokensData[token].price = _price;
    tokensData[token].symbol =  _symbol;
  }

  function getBalance(address token) public view returns(uint){
    // check if the pool was created
    require(keccak256(bytes(tokensData[token].symbol)) != keccak256(bytes("")), "Pool does not exist");
    return ERC20(token).balanceOf(address(this));
  }

  function exchange(address token1, address token2, uint amountReceive, address payable user) public{
    // check if the exchange has enough tokens to send
    uint amountSend = amountReceive*(tokensData[token1].price/tokensData[token2].price);
    require(getBalance(token2) >= amountSend, "Not enough to excgange");
    // check if a pool for token1 exists
    require(keccak256(bytes(tokensData[token1].symbol)) != keccak256(bytes("")), "Pool for token given does not exist");
    // receive token1
    ERC20(token1).transferFrom(user, address(this), amountReceive);
    // send token 2
    ERC20(token2).transfer(user,amountSend);
  }

  function isContract(address _addr) public view returns (bool){
    uint32 size;
    assembly {
      size := extcodesize(_addr)
    }
    return size > 0;
  }


}
