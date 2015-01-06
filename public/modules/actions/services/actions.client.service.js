'use strict';

//Actions service used to communicate Actions REST endpoints
angular.module('actions').factory('Actions', ['$resource',
	function($resource) {
		return $resource('actions/:actionId', { actionId: '@_id'
		}, {
			update: {
				method: 'PUT'
			}
		});
	}
]);