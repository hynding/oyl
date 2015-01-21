'use strict';

//Setting up route
angular.module('occurrences').config(['$stateProvider',
	function($stateProvider) {
		// Occurrences state routing
		$stateProvider.
		state('listOccurrences', {
			url: '/occurrences',
			templateUrl: 'modules/occurrences/views/list-occurrences.client.view.html'
		}).
		state('createOccurrence', {
			url: '/occurrences/create',
			templateUrl: 'modules/occurrences/views/create-occurrence.client.view.html'
		}).
		state('viewOccurrence', {
			url: '/occurrences/:occurrenceId',
			templateUrl: 'modules/occurrences/views/view-occurrence.client.view.html'
		}).
		state('editOccurrence', {
			url: '/occurrences/:occurrenceId/edit',
			templateUrl: 'modules/occurrences/views/edit-occurrence.client.view.html'
		});
	}
]);