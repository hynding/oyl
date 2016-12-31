Feature: An application to organize your life, colloquially referred to as OYL
  OYL should associate itself to at least one user profile
  OYL should be able to answer questions about the user's activities and status

  Scenario: Your name
    Given your name is "Steve"
    When you ask for your name
    Then oyl prints "Steve"

  Scenario: Your daily schedule
    Given you went to "library" on "June 6, 2016"
    And you went to "museum" on "June 7, 2016"
    When you ask where you went on "June 6, 2016"
    Then oyl prints "library"

  Scenario: Your eating pattern
    Given you ate 1 "eggs" on "July 8, 2016"
    And you ate 1 "toast" on "July 9, 2016"
    When you ask what you ate on "July 8, 2016"
    Then oyl prints 1 "eggs"

  Scenario: Your calorie consumption
    Given "eggs" have 70 kcals per serving
    And you ate 2 "eggs" on "July 8, 2016"
    When you ask how many kcals you "consumed" on "July 8, 2016"
    Then oyl prints 140

  Scenario: Your fitness tracker
    Given you "walk" 5 "miles" on "July 8, 2016"
    And you "run" 3 "miles" on "July 8, 2016"
    And you are a 35 year old "male"
    And you weight 175 "lbs"
    When you ask how many kcals you "burned" on "July 8, 2016"
    Then oyl prints
