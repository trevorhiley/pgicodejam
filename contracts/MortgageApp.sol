contract MortgageApp {

  function MortgageApp() {
  }

  struct Quote {
    address lenderAddress;
    bytes32 companyName;
    uint loanAmount;
    uint term;
    uint estimatedRate;
  }

  struct MortgageRequest {
        uint loanAmount;
        bytes32 propertyType;
        uint loanTerm;
        bytes32 city;
        bytes32 state;
        bytes32 zip;
        uint propertyValue;
        uint ltv;
        Quote[] quotes;
  }

  mapping(address => MortgageRequest) public requests;

  event MortgageRequested(address requestorAddress, uint loanAmount, bytes32 propertyType, uint loanTerm, bytes32 city, bytes32 state, bytes32 zip, uint propertyValue, uint ltv);
  event MortgageQuoted(address requestorAddress, address lenderAddress, bytes32 companyName, uint loanAmount, uint term, uint estimatedRate);

  function submitRequest(
    uint loanAmount, bytes32 propertyType, uint loanTerm, bytes32 city, bytes32 state, bytes32 zip, uint propertyValue, uint ltv) {

    requests[msg.sender].loanAmount = loanAmount;
    requests[msg.sender].propertyType = propertyType;
    requests[msg.sender].loanTerm = loanTerm;
    requests[msg.sender].city = city;
    requests[msg.sender].state = state;
    requests[msg.sender].zip = zip;
    requests[msg.sender].propertyValue = propertyValue;
    requests[msg.sender].ltv = ltv;

    MortgageRequested(msg.sender, loanAmount, propertyType, loanTerm, city, state, zip, propertyValue, ltv);
  }

  function submitQuote(address requestorAddress, address lenderAddress, bytes32 companyName, uint loanAmount, uint term, uint estimatedRate) {
    Quote memory quote;
    quote.lenderAddress = msg.sender;
    quote.companyName = companyName;
    quote.loanAmount = loanAmount;
    quote.term = term;
    quote.estimatedRate = estimatedRate;

    Quote[] quotes = requests[requestorAddress].quotes;
 

    quotes.push(quote);

    MortgageQuoted(requestorAddress, msg.sender, companyName, loanAmount, term, estimatedRate);
  }

  function removeQuotes() {
    requests[msg.sender].quotes.length = 0;
  }

  function getNumberOfQuotes(address requestorAddress) constant returns (uint count) {
    count = requests[requestorAddress].quotes.length;
  }

  function getQuotes(address requestorAddress, uint index) constant returns (address, bytes32, uint, uint, uint) {
    Quote quote = requests[requestorAddress].quotes[index];
    return (quote.lenderAddress, quote.companyName, quote.loanAmount, quote.term, quote.estimatedRate);
  }

  function getRequest(address requestorAddress) constant returns (uint, bytes32) {
    MortgageRequest request = requests[requestorAddress];
    return ( request.loanAmount, request.propertyType );
  }

}
