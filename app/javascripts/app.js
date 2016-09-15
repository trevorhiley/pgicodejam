var accounts;
var account;
var account1;
var account2;
var account3;
var account4;
var requestCreated = false;
var quotes = [];


(function($) {
    $(function() {

        $('.button-collapse').sideNav();
        $('.parallax').parallax();

    }); // end of document ready
})(jQuery); // end of jQuery name space



function addToQuotes(quote) {
    if (quotes.length > 0) {
        var companyFound = false;
        for (var i = 0; i < quotes.length; i++) {
            if (quotes[i].companyName === quote.companyName) {
                companyFound = true;
            }
        }
        if (!companyFound) {
            quotes.push(quote);
            addQuoteToList(quote);
        }
    } else {
        quotes.push(quote);
        addQuoteToList(quote);
    }
}

function addQuoteToList(quote) {
    var imageName = 'W301157';

    if (quote.companyName == "Adam's Lending Emporium") {
      imageName = 'W301157.jpg';
    }


    $("#noQuotes").hide();
    var first = '<li class="collection-item avatar animated slideInLeft">';
    var image = '<img src="images/"' + imageName + ' alt="" class="circle">';
    var title = '<span class="title">' + quote.companyName + '</span>';
    var details = '<p>Loan amount: ' + numeral(quote.loanAmount).format('$0,0.00') + '<br>Loan term: ' + quote.term + ' months<br>Estimated Rate:' + numeral(quote.estimatedRate * .0001).format('0.000%') + '</p>';
    var apply = '<a href="#!" class="secondary-content waves-effect waves-light btn orange animated infinite pulse" <i id="submitButton" class="" >Apply Now</i></a></li>';
    $("#listOfQuotes2").append(first + image + title + details + apply);
}


function watchForRequests() {
    var meta = MortgageApp.deployed();
    var intervalId = window.setInterval(
        function() {
            meta.getRequest.call(account, {
                from: account
            }).then(function(response) {
                window.clearInterval(intervalId);
                if (!requestCreated) {
                    requestCreated = true;
                    createQuotes();
                }
            }).catch(function(e) {
                // There was an error! Handle it.
            })
        }, 1000);
}



function createQuotes() {
    deleteQuotes();

    generateQuote({
        requestorAddress: account,
        lenderAddress: account1,
        companyName: "Principal Real Estate Investors",
        loanAmount: 25000000,
        term: 370,
        estimatedRate: 250
    }, 2000)

    generateQuote({
        requestorAddress: account,
        lenderAddress: account2,
        companyName: "The Other Guy",
        loanAmount: 23000000,
        term: 350,
        estimatedRate: 850
    }, 4000)

    generateQuote({
        requestorAddress: account,
        lenderAddress: account3,
        companyName: "Stage Coach Lending",
        loanAmount: 25000000,
        term: 340,
        estimatedRate: 350
    }, 6000)

    generateQuote({
        requestorAddress: account,
        lenderAddress: account1,
        companyName: "Adam's Lending Emporium",
        loanAmount: 25000000000000,
        term: 12,
        estimatedRate: 1550
    }, 500)

    generateQuote({
        requestorAddress: account,
        lenderAddress: account2,
        companyName: "Sondgeroth Mortgage",
        loanAmount: 25000000,
        term: 360,
        estimatedRate: 250
    }, 1500)

    generateQuote({
        requestorAddress: account,
        lenderAddress: account3,
        companyName: "PGI Code Jammers",
        loanAmount: 40,
        term: 1,
        estimatedRate: 45000
    }, 7500)
}

function watchForQuotes() {
    var meta = MortgageApp.deployed();
    var intervalId = window.setInterval(
        function() {
            getCurrentQuotes();
        }, 500)
}

function getCurrentQuotes() {
    var meta = MortgageApp.deployed();
    meta.getNumberOfQuotes.call(account, {
        from: account
    }).then(function(value) {
        var numberOfQuotes = value;
        console.log("Number of quotes is " + value);
        for (var i = 0; i < numberOfQuotes; i++) {
            meta.getQuotes.call(account, i, {
                from: account
            }).then(function(value) {
                addToQuotes({
                    companyName: web3.toAscii(value[1]),
                    loanAmount: value[2].toNumber(),
                    term: value[3].toNumber(),
                    estimatedRate: value[4].toNumber()
                });
            }).catch(function(e) {
                console.log(e);
            });
        }

    }).catch(function(e) {
        console.log(e);
    });
}

function deleteQuotes() {
    var meta = MortgageApp.deployed();
    meta.removeQuotes({
        from: account
    }).then(function() {
        console.log("quotes removed");
        watchForQuotes();
    }).catch(function(e) {
        console.log(e);
    });
}

function generateQuote(quote, timeOut) {
    var meta = MortgageApp.deployed();
    setTimeout(function() {
        meta.submitQuote(quote.requestorAddress, quote.lenderAddress, quote.companyName, quote.loanAmount, quote.term, quote.estimatedRate, {
            from: account
        }).then(function() {}).catch(function(e) {
            console.log(e);
        })
    }, timeOut);
}

function apply() {
    var meta = MortgageApp.deployed();

    var loanAmount = 25000000;
    var propertyType = 'Retail';
    var loanTerm = 360;
    var city = 'Des Moines';
    var state = 'IA';
    var zip = '50192';
    var propertyValue = 2000000;
    var ltv = .65;

    meta.submitRequest(loanAmount, propertyType, loanTerm, city, state, zip, propertyValue, ltv, {
        from: account
    }).then(function() {
        meta.getRequest.call(account, {
            from: account
        }).then(function(value) {
            watchForRequests();
        }).catch(function(e) {
            console.log(e);
        });
    }).catch(function(e) {
        console.log(e);
    });
};

window.onload = function() {
    web3.eth.getAccounts(function(err, accs) {
        if (err != null) {
            alert("There was an error fetching your accounts.");
            return;
        }

        if (accs.length == 0) {
            alert("Couldn't get any accounts! Make sure your Ethereum client is configured correctly.");
            return;
        }

        accounts = accs;
        account = accounts[0];
        account1 = accounts[1];
        account2 = accounts[2];
        account3 = accounts[3];

    });
}


// requested loan amount
var requestedLoanAmountSlider = document.getElementById('requested-loan-amount-range');

noUiSlider.create(requestedLoanAmountSlider, {
    start: [10000000],
    step: 100000,
    range: {
        'min': [10000000],
        'max': [50000000]
    }
});

var requestedLoanAmountSliderValueElement = document.getElementById('requested-loan-amount-range-value');

requestedLoanAmountSlider.noUiSlider.on('update', function(values, handle) {
    var requestedLoanAmount = Number(values[handle]).toLocaleString('en-US', {
        style: 'currency',
        currency: 'USD'
    });
    requestedLoanAmountSliderValueElement.innerHTML = requestedLoanAmount;
});


// estimated property value
var estimatedPropertyValueSlider = document.getElementById('estimated-property-value-range');

noUiSlider.create(estimatedPropertyValueSlider, {
    start: [10000000],
    step: 100000,
    range: {
        'min': [10000000],
        'max': [50000000]
    }
});

var estimatedPropertyValueSliderValueElement = document.getElementById('estimated-property-value-range-value');

estimatedPropertyValueSlider.noUiSlider.on('update', function(values, handle) {
    estimatedPropertyValueSliderValueElement.innerHTML = Number(values[handle]).toLocaleString('en-US', {
        style: 'currency',
        currency: 'USD'
    });
});

requestedLoanAmountSlider.noUiSlider.on('slide', function(values, handle) {
    var loan_to_value_percent = requestedLoanAmountSlider.noUiSlider.get() / estimatedPropertyValueSlider.noUiSlider.get();
    $('#loan_to_value').val((loan_to_value_percent * 100).toFixed(2) + "%");
});

estimatedPropertyValueSlider.noUiSlider.on('slide', function(values, handle) {
    var loan_to_value_percent = requestedLoanAmountSlider.noUiSlider.get() / estimatedPropertyValueSlider.noUiSlider.get();
    $('#loan_to_value').val((loan_to_value_percent * 100).toFixed(2) + "%");
});

$(document).ready(function() {
    $('#property_type').material_select();
    $('#desired_loan_term').material_select();

    var loan_to_value_percent = requestedLoanAmountSlider.noUiSlider.get() / estimatedPropertyValueSlider.noUiSlider.get();
    $('#loan_to_value').val((loan_to_value_percent * 100).toFixed(2) + "%");

    $('.scrollspy').scrollSpy({
        scrollOffset: 50
    });
});