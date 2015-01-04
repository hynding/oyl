'use strict';

var should = require('should'),
	request = require('supertest'),
	app = require('../../server'),
	mongoose = require('mongoose'),
	User = mongoose.model('User'),
	Todo = mongoose.model('Todo'),
	agent = request.agent(app);

/**
 * Globals
 */
var credentials, user, todo;

/**
 * Todo routes tests
 */
describe('Todo CRUD tests', function() {
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

		// Save a user to the test db and create new Todo
		user.save(function() {
			todo = {
				name: 'Todo Name'
			};

			done();
		});
	});

	it('should be able to save Todo instance if logged in', function(done) {
		agent.post('/auth/signin')
			.send(credentials)
			.expect(200)
			.end(function(signinErr, signinRes) {
				// Handle signin error
				if (signinErr) done(signinErr);

				// Get the userId
				var userId = user.id;

				// Save a new Todo
				agent.post('/todos')
					.send(todo)
					.expect(200)
					.end(function(todoSaveErr, todoSaveRes) {
						// Handle Todo save error
						if (todoSaveErr) done(todoSaveErr);

						// Get a list of Todos
						agent.get('/todos')
							.end(function(todosGetErr, todosGetRes) {
								// Handle Todo save error
								if (todosGetErr) done(todosGetErr);

								// Get Todos list
								var todos = todosGetRes.body;

								// Set assertions
								(todos[0].user._id).should.equal(userId);
								(todos[0].name).should.match('Todo Name');

								// Call the assertion callback
								done();
							});
					});
			});
	});

	it('should not be able to save Todo instance if not logged in', function(done) {
		agent.post('/todos')
			.send(todo)
			.expect(401)
			.end(function(todoSaveErr, todoSaveRes) {
				// Call the assertion callback
				done(todoSaveErr);
			});
	});

	it('should not be able to save Todo instance if no name is provided', function(done) {
		// Invalidate name field
		todo.name = '';

		agent.post('/auth/signin')
			.send(credentials)
			.expect(200)
			.end(function(signinErr, signinRes) {
				// Handle signin error
				if (signinErr) done(signinErr);

				// Get the userId
				var userId = user.id;

				// Save a new Todo
				agent.post('/todos')
					.send(todo)
					.expect(400)
					.end(function(todoSaveErr, todoSaveRes) {
						// Set message assertion
						(todoSaveRes.body.message).should.match('Please fill Todo name');
						
						// Handle Todo save error
						done(todoSaveErr);
					});
			});
	});

	it('should be able to update Todo instance if signed in', function(done) {
		agent.post('/auth/signin')
			.send(credentials)
			.expect(200)
			.end(function(signinErr, signinRes) {
				// Handle signin error
				if (signinErr) done(signinErr);

				// Get the userId
				var userId = user.id;

				// Save a new Todo
				agent.post('/todos')
					.send(todo)
					.expect(200)
					.end(function(todoSaveErr, todoSaveRes) {
						// Handle Todo save error
						if (todoSaveErr) done(todoSaveErr);

						// Update Todo name
						todo.name = 'WHY YOU GOTTA BE SO MEAN?';

						// Update existing Todo
						agent.put('/todos/' + todoSaveRes.body._id)
							.send(todo)
							.expect(200)
							.end(function(todoUpdateErr, todoUpdateRes) {
								// Handle Todo update error
								if (todoUpdateErr) done(todoUpdateErr);

								// Set assertions
								(todoUpdateRes.body._id).should.equal(todoSaveRes.body._id);
								(todoUpdateRes.body.name).should.match('WHY YOU GOTTA BE SO MEAN?');

								// Call the assertion callback
								done();
							});
					});
			});
	});

	it('should be able to get a list of Todos if not signed in', function(done) {
		// Create new Todo model instance
		var todoObj = new Todo(todo);

		// Save the Todo
		todoObj.save(function() {
			// Request Todos
			request(app).get('/todos')
				.end(function(req, res) {
					// Set assertion
					res.body.should.be.an.Array.with.lengthOf(1);

					// Call the assertion callback
					done();
				});

		});
	});


	it('should be able to get a single Todo if not signed in', function(done) {
		// Create new Todo model instance
		var todoObj = new Todo(todo);

		// Save the Todo
		todoObj.save(function() {
			request(app).get('/todos/' + todoObj._id)
				.end(function(req, res) {
					// Set assertion
					res.body.should.be.an.Object.with.property('name', todo.name);

					// Call the assertion callback
					done();
				});
		});
	});

	it('should be able to delete Todo instance if signed in', function(done) {
		agent.post('/auth/signin')
			.send(credentials)
			.expect(200)
			.end(function(signinErr, signinRes) {
				// Handle signin error
				if (signinErr) done(signinErr);

				// Get the userId
				var userId = user.id;

				// Save a new Todo
				agent.post('/todos')
					.send(todo)
					.expect(200)
					.end(function(todoSaveErr, todoSaveRes) {
						// Handle Todo save error
						if (todoSaveErr) done(todoSaveErr);

						// Delete existing Todo
						agent.delete('/todos/' + todoSaveRes.body._id)
							.send(todo)
							.expect(200)
							.end(function(todoDeleteErr, todoDeleteRes) {
								// Handle Todo error error
								if (todoDeleteErr) done(todoDeleteErr);

								// Set assertions
								(todoDeleteRes.body._id).should.equal(todoSaveRes.body._id);

								// Call the assertion callback
								done();
							});
					});
			});
	});

	it('should not be able to delete Todo instance if not signed in', function(done) {
		// Set Todo user 
		todo.user = user;

		// Create new Todo model instance
		var todoObj = new Todo(todo);

		// Save the Todo
		todoObj.save(function() {
			// Try deleting Todo
			request(app).delete('/todos/' + todoObj._id)
			.expect(401)
			.end(function(todoDeleteErr, todoDeleteRes) {
				// Set message assertion
				(todoDeleteRes.body.message).should.match('User is not logged in');

				// Handle Todo error error
				done(todoDeleteErr);
			});

		});
	});

	afterEach(function(done) {
		User.remove().exec();
		Todo.remove().exec();
		done();
	});
});