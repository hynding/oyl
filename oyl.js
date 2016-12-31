'use strict';

module.exports = oyl;

function oyl(settings) {
  return {
    what: {
      is: {
        my: {
          name: function() {
            return settings.profile.name;
          }
        }
      }
    },
    where: {
      was: {
        I: {
          on: function(date) {
            var whereIwas = 'no data';
            settings.schedule.forEach(function(item){
              if (item.date && item.date == date) {
                whereIwas = item.place.name;
              }
            });
            return whereIwas;
          }
        }
      }
    }
  };
} 