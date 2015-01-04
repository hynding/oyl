'use strict';

// Todos controller
angular.module('todos').controller('TodosController', ['$scope', '$stateParams', '$location', 'Authentication', 'Todos',
	function($scope, $stateParams, $location, Authentication, Todos) {
		$scope.authentication = Authentication;

		// Create new Todo
		$scope.create = function() {
			// Create new Todo object
			var todo = new Todos ({
				name: this.name
			});

			// Redirect after save
			todo.$save(function(response) {
				$location.path('todos/' + response._id);

				// Clear form fields
				$scope.name = '';
			}, function(errorResponse) {
				$scope.error = errorResponse.data.message;
			});
		};

		// Remove existing Todo
		$scope.remove = function(todo) {
			if ( todo ) { 
				todo.$remove();

				for (var i in $scope.todos) {
					if ($scope.todos [i] === todo) {
						$scope.todos.splice(i, 1);
					}
				}
			} else {
				$scope.todo.$remove(function() {
					$location.path('todos');
				});
			}
		};

		// Update existing Todo
		$scope.update = function() {
			var todo = $scope.todo;

			todo.$update(function() {
				$location.path('todos/' + todo._id);
			}, function(errorResponse) {
				$scope.error = errorResponse.data.message;
			});
		};

		// Find a list of Todos
		$scope.find = function() {
			$scope.todos = Todos.query();
		};

		// Find existing Todo
		$scope.findOne = function() {
			$scope.todo = Todos.get({ 
				todoId: $stateParams.todoId
			});
		};
	}
]);