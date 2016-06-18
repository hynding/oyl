module.exports = ->
  
  @Given /^your name is "([^"]*)"$/, (name, next)->
    next null, 'pending'

  @When /^you ask for your name$/, (next)->
    next null, 'pending'
    
  @Then /^it prints "([^"]*)"$/, (name, next)->
    next null, 'pending'