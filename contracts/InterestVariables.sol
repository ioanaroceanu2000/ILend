// SPDX-License-Identifier: MIT
pragma solidity >=0.4.22 <0.8.0;
pragma experimental ABIEncoderV2;
import './SafeMath.sol';

contract InterestVariables {

  address private owner;
  address public liquidityPoolAddress;

  modifier onlyOwner() {
      require(msg.sender == owner, "Only owner can do function call");
      _;
  }

  modifier onlyLiquidityPool() {
      require(msg.sender == liquidityPoolAddress, "Only Liquidity pool can do function call");
      _;
  }

  // tokens structure
  struct TknVariables {
    address token_address;
    uint optimal_utilisation;
    uint collateral_factor;
    uint base_rate;
    uint slope1;
    uint slope2;
    uint spread;
  }

  mapping (address => TknVariables) public tokens;
  mapping (address => InterestCummulation) public tokenIRcummulation;

  struct InterestCummulation{
    uint256 cummulated_depositIR; // could only use this and get ride of borrow
    uint256 cummulated_borrowIR;
    uint last_time; // last time of IR cummulation
  }


  constructor() public{
    owner = msg.sender;
  }

  function setLiquidityPoolAddress(address add) public onlyOwner{
    liquidityPoolAddress = add;
  }

  function createToken(
    address _token_address,
    uint _optimal_utilisation,
    uint _collateral_factor,
    uint _base_rate,
    uint _slope1,
    uint _slope2,
    uint _spread)
    public{
    tokens[_token_address] = TknVariables( _token_address,_optimal_utilisation, _collateral_factor, _base_rate, _slope1, _slope2, _spread);
    // initialise tokne glogal variable of CUMMULATED IR
    tokenIRcummulation[_token_address].cummulated_depositIR = 1e12;
    tokenIRcummulation[_token_address].cummulated_borrowIR = 1e12;
    tokenIRcummulation[_token_address].last_time = now;
  }

  function getIRDepositTotalCummulation(address token) public view returns(uint){
    require(tokens[token].token_address != address(0), 'Token not created yet');
    return tokenIRcummulation[token].cummulated_depositIR;
  }

  function getIRBorrowTotalCummulation(address token) public view returns(uint){
    require(tokens[token].token_address != address(0), 'Token not created yet');
    return tokenIRcummulation[token].cummulated_borrowIR;
  }

  //returns ir% * 100 => returns 702 for 7.02% interest rate
  function depositInterestRate(address id, uint utilisationRate) public view returns(uint){
    TknVariables memory token = tokens[id];
    if(utilisationRate < token.optimal_utilisation){
      return SafeMath.add(SafeMath.mul(token.base_rate, 100), SafeMath.div(SafeMath.mul(SafeMath.mul(token.slope1, utilisationRate), 100), token.optimal_utilisation));
    }else{
      uint firstPart = SafeMath.mul(SafeMath.add(token.base_rate,token.slope1), 100);
      uint partAbove = SafeMath.mul(token.slope2, SafeMath.mul(100, SafeMath.sub(utilisationRate, token.optimal_utilisation)));
      uint partBelow = SafeMath.sub(100, token.optimal_utilisation);
      return SafeMath.add(firstPart, SafeMath.div(partAbove, partBelow));
    }
  }

  //returns ir% * 100 => returns 702 for 7.02% interest rate
  // //spread € {20,40}
  function borrowInterestRate(address id, uint utilisationRate) public view returns(uint){
    uint deposit = depositInterestRate(id, utilisationRate);
    TknVariables memory token = tokens[id];
    return SafeMath.add(deposit, SafeMath.div(SafeMath.mul(deposit, token.spread),100));
  }

  //returns ir% * 100 => returns 702 for 7.02% interest rate
  //spread € {20,40}
  function borrowInterestRate(address id, uint utilisationRate, uint deposit) public view returns(uint){
    TknVariables memory token = tokens[id];
    return SafeMath.add(deposit, SafeMath.div(SafeMath.mul(deposit, token.spread),100));
  }

  // update the global variable interest rate
  // call this before utilisation rate changes
  function compoundIR(address token, uint utilisationRate) public onlyLiquidityPool returns (bool){
    // timestamp
    uint timenow = now;

    // ir current (before changing the UtRate)
    uint before_borrowIR = borrowInterestRate(token, utilisationRate);
    uint before_depositIR = depositInterestRate(token, utilisationRate);

    uint PRECISION = 1e12;
    InterestCummulation memory tokenCummulation = tokenIRcummulation[token];
    // seconds since last update / seconds in a year -> to account for ir pre sec
    uint timeperiod = SafeMath.sub(timenow,tokenCummulation.last_time);
    uint256 UINT_MAX_VALUE = uint256(-1);

    // check if value of cummulated deposit interest will exceed uint256/1e12 (this is always larger)
    if(SafeMath.mul(SafeMath.mul(tokenCummulation.cummulated_depositIR,timeperiod), before_depositIR) >= UINT_MAX_VALUE ){
      return false;
    }

    // compound cummulated interest rate
    // these values are always *1e12
    if(timeperiod != 0 && before_borrowIR != 0 &&  before_depositIR != 0){
      tokenIRcummulation[token].cummulated_borrowIR = SafeMath.div(SafeMath.mul(tokenCummulation.cummulated_borrowIR,powerPrecision(before_borrowIR, timeperiod)), PRECISION);
      tokenIRcummulation[token].cummulated_depositIR = SafeMath.div(SafeMath.mul(tokenCummulation.cummulated_depositIR,powerPrecision(before_depositIR, timeperiod)), PRECISION);
    }

    // update last time of update
    tokenIRcummulation[token].last_time = timenow;
    return true;
  }

  // ( (ir+secundeAn)*Precision/secundeAn)^perioada => interest to cummulate over that time period multiplied by PRECISION 10^12
  function powerPrecision(uint256 ir, uint256 power) internal view returns (uint256){
    uint256 PRECISION = 1e12;
    uint256 secYear = 31556952;
    uint secYear4 = SafeMath.mul(secYear, 10000); // - because IR is actualir*10^4
    uint256 result = SafeMath.div(SafeMath.mul(SafeMath.add(ir,secYear4), PRECISION), secYear4);
    for(uint i = 0; i< SafeMath.sub(power,1); i++){
      result = SafeMath.div(SafeMath.mul(result,SafeMath.add(ir,secYear4)), secYear4);
    }
    return result;
  }


}
