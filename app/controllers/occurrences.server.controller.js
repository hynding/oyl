'use strict';

/**
 * Module dependencies.
 */
var mongoose = require('mongoose'),
	errorHandler = require('./errors.server.controller'),
	Occurrence = mongoose.model('Occurrence'),
	_ = require('lodash');

/**
 * Create a Occurrence
 */
exports.create = function(req, res) {
	var occurrence = new Occurrence(req.body);
	occurrence.user = req.user;

	occurrence.save(function(err) {
		if (err) {
			return res.status(400).send({
				message: errorHandler.getErrorMessage(err)
			});
		} else {
			res.jsonp(occurrence);
		}
	});
};

/**
 * Show the current Occurrence
 */
exports.read = function(req, res) {
	res.jsonp(req.occurrence);
};

/**
 * Update a Occurrence
 */
exports.update = function(req, res) {
	var occurrence = req.occurrence ;

	occurrence = _.extend(occurrence , req.body);

	occurrence.save(function(err) {
		if (err) {
			return res.status(400).send({
				message: errorHandler.getErrorMessage(err)
			});
		} else {
			res.jsonp(occurrence);
		}
	});
};

/**
 * Delete an Occurrence
 */
exports.delete = function(req, res) {
	var occurrence = req.occurrence ;

	occurrence.remove(function(err) {
		if (err) {
			return res.status(400).send({
				message: errorHandler.getErrorMessage(err)
			});
		} else {
			res.jsonp(occurrence);
		}
	});
};

/**
 * List of Occurrences
 */
exports.list = function(req, res) { 
	Occurrence.find().sort('-created').populate('user', 'displayName').exec(function(err, occurrences) {
		if (err) {
			return res.status(400).send({
				message: errorHandler.getErrorMessage(err)
			});
		} else {
			res.jsonp(occurrences);
		}
	});
};

/**
 * Occurrence middleware
 */
exports.occurrenceByID = function(req, res, next, id) { 
	Occurrence.findById(id).populate('user', 'displayName').exec(function(err, occurrence) {
		if (err) return next(err);
		if (! occurrence) return next(new Error('Failed to load Occurrence ' + id));
		req.occurrence = occurrence ;
		next();
	});
};

/**
 * Occurrence authorization middleware
 */
exports.hasAuthorization = function(req, res, next) {
	if (req.occurrence.user.id !== req.user.id) {
		return res.status(403).send('User is not authorized');
	}
	next();
};
