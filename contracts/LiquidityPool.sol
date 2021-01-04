// SPDX-License-Identifier: MIT
pragma solidity >=0.4.22 <0.8.0;
import "./ERC20.sol";
import "./Address.sol";
import "./InterestVariables.sol";

contract LiquidityPool {

  InterestVariables private ivar;

  constructor(address ivar_add) public {
    require(isContract(ivar_add), 'Interest Variables contract address is not a contract');
    ivar = InterestVariables(ivar_add);
  }

  address private owner;

  mapping (address => TokenCoreData) public tokensCoreData;
  mapping (address => UserBalance) public usersBalance;

  struct UserBalance{
    uint depositedAmount;
    uint init_interest_deposit;
    uint cummulated_ir_deposit;
    address tokenDeposited;
    uint collateralAmount;
    address tokenCollateralised;
    uint borrowedAmount;
    uint init_interest_borrow;
    uint cummulated_ir_borrow;
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
    uint _price) public{
      require(isContract(_token_address), 'Token contract address is not a contract');
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

  // cummulate interest rate for the token
  function updateInterestRate(address user, address token, uint oldUtilisationRate) internal{
    bool updated = ivar.compoundIR(token, oldUtilisationRate);
    // if not updated means that the compounded IR exceeds uint
    updateUtilisationRate(token);
  }

  // add to liquidity pool of token
  function addToReserves(address tokenId, uint amount, address payable user, bool isCollateral, bool isRepayment) internal{
    ERC20(tokenId).transferFrom(user, address(this), amount);
    if(isCollateral){
      tokensCoreData[tokenId].totalCollateral+=amount;
    }else if(isRepayment){
      tokensCoreData[tokenId].totalBorrowed-=amount;
    }else{
      tokensCoreData[tokenId].totalDeposited+=amount;
    }
  }

  // take out from liquidity pool of token
  function takeFromReserves(address tokenId, uint amount, address payable user, bool isLoan) internal{
    ERC20(tokenId).transfer(user,  amount);
    if(isLoan){
      tokensCoreData[tokenId].totalBorrowed+=amount;
    }else{ //redeeming
      tokensCoreData[tokenId].totalDeposited-=amount;
    }
  }

  function getReserveBalance(address tokenId) public view returns(uint){
    return ERC20(tokenId).balanceOf(address(this));
  }


  function deposit(address payable user, uint amount, address tokenId) public{
    //make sure users only have deposits in one token
    require(usersBalance[user].tokenDeposited == address(0) || usersBalance[user].depositedAmount == 0, "Address already has a deposit");
    //make sure token is supported
    require(tokensCoreData[tokenId].price != 0 && keccak256(bytes(tokensCoreData[tokenId].symbol)) != keccak256(bytes("")));
    addToReserves(tokenId, amount, user, false, false);
    updateInterestRate(user,tokenId,tokensCoreData[tokenId].utilisation);
    usersBalance[user].tokenDeposited = tokenId;
    usersBalance[user].depositedAmount = amount;
    usersBalance[user].cummulated_ir_deposit = amount;
    usersBalance[user].init_interest_deposit = ivar.getIRDepositTotalCummulation(tokenId);
  }

  function borrow(address payable user, uint amount, address tokenId) public{
    //make sure token is supported
    require(tokensCoreData[tokenId].price != 0 && keccak256(bytes(tokensCoreData[tokenId].symbol)) != keccak256(bytes("")));
    // make sure subtracting amount from deposits does not make the total deposited less than total borrow
    require(tokensCoreData[tokenId].totalDeposited > tokensCoreData[tokenId].totalBorrowed + amount, "Cannot borrow if it results in overborrowings");
    //make sure users only have borrowings in one token
    require(usersBalance[user].tokenBorrowed == address(0) || usersBalance[user].borrowedAmount == 0, "Address already has a loan");
    // make sure it borrowes less than the collateral _collateral_factor
    address collateralToken = usersBalance[user].tokenCollateralised;
    require(amount < tokensCoreData[collateralToken].collateral_factor * usersBalance[user].collateralAmount, "Cannot borrow over collateral factor");

    usersBalance[user].tokenBorrowed = tokenId;
    usersBalance[user].borrowedAmount = amount;
    usersBalance[user].cummulated_ir_borrow = amount;
    takeFromReserves(tokenId, amount, user, true);
    updateInterestRate(user,tokenId,tokensCoreData[tokenId].utilisation);
    usersBalance[user].init_interest_borrow = ivar.getIRBorrowTotalCummulation(tokenId);

  }

  function depositCollateral(address payable user, uint amount, address tokenId) public{
    //make sure users only have deposits in one token
    require(usersBalance[user].tokenCollateralised == address(0) || usersBalance[user].tokenCollateralised == tokenId, "Address already has collateral in another token");
    //make sure token is supported
    require(tokensCoreData[tokenId].price != 0 && keccak256(bytes(tokensCoreData[tokenId].symbol)) != keccak256(bytes("")), "Token not supported");
    addToReserves(tokenId, amount, user, true, false);
    if(usersBalance[user].tokenCollateralised != tokenId){
      usersBalance[user].tokenCollateralised = tokenId;
    }
    usersBalance[user].collateralAmount += amount;
  }

  // Currently switch from deposit to collaterall can only be done from the principle depositedAmount
  // not from the accumulated interest
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
    uint cummulatedInterest = getCummulatedInterestDeposit(user);
    usersBalance[user].cummulated_ir_deposit = cummulatedInterest - amount;
    if(usersBalance[user].tokenCollateralised != tokenId){
      usersBalance[user].tokenCollateralised = tokenId;
    }
    tokensCoreData[tokenId].totalCollateral +=amount; // increase reserves collateral
    tokensCoreData[tokenId].totalDeposited -=amount; // decrease reserves deposits
    updateInterestRate(user,tokenId,tokensCoreData[tokenId].utilisation);
    usersBalance[user].collateralAmount += amount;
  }

  function repay(address payable user, uint amount) public{
    // check if there is something to repay
    require(usersBalance[user].borrowedAmount != 0, "There is no loan to repay for user");

    // check if given amount does not exceed the owed amount
    uint cummulatedInterest = getCummulatedInterestLoan(user); // cummulated amount owed
    require(cummulatedInterest >= amount, "Amount repaid is larger than owed");

    // what is not subtracted from the totalBorrowed of reserves is extra
    uint borrowedAmount = usersBalance[user].borrowedAmount;
    uint toPool = amount;
    uint extra = 0;
    if(amount > borrowedAmount){
      toPool = borrowedAmount;
      extra = amount-toPool;
    }

    address token = usersBalance[user].tokenBorrowed;

    // repay what was borrowed to reserves
    addToReserves(token, toPool, user,false, true);
    // give interest payment (extra) to reserves as well
    ERC20(token).transferFrom(user, address(this), extra);

    // reinitialise initial interest
    usersBalance[user].borrowedAmount -= toPool;
    usersBalance[user].cummulated_ir_borrow = cummulatedInterest - amount;
    usersBalance[user].init_interest_borrow = ivar.getIRBorrowTotalCummulation(token);
    // modify utilisation rate and interest
    updateInterestRate(user, token, tokensCoreData[token].utilisation);
  }

  function redeem(address payable user, uint amount) public{
    // check if given amount does not exceed the deposit+interest
    uint cummulatedInterest = getCummulatedInterestDeposit(user); // cummulated amount owed
    require(cummulatedInterest >= amount, "Amount redeemed is larger than assigned");

    // split the amount requested
    uint depositedAmount = usersBalance[user].depositedAmount;
    uint fromPool = amount;
    uint extra = 0;
    if(amount > depositedAmount){
      fromPool = depositedAmount;
      extra = amount - depositedAmount;
    }

    address token = usersBalance[user].tokenDeposited;

    // check if enough liquidity in reserves
    require( tokensCoreData[token].totalDeposited - fromPool >= tokensCoreData[token].totalBorrowed, "Demand would exceed supply");
    // check for extra liquidity obtained from interest rate payments on loans
    uint reservesBalance = getReserveBalance(token);
    require(extra < reservesBalance - tokensCoreData[token].totalDeposited - tokensCoreData[token].totalCollateral, "Not enough extra reserves");

    // update user's deposit variables
    usersBalance[user].depositedAmount -= fromPool;
    usersBalance[user].cummulated_ir_deposit = cummulatedInterest - amount;
    usersBalance[user].init_interest_deposit = ivar.getIRDepositTotalCummulation(token);

    // give from reserves
    takeFromReserves(token,fromPool,user,false);
    // transfer extra
    ERC20(token).transfer(user,extra);
    // modify utilisation rate and interest
    updateInterestRate(user, token, tokensCoreData[token].utilisation);
  }

  function redeemCollateral(address payable user, uint amount) public{
    // check if there is enough to redeem
    require(usersBalance[user].collateralAmount >= amount,"Given amount greater than the existing collateral");
    // check if redeeming would not affect the health factor
    uint cummulatedInterest = getCummulatedInterestLoan(user); // cummulated amount owed
    address collateralToken = usersBalance[user].tokenCollateralised;
    require(cummulatedInterest < tokensCoreData[collateralToken].collateral_factor * (usersBalance[user].collateralAmount - amount), "Health factor would be too low");
    // do changes in user's balances
    usersBalance[user].collateralAmount -= amount;
    // do changes in reserves data
    tokensCoreData[collateralToken].totalCollateral -= amount;
    ERC20(collateralToken).transfer(user,amount);
  }

  // get value of deposit with cummulated interest so far
  function getCummulatedInterestDeposit(address user) public view returns (uint){
    // get initial deposit
    uint balanceSoFar = usersBalance[user].cummulated_ir_deposit;
    address token = usersBalance[user].tokenDeposited;
    uint initial_ir = usersBalance[user].init_interest_deposit;
    // get token interest tokenCummulation
    uint interest_total_cummulation = ivar.getIRDepositTotalCummulation(token);
    require(interest_total_cummulation != 0, "INterest Total Cummulation is zero" );
    uint interest_earned = interest_total_cummulation/initial_ir;

    // compute interest since depositing
    return (balanceSoFar*interest_total_cummulation)/initial_ir;
  }

  // get value of deposit with cummulated interest so far
  function getCummulatedInterestLoan(address user) public view returns (uint){
    // get initial deposit
    uint balanceSoFar = usersBalance[user].cummulated_ir_borrow;
    address token = usersBalance[user].tokenBorrowed;
    uint initial_ir = usersBalance[user].init_interest_borrow;
    // get token interest tokenCummulation
    uint interest_total_cummulation = ivar.getIRBorrowTotalCummulation(token);
    require(interest_total_cummulation != 0, "INterest Total Cummulation is zero" );
    uint interest_earned = interest_total_cummulation/initial_ir;

    // compute interest since depositing
    return (balanceSoFar*interest_total_cummulation)/initial_ir;
  }

  function getUserInitDeposit(address user) public view returns(uint){
    return usersBalance[user].depositedAmount;
  }
  function getUserInterestTotalCummulation(address user) public view returns(uint){
    address token = usersBalance[user].tokenDeposited;
    return ivar.getIRDepositTotalCummulation(token);
  }
  function getUserInitInterest(address user) public view returns(uint){
    return usersBalance[user].init_interest_deposit;
  }

}
