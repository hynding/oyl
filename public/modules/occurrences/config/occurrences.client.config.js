'use strict';

// Configuring the Articles module
angular.module('occurrences').run(['Menus',
	function(Menus) {
		// Set top bar menu items
		Menus.addMenuItem('topbar', 'Occurrences', 'occurrences', 'dropdown', '/occurrences(/create)?');
		Menus.addSubMenuItem('topbar', 'occurrences', 'List Occurrences', 'occurrences');
		Menus.addSubMenuItem('topbar', 'occurrences', 'New Occurrence', 'occurrences/create');
	}
]);