'use strict';

/**
 * Module dependencies.
 */
var mongoose = require('mongoose'),
	Schema = mongoose.Schema;

/**
 * Daily Schema
 */
var DailySchema = new Schema({
	day: {
		type: Date,
		default: Date.now,
		required: 'Choose which day you are tracking',
		trim: true
	},
    todos:[{
        type: Schema.ObjectId,
        ref: 'Todo'
    }],
	created: {
		type: Date,
		default: Date.now
	},
	user: {
		type: Schema.ObjectId,
		ref: 'User'
	}
});

mongoose.model('Daily', DailySchema);