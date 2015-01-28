'use strict';

angular.module('tasks').directive('taskActions', [
	function() {
		return {
			templateUrl: '/modules/tasks/directives/task-actions.client.directive.html',
			restrict: 'E'
		};
	}
]);