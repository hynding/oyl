'use strict';

module.exports = function(app) {
	var users = require('../../app/controllers/users.server.controller');
	var dailies = require('../../app/controllers/dailies.server.controller');

	// Dailies Routes
	app.route('/dailies')
		.get(dailies.list)
		.post(users.requiresLogin, dailies.create);

	app.route('/dailies/:dailyId')
		.get(dailies.read)
		.put(users.requiresLogin, dailies.hasAuthorization, dailies.update)
		.delete(users.requiresLogin, dailies.hasAuthorization, dailies.delete);

	// Finish by binding the Daily middleware
	app.param('dailyId', dailies.dailyByID);
};
