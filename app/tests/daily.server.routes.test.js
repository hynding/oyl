'use strict';

var should = require('should'),
	request = require('supertest'),
	app = require('../../server'),
	mongoose = require('mongoose'),
	User = mongoose.model('User'),
	Daily = mongoose.model('Daily'),
	agent = request.agent(app);

/**
 * Globals
 */
var credentials, user, daily;

/**
 * Daily routes tests
 */
describe('Daily CRUD tests', function() {
	beforeEach(function(done) {
		// Create user credentials
		credentials = {
			username: 'username',
			password: 'password'
		};

		// Create a new user
		user = new User({
			firstName: 'Full',
			lastName: 'Name',
			displayName: 'Full Name',
			email: 'test@test.com',
			username: credentials.username,
			password: credentials.password,
			provider: 'local'
		});

		// Save a user to the test db and create new Daily
		user.save(function() {
			daily = {
				name: 'Daily Name'
			};

			done();
		});
	});

	it('should be able to save Daily instance if logged in', function(done) {
		agent.post('/auth/signin')
			.send(credentials)
			.expect(200)
			.end(function(signinErr, signinRes) {
				// Handle signin error
				if (signinErr) done(signinErr);

				// Get the userId
				var userId = user.id;

				// Save a new Daily
				agent.post('/dailies')
					.send(daily)
					.expect(200)
					.end(function(dailySaveErr, dailySaveRes) {
						// Handle Daily save error
						if (dailySaveErr) done(dailySaveErr);

						// Get a list of Dailies
						agent.get('/dailies')
							.end(function(dailiesGetErr, dailiesGetRes) {
								// Handle Daily save error
								if (dailiesGetErr) done(dailiesGetErr);

								// Get Dailies list
								var dailies = dailiesGetRes.body;

								// Set assertions
								(dailies[0].user._id).should.equal(userId);
								(dailies[0].name).should.match('Daily Name');

								// Call the assertion callback
								done();
							});
					});
			});
	});

	it('should not be able to save Daily instance if not logged in', function(done) {
		agent.post('/dailies')
			.send(daily)
			.expect(401)
			.end(function(dailySaveErr, dailySaveRes) {
				// Call the assertion callback
				done(dailySaveErr);
			});
	});

	it('should not be able to save Daily instance if no name is provided', function(done) {
		// Invalidate name field
		daily.name = '';

		agent.post('/auth/signin')
			.send(credentials)
			.expect(200)
			.end(function(signinErr, signinRes) {
				// Handle signin error
				if (signinErr) done(signinErr);

				// Get the userId
				var userId = user.id;

				// Save a new Daily
				agent.post('/dailies')
					.send(daily)
					.expect(400)
					.end(function(dailySaveErr, dailySaveRes) {
						// Set message assertion
						(dailySaveRes.body.message).should.match('Please fill Daily name');
						
						// Handle Daily save error
						done(dailySaveErr);
					});
			});
	});

	it('should be able to update Daily instance if signed in', function(done) {
		agent.post('/auth/signin')
			.send(credentials)
			.expect(200)
			.end(function(signinErr, signinRes) {
				// Handle signin error
				if (signinErr) done(signinErr);

				// Get the userId
				var userId = user.id;

				// Save a new Daily
				agent.post('/dailies')
					.send(daily)
					.expect(200)
					.end(function(dailySaveErr, dailySaveRes) {
						// Handle Daily save error
						if (dailySaveErr) done(dailySaveErr);

						// Update Daily name
						daily.name = 'WHY YOU GOTTA BE SO MEAN?';

						// Update existing Daily
						agent.put('/dailies/' + dailySaveRes.body._id)
							.send(daily)
							.expect(200)
							.end(function(dailyUpdateErr, dailyUpdateRes) {
								// Handle Daily update error
								if (dailyUpdateErr) done(dailyUpdateErr);

								// Set assertions
								(dailyUpdateRes.body._id).should.equal(dailySaveRes.body._id);
								(dailyUpdateRes.body.name).should.match('WHY YOU GOTTA BE SO MEAN?');

								// Call the assertion callback
								done();
							});
					});
			});
	});

	it('should be able to get a list of Dailies if not signed in', function(done) {
		// Create new Daily model instance
		var dailyObj = new Daily(daily);

		// Save the Daily
		dailyObj.save(function() {
			// Request Dailies
			request(app).get('/dailies')
				.end(function(req, res) {
					// Set assertion
					res.body.should.be.an.Array.with.lengthOf(1);

					// Call the assertion callback
					done();
				});

		});
	});


	it('should be able to get a single Daily if not signed in', function(done) {
		// Create new Daily model instance
		var dailyObj = new Daily(daily);

		// Save the Daily
		dailyObj.save(function() {
			request(app).get('/dailies/' + dailyObj._id)
				.end(function(req, res) {
					// Set assertion
					res.body.should.be.an.Object.with.property('name', daily.name);

					// Call the assertion callback
					done();
				});
		});
	});

	it('should be able to delete Daily instance if signed in', function(done) {
		agent.post('/auth/signin')
			.send(credentials)
			.expect(200)
			.end(function(signinErr, signinRes) {
				// Handle signin error
				if (signinErr) done(signinErr);

				// Get the userId
				var userId = user.id;

				// Save a new Daily
				agent.post('/dailies')
					.send(daily)
					.expect(200)
					.end(function(dailySaveErr, dailySaveRes) {
						// Handle Daily save error
						if (dailySaveErr) done(dailySaveErr);

						// Delete existing Daily
						agent.delete('/dailies/' + dailySaveRes.body._id)
							.send(daily)
							.expect(200)
							.end(function(dailyDeleteErr, dailyDeleteRes) {
								// Handle Daily error error
								if (dailyDeleteErr) done(dailyDeleteErr);

								// Set assertions
								(dailyDeleteRes.body._id).should.equal(dailySaveRes.body._id);

								// Call the assertion callback
								done();
							});
					});
			});
	});

	it('should not be able to delete Daily instance if not signed in', function(done) {
		// Set Daily user 
		daily.user = user;

		// Create new Daily model instance
		var dailyObj = new Daily(daily);

		// Save the Daily
		dailyObj.save(function() {
			// Try deleting Daily
			request(app).delete('/dailies/' + dailyObj._id)
			.expect(401)
			.end(function(dailyDeleteErr, dailyDeleteRes) {
				// Set message assertion
				(dailyDeleteRes.body.message).should.match('User is not logged in');

				// Handle Daily error error
				done(dailyDeleteErr);
			});

		});
	});

	afterEach(function(done) {
		User.remove().exec();
		Daily.remove().exec();
		done();
	});
});