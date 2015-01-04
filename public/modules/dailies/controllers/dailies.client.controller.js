'use strict';

// Dailies controller
angular.module('dailies').controller('DailiesController', ['$scope', '$stateParams', '$location', 'Authentication', 'Dailies',
	function($scope, $stateParams, $location, Authentication, Dailies) {
		$scope.authentication = Authentication;

		// Create new Daily
		$scope.create = function() {
			// Create new Daily object
			var daily = new Dailies ({
				name: this.name
			});

			// Redirect after save
			daily.$save(function(response) {
				$location.path('dailies/' + response._id);

				// Clear form fields
				$scope.name = '';
			}, function(errorResponse) {
				$scope.error = errorResponse.data.message;
			});
		};

		// Remove existing Daily
		$scope.remove = function(daily) {
			if ( daily ) { 
				daily.$remove();

				for (var i in $scope.dailies) {
					if ($scope.dailies [i] === daily) {
						$scope.dailies.splice(i, 1);
					}
				}
			} else {
				$scope.daily.$remove(function() {
					$location.path('dailies');
				});
			}
		};

		// Update existing Daily
		$scope.update = function() {
			var daily = $scope.daily;

			daily.$update(function() {
				$location.path('dailies/' + daily._id);
			}, function(errorResponse) {
				$scope.error = errorResponse.data.message;
			});
		};

		// Find a list of Dailies
		$scope.find = function() {
			$scope.dailies = Dailies.query();
		};

		// Find existing Daily
		$scope.findOne = function() {
			$scope.daily = Dailies.get({ 
				dailyId: $stateParams.dailyId
			});
		};
	}
]);