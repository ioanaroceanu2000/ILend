// SPDX-License-Identifier: MIT
pragma solidity >=0.4.22 <0.8.0;
import "./ERC20.sol";
import "./Address.sol";
import "./InterestVariables.sol";

contract LiquidityPool {
  constructor() public {
  }

  address private owner;

  mapping (address => TokenCoreData) public tokensCoreData;
  mapping (address => UserBalance) public usersBalance;

  struct UserBalance{
    uint depositedAmount;
    address tokenDeposited;
    uint collateralAmount;
    address tokenCollateralised;
    uint borrowedAmount;
    address tokenBorrowed;
  }

  struct TokenCoreData{
    uint price;
    string symbol;
    uint utilisation;
    uint borrowIR;
    uint depositIR;
    uint collateral_factor;
    uint totalBorrowed;
    uint totalDeposited;
    uint totalCollateral;
  }

  modifier onlyOwner() {
      require(msg.sender == owner);
      _;
  }

  // create token with all data
  function createToken(string memory _symbol,
    address _token_address,
    uint _optimal_utilisation,
    uint _collateral_factor,
    uint _base_rate,
    uint _slope1,
    uint _slope2,
    uint _spread,
    uint _price,
    address _InterestContract_address) public{
      require(isContract(_InterestContract_address), 'Interest Variables contract address is not a contract');
      require(isContract(_token_address), 'Token contract address is not a contract');
      InterestVariables ivar = InterestVariables(_InterestContract_address);
      ivar.createToken(_symbol, _token_address, _optimal_utilisation, _collateral_factor, _base_rate, _slope1, _slope2, _spread);
      uint borrowIR = ivar.borrowInterestRate(_token_address, 0);
      uint depositIR = ivar.depositInterestRate(_token_address, 0, borrowIR);
      tokensCoreData[_token_address] = TokenCoreData(_price, _symbol, 0, borrowIR, depositIR, _collateral_factor, 0, 0, 0);
  }

  function isContract(address _addr) public view returns (bool){
    uint32 size;
    assembly {
      size := extcodesize(_addr)
    }
    return size > 0;
  }

  // update token price and call liquid checks
  function updateTokenPrice(address tokenId, uint _price) public{
    tokensCoreData[tokenId].price = _price;
  }

  // update utilisation rate
  function updateUtilisationRate(address tokenId) internal{
    tokensCoreData[tokenId].utilisation = tokensCoreData[tokenId].totalBorrowed / tokensCoreData[tokenId].totalDeposited;
  }

  // add to liquidity pool of token
  function addToReserves(address tokenId, uint amount, address payable user, bool isCollateral) internal{
    ERC20(tokenId).transferFrom(user, address(this), amount);
    if(isCollateral){
      tokensCoreData[tokenId].totalCollateral+=amount;
    }else{
      tokensCoreData[tokenId].totalDeposited+=amount;
    }
  }

  // take out from liquidity pool of token
  function takeFromReserves(address tokenId, uint amount, address payable user) internal{
    ERC20(tokenId).transferFrom(address(this), user,  amount);
    tokensCoreData[tokenId].totalBorrowed+=amount;
  }

  function getReserveBalance(address tokenId) public{
    ERC20(tokenId).balanceOf(address(this));
  }


  function deposit(address payable user, uint amount, address tokenId) public{
    //make sure users only have deposits in one token
    require(usersBalance[user].tokenDeposited == address(0) || usersBalance[user].depositedAmount == 0, "Address already has a deposit");
    //make sure token is supported
    require(tokensCoreData[tokenId].price != 0 && keccak256(bytes(tokensCoreData[tokenId].symbol)) != keccak256(bytes("")));
    addToReserves(tokenId, amount, user, false);
    updateUtilisationRate(tokenId);
    usersBalance[user].tokenDeposited = tokenId;
    usersBalance[user].depositedAmount = amount;

  }

  function borrow(address payable user, uint amount, address tokenId) public{
    //make sure token is supported
    require(tokensCoreData[tokenId].price != 0 && keccak256(bytes(tokensCoreData[tokenId].symbol)) != keccak256(bytes("")));
    // make sure subtracting amount from deposits does not make the total deposited less than total borrow
    require(tokensCoreData[tokenId].totalDeposited > tokensCoreData[tokenId].totalBorrowed + amount, "Cannot borrow if it results in overborrowings");
    //make sure users only have borrowings in one token
    require(usersBalance[user].tokenBorrowed == address(0) || usersBalance[user].borrowedAmount == 0, "Address already has a loan");
    // make sure it borrowes less than the collateral _collateral_factor
    require(amount < tokensCoreData[tokenId].collateral_factor * usersBalance[user].collateralAmount, "Cannot borrow over collateral factor");

    usersBalance[user].tokenBorrowed = tokenId;
    usersBalance[user].borrowedAmount = amount;
    takeFromReserves(tokenId, amount, user);
    updateUtilisationRate(tokenId);

  }

  function depositCollateral(address payable user, uint amount, address tokenId) public{
    //make sure users only have deposits in one token
    require(usersBalance[user].tokenCollateralised == address(0) || usersBalance[user].tokenCollateralised == tokenId, "Address already has collateral in another token");
    //make sure token is supported
    require(tokensCoreData[tokenId].price != 0 && keccak256(bytes(tokensCoreData[tokenId].symbol)) != keccak256(bytes("")), "Token not supported");
    addToReserves(tokenId, amount, user, true);
    if(usersBalance[user].tokenCollateralised != tokenId){
      usersBalance[user].tokenCollateralised = tokenId;
    }
    usersBalance[user].collateralAmount += amount;
  }

  function switchDepositToCollateral(address payable user, uint amount, address tokenId) public{
    //make sure token is supported
    require(tokensCoreData[tokenId].price != 0 && keccak256(bytes(tokensCoreData[tokenId].symbol)) != keccak256(bytes("")), "Token does not exist");
    // make sure deposited is not zero
    require(usersBalance[user].depositedAmount >= amount, "Deposit is 0, cannot switch to collateral");
    // make sure collateral is not in another token
    require(usersBalance[user].tokenCollateralised == address(0) || (usersBalance[user].tokenCollateralised == tokenId && usersBalance[user].tokenDeposited == tokenId), "Collateral already in another token or collateral token != deposit token");
    // make sure subtracting amount from deposits does not make the total deposited less than total borrow
    require(tokensCoreData[tokenId].totalDeposited - amount > tokensCoreData[tokenId].totalBorrowed, "Cannot decrease deposits if it results in overborrowings");

    usersBalance[user].depositedAmount -= amount;
    if(usersBalance[user].tokenCollateralised != tokenId){
      usersBalance[user].tokenCollateralised = tokenId;
    }
    tokensCoreData[tokenId].totalCollateral +=amount; // increase reserves collateral
    tokensCoreData[tokenId].totalDeposited -=amount; // decrease reserves deposits
    updateUtilisationRate(tokenId);
    usersBalance[user].collateralAmount += amount;
  }

}
