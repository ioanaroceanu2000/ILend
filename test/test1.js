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
  let contractInstance = null;
  let exchangeInstance = null;
  let accounts = null;
  let add = null;
  let tokenInstance = null;
  let tokenInstanceDai = null;
  let addDai = null;
  // do this before running the tests
  before(async () => {
    // NOW LIQUIDITY POOL HAS A CONSTRUCTOR ARGUMENT
    exchangeInstance = await Exchange.deployed();
    let ivar_address = web3.utils.toChecksumAddress('0xA929fc9B42030B6aE983fb0a64c4cB0D36d83caD');
    contractInstance = await LiquidityPool.deployed(ivar_address, exchangeInstance.address);
    accounts = await web3.eth.getAccounts();
    console.log(contractInstance.address);
    console.log(exchangeInstance.address);
    //create token
    const contractToken = await depolyToken('Weth', 'Weth');
    add = contractToken[0];
    const abi = contractToken[1];
    tokenInstance = new web3.eth.Contract(abi,add);
    await contractInstance.createToken('Weth',add,50, 70, 1, 7, 200, 2,490);
    //var syl = await contractInstance.tokensCoreData(add);

    // deploy new token DAI
    var contractToken2 = await depolyToken('Dai', 'Dai');
    addDai = contractToken2[0];
    const abiDai = contractToken2[1];
    tokenInstanceDai = new web3.eth.Contract(abiDai,addDai);
    await contractInstance.createToken('Dai',addDai,50, 70, 1, 7, 200, 2,1);

    // put tokens on exchange
    await exchangeInstance.createPool(add, 490, 'Weth');
    await exchangeInstance.createPool(addDai, 1, 'Dai');

  });

  it('should Deposit 4000 Weth into the contract address', async () => {
    //send tokens to adresses
    await giveTokenTo(accounts[1], accounts[0], tokenInstance, 1000000);

    //give allowence to smart contract
    var privateKey = '9cb134e505157dc6914838b3ab4c2c4f2a1f7fc9ebf4a900109273f3d86290a1';
    await givePermissionToContract(accounts[1], privateKey, contractInstance.address, 500000, tokenInstance,add);

    //deposit from an address to contract
    await contractInstance.deposit(accounts[1], 4000, add);

    var blc = await contractInstance.usersBalance(accounts[1]);
    var balance;
    await tokenInstance.methods.balanceOf(contractInstance.address).call().then(res =>{ balance = res; });
    var reserves = await contractInstance.getReserveBalance(add);

    assert.equal(blc.depositedAmount, 4000, "balance incorrect");
    assert.equal(balance, 4000, "reserves balance incorrect");

  });

  it('should switch from deposit to collateral', async () => {
    //deposit from an address to contract
    await contractInstance.switchDepositToCollateral(accounts[1], 2000, add);

    var blc = await contractInstance.usersBalance(accounts[1]);
    var balance;
    await tokenInstance.methods.balanceOf(contractInstance.address).call().then(res =>{ balance = res; });

    assert.equal(blc.collateralAmount, 2000, "collateral amount incorrect");
    assert.equal(balance, 4000, "reserves balance incorrect");
  });

  it('should deposit collateral', async () => {
    //deposit from an address to contract
    await contractInstance.depositCollateral(accounts[1], 20000, add);

    var blc = await contractInstance.usersBalance(accounts[1]);
    var balance;
    await tokenInstance.methods.balanceOf(contractInstance.address).call().then(res =>{ balance = res; });

    // 20000 + 2000(swapped last time)
    assert.equal(blc.collateralAmount, 22000, "collateral amount incorrect");
    assert.equal(balance, 24000, "reserves balance incorrect");
  });

  it('should borrow 1000', async () => {
    // get some tokens
    await giveTokenTo(accounts[3], accounts[0], tokenInstanceDai, 600000);
    // give allowence to contract
    var privateKey = '7ce043e8568ca1b4e75a7f12707f9c768c716d7d9a911280680a145791edd9cc';
    await givePermissionToContract(accounts[3], privateKey, contractInstance.address, 500000, tokenInstanceDai,addDai);
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
  it('should earn some interest', async () => {
    //deposit from an address to contract

    let ir = await contractInstance.getCummulatedInterestDeposit(accounts[1]);
    console.log(ir.valueOf().toNumber());
    let ir2 = await contractInstance.getCummulatedInterestLoan(accounts[3]);
    console.log(ir2.valueOf().toNumber());
    assert.notEqual(ir.valueOf().toNumber(), 0, "interest accumulation is zero");
  });

  it('should repay some debt', async () => {
    // give permission to contract
    var privateKey = '7ce043e8568ca1b4e75a7f12707f9c768c716d7d9a911280680a145791edd9cc';
    await givePermissionToContract(accounts[3], privateKey, contractInstance.address, 1000, tokenInstance,add);
    // repay 900 Eth
    await contractInstance.repay(accounts[3], 200);
    // check user balance and reserves
    var blc = await contractInstance.usersBalance(accounts[3]);
    var reserves = await contractInstance.tokensCoreData(add);
    assert.equal(blc.borrowedAmount, 300, "Borrowed amount not left to be 100");
    assert.equal(reserves.totalBorrowed, 300, "Reserves total borrowed not letf to 100");
  });
  /* CURRENT SITUATION:
  a1 collateral 22000 eth
  a1 deposit 2000 eth
  a3 collateral 500 000 Dai
  a3 loan 300 Eth
  both eth and dai have 70% coll
  */
  it('should redeem some tokens deposited', async () => {
    // redeem 1000 Eth
    await contractInstance.redeem(accounts[1], 1000);
    // check user balance and reserves
    var blc = await contractInstance.usersBalance(accounts[1]);
    var reserves = await contractInstance.tokensCoreData(add);
    console.log(blc.depositedAmount);
    console.log(reserves.totalDeposited);
    assert.equal(blc.depositedAmount, 1000, "Deposited amount not left to be 1000");
    assert.equal(reserves.totalDeposited, 1000, "Reserves total deposits not letf to 1000");
  });

  it('should redeem some tokens collateralised', async () => {
    // redeem 1000 Eth
    await contractInstance.redeemCollateral(accounts[3], 200000);
    // check user balance and reserves
    var blc = await contractInstance.usersBalance(accounts[3]);
    var reserves = await contractInstance.tokensCoreData(addDai);
    assert.equal(blc.collateralAmount, 300000, "Collateral amount not left to be 1000");
    assert.equal(reserves.totalCollateral, 300000, "Reserves total deposited not letf to 1000");
  });

  // test this by tracking the health factor of account3
  it('should change the price of Eth', async () => {
    console.log("WE ARE TESTING CHANGING THE PRICE OF ETH");
    var healthFactorBefore = await contractInstance.getHealthFactor(accounts[3]);
    console.log("This is the health factor");
    console.log(healthFactorBefore);
    await exchangeInstance.updatePrice(add, 800);
    await contractInstance.updateTokenPrice(add);
    var healthFactorAfter = await contractInstance.getHealthFactor(accounts[3]);
    console.log("This is the health factor");
    console.log(healthFactorAfter);
    assert.equal(healthFactorAfter, 875, "Health factor wgrongly calculated after price update");
  });

  it('liquidate an account', async () => {
    // balance of liquidator before liquidation
    var balanceEthBefore;
    await tokenInstance.methods.balanceOf(accounts[0]).call().then(res =>{ balanceEthBefore = res; });
    var balanceDaiBefore;
    await tokenInstanceDai.methods.balanceOf(accounts[0]).call().then(res =>{ balanceDaiBefore = res; });

    // calculate user's balances before liquidation
    let details1 = await contractInstance.getUserDetails(accounts[3]);


    // give permission to contract and liquidate
    var privateKey = 'c1595eb1ac52db31660c6f248c49a75e8e17882e15003334454c2655de78eddd';
    await givePermissionToContract(accounts[0], privateKey, contractInstance.address, 300, tokenInstance, add);
    let ir = await contractInstance.getCummulatedInterestLoan(accounts[3])
    let cummulatedLoan = ir.valueOf().toNumber();
    await contractInstance.liquidate(accounts[3]);

    // check balance of account3 for collateral
    let details = await contractInstance.getUserDetails(accounts[3]);
    let collateralLeft = details1[0] - (cummulatedLoan * 800 * 105)/100;
    assert.equal(details[0], collateralLeft, "Collateral left not equal to the expected amount");
    // check balance of account3 for loan
    assert.equal(details[2], 0, "User still owes money after liquidation");

    // check overall balance of account[0]
    // balance of liquidator after liquidation
    var balanceEthAfter;
    await tokenInstance.methods.balanceOf(accounts[0]).call().then(res =>{ balanceEthAfter = res; });
    var balanceDaiAfter;
    await tokenInstanceDai.methods.balanceOf(accounts[0]).call().then(res =>{ balanceDaiAfter = res; });
    console.log("Balance eth of liquidator BEFORE");
    console.log(balanceEthBefore);
    console.log("Balance eth of liquidator AFTER");
    console.log(balanceEthAfter);
    assert.equal(BigInt(balanceEthBefore) - BigInt(balanceEthAfter), 300, "Collateral amount not left to be 1000");
    assert.equal(BigInt(balanceDaiAfter) - BigInt(balanceDaiBefore), (cummulatedLoan * 800 * 105)/100, "Reserves total deposited not letf to 1000");
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
