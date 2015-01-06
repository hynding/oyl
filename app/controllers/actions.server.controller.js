'use strict';

/**
 * Module dependencies.
 */
var mongoose = require('mongoose'),
	errorHandler = require('./errors.server.controller'),
	Action = mongoose.model('Action'),
	_ = require('lodash');

/**
 * Create a Action
 */
exports.create = function(req, res) {
	var action = new Action(req.body);
	action.user = req.user;

	action.save(function(err) {
		if (err) {
			return res.status(400).send({
				message: errorHandler.getErrorMessage(err)
			});
		} else {
			res.jsonp(action);
		}
	});
};

/**
 * Show the current Action
 */
exports.read = function(req, res) {
	res.jsonp(req.action);
};

/**
 * Update a Action
 */
exports.update = function(req, res) {
	var action = req.action ;

	action = _.extend(action , req.body);

	action.save(function(err) {
		if (err) {
			return res.status(400).send({
				message: errorHandler.getErrorMessage(err)
			});
		} else {
			res.jsonp(action);
		}
	});
};

/**
 * Delete an Action
 */
exports.delete = function(req, res) {
	var action = req.action ;

	action.remove(function(err) {
		if (err) {
			return res.status(400).send({
				message: errorHandler.getErrorMessage(err)
			});
		} else {
			res.jsonp(action);
		}
	});
};

/**
 * List of Actions
 */
exports.list = function(req, res) { 
	Action.find().sort('-created').populate('user', 'displayName').exec(function(err, actions) {
		if (err) {
			return res.status(400).send({
				message: errorHandler.getErrorMessage(err)
			});
		} else {
			res.jsonp(actions);
		}
	});
};

/**
 * Action middleware
 */
exports.actionByID = function(req, res, next, id) { 
	Action.findById(id).populate('user', 'displayName').exec(function(err, action) {
		if (err) return next(err);
		if (! action) return next(new Error('Failed to load Action ' + id));
		req.action = action ;
		next();
	});
};

/**
 * Action authorization middleware
 */
exports.hasAuthorization = function(req, res, next) {
	if (req.action.user.id !== req.user.id) {
		return res.status(403).send('User is not authorized');
	}
	next();
};
