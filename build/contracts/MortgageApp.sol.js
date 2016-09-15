var Web3 = require("web3");
var SolidityEvent = require("web3/lib/web3/event.js");

(function() {
  // Planned for future features, logging, etc.
  function Provider(provider) {
    this.provider = provider;
  }

  Provider.prototype.send = function() {
    this.provider.send.apply(this.provider, arguments);
  };

  Provider.prototype.sendAsync = function() {
    this.provider.sendAsync.apply(this.provider, arguments);
  };

  var BigNumber = (new Web3()).toBigNumber(0).constructor;

  var Utils = {
    is_object: function(val) {
      return typeof val == "object" && !Array.isArray(val);
    },
    is_big_number: function(val) {
      if (typeof val != "object") return false;

      // Instanceof won't work because we have multiple versions of Web3.
      try {
        new BigNumber(val);
        return true;
      } catch (e) {
        return false;
      }
    },
    merge: function() {
      var merged = {};
      var args = Array.prototype.slice.call(arguments);

      for (var i = 0; i < args.length; i++) {
        var object = args[i];
        var keys = Object.keys(object);
        for (var j = 0; j < keys.length; j++) {
          var key = keys[j];
          var value = object[key];
          merged[key] = value;
        }
      }

      return merged;
    },
    promisifyFunction: function(fn, C) {
      var self = this;
      return function() {
        var instance = this;

        var args = Array.prototype.slice.call(arguments);
        var tx_params = {};
        var last_arg = args[args.length - 1];

        // It's only tx_params if it's an object and not a BigNumber.
        if (Utils.is_object(last_arg) && !Utils.is_big_number(last_arg)) {
          tx_params = args.pop();
        }

        tx_params = Utils.merge(C.class_defaults, tx_params);

        return new Promise(function(accept, reject) {
          var callback = function(error, result) {
            if (error != null) {
              reject(error);
            } else {
              accept(result);
            }
          };
          args.push(tx_params, callback);
          fn.apply(instance.contract, args);
        });
      };
    },
    synchronizeFunction: function(fn, instance, C) {
      var self = this;
      return function() {
        var args = Array.prototype.slice.call(arguments);
        var tx_params = {};
        var last_arg = args[args.length - 1];

        // It's only tx_params if it's an object and not a BigNumber.
        if (Utils.is_object(last_arg) && !Utils.is_big_number(last_arg)) {
          tx_params = args.pop();
        }

        tx_params = Utils.merge(C.class_defaults, tx_params);

        return new Promise(function(accept, reject) {

          var decodeLogs = function(logs) {
            return logs.map(function(log) {
              var logABI = C.events[log.topics[0]];

              if (logABI == null) {
                return null;
              }

              var decoder = new SolidityEvent(null, logABI, instance.address);
              return decoder.decode(log);
            }).filter(function(log) {
              return log != null;
            });
          };

          var callback = function(error, tx) {
            if (error != null) {
              reject(error);
              return;
            }

            var timeout = C.synchronization_timeout || 240000;
            var start = new Date().getTime();

            var make_attempt = function() {
              C.web3.eth.getTransactionReceipt(tx, function(err, receipt) {
                if (err) return reject(err);

                if (receipt != null) {
                  // If they've opted into next gen, return more information.
                  if (C.next_gen == true) {
                    return accept({
                      tx: tx,
                      receipt: receipt,
                      logs: decodeLogs(receipt.logs)
                    });
                  } else {
                    return accept(tx);
                  }
                }

                if (timeout > 0 && new Date().getTime() - start > timeout) {
                  return reject(new Error("Transaction " + tx + " wasn't processed in " + (timeout / 1000) + " seconds!"));
                }

                setTimeout(make_attempt, 1000);
              });
            };

            make_attempt();
          };

          args.push(tx_params, callback);
          fn.apply(self, args);
        });
      };
    }
  };

  function instantiate(instance, contract) {
    instance.contract = contract;
    var constructor = instance.constructor;

    // Provision our functions.
    for (var i = 0; i < instance.abi.length; i++) {
      var item = instance.abi[i];
      if (item.type == "function") {
        if (item.constant == true) {
          instance[item.name] = Utils.promisifyFunction(contract[item.name], constructor);
        } else {
          instance[item.name] = Utils.synchronizeFunction(contract[item.name], instance, constructor);
        }

        instance[item.name].call = Utils.promisifyFunction(contract[item.name].call, constructor);
        instance[item.name].sendTransaction = Utils.promisifyFunction(contract[item.name].sendTransaction, constructor);
        instance[item.name].request = contract[item.name].request;
        instance[item.name].estimateGas = Utils.promisifyFunction(contract[item.name].estimateGas, constructor);
      }

      if (item.type == "event") {
        instance[item.name] = contract[item.name];
      }
    }

    instance.allEvents = contract.allEvents;
    instance.address = contract.address;
    instance.transactionHash = contract.transactionHash;
  };

  // Use inheritance to create a clone of this contract,
  // and copy over contract's static functions.
  function mutate(fn) {
    var temp = function Clone() { return fn.apply(this, arguments); };

    Object.keys(fn).forEach(function(key) {
      temp[key] = fn[key];
    });

    temp.prototype = Object.create(fn.prototype);
    bootstrap(temp);
    return temp;
  };

  function bootstrap(fn) {
    fn.web3 = new Web3();
    fn.class_defaults  = fn.prototype.defaults || {};

    // Set the network iniitally to make default data available and re-use code.
    // Then remove the saved network id so the network will be auto-detected on first use.
    fn.setNetwork("default");
    fn.network_id = null;
    return fn;
  };

  // Accepts a contract object created with web3.eth.contract.
  // Optionally, if called without `new`, accepts a network_id and will
  // create a new version of the contract abstraction with that network_id set.
  function Contract() {
    if (this instanceof Contract) {
      instantiate(this, arguments[0]);
    } else {
      var C = mutate(Contract);
      var network_id = arguments.length > 0 ? arguments[0] : "default";
      C.setNetwork(network_id);
      return C;
    }
  };

  Contract.currentProvider = null;

  Contract.setProvider = function(provider) {
    var wrapped = new Provider(provider);
    this.web3.setProvider(wrapped);
    this.currentProvider = provider;
  };

  Contract.new = function() {
    if (this.currentProvider == null) {
      throw new Error("MortgageApp error: Please call setProvider() first before calling new().");
    }

    var args = Array.prototype.slice.call(arguments);

    if (!this.unlinked_binary) {
      throw new Error("MortgageApp error: contract binary not set. Can't deploy new instance.");
    }

    var regex = /__[^_]+_+/g;
    var unlinked_libraries = this.binary.match(regex);

    if (unlinked_libraries != null) {
      unlinked_libraries = unlinked_libraries.map(function(name) {
        // Remove underscores
        return name.replace(/_/g, "");
      }).sort().filter(function(name, index, arr) {
        // Remove duplicates
        if (index + 1 >= arr.length) {
          return true;
        }

        return name != arr[index + 1];
      }).join(", ");

      throw new Error("MortgageApp contains unresolved libraries. You must deploy and link the following libraries before you can deploy a new version of MortgageApp: " + unlinked_libraries);
    }

    var self = this;

    return new Promise(function(accept, reject) {
      var contract_class = self.web3.eth.contract(self.abi);
      var tx_params = {};
      var last_arg = args[args.length - 1];

      // It's only tx_params if it's an object and not a BigNumber.
      if (Utils.is_object(last_arg) && !Utils.is_big_number(last_arg)) {
        tx_params = args.pop();
      }

      tx_params = Utils.merge(self.class_defaults, tx_params);

      if (tx_params.data == null) {
        tx_params.data = self.binary;
      }

      // web3 0.9.0 and above calls new twice this callback twice.
      // Why, I have no idea...
      var intermediary = function(err, web3_instance) {
        if (err != null) {
          reject(err);
          return;
        }

        if (err == null && web3_instance != null && web3_instance.address != null) {
          accept(new self(web3_instance));
        }
      };

      args.push(tx_params, intermediary);
      contract_class.new.apply(contract_class, args);
    });
  };

  Contract.at = function(address) {
    if (address == null || typeof address != "string" || address.length != 42) {
      throw new Error("Invalid address passed to MortgageApp.at(): " + address);
    }

    var contract_class = this.web3.eth.contract(this.abi);
    var contract = contract_class.at(address);

    return new this(contract);
  };

  Contract.deployed = function() {
    if (!this.address) {
      throw new Error("Cannot find deployed address: MortgageApp not deployed or address not set.");
    }

    return this.at(this.address);
  };

  Contract.defaults = function(class_defaults) {
    if (this.class_defaults == null) {
      this.class_defaults = {};
    }

    if (class_defaults == null) {
      class_defaults = {};
    }

    var self = this;
    Object.keys(class_defaults).forEach(function(key) {
      var value = class_defaults[key];
      self.class_defaults[key] = value;
    });

    return this.class_defaults;
  };

  Contract.extend = function() {
    var args = Array.prototype.slice.call(arguments);

    for (var i = 0; i < arguments.length; i++) {
      var object = arguments[i];
      var keys = Object.keys(object);
      for (var j = 0; j < keys.length; j++) {
        var key = keys[j];
        var value = object[key];
        this.prototype[key] = value;
      }
    }
  };

  Contract.all_networks = {
  "default": {
    "abi": [
      {
        "constant": false,
        "inputs": [],
        "name": "removeQuotes",
        "outputs": [],
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [
          {
            "name": "requestorAddress",
            "type": "address"
          }
        ],
        "name": "getNumberOfQuotes",
        "outputs": [
          {
            "name": "count",
            "type": "uint256"
          }
        ],
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          {
            "name": "loanAmount",
            "type": "uint256"
          },
          {
            "name": "propertyType",
            "type": "bytes32"
          },
          {
            "name": "loanTerm",
            "type": "uint256"
          },
          {
            "name": "city",
            "type": "bytes32"
          },
          {
            "name": "state",
            "type": "bytes32"
          },
          {
            "name": "zip",
            "type": "bytes32"
          },
          {
            "name": "propertyValue",
            "type": "uint256"
          },
          {
            "name": "ltv",
            "type": "uint256"
          }
        ],
        "name": "submitRequest",
        "outputs": [],
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [
          {
            "name": "requestorAddress",
            "type": "address"
          }
        ],
        "name": "getRequest",
        "outputs": [
          {
            "name": "",
            "type": "uint256"
          },
          {
            "name": "",
            "type": "bytes32"
          }
        ],
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [
          {
            "name": "",
            "type": "address"
          }
        ],
        "name": "requests",
        "outputs": [
          {
            "name": "loanAmount",
            "type": "uint256"
          },
          {
            "name": "propertyType",
            "type": "bytes32"
          },
          {
            "name": "loanTerm",
            "type": "uint256"
          },
          {
            "name": "city",
            "type": "bytes32"
          },
          {
            "name": "state",
            "type": "bytes32"
          },
          {
            "name": "zip",
            "type": "bytes32"
          },
          {
            "name": "propertyValue",
            "type": "uint256"
          },
          {
            "name": "ltv",
            "type": "uint256"
          }
        ],
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          {
            "name": "requestorAddress",
            "type": "address"
          },
          {
            "name": "lenderAddress",
            "type": "address"
          },
          {
            "name": "companyName",
            "type": "bytes32"
          },
          {
            "name": "loanAmount",
            "type": "uint256"
          },
          {
            "name": "term",
            "type": "uint256"
          },
          {
            "name": "estimatedRate",
            "type": "uint256"
          }
        ],
        "name": "submitQuote",
        "outputs": [],
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [
          {
            "name": "requestorAddress",
            "type": "address"
          },
          {
            "name": "index",
            "type": "uint256"
          }
        ],
        "name": "getQuotes",
        "outputs": [
          {
            "name": "",
            "type": "address"
          },
          {
            "name": "",
            "type": "bytes32"
          },
          {
            "name": "",
            "type": "uint256"
          },
          {
            "name": "",
            "type": "uint256"
          },
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "type": "function"
      },
      {
        "inputs": [],
        "type": "constructor"
      },
      {
        "anonymous": false,
        "inputs": [
          {
            "indexed": false,
            "name": "requestorAddress",
            "type": "address"
          },
          {
            "indexed": false,
            "name": "loanAmount",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "propertyType",
            "type": "bytes32"
          },
          {
            "indexed": false,
            "name": "loanTerm",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "city",
            "type": "bytes32"
          },
          {
            "indexed": false,
            "name": "state",
            "type": "bytes32"
          },
          {
            "indexed": false,
            "name": "zip",
            "type": "bytes32"
          },
          {
            "indexed": false,
            "name": "propertyValue",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "ltv",
            "type": "uint256"
          }
        ],
        "name": "MortgageRequested",
        "type": "event"
      },
      {
        "anonymous": false,
        "inputs": [
          {
            "indexed": false,
            "name": "requestorAddress",
            "type": "address"
          },
          {
            "indexed": false,
            "name": "lenderAddress",
            "type": "address"
          },
          {
            "indexed": false,
            "name": "companyName",
            "type": "bytes32"
          },
          {
            "indexed": false,
            "name": "loanAmount",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "term",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "estimatedRate",
            "type": "uint256"
          }
        ],
        "name": "MortgageQuoted",
        "type": "event"
      }
    ],
    "unlinked_binary": "0x60606040526104df806100126000396000f3606060405236156100615760e060020a6000350463038df41d8114610063578063348b54cb146100f35780633f9176951461012357806363c1dff7146101fc57806374adad1d146102385780637ca811871461027d578063e785f45b14610310575b005b61006133600160a060020a031660009081526020819052604081206008018054828255829080158290116104085760050281600502836000526020600020918201910161040891905b8082111561040e57805473ffffffffffffffffffffffffffffffffffffffff19168155600060018201819055600282018190556003820181905560048201556005016100ac565b600160a060020a036004351660009081526020819052604090206008015460408051918252519081900360200190f35b61006160043560243560443560643560843560a43560c43560e43533600160a060020a0316600081815260208181526040918290208b8155600181018b9055600281018a905560038101899055600481018890556005810187905560068101869055600701849055815192835282018a9052818101899052606082018890526080820187905260a0820186905260c0820185905260e082018490526101008201839052517ffde21aa7a3f5f162d96099fef2ad463b7ddf6a661a007758f02123503d63eac3918190036101200190a15050505050505050565b600160a060020a036004351660009081526020819052604090208054600191909101546040805192835260208301919091528051918290030190f35b60006020819052600480358252604090912080546001820154600283015460038401549484015460058501546006860154600790960154610391979596949593949088565b61006160043560243560443560643560843560a4356040805160a08101825233600160a060020a039081168252602082810188905282840187905260608301869052608083018590529089166000908152908190529190912060080180546001810180835582919082818380158290116104125760050281600502836000526020600020918201910161041291906100ac565b6103d2600435602435600160a060020a0382166000908152602081905260408120600801805482918291829182918291908890811015610002576000918252602090912060059190910201805460018201546002830154600384015460049490940154600160a060020a03939093169c919b50995091975095509350505050565b604080519889526020890197909752878701959095526060870193909352608086019190915260a085015260c084015260e083015251908190036101000190f35b60408051600160a060020a0396909616865260208601949094528484019290925260608401526080830152519081900360a00190f35b50505050565b5090565b505050919090600052602060002090600502016000508351815473ffffffffffffffffffffffffffffffffffffffff1916178155602084810151600183015560408581015160028401556060868101516003850155608087810151600495909501949094558151600160a060020a038e811682523316938101939093528282018b9052820189905291810187905260a0810186905290517f9271808ab926a95dc3e37f63db2711d4e35b4f8e9c39d28411eb3498509ceac792509081900360c00190a1505050505050505056",
    "events": {
      "0x60094e1d066d25d436e7eb94d679e76cac297d5f13a6faf5bc0d27aab4478b68": {
        "anonymous": false,
        "inputs": [
          {
            "indexed": false,
            "name": "requestor",
            "type": "address"
          },
          {
            "indexed": false,
            "name": "age",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "gender",
            "type": "bytes32"
          },
          {
            "indexed": false,
            "name": "zip",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "height",
            "type": "bytes32"
          },
          {
            "indexed": false,
            "name": "weight",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "tobaccoUse",
            "type": "bool"
          },
          {
            "indexed": false,
            "name": "lengthOfProtection",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "dmvRecords",
            "type": "bool"
          },
          {
            "indexed": false,
            "name": "medicalHistory",
            "type": "bool"
          },
          {
            "indexed": false,
            "name": "coverageRequested",
            "type": "uint256"
          }
        ],
        "name": "InsuranceRequested",
        "type": "event"
      },
      "0x1d6376efb5768191ddf99b6f88e6c4afce156c84ab26661eb50accef9b515ae7": {
        "anonymous": false,
        "inputs": [
          {
            "indexed": false,
            "name": "requestor",
            "type": "address"
          },
          {
            "indexed": false,
            "name": "companyName",
            "type": "bytes32"
          },
          {
            "indexed": false,
            "name": "monthlyPremium",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "coverageOffered",
            "type": "uint256"
          }
        ],
        "name": "InsuranceQuoted",
        "type": "event"
      },
      "0xfde21aa7a3f5f162d96099fef2ad463b7ddf6a661a007758f02123503d63eac3": {
        "anonymous": false,
        "inputs": [
          {
            "indexed": false,
            "name": "requestorAddress",
            "type": "address"
          },
          {
            "indexed": false,
            "name": "loanAmount",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "propertyType",
            "type": "bytes32"
          },
          {
            "indexed": false,
            "name": "loanTerm",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "city",
            "type": "bytes32"
          },
          {
            "indexed": false,
            "name": "state",
            "type": "bytes32"
          },
          {
            "indexed": false,
            "name": "zip",
            "type": "bytes32"
          },
          {
            "indexed": false,
            "name": "propertyValue",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "ltv",
            "type": "uint256"
          }
        ],
        "name": "MortgageRequested",
        "type": "event"
      },
      "0x9271808ab926a95dc3e37f63db2711d4e35b4f8e9c39d28411eb3498509ceac7": {
        "anonymous": false,
        "inputs": [
          {
            "indexed": false,
            "name": "requestorAddress",
            "type": "address"
          },
          {
            "indexed": false,
            "name": "lenderAddress",
            "type": "address"
          },
          {
            "indexed": false,
            "name": "companyName",
            "type": "bytes32"
          },
          {
            "indexed": false,
            "name": "loanAmount",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "term",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "estimatedRate",
            "type": "uint256"
          }
        ],
        "name": "MortgageQuoted",
        "type": "event"
      }
    },
    "updated_at": 1473940674856,
    "links": {},
    "address": "0xc89ce4735882c9f0f0fe26686c53074e09b0d550"
  }
};

  Contract.checkNetwork = function(callback) {
    var self = this;

    if (this.network_id != null) {
      return callback();
    }

    this.web3.version.network(function(err, result) {
      if (err) return callback(err);

      var network_id = result.toString();

      // If we have the main network,
      if (network_id == "1") {
        var possible_ids = ["1", "live", "default"];

        for (var i = 0; i < possible_ids.length; i++) {
          var id = possible_ids[i];
          if (Contract.all_networks[id] != null) {
            network_id = id;
            break;
          }
        }
      }

      if (self.all_networks[network_id] == null) {
        return callback(new Error(self.name + " error: Can't find artifacts for network id '" + network_id + "'"));
      }

      self.setNetwork(network_id);
      callback();
    })
  };

  Contract.setNetwork = function(network_id) {
    var network = this.all_networks[network_id] || {};

    this.abi             = this.prototype.abi             = network.abi;
    this.unlinked_binary = this.prototype.unlinked_binary = network.unlinked_binary;
    this.address         = this.prototype.address         = network.address;
    this.updated_at      = this.prototype.updated_at      = network.updated_at;
    this.links           = this.prototype.links           = network.links || {};
    this.events          = this.prototype.events          = network.events || {};

    this.network_id = network_id;
  };

  Contract.networks = function() {
    return Object.keys(this.all_networks);
  };

  Contract.link = function(name, address) {
    if (typeof name == "function") {
      var contract = name;

      if (contract.address == null) {
        throw new Error("Cannot link contract without an address.");
      }

      Contract.link(contract.contract_name, contract.address);

      // Merge events so this contract knows about library's events
      Object.keys(contract.events).forEach(function(topic) {
        Contract.events[topic] = contract.events[topic];
      });

      return;
    }

    if (typeof name == "object") {
      var obj = name;
      Object.keys(obj).forEach(function(name) {
        var a = obj[name];
        Contract.link(name, a);
      });
      return;
    }

    Contract.links[name] = address;
  };

  Contract.contract_name   = Contract.prototype.contract_name   = "MortgageApp";
  Contract.generated_with  = Contract.prototype.generated_with  = "3.2.0";

  // Allow people to opt-in to breaking changes now.
  Contract.next_gen = false;

  var properties = {
    binary: function() {
      var binary = Contract.unlinked_binary;

      Object.keys(Contract.links).forEach(function(library_name) {
        var library_address = Contract.links[library_name];
        var regex = new RegExp("__" + library_name + "_*", "g");

        binary = binary.replace(regex, library_address.replace("0x", ""));
      });

      return binary;
    }
  };

  Object.keys(properties).forEach(function(key) {
    var getter = properties[key];

    var definition = {};
    definition.enumerable = true;
    definition.configurable = false;
    definition.get = getter;

    Object.defineProperty(Contract, key, definition);
    Object.defineProperty(Contract.prototype, key, definition);
  });

  bootstrap(Contract);

  if (typeof module != "undefined" && typeof module.exports != "undefined") {
    module.exports = Contract;
  } else {
    // There will only be one version of this contract in the browser,
    // and we can use that.
    window.MortgageApp = Contract;
  }
})();
