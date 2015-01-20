'use strict';

module.exports = function(app) {
	var users = require('../../app/controllers/users.server.controller');
	var occurrences = require('../../app/controllers/occurrences.server.controller');

	// Occurrences Routes
	app.route('/occurrences')
		.get(occurrences.list)
		.post(users.requiresLogin, occurrences.create);

	app.route('/occurrences/:occurrenceId')
		.get(occurrences.read)
		.put(users.requiresLogin, occurrences.hasAuthorization, occurrences.update)
		.delete(users.requiresLogin, occurrences.hasAuthorization, occurrences.delete);

	// Finish by binding the Occurrence middleware
	app.param('occurrenceId', occurrences.occurrenceByID);
};
