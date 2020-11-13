require("web3");
const BigNumber = require('bignumber.js');
const InterestVariables = artifacts.require("InterestVariables");

contract('InterestVariables', () => {
  it('should calculate the interest rate', async () => {
    const contractInstance = await InterestVariables.deployed();
    const add = web3.utils.toChecksumAddress('0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2');
    await contractInstance.createToken('WETH',add,50, 70, 1, 7, 200, 2);
    const ir = await contractInstance.borrowInterestRate(add,80);
    assert.equal(ir.valueOf().toNumber(), 12800, "ir does not have the same value");
  });
  it('should calculate the interest rate', async () => {
    const contractInstance = await InterestVariables.deployed();
    const add = web3.utils.toChecksumAddress('0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2');
    await contractInstance.createToken('WETH',add,50, 70, 1, 7, 200, 2);
    const ir = await contractInstance.depositInterestRate(add,80);
    assert.equal(ir.valueOf().toNumber(), 13056, "ir does not have the same value");
  });

});
