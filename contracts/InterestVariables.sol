// SPDX-License-Identifier: MIT
pragma solidity >=0.4.22 <0.8.0;
pragma experimental ABIEncoderV2;
import './SafeMath.sol';

contract InterestVariables {

  address private owner;

  modifier onlyOwner() {
      require(msg.sender == owner);
      _;
  }

  // tokens structure
  struct TknVariables {
    string symbol;
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

  function createToken(string memory _symbol,
    address _token_address,
    uint _optimal_utilisation,
    uint _collateral_factor,
    uint _base_rate,
    uint _slope1,
    uint _slope2,
    uint _spread)
    public{
    tokens[_token_address] = TknVariables(_symbol, _token_address,_optimal_utilisation*100, _collateral_factor*100, _base_rate*100, _slope1*100, _slope2*100, _spread*100);
    // initialise tokne glogal variable of CUMMULATED IR
    tokenIRcummulation[_token_address].cummulated_depositIR = 1e9;
    tokenIRcummulation[_token_address].cummulated_borrowIR = 1e9;
    tokenIRcummulation[_token_address].last_time = now;
  }

  function getSymbol(address id) public view returns(string memory){
    return tokens[id].symbol;
  }

  function getOptUtilisation(address id) public view returns(uint){
    return tokens[id].optimal_utilisation;
  }

  function getCollateralFactor(address id) public view returns(uint){
    return tokens[id].collateral_factor;
  }

  function getBaseRate(address id) public view returns(uint){
    return tokens[id].base_rate;
  }

  function getSlope1(address id) public view returns(uint){
    return tokens[id].slope1;
  }

  function getSlope2(address id) public view returns(uint){
    return tokens[id].slope2;
  }

  function getSpread(address id) public view returns(uint){
    return tokens[id].spread;
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
  function borrowInterestRate(address id, uint utilisationRate) public view returns(uint){
    TknVariables memory token = tokens[id];
    if(utilisationRate*100 < token.optimal_utilisation){
      return token.base_rate + token.slope1*(utilisationRate*10000/token.optimal_utilisation);
    }else{
      return token.base_rate + token.slope1 + (token.slope2/100)*( (utilisationRate*10000 - token.optimal_utilisation*100) / (10000 - token.optimal_utilisation));
    }
  }

  //returns ir% * 100 => returns 702 for 7.02% interest rate
  function depositInterestRate(address id, uint utilisationRate) public view returns(uint){
    uint borrow = borrowInterestRate(id, utilisationRate);
    TknVariables memory token = tokens[id];
    return borrow + borrow*token.spread/10000;
  }

  //returns ir% * 100 => returns 702 for 7.02% interest rate
  function depositInterestRate(address id, uint utilisationRate, uint borrowIR) public view returns(uint){
    //uint borrow = borrowInterestRate(id, utilisationRate);
    TknVariables memory token = tokens[id];
    return borrowIR + borrowIR*token.spread/10000;
  }

  // update the global variable interest rate
  // call this before utilisation rate changes
  //!! change visibility
  function compoundIR(address token, uint utilisationRate) public returns (bool){
    // timestamp
    uint timenow = now;

    // ir current (before changing the UtRate)
    uint before_borrowIR = borrowInterestRate(token, utilisationRate);
    uint before_depositIR = depositInterestRate(token, utilisationRate);

    uint PRECISION = 1e9;
    InterestCummulation memory tokenCummulation = tokenIRcummulation[token];
    // seconds since last update / seconds in a year -> to account for ir pre sec
    uint timeperiod = SafeMath.sub(timenow,tokenCummulation.last_time);
    uint256 UINT_MAX_VALUE = uint256(-1);

    // check if value of cummulated deposit interest will exceed uint256/1e9 (this is always larger)
    if(tokenCummulation.cummulated_depositIR*timeperiod*before_depositIR >= UINT_MAX_VALUE ){
      return false;
    }

    // compound cummulated interest rate
    // these values are always *1e9
    if(timeperiod != 0 && before_borrowIR != 0 &&  before_depositIR != 0){
      tokenIRcummulation[token].cummulated_borrowIR = SafeMath.div(SafeMath.mul(tokenCummulation.cummulated_borrowIR,powerPrecision(before_borrowIR, timeperiod)), PRECISION);
      tokenIRcummulation[token].cummulated_depositIR = SafeMath.div(SafeMath.mul(tokenCummulation.cummulated_depositIR,powerPrecision(before_depositIR, timeperiod)), PRECISION);
    }

    // update last time of update
    tokenIRcummulation[token].last_time = timenow;
    return true;
  }

  // ( (ir+secundeAn)*Precision/secundeAn)^perioada => interest to cummulate over that time period multiplied by PRECISION
  function powerPrecision(uint256 ir, uint256 power) internal view returns (uint256){
    uint256 PRECISION = 1e9;
    uint256 result = SafeMath.div(SafeMath.mul(SafeMath.add(ir,31556952), PRECISION), 31556952);
    for(uint i = 0; i< power - 1;i++){
      result = SafeMath.div(SafeMath.mul(result,SafeMath.add(ir,31556952)), 31556952);
    }
    return result;
  }


}
