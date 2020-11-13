// SPDX-License-Identifier: MIT
pragma solidity >=0.4.22 <0.8.0;
pragma experimental ABIEncoderV2;
//import './SafeMath.sol';

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
  }

  function getSymbol(address id) public returns(string memory){
    return tokens[id].symbol;
  }

  function getOptUtilisation(address id) public returns(uint){
    return tokens[id].optimal_utilisation;
  }

  function getCollateralFactor(address id) public returns(uint){
    return tokens[id].collateral_factor;
  }

  function getBaseRate(address id) public returns(uint){
    return tokens[id].base_rate;
  }

  function getSlope1(address id) public returns(uint){
    return tokens[id].slope1;
  }

  function getSlope2(address id) public returns(uint){
    return tokens[id].slope2;
  }

  function getSpread(address id) public returns(uint){
    return tokens[id].spread;
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

}
