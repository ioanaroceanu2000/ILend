// SPDX-License-Identifier: MIT
pragma solidity >=0.4.22 <0.8.0;
import "./ERC20.sol";
import "./Address.sol";
import "./InterestVariables.sol";
import "./Exchange.sol";
import './SafeMath.sol';
import './LiquidationManager.sol';

contract LiquidityPool {

  InterestVariables private ivar;
  Exchange private exchange;
  LiquidationManager private lm;
  address public lm_add;
  mapping (address => bool) public trustedTkns;


  constructor(address ivar_add, address exchange_add, address lm_address) public {
    ivar = InterestVariables(ivar_add);
    exchange = Exchange(exchange_add);
    lm = LiquidationManager(lm_address);
    lm_add = lm_address;
    owner = msg.sender;
  }

  address private owner;

  mapping (address => tknCoreData) public tknsData;
  mapping (address => UserBalance) public uBal;

  struct UserBalance{
    uint depositedAmount;
    uint init_ir_deposit;
    uint cummulated_dep;
    address tknDeposited;
    uint collateralAmount;
    address tknCollateralised;
    uint borrowedAmount;
    uint init_ir_borrow;
    uint cummulated_borr;
    address tknBorrowed;
  }

  struct tknCoreData{
    uint price;
    uint utilisation;
    uint collateral_factor;
    uint totalBorrowed;
    uint totalDeposited;
    uint totalCollateral;
    bool exchangeable;
  }

  modifier onlyOwner() {
      require(msg.sender == owner || msg.sender == lm_add, "OWLP");
      _;
  }

  event Loan(
    address user,
    uint timestamp
  );


  // create tkn with all data
  function createtkn(address _tkn_address,
    uint _optimal_utilisation,
    uint _collateral_factor,
    uint _base_rate,
    uint _slope1,
    uint _slope2,
    uint _spread,
    uint _price,
    bool truested) public{
      require(Address.isContract(_tkn_address), 'Not a contract');
      ivar.createToken(_tkn_address, _optimal_utilisation, _collateral_factor, _base_rate, _slope1, _slope2, _spread);
      tknsData[_tkn_address] = tknCoreData(_price, 0, _collateral_factor, 0, 0, 0, true);
      trustedTkns[_tkn_address] = truested;
  }

  // discards all loan details when borrowed tkn is NOT exchangable anymore
  function tryDiscardLoan(address user) public{
    address tknBorr = uBal[user].tknBorrowed;
    address tknColl = uBal[user].tknCollateralised;
    uint cumm = ivar.getCumIrLoan(tknBorr, uBal[user].cummulated_borr, uBal[user].init_ir_borrow);
    if(!tknsData[tknBorr].exchangeable && tknBorr != address(0)){
      ERC20(tknColl).transfer(lm_add,uBal[user].collateralAmount); // give collateral to LM
      tknsData[tknColl].totalCollateral = SafeMath.sub(tknsData[tknColl].totalCollateral, uBal[user].collateralAmount);
      uBal[user] = UserBalance(uBal[user].depositedAmount, uBal[user].init_ir_deposit, uBal[user].cummulated_dep, uBal[user].tknDeposited, 0, address(0), 0, 0, 0, address(0));
    }
    if(!tknsData[tknColl].exchangeable && tknColl != address(0)){
      lm.registerNeed(tknBorr, cumm);
      //uBal[user] = UserBalance(uBal[user].depositedAmount, uBal[user].init_ir_deposit, uBal[user].cummulated_dep, uBal[user].tknDeposited, 0, address(0), 0, 0, 0, address(0));
    }
  }

  function modifyReserves(address colltkn, uint minusColl, address borrtkn, uint minusBorr) public onlyOwner{
    tknsData[borrtkn].totalBorrowed = SafeMath.sub(tknsData[borrtkn].totalBorrowed, minusBorr);
  }

  // update prices from the exchange
  function updatetknPrice(address tkn) public{
    tknsData[tkn].price = exchange.getPrice(tkn);
  }

  function checkExchangeability(address tkn) public{
    tknsData[tkn].exchangeable = exchange.isExchangeable(tkn);
  }

  // cummulate interest rate for the tkn
  function updateInterestRate(address tkn, uint oldUtilisationRate) internal{
    ivar.compoundIR(tkn, oldUtilisationRate);
    // if not updated means that the compounded IR exceeds uint
    if(tknsData[tkn].totalDeposited != 0){
      tknsData[tkn].utilisation = SafeMath.div(SafeMath.mul(tknsData[tkn].totalBorrowed, 100), tknsData[tkn].totalDeposited);
    }else{
      tknsData[tkn].utilisation = 0;
    }

  }

  // add to liquidity pool of tkn
  function addToReserves(address tknId, uint amount, address payable user, bool isCollateral, bool isRepayment) internal{
    ERC20(tknId).transferFrom(user, address(this), amount);
    if(isCollateral){
      tknsData[tknId].totalCollateral = SafeMath.add(amount, tknsData[tknId].totalCollateral);
    }else if(isRepayment){
      tknsData[tknId].totalBorrowed = SafeMath.sub(tknsData[tknId].totalBorrowed, amount);
    }else{
      tknsData[tknId].totalDeposited = SafeMath.add(tknsData[tknId].totalDeposited, amount);
    }
  }

  // take out from liquidity pool of tkn
  function takeFromReserves(address tknId, uint amount, address payable user, bool isLoan) internal{
    if(isLoan){
      tknsData[tknId].totalBorrowed = SafeMath.add(tknsData[tknId].totalBorrowed, amount);
    }else{ //redeeming
      tknsData[tknId].totalDeposited = SafeMath.sub(tknsData[tknId].totalDeposited, amount);
    }
    ERC20(tknId).transfer(user,  amount);
  }

  function deposit(address payable user, uint amount, address tknId) public{
    //make sure users only have deposits in one tkn
    require(uBal[user].tknDeposited == tknId || uBal[user].depositedAmount == 0, "Already has a deposit");
    //make sure tkn is supported
    require(tknsData[tknId].price != 0, "Not supported");

    // make sure tkn is exchangeable
    checkExchangeability(tknId);
    tryDiscardLoan(user);
    if(!tknsData[tknId].exchangeable){
      return;
    }

    addToReserves(tknId, amount, user, false, false);
    updateInterestRate(tknId,tknsData[tknId].utilisation);
    uBal[user].tknDeposited = tknId;
    uBal[user].depositedAmount = SafeMath.add(amount, uBal[user].depositedAmount);
    uBal[user].cummulated_dep = SafeMath.add(amount, ivar.getCumIrDeposit(uBal[user].tknDeposited, uBal[user].cummulated_dep, uBal[user].init_ir_deposit));
    uBal[user].init_ir_deposit = ivar.getIRDepositTotalCummulation(tknId);
  }

  function borrow(address payable user, uint amount, address tknId) public{
    //make sure tkn is supported
    require(tknsData[tknId].price != 0, "Not supported");

    // make sure tkn is exchangeable
    checkExchangeability(tknId); // call at exchange 5
    tryDiscardLoan(user);
    if(!tknsData[tknId].exchangeable){
      return;
    }

    require(tknsData[tknId].totalDeposited >= SafeMath.add(tknsData[tknId].totalBorrowed, amount), "Overborrowings");

    require(uBal[user].tknBorrowed == tknId || uBal[user].borrowedAmount == 0, "Already has loan");

    address collateraltkn = uBal[user].tknCollateralised;
    uint healthFactorAfter = getHealthFactorUnsafe(collateraltkn, uBal[user].collateralAmount, tknId, SafeMath.add(amount, uBal[user].borrowedAmount));
    require(healthFactorAfter > 1000, "Unhealthy");

    uBal[user].tknBorrowed = tknId;
    uBal[user].borrowedAmount = SafeMath.add(uBal[user].borrowedAmount, amount);
    uBal[user].cummulated_borr = SafeMath.add(amount, ivar.getCumIrLoan(tknId, uBal[user].cummulated_borr, uBal[user].init_ir_borrow));
    takeFromReserves(tknId, amount, user, true);
    updateInterestRate(tknId,tknsData[tknId].utilisation);
    uBal[user].init_ir_borrow = ivar.getIRBorrowTotalCummulation(tknId);
    emit Loan(user, now);
  }

  function depositCollateral(address payable user, uint amount, address tknId) public{
    require(uBal[user].tknCollateralised == address(0) || uBal[user].tknCollateralised == tknId, "Already has collateral");

    require(tknsData[tknId].price != 0, "Not supported");

    checkExchangeability(tknId);
    tryDiscardLoan(user);
    if(!tknsData[tknId].exchangeable){
      return;
    }

    require(trustedTkns[tknId] || SafeMath.add(tknsData[tknId].totalCollateral, amount) <= tknsData[tknId].totalBorrowed, "borrowed less than collateralized");

    addToReserves(tknId, amount, user, true, false);
    uBal[user].tknCollateralised = tknId;
    uBal[user].collateralAmount = SafeMath.add(uBal[user].collateralAmount, amount);
  }

  function repay(address payable user, uint amount) public{
    require(uBal[user].borrowedAmount != 0, "No loan to repay");
    address tkn = uBal[user].tknBorrowed;
    checkExchangeability(tkn);
    tryDiscardLoan(user);
    if(!tknsData[tkn].exchangeable){
      return;
    }

    require(trustedTkns[tkn] || SafeMath.sub(tknsData[tkn].totalBorrowed, amount) >= tknsData[tkn].totalCollateral, "borrowed less than collateralized");
    uint cummulatedInterest = ivar.getCumIrLoan(tkn, uBal[user].cummulated_borr, uBal[user].init_ir_borrow); // cummulated amount owed
    require(cummulatedInterest >= amount, "Repaid too much");

    // what is not subtracted from the totalBorrowed of reserves is extra
    uint borrowedAmount = uBal[user].borrowedAmount;
    uint toPool = amount;
    uint extra = 0;
    if(amount > borrowedAmount){
      toPool = borrowedAmount;
      extra = SafeMath.sub(amount,toPool);
    }

    // repay what was borrowed to reserves
    addToReserves(tkn, toPool, user,false, true);
    // give interest payment (extra) to reserves as well
    ERC20(tkn).transferFrom(user, address(this), extra);

    // reinitialise initial interest
    uBal[user].borrowedAmount = SafeMath.sub(uBal[user].borrowedAmount, toPool);
    uBal[user].cummulated_borr = SafeMath.sub(cummulatedInterest ,amount);
    uBal[user].init_ir_borrow = ivar.getIRBorrowTotalCummulation(tkn);
    updateInterestRate(tkn, tknsData[tkn].utilisation);
  }

  function redeem(address payable user, uint amount) public{

    address tkn = uBal[user].tknDeposited;

    checkExchangeability(tkn);
    tryDiscardLoan(user);

    uint cummulatedInterest = ivar.getCumIrDeposit(uBal[user].tknDeposited, uBal[user].cummulated_dep, uBal[user].init_ir_deposit);
    require(cummulatedInterest >= amount, "Redeemed too much");

    // split the amount requested
    uint depositedAmount = uBal[user].depositedAmount;
    uint fromPool = amount;
    uint extra = 0;
    if(amount > depositedAmount){
      fromPool = depositedAmount;
      extra = SafeMath.sub(amount, depositedAmount);
    }

    require( SafeMath.sub(tknsData[tkn].totalDeposited, fromPool) >= tknsData[tkn].totalBorrowed, "Overborrowing");
    uint reservesBalance = ERC20(tkn).balanceOf(address(this));
    require(extra == 0 || extra < SafeMath.sub(SafeMath.sub(reservesBalance, tknsData[tkn].totalDeposited),tknsData[tkn].totalCollateral), "Not enough extra reserves");

    // update user's deposit variables
    uBal[user].depositedAmount = SafeMath.sub(uBal[user].depositedAmount, fromPool);
    uBal[user].cummulated_dep = SafeMath.sub(cummulatedInterest, amount);
    uBal[user].init_ir_deposit = ivar.getIRDepositTotalCummulation(tkn);

    takeFromReserves(tkn,fromPool,user,false);
    ERC20(tkn).transfer(user,extra);
    updateInterestRate(tkn, tknsData[tkn].utilisation);
  }

  function redeemCollateral(address payable user, uint amount) public{
    // chack exchageability but do not require tkn to be exchangable
    address collateraltkn = uBal[user].tknCollateralised;
    address borrowedtkn = uBal[user].tknBorrowed;
    checkExchangeability(collateraltkn);
    checkExchangeability(borrowedtkn);
    tryDiscardLoan(user);
    if(!tknsData[borrowedtkn].exchangeable){
      return;
    }

    require(uBal[user].collateralAmount >= amount,"Redeemed too much");
    uint healthFactorAfter = getHealthFactorUnsafe(collateraltkn, SafeMath.sub(uBal[user].collateralAmount, amount), borrowedtkn, ivar.getCumIrLoan(borrowedtkn, uBal[user].cummulated_borr, uBal[user].init_ir_borrow));
    require( healthFactorAfter > 1000, "Unhealthy");
    uBal[user].collateralAmount = SafeMath.sub(uBal[user].collateralAmount, amount);
    tknsData[collateraltkn].totalCollateral = SafeMath.sub(tknsData[collateraltkn].totalCollateral, amount);
    ERC20(collateraltkn).transfer(user,amount);
  }

  // returns health factor *1000
  function getHealthFactorUnsafe(address colltkn, uint collAmount, address borrtkn, uint owed) internal returns(uint){
    // maximum y=the user can borrow against their collateral (*100)
    updatetknPrice(colltkn);
    updatetknPrice(borrtkn);
    uint upperLimitLoanUSD100 = SafeMath.mul(SafeMath.mul(tknsData[colltkn].collateral_factor, tknsData[colltkn].price), collAmount);
    // how much they owe in USD
    return SafeMath.div(SafeMath.mul(upperLimitLoanUSD100,10),SafeMath.mul(owed, tknsData[borrtkn].price));
  }

  // returns health factor *1000
  function getHealthFactor(address user) public view returns(uint){
    address collToken = uBal[user].tknCollateralised;
    address borrToken = uBal[user].tknBorrowed;
    // maximum y=the user can borrow against their collateral (*100)
    uint upperLimitLoanUSD100 = SafeMath.mul(SafeMath.mul(tknsData[collToken].collateral_factor, tknsData[collToken].price), uBal[user].collateralAmount);
    uint cummulatedLoan = ivar.getCumIrLoan(borrToken, uBal[user].cummulated_borr, uBal[user].init_ir_borrow);
    return SafeMath.div(SafeMath.mul(upperLimitLoanUSD100,10),SafeMath.mul(cummulatedLoan,tknsData[borrToken].price));
  }

  function liquidate(address user) public{
    // check if the account has health Factor > 1
    address colltkn = uBal[user].tknCollateralised;
    address borrtkn = uBal[user].tknBorrowed;
    checkExchangeability(borrtkn);
    tryDiscardLoan(user);
    if(!tknsData[borrtkn].exchangeable){
      return;
    }
    updatetknPrice(colltkn);
    updatetknPrice(borrtkn);
    uint cummulatedLoan = ivar.getCumIrLoan(borrtkn, uBal[user].cummulated_borr, uBal[user].init_ir_borrow);
    uint healthFactor = getHealthFactorUnsafe(colltkn, uBal[user].collateralAmount, borrtkn, cummulatedLoan);
    require(healthFactor < 1000, "Safe HF");

    // get money from sender (loan)
    // sender has to give me the amounnt owed
    ERC20(borrtkn).transferFrom(msg.sender, address(this), cummulatedLoan);

    // send to sender (collateral)
    // sender has to receive the tkn collateralised correspondend with amount owed*1.05
    uint toLiquidator = SafeMath.div(SafeMath.mul(SafeMath.mul(cummulatedLoan, tknsData[borrtkn].price),105), SafeMath.mul(tknsData[colltkn].price, 100));

    // modify details
    uBal[user].borrowedAmount = 0;
    uBal[user].cummulated_borr = 0;
    uBal[user].collateralAmount = SafeMath.sub(uBal[user].collateralAmount, toLiquidator);
    tknsData[borrtkn].totalBorrowed = SafeMath.sub(tknsData[borrtkn].totalBorrowed, cummulatedLoan);
    tknsData[colltkn].totalCollateral = SafeMath.sub(tknsData[colltkn].totalCollateral, toLiquidator);

    ERC20(colltkn).transfer(msg.sender, toLiquidator);
  }


}
