const InterestRates = artifacts.require("InterestRates");

module.exports = function (deployer) {
  deployer.deploy(InterestRates);
};
