const Web3 = require("web3");
const web3  = new Web3("http://localhost:7545");
const SafeMath = artifacts.require("SafeMath");
const Context = artifacts.require("Context");
const IERC20 = artifacts.require("IERC20");
const ERC20 = artifacts.require("ERC20");
const Address = artifacts.require("Address");
const LiquidityPool = artifacts.require("LiquidityPool");
const InterestVariables = artifacts.require("InterestVariables");


module.exports = function (deployer) {
  deployer.deploy(InterestVariables).then(function (){
    deployer.deploy(SafeMath);
    //deployer.deploy(Context);
    //deployer.deploy(IERC20);
    //deployer.link(IERC20, ERC20);
    deployer.link(SafeMath, ERC20);
    //deployer.link(Context, ERC20);
    deployer.deploy(ERC20, "Ioana", "JO");
    deployer.deploy(Address);
    deployer.link(Address,LiquidityPool);
    deployer.link(ERC20, LiquidityPool);
    deployer.deploy(LiquidityPool, InterestVariables.address);
  });

};
