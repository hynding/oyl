'use strict';

/**
 * Module dependencies.
 */
var mongoose = require('mongoose'),
	Schema = mongoose.Schema;

/**
 * Todo Schema
 */
var TodoSchema = new Schema({
	name: {
		type: String,
		default: '',
		required: 'Please fill Todo name',
		trim: true
	},
    tasks: [{
        task: {
            type: Schema.ObjectId,
            ref: 'Task'
        },
        value: {
            type: String
        }
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

mongoose.model('Todo', TodoSchema);