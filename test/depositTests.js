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


contract('LiquidityPool', () => {
  let contractInstance = null;
  let exchangeInstance = null;
  let accounts = null;
  let add = null;
  let tokenInstance = null;
  let tokenInstanceDai = null;
  let addDai = null;
  let tokenInstanceWBTC = null;
  let addWBTC = null;
  let tokenInstanceUNI = null;
  let addUNI = null;
  let ivarInstance = null;
  const ivar_address = web3.utils.toChecksumAddress('0x3Ce98c9524C753C4894bDa3c34a638D79bC00F45');
  const privateKeyAcc1 = 'db0da07daf7017dbd997ccb953c2b372b4f319c87bc11c4598b749fb33a5871d';
  const privateKeyAcc3 = 'b29053acd1c83362a25eb41fc70eaa4332b99a607048116444086a8dbcd8a9c2';
  const privateKeyAcc0 = 'b914330cc23191e0965fdbd02c08b3341ca07b8e231852240b46dc8da0d11ab4';
  // do this before running the tests
  before(async () => {
    // NOW LIQUIDITY POOL HAS A CONSTRUCTOR ARGUMENT
    exchangeInstance = await Exchange.deployed();
    contractInstance = await LiquidityPool.deployed(ivar_address, exchangeInstance.address);
    ivarInstance = await InterestVariables.deployed();
    accounts = await web3.eth.getAccounts();
    console.log(contractInstance.address);
    console.log(exchangeInstance.address);
    //create token
    const contractToken = await depolyToken('Weth', 'Weth');
    add = contractToken[0];
    const abi = contractToken[1];
    tokenInstance = new web3.eth.Contract(abi,add);
    await contractInstance.createToken(add,50, 70, 1, 7, 200, 2,490, true);
    //var syl = await contractInstance.tokensData(add);

    // deploy new token DAI
    var contractToken2 = await depolyToken('Dai', 'Dai');
    addDai = contractToken2[0];
    const abiDai = contractToken2[1];
    tokenInstanceDai = new web3.eth.Contract(abiDai,addDai);
    await contractInstance.createToken(addDai,50, 70, 1, 7, 200, 2,1, true);

    // deploy new token WBTC
    var contractToken3 = await depolyToken('WBTC', 'WBTC');
    addWBTC = contractToken3[0];
    const abiWBTC = contractToken3[1];
    tokenInstanceWBTC = new web3.eth.Contract(abiWBTC,addWBTC);

    // deploy new token UNI
    var contractToken4 = await depolyToken('UNI', 'UNI');
    addUNI = contractToken4[0];
    const abiUNI = contractToken4[1];
    tokenInstanceUNI = new web3.eth.Contract(abiUNI,addUNI);
    await contractInstance.createToken(addUNI,50, 70, 1, 7, 200, 2,22, false);

    // put tokens on exchange
    await exchangeInstance.createPool(add, 490, 'Weth');
    await exchangeInstance.createPool(addDai, 1, 'Dai');
    await exchangeInstance.createPool(addWBTC, 49000, 'WBTC');
    await exchangeInstance.createPool(addUNI, 22, 'UNI');
  });

  // deposit unsupported token
  it('should not allow deposit in unsupported token', async () => {
    //send tokens to adresses
    await giveTokenTo(accounts[1], accounts[0], tokenInstanceWBTC, 1000000);
    //give allowence to smart contract
    await givePermissionToContract(accounts[1], privateKeyAcc1, contractInstance.address, 500000, tokenInstanceWBTC,addWBTC);
    //deposit from an address to contract
    var error = false;
    try{
      await contractInstance.deposit(accounts[1], 4000, addWBTC);
    }catch (err){
      error = true;
      console.log("error found " + err);
    }

    var blc = await contractInstance.usersBalance(accounts[1]);
    var balance;
    await tokenInstanceWBTC.methods.balanceOf(contractInstance.address).call().then(res =>{ balance = res; });

    assert.equal(error, true, "Transaction gives no error");
    assert.equal(blc.depositedAmount, 0, "balance incorrect");
    assert.equal(balance, 0, "reserves balance incorrect");
  });

  // deposit unexchangable token
  it('should not allow deposit in unexchangable token', async () => {
    //send tokens to adresses
    await giveTokenTo(accounts[1], accounts[0], tokenInstanceUNI, 10000);
    //give allowence to smart contract
    await givePermissionToContract(accounts[1], privateKeyAcc1, contractInstance.address, 5000, tokenInstanceUNI,addUNI);
    //deposit from an address to contract

    //make token unexchangable
    await exchangeInstance.switchToUnexchangable(addUNI);

    //deposit from an address to contract
    await contractInstance.deposit(accounts[1], 4000, addUNI);

    var blc = await contractInstance.usersBalance(accounts[1]);
    var balance;
    await tokenInstanceUNI.methods.balanceOf(contractInstance.address).call().then(res =>{ balance = res; });

    assert.equal(blc.depositedAmount, 0, "balance incorrect");
    assert.equal(balance, 0, "reserves balance incorrect");
  });

  it('should Deposit 4000 Weth into the contract address', async () => {
    //send tokens to adresses
    await giveTokenTo(accounts[1], accounts[0], tokenInstance, 1000000);
    //give allowence to smart contract
    await givePermissionToContract(accounts[1], privateKeyAcc1, contractInstance.address, 500000, tokenInstance,add);
    //deposit from an address to contract
    await contractInstance.deposit(accounts[1], 4000, add);

    var blc = await contractInstance.usersBalance(accounts[1]);
    var balance;
    await tokenInstance.methods.balanceOf(contractInstance.address).call().then(res =>{ balance = res; });


    let cummIRdep = await ivarInstance.getIRDepositTotalCummulation(add);
    console.log(cummIRdep.valueOf().toNumber());
    let commIRBorr = await ivarInstance.getIRBorrowTotalCummulation(add);
    console.log(commIRBorr.valueOf().toNumber());

    assert.equal(blc.depositedAmount, 4000, "balance incorrect");
    assert.equal(balance, 4000, "reserves balance incorrect");
  });

  //a1 deposit 4000 weth

  // deposit another token than current deposit
  it('should not be allowed to deposit DAI too', async () => {
    //send tokens to adresses
    await giveTokenTo(accounts[1], accounts[0], tokenInstanceDai, 10000);
    //give allowence to smart contract
    await givePermissionToContract(accounts[1], privateKeyAcc1, contractInstance.address, 5000, tokenInstanceDai,addDai);
    //deposit from an address to contract
    var error = false;
    try{
      await contractInstance.deposit(accounts[1], 4000, addDai);
    }catch (err){
      error = true;
      console.log("error found " + err);
    }


    var blc = await contractInstance.usersBalance(accounts[1]);
    var balance;
    await tokenInstance.methods.balanceOf(contractInstance.address).call().then(res =>{ balance = res; });

    assert.equal(error, true, "Transaction gives no error");
    assert.equal(blc.depositedAmount, 4000, "balance incorrect");
    assert.equal(balance, 4000, "reserves balance incorrect");
  });

  // deposit again in Weth should be allowed
  it('should Deposit 4000 Weth into the contract address AGAIN', async () => {
    var blc1 = await contractInstance.usersBalance(accounts[1]);

    //deposit from an address to contract
    try{
      await contractInstance.deposit(accounts[1], 4000, add);
    }catch(err){
      console.log(err);
    }

    console.log(blc1.depositedAmount);
    console.log(blc1.tokenDeposited);
    console.log(add);
    var data = await contractInstance.tokensData(add);
    console.log(data.exchangeable);
    console.log("Is exchangeable");

    var blc = await contractInstance.usersBalance(accounts[1]);
    var balance;
    await tokenInstance.methods.balanceOf(contractInstance.address).call().then(res =>{ balance = res; });

    assert.equal(blc.depositedAmount.toNumber(), 8000, "balance incorrect");
    assert.equal(balance, 8000, "reserves balance incorrect");
  });

  //a1 deposit 8000 weth

// SWTICH FROM DEPOSIT TO COLLATERAL

  it('should switch from deposit to collateral', async () => {
    //deposit from an address to contract
    await contractInstance.switchDepositToCollateral(accounts[1], 2000);

    var blc = await contractInstance.usersBalance(accounts[1]);
    var balance;
    await tokenInstance.methods.balanceOf(contractInstance.address).call().then(res =>{ balance = res; });

    assert.equal(blc.collateralAmount, 2000, "collateral amount incorrect");
    assert.equal(blc.depositedAmount, 6000, "not subtracted from deposit");
    assert.equal(balance, 8000, "reserves balance incorrect");
  });

  //a1 deposit 6000 weth
  //a1 coll 2000 weth

  it('should switch from deposit to collateral AGAIN same token', async () => {
    //deposit from an address to contract
    await contractInstance.switchDepositToCollateral(accounts[1], 2000);

    var blc = await contractInstance.usersBalance(accounts[1]);
    var balance;
    await tokenInstance.methods.balanceOf(contractInstance.address).call().then(res =>{ balance = res; });

    assert.equal(blc.collateralAmount, 4000, "collateral amount incorrect");
    assert.equal(blc.depositedAmount, 4000, "not subtracted from deposit");
    assert.equal(balance, 8000, "reserves balance incorrect");
  });

  //a1 deposit 4000 weth
  //a1 coll 4000 weth

  it('should switch from deposit to collateral more than allowed', async () => {

    var error = false;
    try{
      await await contractInstance.switchDepositToCollateral(accounts[1], 6000);
    }catch (err){
      error = true;
      console.log("error found " + err);
    }

    var blc = await contractInstance.usersBalance(accounts[1]);
    var balance;
    await tokenInstance.methods.balanceOf(contractInstance.address).call().then(res =>{ balance = res; });

    assert.equal(error, true, "no error given");
    assert.equal(blc.collateralAmount, 4000, "collateral amount incorrect");
    assert.equal(blc.depositedAmount, 4000, "not subtracted from deposit");
    assert.equal(balance, 8000, "reserves balance incorrect");
  });

  it('should switch nothing from deposit to collateral ', async () => {

    await await contractInstance.switchDepositToCollateral(accounts[1], 0);
    var blc = await contractInstance.usersBalance(accounts[1]);
    var balance;
    await tokenInstance.methods.balanceOf(contractInstance.address).call().then(res =>{ balance = res; });

    assert.equal(blc.collateralAmount, 4000, "collateral amount incorrect");
    assert.equal(blc.depositedAmount, 4000, "not subtracted from deposit");
    assert.equal(balance, 8000, "reserves balance incorrect");
  });

  it('try switching an unexchangable token', async () => {

    // create new token
    // deploy new token
    var contractToken = await depolyToken('TTI', 'TTI');
    addTTI = contractToken[0];
    const abiTTI = contractToken[1];
    tokenInstanceTTI = new web3.eth.Contract(abiTTI,addTTI);
    await contractInstance.createToken(addTTI,50, 70, 1, 7, 200, 2,22, false);

    // put tokens on exchange
    await exchangeInstance.createPool(addTTI, 34, 'TTI');

    //send tokens to adresses
    await giveTokenTo(accounts[3], accounts[0], tokenInstanceTTI, 10000);
    //give allowence to smart contract
    await givePermissionToContract(accounts[3], privateKeyAcc3, contractInstance.address, 5000, tokenInstanceTTI,addTTI);
    // deposit token
    await contractInstance.deposit(accounts[3], 4000, addTTI);

    //make token unexchangable
    await exchangeInstance.switchToUnexchangable(addTTI);

    await await contractInstance.switchDepositToCollateral(accounts[3], 6000);

    var blc = await contractInstance.usersBalance(accounts[3]);
    var balance;
    await tokenInstanceTTI.methods.balanceOf(contractInstance.address).call().then(res =>{ balance = res; });

    assert.equal(blc.collateralAmount, 0, "collateral amount incorrect");
    assert.equal(blc.depositedAmount, 4000, "not subtracted from deposit");
    assert.equal(balance, 4000, "reserves balance incorrect");
  });

  it('should deposit collateral', async () => {
    //deposit from an address to contract
    await contractInstance.depositCollateral(accounts[1], 20000, add);

    var blc = await contractInstance.usersBalance(accounts[1]);
    var balance;
    await tokenInstance.methods.balanceOf(contractInstance.address).call().then(res =>{ balance = res; });

    // 20000 + 2000(swapped last time)
    assert.equal(blc.collateralAmount.toNumber(), 24000, "collateral amount incorrect");
    assert.equal(balance, 28000, "reserves balance incorrect");
  });

  //a1 deposit 4000 weth
  //a1 coll 24000 weth

  it('should borrow 1000', async () => {
    // get some tokens
    await giveTokenTo(accounts[3], accounts[0], tokenInstanceDai, 600000);
    // give allowence to contract

    await givePermissionToContract(accounts[3], privateKeyAcc3, contractInstance.address, 500000, tokenInstanceDai,addDai);
    // deposit collateral in Dai
    await contractInstance.depositCollateral(accounts[3], 500000, addDai);
    // account 2 borrows 1000 Weth (Utilisation should be 50)
    await contractInstance.borrow(accounts[3], 500, add);
    var blc = await contractInstance.usersBalance(accounts[3]);

    var balance;
    await tokenInstance.methods.balanceOf(accounts[3]).call().then(res =>{ balance = res; });
    // 20000 + 2000(swapped last time)
    assert.equal(blc.borrowedAmount, 500, "borrowed amount incorrect");
    assert.equal(balance, 500, "reserves balance incorrect");
  });

  /* CURRENT SITUATION:
  a1 collateral 22000 eth
  a1 deposit 2000 eth
  a3 collateral 500 000 Dai
  a3 loan 500 Eth
  both eth and dai have 70% coll
  */

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
