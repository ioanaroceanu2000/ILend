// SPDX-License-Identifier: MIT
pragma solidity >=0.4.22 <0.8.0;
import "./ERC20.sol";
import "./Address.sol";
import "./InterestVariables.sol";
import "./Exchange.sol";
import './SafeMath.sol';

contract LiquidityPool {

  InterestVariables private ivar;
  Exchange private exchange;
  mapping (address => bool) public trustedTkns;


  constructor(address ivar_add, address exchange_add) public {
    ivar = InterestVariables(ivar_add);
    exchange = Exchange(exchange_add);
    owner = msg.sender;
  }

  address private owner;

  mapping (address => TokenCoreData) public tokensData;
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
    uint utilisation;
    uint collateral_factor;
    uint totalBorrowed;
    uint totalDeposited;
    uint totalCollateral;
    bool exchangeable;
  }

  modifier onlyOwner() {
      require(msg.sender == owner, "OWLP");
      _;
  }

  event Loan(
    address user,
    uint timestamp
  );


  // create token with all data
  function createToken(address _token_address,
    uint _optimal_utilisation,
    uint _collateral_factor,
    uint _base_rate,
    uint _slope1,
    uint _slope2,
    uint _spread,
    uint _price,
    bool truested) public{
      require(Address.isContract(_token_address), 'Not a contract');
      ivar.createToken(_token_address, _optimal_utilisation, _collateral_factor, _base_rate, _slope1, _slope2, _spread);
      tokensData[_token_address] = TokenCoreData(_price, 0, _collateral_factor, 0, 0, 0, true);
      trustedTkns[_token_address] = truested;
  }

  // discards all loan details when borrowed token is NOT exchangable anymore
  function tryDiscardLoan(address user) public returns (bool){
    address tokenBorrowed = usersBalance[user].tokenBorrowed;
    if(tokensData[tokenBorrowed].exchangeable == false && tokenBorrowed != address(0)){
      // delete from reserves registers
      tokensData[tokenBorrowed].totalBorrowed = SafeMath.sub(tokensData[tokenBorrowed].totalBorrowed, usersBalance[user].borrowedAmount);
      address tokenColl = usersBalance[user].tokenCollateralised;
      tokensData[tokenColl].totalCollateral = SafeMath.sub(tokensData[tokenColl].totalCollateral, usersBalance[user].collateralAmount);
      // delete user's loan and collateral
      usersBalance[user] = UserBalance(usersBalance[user].depositedAmount, usersBalance[user].init_interest_deposit, usersBalance[user].cummulated_ir_deposit, usersBalance[user].tokenDeposited, 0, address(0), 0, 0, 0, address(0));
      // compound interest and update utilisation for the borrowed token
      updateInterestRate(tokenBorrowed, tokensData[tokenBorrowed].utilisation);
      return true;
    }
    return false;
  }

  // update prices from the exchange
  function updateTokenPrice(address token) public{
    tokensData[token].price = exchange.getPrice(token);
  }

  function checkExchangeability(address token) public{
    tokensData[token].exchangeable = exchange.isExchangeable(token);
  }

  // cummulate interest rate for the token
  function updateInterestRate(address token, uint oldUtilisationRate) internal{
    ivar.compoundIR(token, oldUtilisationRate);
    // if not updated means that the compounded IR exceeds uint
    tokensData[token].utilisation = SafeMath.div(SafeMath.mul(tokensData[token].totalBorrowed, 100), tokensData[token].totalDeposited) ;
  }

  // add to liquidity pool of token
  function addToReserves(address tokenId, uint amount, address payable user, bool isCollateral, bool isRepayment) internal{
    ERC20(tokenId).transferFrom(user, address(this), amount);
    if(isCollateral){
      tokensData[tokenId].totalCollateral = SafeMath.add(amount, tokensData[tokenId].totalCollateral);
    }else if(isRepayment){
      tokensData[tokenId].totalBorrowed = SafeMath.sub(tokensData[tokenId].totalBorrowed, amount);
    }else{
      tokensData[tokenId].totalDeposited = SafeMath.add(tokensData[tokenId].totalDeposited, amount);
    }
  }

  // take out from liquidity pool of token
  function takeFromReserves(address tokenId, uint amount, address payable user, bool isLoan) internal{
    if(isLoan){
      tokensData[tokenId].totalBorrowed = SafeMath.add(tokensData[tokenId].totalBorrowed, amount);
    }else{ //redeeming
      tokensData[tokenId].totalDeposited = SafeMath.sub(tokensData[tokenId].totalDeposited, amount);
    }
    ERC20(tokenId).transfer(user,  amount);
  }

  function deposit(address payable user, uint amount, address tokenId) public{
    //make sure users only have deposits in one token
    require(usersBalance[user].tokenDeposited == tokenId || usersBalance[user].depositedAmount == 0, "Already has a deposit");
    //make sure token is supported
    require(tokensData[tokenId].price != 0, "Not supported");

    // make sure token is exchangeable
    checkExchangeability(tokenId);
    tryDiscardLoan(user);
    if(tokensData[tokenId].exchangeable != true){
      return;
    }

    addToReserves(tokenId, amount, user, false, false);
    updateInterestRate(tokenId,tokensData[tokenId].utilisation);
    usersBalance[user].tokenDeposited = tokenId;
    usersBalance[user].depositedAmount = SafeMath.add(amount, usersBalance[user].depositedAmount);
    usersBalance[user].cummulated_ir_deposit = SafeMath.add(amount, getCummulatedInterestDeposit(user));
    usersBalance[user].init_interest_deposit = ivar.getIRDepositTotalCummulation(tokenId);
  }

  function borrow(address payable user, uint amount, address tokenId) public{
    //make sure token is supported
    require(tokensData[tokenId].price != 0, "Not supported");

    // make sure token is exchangeable
    checkExchangeability(tokenId); // call at exchange 5
    tryDiscardLoan(user);
    if(tokensData[tokenId].exchangeable != true){
      return;
    }

    // make sure total borrow plus the amount to be borrowed is less than totalDeposited
    require(tokensData[tokenId].totalDeposited >= SafeMath.add(tokensData[tokenId].totalBorrowed, amount), "Overborrowings");
    //make sure users only have borrowings in one token
    require(usersBalance[user].tokenBorrowed == tokenId || usersBalance[user].borrowedAmount == 0, "Already has loan");
    // make sure it borrowes less than the collateral _collateral_factor
    address collateralToken = usersBalance[user].tokenCollateralised;
    uint healthFactorAfter = getHealthFactorUnsafe(collateralToken, usersBalance[user].collateralAmount, tokenId, SafeMath.add(amount, usersBalance[user].borrowedAmount));
    require(healthFactorAfter > 1000, "Cannot borrow over collateral factor");

    usersBalance[user].tokenBorrowed = tokenId;
    usersBalance[user].borrowedAmount = SafeMath.add(usersBalance[user].borrowedAmount, amount);
    usersBalance[user].cummulated_ir_borrow = SafeMath.add(amount, getCummulatedInterestLoan(user));
    takeFromReserves(tokenId, amount, user, true); // call at ETh a9
    updateInterestRate(tokenId,tokensData[tokenId].utilisation); // call at IR cb
    usersBalance[user].init_interest_borrow = ivar.getIRBorrowTotalCummulation(tokenId); 
    emit Loan(user, now);
  }

  function depositCollateral(address payable user, uint amount, address tokenId) public{
    //make sure users only have deposits in one token
    require(usersBalance[user].tokenCollateralised == address(0) || usersBalance[user].tokenCollateralised == tokenId, "Already has collateral");
    //make sure token is supported
    require(tokensData[tokenId].price != 0, "Not supported");

    // make sure token is exchangeable
    checkExchangeability(tokenId);
    tryDiscardLoan(user);
    if(tokensData[tokenId].exchangeable != true){
      return;
    }

    require(trustedTkns[tokenId] || SafeMath.add(tokensData[tokenId].totalCollateral, amount) <= tokensData[tokenId].totalBorrowed, "Token borrowed less than collateralized");

    addToReserves(tokenId, amount, user, true, false);
    usersBalance[user].tokenCollateralised = tokenId;
    usersBalance[user].collateralAmount = SafeMath.add(usersBalance[user].collateralAmount, amount);
  }

  // Currently switch from deposit to collaterall can only be done from the principle depositedAmount
  // not from the accumulated interest
  function switchDepositToCollateral(address payable user, uint amount) public{
    address tokenId = usersBalance[user].tokenDeposited;
    //make sure token is supported
    require(tokensData[tokenId].price != 0, "Not supported");

    // make sure token is exchangeable
    checkExchangeability(tokenId);
    tryDiscardLoan(user);
    if(tokensData[tokenId].exchangeable != true){
      return;
    }
    require(trustedTkns[tokenId] || SafeMath.add(tokensData[tokenId].totalCollateral, amount) <= tokensData[tokenId].totalBorrowed, "Token borrowed less than collateralized");
    // make sure deposited is not zero
    require(usersBalance[user].depositedAmount >= amount, "Deposit is not enough");
    // make sure collateral is not in another token
    require(usersBalance[user].tokenCollateralised == address(0) || (usersBalance[user].tokenCollateralised == tokenId && usersBalance[user].tokenDeposited == tokenId), "Collateral token is not deposit token");
    // make sure subtracting amount from deposits does not make the total deposited less than total borrow
    require(SafeMath.sub(tokensData[tokenId].totalDeposited,amount) > tokensData[tokenId].totalBorrowed, "Implies overborrowings");

    usersBalance[user].depositedAmount = SafeMath.sub(usersBalance[user].depositedAmount, amount);
    usersBalance[user].cummulated_ir_deposit = SafeMath.sub(getCummulatedInterestDeposit(user), amount);

    usersBalance[user].tokenCollateralised = tokenId;
    tokensData[tokenId].totalCollateral = SafeMath.add(tokensData[tokenId].totalCollateral, amount); // increase reserves collateral
    tokensData[tokenId].totalDeposited = SafeMath.sub(tokensData[tokenId].totalDeposited, amount); // decrease reserves deposits
    updateInterestRate(tokenId,tokensData[tokenId].utilisation);
    usersBalance[user].collateralAmount = SafeMath.add(usersBalance[user].collateralAmount, amount);
  }

  function repay(address payable user, uint amount) public{
    // check if there is something to repay
    require(usersBalance[user].borrowedAmount != 0, "No loan to repay");

    address token = usersBalance[user].tokenBorrowed;

    // make sure token is exchangeable
    checkExchangeability(token);
    tryDiscardLoan(user);
    if(tokensData[token].exchangeable != true){
      return;
    }

    require(trustedTkns[token] || SafeMath.sub(tokensData[token].totalBorrowed, amount) >= tokensData[token].totalCollateral, "Token borrowed less than collateralized");
    // check if given amount does not exceed the owed amount
    uint cummulatedInterest = getCummulatedInterestLoan(user); // cummulated amount owed
    require(cummulatedInterest >= amount, "Repaid too much");

    // what is not subtracted from the totalBorrowed of reserves is extra
    uint borrowedAmount = usersBalance[user].borrowedAmount;
    uint toPool = amount;
    uint extra = 0;
    if(amount > borrowedAmount){
      toPool = borrowedAmount;
      extra = SafeMath.sub(amount,toPool);
    }

    // repay what was borrowed to reserves
    addToReserves(token, toPool, user,false, true);
    // give interest payment (extra) to reserves as well
    ERC20(token).transferFrom(user, address(this), extra);

    // reinitialise initial interest
    usersBalance[user].borrowedAmount = SafeMath.sub(usersBalance[user].borrowedAmount, toPool);
    usersBalance[user].cummulated_ir_borrow = SafeMath.sub(cummulatedInterest ,amount);
    usersBalance[user].init_interest_borrow = ivar.getIRBorrowTotalCummulation(token);
    // modify utilisation rate and interest
    updateInterestRate(token, tokensData[token].utilisation);
  }

  function redeem(address payable user, uint amount) public{

    address token = usersBalance[user].tokenDeposited;

    // chack exchageability but do not require token to be exchangable
    checkExchangeability(token);
    tryDiscardLoan(user);

    // check if given amount does not exceed the deposit+interest
    uint cummulatedInterest = getCummulatedInterestDeposit(user); // cummulated amount owed
    require(cummulatedInterest >= amount, "Redeemed too much");

    // split the amount requested
    uint depositedAmount = usersBalance[user].depositedAmount;
    uint fromPool = amount;
    uint extra = 0;
    if(amount > depositedAmount){
      fromPool = depositedAmount;
      extra = SafeMath.sub(amount, depositedAmount);
    }

    // check if enough liquidity in reserves
    require( SafeMath.sub(tokensData[token].totalDeposited, fromPool) >= tokensData[token].totalBorrowed, "Implies overborrowing");
    // check for extra liquidity obtained from interest rate payments on loans
    uint reservesBalance = ERC20(token).balanceOf(address(this));
    // if extra redeemed, check if enough in extra reserves
    require(extra == 0 || extra < SafeMath.sub(SafeMath.sub(reservesBalance, tokensData[token].totalDeposited),tokensData[token].totalCollateral), "Not enough extra reserves");

    // update user's deposit variables
    usersBalance[user].depositedAmount = SafeMath.sub(usersBalance[user].depositedAmount, fromPool);
    usersBalance[user].cummulated_ir_deposit = SafeMath.sub(cummulatedInterest, amount);
    usersBalance[user].init_interest_deposit = ivar.getIRDepositTotalCummulation(token);

    // give from reserves
    takeFromReserves(token,fromPool,user,false);
    // transfer extra
    ERC20(token).transfer(user,extra);
    // modify utilisation rate and interest
    updateInterestRate(token, tokensData[token].utilisation);
  }

  function redeemCollateral(address payable user, uint amount) public{
    // chack exchageability but do not require token to be exchangable
    address collateralToken = usersBalance[user].tokenCollateralised;
    address borrowedToken = usersBalance[user].tokenBorrowed;
    checkExchangeability(collateralToken);
    checkExchangeability(borrowedToken);
    tryDiscardLoan(user);
    if(tokensData[borrowedToken].exchangeable != true){
      return;
    }

    // check if there is enough to redeem
    require(usersBalance[user].collateralAmount >= amount,"Redeemed too much");
    // check if redeeming would not affect the health factor
    uint healthFactorAfter = getHealthFactorUnsafe(collateralToken, SafeMath.sub(usersBalance[user].collateralAmount, amount), borrowedToken, getCummulatedInterestLoan(user));
    require( healthFactorAfter > 1000, "Health factor would be too low");
    // do changes in user's balances
    usersBalance[user].collateralAmount = SafeMath.sub(usersBalance[user].collateralAmount, amount);
    // do changes in reserves data
    tokensData[collateralToken].totalCollateral = SafeMath.sub(tokensData[collateralToken].totalCollateral, amount);
    ERC20(collateralToken).transfer(user,amount);
  }

  // get value of deposit with cummulated interest so far
  function getCummulatedInterestDeposit(address user) public view returns (uint){
    // get initial deposit
    address token = usersBalance[user].tokenDeposited;
    if(usersBalance[user].init_interest_deposit == 0){
      return 0;
    }
    // compute interest since depositing
    return SafeMath.div(SafeMath.mul(usersBalance[user].cummulated_ir_deposit,ivar.getIRDepositTotalCummulation(token)), usersBalance[user].init_interest_deposit);
  }

  // get value of deposit with cummulated interest so far
  function getCummulatedInterestLoan(address user) public view returns (uint){
    // get initial deposit
    address token = usersBalance[user].tokenBorrowed;
    if(usersBalance[user].init_interest_borrow == 0){
      return 0;
    }
    // compute interest since depositing
    return SafeMath.div(SafeMath.mul(usersBalance[user].cummulated_ir_borrow,ivar.getIRBorrowTotalCummulation(token)), usersBalance[user].init_interest_borrow);
  }

  // returns health factor *1000
  function getHealthFactor(address user) public view returns(uint){
    address collToken = usersBalance[user].tokenCollateralised;
    address borrToken = usersBalance[user].tokenBorrowed;
    // maximum y=the user can borrow against their collateral (*100)
    uint upperLimitLoanUSD100 = SafeMath.mul(SafeMath.mul(tokensData[collToken].collateral_factor, tokensData[collToken].price), usersBalance[user].collateralAmount);
    uint cummulatedLoan = getCummulatedInterestLoan(user);
    return SafeMath.div(SafeMath.mul(upperLimitLoanUSD100,10),SafeMath.mul(cummulatedLoan,tokensData[borrToken].price));
  }

  // returns health factor *1000
  function getHealthFactorUnsafe(address collToken, uint collAmount, address borrToken, uint owed) internal returns(uint){
    // maximum y=the user can borrow against their collateral (*100)
    updateTokenPrice(collToken);
    updateTokenPrice(borrToken);
    uint upperLimitLoanUSD100 = SafeMath.mul(SafeMath.mul(tokensData[collToken].collateral_factor, tokensData[collToken].price), collAmount);
    // how much they owe in USD
    return SafeMath.div(SafeMath.mul(upperLimitLoanUSD100,10),SafeMath.mul(owed, tokensData[borrToken].price));
  }

  function liquidate(address user) public{
    // check if the account has health Factor > 1
    address collToken = usersBalance[user].tokenCollateralised;
    address borrToken = usersBalance[user].tokenBorrowed;
    checkExchangeability(borrToken);
    tryDiscardLoan(user);
    if(tokensData[borrToken].exchangeable != true){
      return;
    }
    updateTokenPrice(collToken);
    updateTokenPrice(borrToken);
    uint cummulatedLoan = getCummulatedInterestLoan(user);
    uint healthFactor = getHealthFactorUnsafe(collToken, usersBalance[user].collateralAmount, borrToken, cummulatedLoan);
    require(healthFactor < 1000, "Safe health factor");

    // get money from sender (loan)
    // sender has to give me the amounnt owed
    ERC20(borrToken).transferFrom(msg.sender, address(this), cummulatedLoan);

    // send to sender (collateral)
    // sender has to receive the token collateralised correspondend with amount owed*1.05
    uint toLiquidator = SafeMath.div(SafeMath.mul(SafeMath.mul(cummulatedLoan, tokensData[borrToken].price),105), SafeMath.mul(tokensData[collToken].price, 100));

    // modify details
    usersBalance[user].borrowedAmount = 0;
    usersBalance[user].cummulated_ir_borrow = 0;
    usersBalance[user].collateralAmount = SafeMath.sub(usersBalance[user].collateralAmount, toLiquidator);
    tokensData[borrToken].totalBorrowed = SafeMath.sub(tokensData[borrToken].totalBorrowed, cummulatedLoan);
    tokensData[collToken].totalCollateral = SafeMath.sub(tokensData[collToken].totalCollateral, toLiquidator);

    ERC20(collToken).transfer(msg.sender, toLiquidator);
  }


}
