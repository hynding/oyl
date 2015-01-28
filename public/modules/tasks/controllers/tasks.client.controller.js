'use strict';

// Tasks controller
angular.module('tasks').controller('TasksController', ['$scope', '$http', '$stateParams', '$location', 'Authentication', 'Tasks', 'Actions',
	function($scope, $http, $stateParams, $location, Authentication, Tasks, Actions) {
		$scope.authentication = Authentication;

        $scope.action = '';
        $scope.promise = null;
        $scope.actions = [];
        $scope.actionResults = [];

        $scope.searchActions = function(event) {
            var query = this.action + String.fromCharCode(event.which);

            if (query.length < 3) {
                console.log('action must be 3 or more chars');
                return false;
            }

            if (event.which === 13) { //enter
                var newAction = new Actions({
                    name: this.action
                });
                $scope.actions.push(newAction);
                $scope.action = '';
                event.preventDefault();
                event.stopPropagation();
            }
            else {
                $http.get('/actions/search/'+query)
                    .success(function(data, status, headers, config) {
                        $scope.actionResults = data;
                    })
                    .error(function(data, status, headers, config) {
                        console.log('err: ', data);
                    });
            }
            return false;
        };

        $scope.actionUp = function() {
            if ( this.$first ) {
                return;
            }
            $scope.actions.splice(this.$index-1, 2, $scope.actions[this.$index], $scope.actions[this.$index-1]);
        };

        $scope.actionDown = function() {
            if ( this.$last ) {
                return;
            }
            $scope.actions.splice(this.$index, 2, $scope.actions[this.$index+1], $scope.actions[this.$index]);
        };

        $scope.actionOut = function() {
            $scope.actions.splice(this.$index, 1);
        };

		// Create new Task
		$scope.create = function() {
			// Create new Task object
			var task = new Tasks ({
				actions: this.actions
			});
            console.log(this.actions);

			// Redirect after save
			task.$save(function(response) {
				$location.path('tasks/' + response._id);

				// Clear form fields
				$scope.actions = '';
			}, function(errorResponse) {
				$scope.error = errorResponse.data.message;
			});
		};

		// Remove existing Task
		$scope.remove = function(task) {
			if ( task ) { 
				task.$remove();

				for (var i in $scope.tasks) {
					if ($scope.tasks [i] === task) {
						$scope.tasks.splice(i, 1);
					}
				}
			} else {
				$scope.task.$remove(function() {
					$location.path('tasks');
				});
			}
		};

		// Update existing Task
		$scope.update = function() {
			var task = $scope.task;

			task.$update(function() {
				$location.path('tasks/' + task._id);
			}, function(errorResponse) {
				$scope.error = errorResponse.data.message;
			});
		};

        // Find a list of Tasks
        $scope.find = function() {
            $scope.tasks = Tasks.query();
        };

		// Find existing Task
		$scope.findOne = function() {
			$scope.task = Tasks.get({ 
				taskId: $stateParams.taskId
			});
		};
	}
]);