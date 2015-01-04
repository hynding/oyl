'use strict';

// Configuring the Articles module
angular.module('todos').run(['Menus',
	function(Menus) {
		// Set top bar menu items
		Menus.addMenuItem('topbar', 'Todos', 'todos', 'dropdown', '/todos(/create)?');
		Menus.addSubMenuItem('topbar', 'todos', 'List Todos', 'todos');
		Menus.addSubMenuItem('topbar', 'todos', 'New Todo', 'todos/create');
	}
]);