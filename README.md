# oyl.js - Organize Your Life

## Install

For Node:

    npm install oyl
    
For Bower:

    bower install oyl
    
## Purpose

OYL is designed to organize everything in your life in a format that 
is intentionally easy to understand. It includes, but is not limited to: 

* Diet / food journaling
* Daily schedule / to do tasks
* Manage finances
* Fitness tracker
* Media tracker (movies, books, games, Facebook postings, tweets, etc stats and badges

## Gamification / Rewardification

OYL incentifices the user to continue making improvements by offering statistics, 
achievements and badges. While it may be completely manipulated by the end-user, 
the intention is simply for encouraging users who incorporate the application honestly. 
Applications built on top of OYL can incorporate the features and leverage 
their own security layer for protecting against abuse.

## Future Test Cases
    
    var foods = {
        "french fries": {
            "servings": [{
                "size": 200,
                "unit": "g",
                "kcal": 400
            }]
        }
    };
    
    var places = {
        "restaurants": {
            "Tripel": {
                "menu": {
                    "cheeseburger": {
                        "size": 200,
                        "unit": "g",
                        "kcal": 400
                    }
                }
            }
        }
    };
    
    var journal = {
        "June 6, 2016": {
            "6:00pm": {
                "ate": {
                    "cheeseburger": 1,
                    "french fries": 0.5
                }
                "at": {
                    "restaurant": "Tripel"
                }
            }
        }
    };
    
    var myself = {
        name: 'Six Sticks',
        birthday: 'June 6, 1996',
        timezone: 'PST'
    };
    
    var OrganizeYourLife = {
        profile: myself,
        places: places,
        foods: foods,
        journal: journal
    };
    
    var my_life = oyl( OrganizeYourLife );
    
    my_life.on("June 6, 2016").how.many("kcal");
    
    // returns 600
    
    my_life.on("June 6, 2016").where.did.I.go();
    
    // returns [{"restaurant":"Tripel"}]
    
    my_life.how.many("kcal").past("week");
    
    // returns 14000
    
    my_life.how.many("kcal").past("week").just("days before 12:00pm");
    
    // returns 5600;
    
    my_life.achievements.past("week");
    
    //returns [{"Breakfast Champion":"You ate a sustainable breakfast every day this week"}]
    
## Generators

To format your data to match the oyl parameters, use a generator.
Generators are available for every type of setting/option.

    var my_journal = [{
        date: 43234500000,
        foods: ["cheeseburger", "french fries"]
    }];
        
    var journalGenerator = oyl.journal(function(d){
            return (moment(d.date, "MMMM D, YYYY"));
        })
        .time(function(d) {
            return (moment(d.date, "h:mma"));
        })
        .ate(function(d) {
            var foods = {};
            for (var i=0; i<d.foods.length; i++) {
                foods[d.foods[i]] = 1;
            }
            return foods;
        });
    
    var journal = journalGenerator( my_journal );
    
