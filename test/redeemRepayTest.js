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
  const privateKeyAcc2 = '8cb6bddedfca7ccf0e05540fb8a9c65d748f4d1e21310c1d02bca29437730413';
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
    await contractInstance.createToken(addWBTC,50, 70, 1, 7, 200, 2,49000, false);

    // deploy new token UNI
    var contractToken4 = await depolyToken('UNI', 'UNI');
    addUNI = contractToken4[0];
    const abiUNI = contractToken4[1];
    tokenInstanceUNI = new web3.eth.Contract(abiUNI,addUNI);
    await contractInstance.createToken(addUNI,50, 70, 1, 7, 200, 2,22, false);

    // put tokens on exchange
    await exchangeInstance.createPool(add, 490, 'Weth');
    await exchangeInstance.createPool(addDai, 1, 'Dai');
    await exchangeInstance.createPool(addUNI, 22, 'UNI');
    await exchangeInstance.createPool(addWBTC, 49000, 'WBTC');

  });

  it('should give error when repaying nonexisting loan', async () => {

    await giveTokenTo(accounts[3], accounts[0], tokenInstance, 10000);
    await givePermissionToContract(accounts[3], privateKeyAcc3, contractInstance.address, 1000, tokenInstance,add);

    var error = false;
    try{
      await contractInstance.repay(accounts[3], 1000);
    }catch(err){
      console.log(err);
      error = true;
    }
    // check user balance and reserves
    var blc = await contractInstance.usersBalance(accounts[3]);
    var reserves = await contractInstance.tokensData(add);
    assert.equal(blc.borrowedAmount, 0, "Borrowed amount not 0");
    assert.equal(reserves.totalBorrowed, 0, "Reserves total borrowed not 0");
    assert.equal(error, true, "no error given for repaying more");
  });


  // a3 has 10000 WETH

  it('should give error when repaying more', async () => {

    // deposit collateral DAI
    await giveTokenTo(accounts[3], accounts[0], tokenInstanceDai, 1000000);
    await givePermissionToContract(accounts[3], privateKeyAcc3, contractInstance.address, 1000000, tokenInstanceDai,addDai);
    await contractInstance.depositCollateral(accounts[3], 200000, addDai);
    // someone else deposit the token to be borrowed UNI
    await givePermissionToContract(accounts[0], privateKeyAcc0, contractInstance.address, 10000, tokenInstanceUNI,addUNI);
    await contractInstance.deposit(accounts[0], 6000, addUNI);
    // borrow token UNI
    await contractInstance.borrow(accounts[3], 6000, addUNI);

    var error = false;
    try{
      await contractInstance.repay(accounts[3], 10000);
    }catch(err){
      console.log(err);
      error = true;
    }
    // check user balance and reserves
    var blc = await contractInstance.usersBalance(accounts[3]);
    var reserves = await contractInstance.tokensData(addUNI);
    assert.equal(blc.borrowedAmount, 6000, "Borrowed amount not 500");
    assert.equal(reserves.totalBorrowed, 6000, "Reserves total borrowed not 500");
    assert.equal(error, true, "no error given for repaying more");
  });
  // a3 has 100 000 WETH and 80 000 DAI
  // a3 collateral 200 000 DAI
  // a3 borrow 9000 UNI
  // a0 deposit 10 000 UNI

  it('should repay all but be left wit ir', async () => {
    await givePermissionToContract(accounts[3], privateKeyAcc3, contractInstance.address, 6000, tokenInstanceUNI,addUNI);
    await contractInstance.repay(accounts[3], 6000);
    // check user balance and reserves
    var blc = await contractInstance.usersBalance(accounts[3]);
    var reserves = await contractInstance.tokensData(addUNI);
    assert.equal(blc.borrowedAmount, 0, "Borrowed amount not 0");
    assert.notEqual(blc.init_interest_borrow, 0, "ir cummulation is 0");
  });

  it('should borrow again in another token', async () => {
    await giveTokenTo(accounts[1], accounts[0], tokenInstance, 10000);
    await givePermissionToContract(accounts[1], privateKeyAcc1, contractInstance.address, 100, tokenInstance,add);
    await contractInstance.deposit(accounts[1], 100, add);
    await givePermissionToContract(accounts[3], privateKeyAcc3, contractInstance.address, 60, tokenInstance,add);
    await contractInstance.borrow(accounts[3], 60, add);
    // check user balance and reserves
    var blc = await contractInstance.usersBalance(accounts[3]);
    assert.equal(blc.borrowedAmount, 60, "Borrowed amount not 0");
    assert.notEqual(blc.borrowedToken, add, "weth is not the borrowed token");
    // then repay
    await contractInstance.repay(accounts[3], 60);
  });

  // repaying loan when token collateralised is unexchangable is okay
  // repaying loans where token borrowed is unexchangable is not okay
  it('should delete loan when token is unexchangable', async () => {
    await contractInstance.borrow(accounts[3], 6000, addUNI);

    //make token unexchangable
    await exchangeInstance.switchToUnexchangable(addUNI);

    var blc1 = await contractInstance.usersBalance(accounts[3]);
    var reserves1 = await contractInstance.tokensData(addUNI);
    assert.equal(blc1.borrowedAmount, 6000, "Borrowed UNI amount not changed to 0");
    assert.equal(blc1.collateralAmount.toNumber(), 200000, "Collateral DAI amount not changed to 0");
    assert.equal(reserves1.totalBorrowed, 6000, "Reserves total borrowed not letf to 100");

    // try to repay UNI (unexchangable)
    await givePermissionToContract(accounts[3], privateKeyAcc3, contractInstance.address, 200, tokenInstanceDai,addDai);
    await contractInstance.repay(accounts[3], 200);

    // check user balance and reserves
    var blc = await contractInstance.usersBalance(accounts[3]);
    var reserves = await contractInstance.tokensData(addUNI);
    assert.equal(blc.borrowedAmount.toNumber(), 0, "Borrowed UNI amount not changed to 0");
    assert.equal(blc.collateralAmount, 0, "Collateral DAI amount not changed to 0");
    assert.equal(reserves.totalBorrowed, 0, "Reserves total borrowed not letf to 100");
  });

  // a3 has 10000 WETH and 80 000 DAI
  // a0 deposit 1000 UNI
  // a1 deposit 100 Weth
  // a1 has 9900 weth

  it('should give an error when redeeming more than assigned', async () => {

    var error = false;
    try{
      await contractInstance.redeem(accounts[1], 1000);
    }catch(err){
      console.log(err);
      error = true;
    }

    // check user balance and reserves
    var blc = await contractInstance.usersBalance(accounts[1]);
    var reserves = await contractInstance.tokensData(add);
    assert.equal(blc.depositedAmount, 100, "Deposited amount not left to be 1000");
    assert.equal(reserves.totalDeposited, 100, "Reserves total deposits not letf to 1000");
    assert.equal(error, true, "no error given");
  });

  it('should give error when supply < demand', async () => {

    // deposit collateral DAI
    await givePermissionToContract(accounts[3], privateKeyAcc3, contractInstance.address, 200000, tokenInstanceDai,addDai);
    await contractInstance.depositCollateral(accounts[3], 200000, addDai);
    // borrow token WETH
    await contractInstance.borrow(accounts[3], 10, add);

    var error = false;
    try{
      await contractInstance.redeem(accounts[1], 95);
    }catch(err){
      console.log(err);
      error = true;
    }

    // check user balance and reserves
    var blc = await contractInstance.usersBalance(accounts[1]);
    var reserves = await contractInstance.tokensData(add);
    assert.equal(blc.depositedAmount, 100, "Deposited amount not left to be 1000");
    assert.equal(reserves.totalDeposited, 100, "Reserves total deposits not letf to 1000");
    assert.equal(error, true, "no error given");
  });

  // a3 has 10000 WETH and 80 000 DAI
  // a0 deposit 1000 UNI
  // a1 deposit 100 Weth
  // a1 has 9900 weth
  // a3 collateral 200 000 Dai
  // a3 borrow 10 eth

  it('should redeem half', async () => {

    await contractInstance.redeem(accounts[1], 50);

    // check user balance and reserves
    var blc = await contractInstance.usersBalance(accounts[1]);
    var reserves = await contractInstance.tokensData(add);
    assert.equal(blc.depositedAmount, 50, "Deposited amount not left to be 50");
    assert.equal(reserves.totalDeposited, 50, "Reserves total deposits not letf to 50");
  });


  it('should give error if redeeming => undercollateralised', async () => {
    var error = false;
    try{
      await contractInstance.redeemCollateral(accounts[3], 196000);
    }catch(err){
      error = true;
      console.log(err);
    }
    // try again but correctly
    await contractInstance.redeemCollateral(accounts[3], 100000);
    // check user balance and reserves
    var blc = await contractInstance.usersBalance(accounts[3]);
    var reserves = await contractInstance.tokensData(addDai);
    assert.equal(blc.collateralAmount, 100000, "Collateral amount not left to be 200000");
    assert.equal(reserves.totalCollateral, 100000, "Reserves total deposited not letf to 200000");
    assert.equal(error, true, "no error given");
  });

  // redeeming collateral is okay if token borrowed is stilled exchangable
  // redeeming collateral is not okay if token borrowed is unexchangable
  it('redeeming collateral of unexchangable token should be allowed', async () => {
    // a3 deposit WBTC
    await giveTokenTo(accounts[2], accounts[0], tokenInstanceWBTC, 3000);
    await givePermissionToContract(accounts[2], privateKeyAcc2, contractInstance.address, 3000, tokenInstanceWBTC,addWBTC);
    await contractInstance.deposit(accounts[2], 3000, addWBTC);
    // a2 borrow some WBTC
    await giveTokenTo(accounts[2], accounts[0], tokenInstance, 600000);
    await givePermissionToContract(accounts[2], privateKeyAcc2, contractInstance.address, 600000, tokenInstance,add);
    await contractInstance.depositCollateral(accounts[2], 600000, add);
    await contractInstance.borrow(accounts[2], 3000, addWBTC);


    // a0 coll in wbtc
    await givePermissionToContract(accounts[0], privateKeyAcc0, contractInstance.address, 3000, tokenInstanceWBTC,addWBTC);
    await contractInstance.depositCollateral(accounts[0], 3000, addWBTC);
    // let a3 deposit some dai
    await givePermissionToContract(accounts[3], privateKeyAcc3, contractInstance.address, 30000, tokenInstanceDai,addDai);
    await contractInstance.deposit(accounts[3], 30000, addDai);
    // a0 borrow Dai
    await contractInstance.borrow(accounts[0], 20000, addDai);
    // wbtc unexc
    await exchangeInstance.switchToUnexchangable(addWBTC);
    // redeem wbtc
    await contractInstance.redeemCollateral(accounts[0], 1000);

    // check user balance and reserves
    var blc = await contractInstance.usersBalance(accounts[0]);
    var reserves = await contractInstance.tokensData(addWBTC);
    assert.equal(blc.collateralAmount, 2000, "Collateral amount not left to be 2000");
    assert.equal(reserves.totalCollateral, 2000, "Reserves total deposited not letf to 2000");
  });

  // redeeming collateral is okay if token borrowed is stilled exchangable
  // redeeming collateral is not okay if token borrowed is unexchangable
  it('redeeming collateral backing unexchangable token should NOT be allowed', async () => {

    await exchangeInstance.switchToUnexchangable(addDai);
    // redeem wbtc when dai unexchangable
    await contractInstance.redeemCollateral(accounts[0], 1000);

    // check user balance and reserves
    var blc = await contractInstance.usersBalance(accounts[0]);
    var reserves = await contractInstance.tokensData(addWBTC);
    assert.equal(blc.collateralAmount, 0, "Collateral amount not left to be 0");
    assert.equal(blc.borrowedAmount, 0, "Borrowed amount not left to be 0");
    assert.equal(reserves.totalCollateral, 0, "Reserves total deposited not letf to 2000");
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
