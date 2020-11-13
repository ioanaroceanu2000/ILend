// SPDX-License-Identifier: MIT
pragma solidity >=0.4.22 <0.8.0;
import "./ERC20.sol";
import "./Address.sol";
import "./InterestVariables.sol";

contract LiquidityPool {
  constructor() public {
  }

  address private owner;

  mapping (address => TokenCoreData) internal tokensCoreData;
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
    uint _price) public onlyOwner{
      require(isContract(_token_address), "Can only create a contract if it is deployed and is a contract");
      InterestVariables ivar = InterestVariables(0xaE036c65C649172b43ef7156b009c6221B596B8b);
      ivar.createToken(_symbol, _token_address, _optimal_utilisation, _collateral_factor, _base_rate, _slope1, _slope2, _spread);
      uint borrowIR = ivar.borrowInterestRate(_token_address, 0);
      uint depositIR = ivar.depositInterestRate(_token_address, 0, borrowIR);
      tokensCoreData[_token_address] = TokenCoreData(_price, _symbol, 0, borrowIR, depositIR, 0, 0, 0);
  }

  function isContract(address account) internal view returns (bool) {
        // This method relies on extcodesize, which returns 0 for contracts in
        // construction, since the code is only stored at the end of the
        // constructor execution.

        uint256 size;
        // solhint-disable-next-line no-inline-assembly
        assembly { size := extcodesize(account) }
        return size > 0;
    }

  // update token price and call liquid checks
  function updateTokenPrice(address tokenId, uint _price) public{
    tokensCoreData[tokenId].price = _price;
  }

  // update utilisation rate
  function updateUtilisationRate(address tokenId) internal{
    tokensCoreData[tokenId].price = tokensCoreData[tokenId].totalBorrowed / tokensCoreData[tokenId].totalDeposited;
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

  function getReserveBalance(address tokenId) public{
    ERC20(tokenId).balanceOf(address(this));
  }

  // take out from liquidity pool of token

  function deposit(address payable user, uint amount, address tokenId) public{
    //make sure users only have deposits in one token
    require(usersBalance[user].tokenDeposited == address(0) || usersBalance[user].depositedAmount == 0, "Address already has a deposit");
    //make sure token is supported
    require(tokensCoreData[tokenId].price != 0 && keccak256(bytes(tokensCoreData[tokenId].symbol)) == keccak256(bytes("")));
    addToReserves(tokenId, amount, user, false);
    usersBalance[user].tokenDeposited = tokenId;
    usersBalance[user].depositedAmount = amount;
  }

}
