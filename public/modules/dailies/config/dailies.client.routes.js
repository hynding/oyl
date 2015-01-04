'use strict';

//Setting up route
angular.module('dailies').config(['$stateProvider',
	function($stateProvider) {
		// Dailies state routing
		$stateProvider.
		state('listDailies', {
			url: '/dailies',
			templateUrl: 'modules/dailies/views/list-dailies.client.view.html'
		}).
		state('createDaily', {
			url: '/dailies/create',
			templateUrl: 'modules/dailies/views/create-daily.client.view.html'
		}).
		state('viewDaily', {
			url: '/dailies/:dailyId',
			templateUrl: 'modules/dailies/views/view-daily.client.view.html'
		}).
		state('editDaily', {
			url: '/dailies/:dailyId/edit',
			templateUrl: 'modules/dailies/views/edit-daily.client.view.html'
		});
	}
]);