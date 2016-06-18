Feature: An application to organize your life, colloquially referred to as OYL
  OYL should be associated to a user profile
  OYL should be able to answer questions about the user's activities and status

  Scenario: All in the name
    Given your name is "Steve"
    When you ask for your name
    Then it prints "Steve"

#  Scenario Outline: Where have you been
#    Given the <date>
#    When you ask for the names of where you have been
#    Then it prints the names of the <places>
#
#    Examples:
#      | date            | places                    |
#      | "June 6, 2016"  | "Home Depot, Lowe's, OSH" |
#      | "March 6, 2016" | "Home Depot, Lowe's, OSH" |