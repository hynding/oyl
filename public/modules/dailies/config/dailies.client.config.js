'use strict';

// Configuring the Articles module
angular.module('dailies').run(['Menus',
	function(Menus) {
		// Set top bar menu items
		Menus.addMenuItem('topbar', 'Dailies', 'dailies', 'dropdown', '/dailies(/create)?');
		Menus.addSubMenuItem('topbar', 'dailies', 'List Dailies', 'dailies');
		Menus.addSubMenuItem('topbar', 'dailies', 'New Daily', 'dailies/create');
	}
]);