const Web3 = require("web3");
const solc = require("solc");
const fs = require("fs")
const BigNumber = require('bignumber.js');
const Tx = require('ethereumjs-tx').Transaction;
const InterestVariables = artifacts.require("InterestVariables");
const LiquidityPool = artifacts.require("LiquidityPool");
const Token = artifacts.require("Token");
const web3  = new Web3("http://localhost:7545");

contract('InterestVariables', () => {
  it('should calculate the BORROW interest rate', async () => {
    const contractInstance = await InterestVariables.deployed();
    const add = (await depolyToken('Weth', 'Weth'))[0];
    await contractInstance.createToken('WETH',add,50, 70, 1, 7, 200, 2);
    const ir = await contractInstance.borrowInterestRate(add,80);
    assert.equal(ir.valueOf().toNumber(), 12800, "ir does not have the same value");
  });
  it('should calculate the DEPOSIT interest rate', async () => {
    const contractInstance = await InterestVariables.deployed();
    const add = (await depolyToken('Weth', 'Weth'))[0];
    await contractInstance.createToken('WETH',add,50, 70, 1, 7, 200, 2);
    const ir = await contractInstance.depositInterestRate(add,80);
    assert.equal(ir.valueOf().toNumber(), 13056, "ir does not have the same value");
  });
});

contract('LiquidityPool', () => {
  it('should Deposit 4000 Weth into the contract address', async () => {
    const contractInstance = await LiquidityPool.deployed();
    var accounts = await web3.eth.getAccounts();

    //create token
    var contractToken = await depolyToken('Weth', 'Weth');
    const add = contractToken[0];
    const abi = contractToken[1];
    await contractInstance.createToken('Weth',add,50, 70, 1, 7, 200, 2,490);
    const tokenInstance = new web3.eth.Contract(abi,add);

    //send tokens to adresses
    let value = web3.utils.toHex(1000000);
    await tokenInstance.methods.transfer(accounts[1], value).send({from: accounts[0]}).on('transactionHash', function(hash){
        console.log(hash);
      });
    var balance;
    await tokenInstance.methods.balanceOf(accounts[1]).call().then(res =>{ balance = res; });


    //give allowence to smart contract
    var nonce = await web3.eth.getTransactionCount(accounts[1]);
    const rawTx = {
      nonce: nonce,
      from: accounts[1],
      to: add,
      gasLimit: web3.utils.toHex(200000),
      data: tokenInstance.methods.approve(contractInstance.address, 500000).encodeABI()
    };
    var privateKey = new Buffer('cf53514e0ab1765467e22a56f784d918318812aba425a51a4e0f04f9d745d3a2', 'hex');
    var tx = new Tx(rawTx);
    tx.sign(privateKey);
    var serializedTx = tx.serialize();
    web3.eth.sendSignedTransaction('0x' + serializedTx.toString('hex')).on('receipt', console.log);
    var allowence = await tokenInstance.methods.allowance(accounts[1],contractInstance.address).call();
    
    //deposit from an address to contract
    await contractInstance.deposit(accounts[1], 4000, add);

    var blc = await contractInstance.usersBalance(accounts[1]);

    assert.equal(blc.depositedAmount, 4000, "balance incorrect");
  });
});

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

  return [instance.options.address, abi];
}
