'use strict';

/**
 * Module dependencies.
 */
var should = require('should'),
	mongoose = require('mongoose'),
	User = mongoose.model('User'),
    Action = mongoose.model('Action'),
	Task = mongoose.model('Task');

/**
 * Globals
 */
var user, action, task;

/**
 * Unit tests
 */
describe('Task Model Unit Tests:', function() {
	beforeEach(function(done) {
		user = new User({
			firstName: 'Full',
			lastName: 'Name',
			displayName: 'Full Name',
			email: 'test@test.com',
			username: 'username',
			password: 'password'
		});
        user.save(function() {
            action = new Action({
                name: 'Test action'
            });

            action.save(function() {
                task = new Task({
                    actions: [action],
                    user: user
                });
                done();
            });
        });
	});

	describe('Method Save', function() {
		it('should be able to save without problems', function(done) {
			return task.save(function(err) {
				should.not.exist(err);
				done();
			});
		});

		it('should be able to show an error when try to save without specifying an action', function(done) {
			task.actions = [];

			return task.save(function(err) {
				should.exist(err);
				done();
			});
		});
	});

	afterEach(function(done) {
		Task.remove().exec();
        Action.remove().exec();
		User.remove().exec();

		done();
	});
});