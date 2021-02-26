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
  it('should calculate a overLimit utilisation interest rate', async () => {
    const contractInstance = await InterestVariables.deployed();
    const add = (await depolyToken('Weth', 'Weth'))[0];
    // (_symbol, _token_address, _optimal_utilisation, _collateral_factor, _base_rate, _slope1, _slope2, _spread)
    await contractInstance.createToken(add,50, 70, 0, 7, 200, 20);
    var opt = await contractInstance.tokens(add);
    console.log(opt.optimal_utilisation);
    const irB = await contractInstance.borrowInterestRate(add,80);
    const irD = await contractInstance.depositInterestRate(add,80);
    assert.equal(irB.valueOf().toNumber(), 15240, "ir does not have the same value");
    assert.equal(irD.valueOf().toNumber(), 12700, "ir does not have the same value");
  });
  it('calculate interest rates when utilisation is 0', async () => {
    const contractInstance = await InterestVariables.deployed();
    const add = (await depolyToken('Weth', 'Weth'))[0];
    await contractInstance.createToken(add,50, 70, 0, 7, 200, 20);
    const irD = await contractInstance.depositInterestRate(add,0);
    const irB = await contractInstance.borrowInterestRate(add,0);
    assert.equal(irD.valueOf().toNumber(), 0, "ir does not have the same value");
    assert.equal(irB.valueOf().toNumber(), 0, "ir does not have the same value");
  });
  it('calculate interest rates when underLimit Urilisation', async () => {
    const contractInstance = await InterestVariables.deployed();
    const add = (await depolyToken('Weth', 'Weth'))[0];
    await contractInstance.createToken(add,50, 70, 0, 7, 200, 20);
    const irD = await contractInstance.depositInterestRate(add,40);
    const irB = await contractInstance.borrowInterestRate(add,40);
    assert.equal(irD.valueOf().toNumber(), 560, "ir does not have the same value");
    assert.equal(irB.valueOf().toNumber(), 672, "ir does not have the same value");
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
  let ivarInstance = null;
  const ivar_address = web3.utils.toChecksumAddress('0x3Ce98c9524C753C4894bDa3c34a638D79bC00F45');
  const privateKeyAcc1 = 'f150f305a793c102042767509d780283f090ff9650652623d6ee1509507e7054';
  const privateKeyAcc3 = '300c0088a1d929a81cfc3c270f8c88c9d34941f399ff82d726e5c99ddf00ca3b';
  const privateKeyAcc0 = 'c7ae604086af1add1829a6e38f3c7bc70c03934f02a4c198acc5ec02debf24d5';
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

    // put tokens on exchange
    await exchangeInstance.createPool(add, 490, 'Weth');
    await exchangeInstance.createPool(addDai, 1, 'Dai');

  });

  it('should Deposit 4000 Weth into the contract address', async () => {
    //send tokens to adresses
    await giveTokenTo(accounts[1], accounts[0], tokenInstance, 1000000);

    //give allowence to smart contract

    await givePermissionToContract(accounts[1], privateKeyAcc1, contractInstance.address, 500000, tokenInstance,add);

    //deposit from an address to contra

    await contractInstance.deposit(accounts[1], 4000, add).then(receipt =>{console.log(receipt);});

    var blc = await contractInstance.usersBalance(accounts[1]);
    var balance;
    await tokenInstance.methods.balanceOf(contractInstance.address).call().then(res =>{ balance = res; });
    var reserves;
    await tokenInstance.methods.balanceOf(contractInstance.address).call().then(res =>{ reserves = res; });

    let cummIRdep = await ivarInstance.getIRDepositTotalCummulation(add);
    console.log(cummIRdep.valueOf().toNumber());
    let commIRBorr = await ivarInstance.getIRBorrowTotalCummulation(add);
    console.log(commIRBorr.valueOf().toNumber());

    assert.equal(blc.depositedAmount, 4000, "balance incorrect");
    assert.equal(balance, 4000, "reserves balance incorrect");

  });

  it('should switch from deposit to collateral', async () => {
    //deposit from an address to contract
    await contractInstance.switchDepositToCollateral(accounts[1], 2000);

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
  it('should earn some interest', async () => {
    //deposit from an address to contract

    let ir = await contractInstance.getCummulatedInterestDeposit(accounts[1]);
    console.log(ir.valueOf().toNumber());
    let ir2 = await contractInstance.getCummulatedInterestLoan(accounts[3]);
    console.log(ir2.valueOf().toNumber());

    let cummIRdep = await ivarInstance.getIRDepositTotalCummulation(add);
    console.log(cummIRdep.valueOf().toNumber());
    let commIRBorr = await ivarInstance.getIRBorrowTotalCummulation(add);
    console.log(commIRBorr.valueOf().toNumber());
    assert.notEqual(ir.valueOf().toNumber(), 0, "interest accumulation is zero");
  });

  it('should repay some debt', async () => {
    // give permission to contract
    await givePermissionToContract(accounts[3], privateKeyAcc3, contractInstance.address, 1000, tokenInstance,add);
    // repay 900 Eth
    await contractInstance.repay(accounts[3], 200);
    // check user balance and reserves
    var blc = await contractInstance.usersBalance(accounts[3]);
    var reserves = await contractInstance.tokensData(add);
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
    var reserves = await contractInstance.tokensData(add);
    var resblc;
    await tokenInstance.methods.balanceOf(contractInstance.address).call().then(res =>{ resblc = res; });
    console.log(blc.depositedAmount);
    console.log(reserves.totalDeposited);
    console.log(resblc);
    assert.equal(blc.depositedAmount, 1000, "Deposited amount not left to be 1000");
    assert.equal(reserves.totalDeposited, 1000, "Reserves total deposits not letf to 1000");
  });

  it('should redeem some tokens collateralised', async () => {
    // redeem 1000 Eth
    await contractInstance.redeemCollateral(accounts[3], 200000);
    // check user balance and reserves
    var blc = await contractInstance.usersBalance(accounts[3]);
    var reserves = await contractInstance.tokensData(addDai);
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
    let userBalance0 = await contractInstance.usersBalance(accounts[3]);

    // give permission to contract and liquidate

    await givePermissionToContract(accounts[0], privateKeyAcc0, contractInstance.address, 300, tokenInstance, add);
    let ir = await contractInstance.getCummulatedInterestLoan(accounts[3])
    let cummulatedLoan = ir.valueOf().toNumber();
    await contractInstance.liquidate(accounts[3]);

    // check balance of account3 for collateral
    let userBalance1 = await contractInstance.usersBalance(accounts[3]);
    let collateralLeft = userBalance0.tokenCollateralised - (cummulatedLoan * 800 * 105)/100;
    assert.equal(userBalance1.tokenCollateralised, collateralLeft, "Collateral left not equal to the expected amount");
    // check balance of account3 for loan
    assert.equal(userBalance1.borrowedAmount, 0, "User still owes money after liquidation");

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
    let cummIRdep = await ivarInstance.getIRDepositTotalCummulation(add);
    console.log(cummIRdep.valueOf().toNumber());
    let commIRBorr = await ivarInstance.getIRBorrowTotalCummulation(add);
    console.log(commIRBorr.valueOf().toNumber());
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
