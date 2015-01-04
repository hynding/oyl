'use strict';

module.exports = function(app) {
	var users = require('../../app/controllers/users.server.controller');
	var todos = require('../../app/controllers/todos.server.controller');

	// Todos Routes
	app.route('/todos')
		.get(todos.list)
		.post(users.requiresLogin, todos.create);

	app.route('/todos/:todoId')
		.get(todos.read)
		.put(users.requiresLogin, todos.hasAuthorization, todos.update)
		.delete(users.requiresLogin, todos.hasAuthorization, todos.delete);

	// Finish by binding the Todo middleware
	app.param('todoId', todos.todoByID);
};
