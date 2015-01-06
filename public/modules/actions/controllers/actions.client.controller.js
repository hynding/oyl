'use strict';

// Actions controller
angular.module('actions').controller('ActionsController', ['$scope', '$stateParams', '$location', 'Authentication', 'Actions',
	function($scope, $stateParams, $location, Authentication, Actions) {
		$scope.authentication = Authentication;

		// Create new Action
		$scope.create = function() {
			// Create new Action object
			var action = new Actions ({
				name: this.name
			});

			// Redirect after save
			action.$save(function(response) {
				$location.path('actions/' + response._id);

				// Clear form fields
				$scope.name = '';
			}, function(errorResponse) {
				$scope.error = errorResponse.data.message;
			});
		};

		// Remove existing Action
		$scope.remove = function(action) {
			if ( action ) { 
				action.$remove();

				for (var i in $scope.actions) {
					if ($scope.actions [i] === action) {
						$scope.actions.splice(i, 1);
					}
				}
			} else {
				$scope.action.$remove(function() {
					$location.path('actions');
				});
			}
		};

		// Update existing Action
		$scope.update = function() {
			var action = $scope.action;

			action.$update(function() {
				$location.path('actions/' + action._id);
			}, function(errorResponse) {
				$scope.error = errorResponse.data.message;
			});
		};

		// Find a list of Actions
		$scope.find = function() {
			$scope.actions = Actions.query();
		};

		// Find existing Action
		$scope.findOne = function() {
			$scope.action = Actions.get({ 
				actionId: $stateParams.actionId
			});
		};
	}
]);