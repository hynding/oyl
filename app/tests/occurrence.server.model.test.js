'use strict';

/**
 * Module dependencies.
 */
var should = require('should'),
	mongoose = require('mongoose'),
	User = mongoose.model('User'),
    Action = mongoose.model('Action'),
    Task = mongoose.model('Task'),
	Occurrence = mongoose.model('Occurrence');

/**
 * Globals
 */
var user, action, task, occurrence;

/**
 * Unit tests
 */
describe('Occurrence Model Unit Tests:', function() {
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
                    actions: [action]
                });

                task.save(function() {
                    occurrence = new Occurrence({
                        task: task,
                        user: user
                    });
                    done();
                });
            });
		});
	});

	describe('Method Save', function() {
		it('should be able to save without problems', function(done) {
			return occurrence.save(function(err) {
                console.log(err);
				should.not.exist(err);
				done();
			});
		});

		it('should be able to show an error when try to save without a task assigned', function(done) {
			occurrence.task = '';

			return occurrence.save(function(err) {
				should.exist(err);
				done();
			});
		});
	});

	afterEach(function(done) { 
		Occurrence.remove().exec();
        Task.remove().exec();
        Action.remove().exec();
		User.remove().exec();

		done();
	});
});