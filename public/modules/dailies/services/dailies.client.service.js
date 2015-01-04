'use strict';

//Dailies service used to communicate Dailies REST endpoints
angular.module('dailies').factory('Dailies', ['$resource',
	function($resource) {
		return $resource('dailies/:dailyId', { dailyId: '@_id'
		}, {
			update: {
				method: 'PUT'
			}
		});
	}
]);