pragma solidity >=0.6.0 <0.8.0;
pragma experimental ABIEncoderV2;

import "truffle/Assert.sol";
//import "truffle/DeployedAddresses.sol";
import "../contracts/InterestVariables.sol";

contract Test1 {

  /*function testInitialBalanceUsingDeployedContract() public {
    MetaCoin meta = MetaCoin(DeployedAddresses.MetaCoin());

    uint expected = 10000;

    Assert.equal(meta.getBalance(tx.origin), expected, "Owner should have 10000 MetaCoin initially");
  }*/


  function testInitialBalanceWithNewMetaCoin() public {

    InterestVariables contr = new InterestVariables();

    address add = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
    contr.createToken('WETH',add,50, 70, 1, 7, 200, 2);
  }

}
