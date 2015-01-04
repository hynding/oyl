'use strict';

/**
 * Module dependencies.
 */
var mongoose = require('mongoose'),
	errorHandler = require('./errors.server.controller'),
	Todo = mongoose.model('Todo'),
	_ = require('lodash');

/**
 * Create a Todo
 */
exports.create = function(req, res) {
	var todo = new Todo(req.body);
	todo.user = req.user;

	todo.save(function(err) {
		if (err) {
			return res.status(400).send({
				message: errorHandler.getErrorMessage(err)
			});
		} else {
			res.jsonp(todo);
		}
	});
};

/**
 * Show the current Todo
 */
exports.read = function(req, res) {
	res.jsonp(req.todo);
};

/**
 * Update a Todo
 */
exports.update = function(req, res) {
	var todo = req.todo ;

	todo = _.extend(todo , req.body);

	todo.save(function(err) {
		if (err) {
			return res.status(400).send({
				message: errorHandler.getErrorMessage(err)
			});
		} else {
			res.jsonp(todo);
		}
	});
};

/**
 * Delete an Todo
 */
exports.delete = function(req, res) {
	var todo = req.todo ;

	todo.remove(function(err) {
		if (err) {
			return res.status(400).send({
				message: errorHandler.getErrorMessage(err)
			});
		} else {
			res.jsonp(todo);
		}
	});
};

/**
 * List of Todos
 */
exports.list = function(req, res) { 
	Todo.find().sort('-created').populate('user', 'displayName').exec(function(err, todos) {
		if (err) {
			return res.status(400).send({
				message: errorHandler.getErrorMessage(err)
			});
		} else {
			res.jsonp(todos);
		}
	});
};

/**
 * Todo middleware
 */
exports.todoByID = function(req, res, next, id) { 
	Todo.findById(id).populate('user', 'displayName').exec(function(err, todo) {
		if (err) return next(err);
		if (! todo) return next(new Error('Failed to load Todo ' + id));
		req.todo = todo ;
		next();
	});
};

/**
 * Todo authorization middleware
 */
exports.hasAuthorization = function(req, res, next) {
	if (req.todo.user.id !== req.user.id) {
		return res.status(403).send('User is not authorized');
	}
	next();
};
