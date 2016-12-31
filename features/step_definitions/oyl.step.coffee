oyl = require '../../oyl'
assert = require 'assert'

module.exports = ->

  test = @
  test.profile =
    name: null
  test.answer = null
  test.oyl = null

  @profile = 
    name: null
  @schedule = null
  @places = null
  @oyl_result = null
  ##
  # Given
  ##
  @Given 'your name is "$name"', (name)->
    test.profile.name = name

  @Given 'you went to "$name" on "$date"', (name, date)->
    test.places = [
      name: name
    ]
    test.schedule = [
      date: date,
      place: test.places[0]
    ]

  ##
  # When
  ##
  @When 'you ask for your name', ()->
    test.oyl = oyl
      profile: test.profile
    test.answer = test.oyl.what.is.my.name()
  
  @When 'you ask where you went on "$date"', (date)->
    test.oyl = oyl
      profile: test.profile
      places: test.places
      schedule: test.schedule
    test.answer = test.oyl.where.was.I.on(date)

  ##
  # Then
  ##
  @Then 'oyl prints "$name"', (name)->
    assert.equal test.answer, name