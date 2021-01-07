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
  let contractInstance = null;
  let accounts = null;
  let add = null;
  let tokenInstance = null;
  let tokenInstanceDai = null;
  let addDai = null;
  // do this before running the tests
  before(async () => {
    // NOW LIQUIDITY POOL HAS A CONSTRUCTOR ARGUMENT
    contractInstance = await LiquidityPool.new(web3.utils.toChecksumAddress('0xb1a13D6E64E6E0454d2aeC2f10Ab6F8FE5eCF99a'));
    accounts = await web3.eth.getAccounts();
    console.log(contractInstance.address)
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

  });

  it('should Deposit 4000 Weth into the contract address', async () => {
    //send tokens to adresses
    await giveTokenTo(accounts[1], accounts[0], tokenInstance, 1000000);

    //give allowence to smart contract
    var privateKey = '821edafc174efdc42eff1919067150c350515e65b15861e1999343343e34360c';
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
    await giveTokenTo(accounts[3], accounts[0], tokenInstanceDai, 3000);
    // give allowence to contract
    var privateKey = 'cac5f9b3d3c37b61628f503af8d41c7d3c4f868a2291c4e02323cb00141e336e';
    await givePermissionToContract(accounts[3], privateKey, contractInstance.address, 2500, tokenInstanceDai,addDai);
    // deposit collateral in Dai
    await contractInstance.depositCollateral(accounts[3], 2000, addDai);

    // account 2 borrows 1000 Weth (Utilisation should be 50)
    await contractInstance.borrow(accounts[3], 1000, add);

    var blc = await contractInstance.usersBalance(accounts[3]);
    var balance;
    await tokenInstance.methods.balanceOf(accounts[3]).call().then(res =>{ balance = res; });

    // 20000 + 2000(swapped last time)
    assert.equal(blc.borrowedAmount, 1000, "borrowed amount incorrect");
    assert.equal(balance, 1000, "reserves balance incorrect");
  });

  /* CURRENT SITUATION:
  a1 collateral 22000 eth
  a1 deposit 2000 eth
  a3 collateral 2000 Dai
  a3 loan 1000 Eth
  both eth and dai have 70% coll
  */
  it('should earn some interest', async () => {
    //deposit from an address to contract
    let init_dep = await contractInstance.getUserInitDeposit(accounts[1]); // initial deposit
    console.log(init_dep.valueOf().toNumber());
    let init_ir = await contractInstance.getUserInitInterest(accounts[1]); // initial deposit
    console.log(init_ir.valueOf().toNumber());
    let tokenIR = await contractInstance.getUserInterestTotalCummulation(accounts[1]); // initial deposit
    console.log(tokenIR.valueOf().toNumber());

    let ir = await contractInstance.getCummulatedInterestDeposit(accounts[1]);
    console.log(ir.valueOf().toNumber());
    let ir2 = await contractInstance.getCummulatedInterestLoan(accounts[3]);
    console.log(ir2.valueOf().toNumber());
    assert.notEqual(ir.valueOf().toNumber(), 0, "interest accumulation is zero");
  });

  it('should repay some debt', async () => {
    // give permission to contract
    var privateKey = 'cac5f9b3d3c37b61628f503af8d41c7d3c4f868a2291c4e02323cb00141e336e';
    await givePermissionToContract(accounts[3], privateKey, contractInstance.address, 1000, tokenInstance,add);
    // repay 900 Eth
    await contractInstance.repay(accounts[3], 900);
    // check user balance and reserves
    var blc = await contractInstance.usersBalance(accounts[3]);
    var reserves = await contractInstance.tokensCoreData(add);
    assert.equal(blc.borrowedAmount, 100, "Borrowed amount not left to be 100");
    assert.equal(reserves.totalBorrowed, 100, "Reserves total borrowed not letf to 100");
  });
  /* CURRENT SITUATION:
  a1 collateral 22000 eth
  a1 deposit 2000 eth
  a3 collateral 2000 Dai
  a3 loan 100 Eth
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
    await contractInstance.redeemCollateral(accounts[3], 1000);
    // check user balance and reserves
    var blc = await contractInstance.usersBalance(accounts[3]);
    var reserves = await contractInstance.tokensCoreData(addDai);
    assert.equal(blc.collateralAmount, 1000, "Collateral amount not left to be 1000");
    assert.equal(reserves.totalCollateral, 1000, "Reserves total deposited not letf to 1000");
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
