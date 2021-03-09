// SPDX-License-Identifier: MIT
pragma solidity >=0.4.22 <0.8.0;
import "./LiquidityPool.sol";
import "./Exchange.sol";
import './SafeMath.sol';

contract LiquidationManager {

  LiquidityPool private lp;
  address public lp_address;
  Exchange private ex;
  mapping (address => uint) public neededTokens;
  mapping (address => uint) public reserves;

  constructor() public {
    owner = msg.sender;
  }

  address private owner;

  modifier onlyOwner() {
      require(msg.sender == owner, "OWLP");
      _;
  }

  modifier onlyLP() {
      require(msg.sender == lp_address, "OWLP");
      _;
  }

  function setLPandEx(address lp_add, address ex_add) public onlyOwner{
    lp = LiquidityPool(lp_add);
    lp_address = lp_add;
    ex = Exchange(ex_add);
  }

  function registerNeed(address token, uint amount) public onlyLP {
    neededTokens[token] = SafeMath.add(neededTokens[token], amount);
  }

  // user gives the token needed and received 105% of token from reserves
  function exchange(address tokenGet, uint amountGet, address tokenGive, address user) public{
    require(neededTokens[tokenGet] <= amountGet, "Gave too much");
    uint amountGive = SafeMath.div(SafeMath.mul(105, SafeMath.mul(amountGet, ex.getPrice(tokenGet))), ex.getPrice(tokenGive)*100);
    require(ERC20(tokenGive).balanceOf(address(this)) >=  amountGive, "Asked for too much");
    // get from user the token needed and transfer it to LP (token needed is the one borrowed backed by unexhangable token)
    ERC20(tokenGet).transferFrom(user, address(this), amountGet);
    ERC20(tokenGet).transfer(lp_address, amountGet);
    // LP totalborrow TokenGet -- amount get
    // LP totalColl TokenGive -- amountGive
    lp.modifyReserves(tokenGive, amountGive, tokenGet, amountGet);
    // give user the token they aked for
    ERC20(tokenGive).transfer(user, amountGive);
  }



}
