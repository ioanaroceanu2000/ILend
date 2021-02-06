const Web3 = require("web3");
const solc = require("solc");
const fs = require("fs")
const BigNumber = require('bignumber.js');
const Tx = require('ethereumjs-tx').Transaction;
const InterestVariables = artifacts.require("InterestVariables");
const LiquidityPool = artifacts.require("LiquidityPool");
const Exchange = artifacts.require("Exchange");
const Token = artifacts.require("Token");
const web3  = new Web3("http://localhost:7545");

contract('Exchange', () => {
  let exchange = null;
  let accounts = null;
  let addEth = null;
  let instanceEth = null;
  let instanceDai = null;
  let addDai = null;
  // do this before running the tests
  before(async () => {
    // NOW LIQUIDITY POOL HAS A CONSTRUCTOR ARGUMENT
    exchange = await Exchange.new();
    accounts = await web3.eth.getAccounts();
    //create token
    const contractToken = await depolyToken('Weth', 'Weth');
    addEth = contractToken[0];
    const abi = contractToken[1];
    instanceEth = new web3.eth.Contract(abi,addEth);
    // deploy new token DAI
    var contractToken2 = await depolyToken('Dai', 'Dai');
    addDai = contractToken2[0];
    const abiDai = contractToken2[1];
    instanceDai = new web3.eth.Contract(abiDai,addDai);

  });
  it('create two pools', async () => {
    await exchange.createPool(addEth, 900, "Weth");
    await exchange.createPool(addDai, 1, "Dai");
    var balanceEth = await exchange.getBalance(addEth);
    var balanceDai = await exchange.getBalance(addDai);
    assert.equal(balanceEth,0 , "Something whent wrong when creating Eth pool");
    assert.equal(balanceDai,0 , "Something whent wrong when creating Dai pool");
  });
  it('should accept tokens', async () => {
    await giveTokenTo(exchange.address, accounts[0], instanceEth, 2000);
    await giveTokenTo(exchange.address, accounts[0], instanceDai, 300000);
    var balanceEth = await exchange.getBalance(addEth);
    var balanceDai = await exchange.getBalance(addDai);
    assert.equal(balanceEth,2000 , "Exchange did not accept 2000 Eth");
    assert.equal(balanceDai,300000 , "Exchange did not accespt 3000 Eth");
  });
  it('should exchange two tokens', async () => {
    var balanceEth;
    await instanceEth.methods.balanceOf(accounts[0]).call().then(res =>{ balanceEth = res; });
    var balanceDai;
    await instanceDai.methods.balanceOf(accounts[0]).call().then(res =>{ balanceDai = res; });

    // run the exchange operation
    var privateKey = 'c1595eb1ac52db31660c6f248c49a75e8e17882e15003334454c2655de78eddd';
    await givePermissionToContract(accounts[0], privateKey, exchange.address, 300, instanceEth, addEth);
    await exchange.exchange(addEth, addDai, 30, accounts[0]);
    console.log("Nothing here");
    var balanceEth2;
    await instanceEth.methods.balanceOf(accounts[0]).call().then(res =>{ balanceEth2 = res; });
    var balanceDai2;
    await instanceDai.methods.balanceOf(accounts[0]).call().then(res =>{ balanceDai2 = res; });
    assert.equal(balanceEth2,'99999999999999997970' , "Eth not out of wallet");
    assert.equal(balanceDai2,  '99999999999999727000', "Dai not out of wallet");
  });
  it('should change prices through array', async () => {
    const ethData = await exchange.tokensData(addEth);
    const daiData = await exchange.tokensData(addDai);
    console.log(ethData.price);
    console.log(daiData.price);
    await exchange.updatePrices([addEth,addDai], [500, 2]);
    const ethData2 = await exchange.tokensData(addEth);
    const daiData2 = await exchange.tokensData(addDai);
    assert.equal(ethData2.price.valueOf().toNumber(), 500, "Eth price wrong");
    assert.equal(daiData2.price.valueOf().toNumber(),  2, "Dai price wrong");
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

// give token from owner to another account
async function giveTokenTo(account, owner, tokenInstance, amount){
  //send tokens to adresses
  let value = web3.utils.toHex(amount);
  await tokenInstance.methods.transfer(account, value).send({from: owner}).on('transactionHash', function(hash){
      //console.log(hash);
    });
  var balance;
  await tokenInstance.methods.balanceOf(account).call().then(res =>{ balance = res; });
}

// give permission to contract to retreive tokens
async function givePermissionToContract(account, privateKey, contractAddress, amount, tokenInstance, tokenAddress){
  var nonce = await web3.eth.getTransactionCount(account);
  console.log("THIS IS THE NONCE");
  console.log(nonce);
  const rawTx = {
    nonce: nonce,
    from: account,
    to: tokenAddress,
    gasLimit: web3.utils.toHex(200000),
    data: tokenInstance.methods.approve(contractAddress, amount).encodeABI()
  };
  // private key of the second account
  var privateKey = new Buffer(privateKey, 'hex');
  var tx = new Tx(rawTx);
  tx.sign(privateKey);
  var serializedTx = tx.serialize();
  web3.eth.sendSignedTransaction('0x' + serializedTx.toString('hex')).on('receipt', console.log);
}
