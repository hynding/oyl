'use strict';

//Occurrences service used to communicate Occurrences REST endpoints
angular.module('occurrences').factory('Occurrences', ['$resource',
	function($resource) {
		return $resource('occurrences/:occurrenceId', { occurrenceId: '@_id'
		}, {
			update: {
				method: 'PUT'
			}
		});
	}
]);