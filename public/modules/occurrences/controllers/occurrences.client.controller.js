'use strict';

// Occurrences controller
angular.module('occurrences').controller('OccurrencesController', ['$scope', '$stateParams', '$location', 'Authentication', 'Occurrences',
	function($scope, $stateParams, $location, Authentication, Occurrences) {
		$scope.authentication = Authentication;

		// Create new Occurrence
		$scope.create = function() {
			// Create new Occurrence object
			var occurrence = new Occurrences ({
				name: this.name
			});

			// Redirect after save
			occurrence.$save(function(response) {
				$location.path('occurrences/' + response._id);

				// Clear form fields
				$scope.name = '';
			}, function(errorResponse) {
				$scope.error = errorResponse.data.message;
			});
		};

		// Remove existing Occurrence
		$scope.remove = function(occurrence) {
			if ( occurrence ) { 
				occurrence.$remove();

				for (var i in $scope.occurrences) {
					if ($scope.occurrences [i] === occurrence) {
						$scope.occurrences.splice(i, 1);
					}
				}
			} else {
				$scope.occurrence.$remove(function() {
					$location.path('occurrences');
				});
			}
		};

		// Update existing Occurrence
		$scope.update = function() {
			var occurrence = $scope.occurrence;

			occurrence.$update(function() {
				$location.path('occurrences/' + occurrence._id);
			}, function(errorResponse) {
				$scope.error = errorResponse.data.message;
			});
		};

		// Find a list of Occurrences
		$scope.find = function() {
			$scope.occurrences = Occurrences.query();
		};

		// Find existing Occurrence
		$scope.findOne = function() {
			$scope.occurrence = Occurrences.get({ 
				occurrenceId: $stateParams.occurrenceId
			});
		};
	}
]);