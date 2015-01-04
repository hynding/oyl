'use strict';

//Todos service used to communicate Todos REST endpoints
angular.module('todos').factory('Todos', ['$resource',
	function($resource) {
		return $resource('todos/:todoId', { todoId: '@_id'
		}, {
			update: {
				method: 'PUT'
			}
		});
	}
]);