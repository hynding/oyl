'use strict';

module.exports = function(app) {
	var users = require('../../app/controllers/users.server.controller');
	var actions = require('../../app/controllers/actions.server.controller');

	// Actions Routes
	app.route('/actions')
		.get(actions.list)
		.post(users.requiresLogin, actions.create);

	app.route('/actions/:actionId')
		.get(actions.read)
		.put(users.requiresLogin, actions.hasAuthorization, actions.update)
		.delete(users.requiresLogin, actions.hasAuthorization, actions.delete);

	// Finish by binding the Action middleware
	app.param('actionId', actions.actionByID);
};
