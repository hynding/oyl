'use strict';

/**
 * Module dependencies.
 */
var mongoose = require('mongoose'),
	errorHandler = require('./errors.server.controller'),
	Daily = mongoose.model('Daily'),
	_ = require('lodash');

/**
 * Create a Daily
 */
exports.create = function(req, res) {
	var daily = new Daily(req.body);
	daily.user = req.user;

	daily.save(function(err) {
		if (err) {
			return res.status(400).send({
				message: errorHandler.getErrorMessage(err)
			});
		} else {
			res.jsonp(daily);
		}
	});
};

/**
 * Show the current Daily
 */
exports.read = function(req, res) {
	res.jsonp(req.daily);
};

/**
 * Update a Daily
 */
exports.update = function(req, res) {
	var daily = req.daily ;

	daily = _.extend(daily , req.body);

	daily.save(function(err) {
		if (err) {
			return res.status(400).send({
				message: errorHandler.getErrorMessage(err)
			});
		} else {
			res.jsonp(daily);
		}
	});
};

/**
 * Delete an Daily
 */
exports.delete = function(req, res) {
	var daily = req.daily ;

	daily.remove(function(err) {
		if (err) {
			return res.status(400).send({
				message: errorHandler.getErrorMessage(err)
			});
		} else {
			res.jsonp(daily);
		}
	});
};

/**
 * List of Dailies
 */
exports.list = function(req, res) { 
	Daily.find().sort('-created').populate('user', 'displayName').exec(function(err, dailies) {
		if (err) {
			return res.status(400).send({
				message: errorHandler.getErrorMessage(err)
			});
		} else {
			res.jsonp(dailies);
		}
	});
};

/**
 * Daily middleware
 */
exports.dailyByID = function(req, res, next, id) { 
	Daily.findById(id).populate('user', 'displayName').exec(function(err, daily) {
		if (err) return next(err);
		if (! daily) return next(new Error('Failed to load Daily ' + id));
		req.daily = daily ;
		next();
	});
};

/**
 * Daily authorization middleware
 */
exports.hasAuthorization = function(req, res, next) {
	if (req.daily.user.id !== req.user.id) {
		return res.status(403).send('User is not authorized');
	}
	next();
};
