const Web3 = require("web3");
const solc = require("solc");
const fs = require("fs")
const BigNumber = require('bignumber.js');
const InterestVariables = artifacts.require("InterestVariables");
const LiquidityPool = artifacts.require("LiquidityPool");
const Token = artifacts.require("Token");
const web3  = new Web3("http://localhost:7545");

contract('InterestVariables', () => {
  it('should calculate the BORROW interest rate', async () => {
    const contractInstance = await InterestVariables.deployed();
    const add = await depolyToken('Weth', 'Weth');
    await contractInstance.createToken('WETH',add,50, 70, 1, 7, 200, 2);
    const ir = await contractInstance.borrowInterestRate(add,80);
    assert.equal(ir.valueOf().toNumber(), 12800, "ir does not have the same value");
  });
  it('should calculate the DEPOSIT interest rate', async () => {
    const contractInstance = await InterestVariables.deployed();
    const add = await depolyToken('Weth', 'Weth');
    await contractInstance.createToken('WETH',add,50, 70, 1, 7, 200, 2);
    const ir = await contractInstance.depositInterestRate(add,80);
    assert.equal(ir.valueOf().toNumber(), 13056, "ir does not have the same value");
  });
});

/*contract('LiquidityPool', () => {
  it('should Deposit 2 ETH into the contract address', async () => {
    const contractInstance = await LiquidityPool.deployed();
    //create token
    //send tokens to adresses
    //deposit from an address to contract
    const add = web3.utils.toChecksumAddress('0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2');
    await contractInstance.createToken('WETH',add,50, 70, 1, 7, 200, 2);
    const ir = await contractInstance.borrowInterestRate(add,80);
    assert.equal(ir.valueOf().toNumber(), 12800, "ir does not have the same value");
  });
  it('should calculate the DEPOSIT interest rate', async () => {
    const contractInstance = await InterestVariables.deployed();
    const add = web3.utils.toChecksumAddress('0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2');
    await contractInstance.createToken('WETH',add,50, 70, 1, 7, 200, 2);
    const ir = await contractInstance.depositInterestRate(add,80);
    assert.equal(ir.valueOf().toNumber(), 13056, "ir does not have the same value");
  });
});*/

// deploy the code for a token and return its address
async function depolyToken(name, symbol){
  // get the abi and bytecode after compilation of Token
  var content = JSON.parse(fs.readFileSync("build/contracts/Token.json"));
  var abi = content['abi'];
  var bytecode = content['bytecode'];
  //create contract and depoly
  var TokenInit = new web3.eth.Contract(abi);
  var TokenTx = TokenInit.deploy({data: bytecode, arguments: [name, symbol]});
  // send transaction from the 1st account
  var accounts = await web3.eth.getAccounts();
  var instance = await TokenTx.send({from: accounts[0], gas: 5000000});

  return instance.options.address;
}
