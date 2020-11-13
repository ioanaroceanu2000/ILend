const InterestVariables = artifacts.require("InterestVariables");

module.exports = function (deployer) {
  deployer.deploy(InterestVariables);
};
