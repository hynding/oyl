'use strict';

/**
 * Module dependencies.
 */
var mongoose = require('mongoose'),
	Schema = mongoose.Schema;

/**
 * Action Schema
 */
var ActionSchema = new Schema({
	name: {
		type: String,
		default: '',
		required: 'Please fill Action name',
		trim: true
	},
    parent: {
        type: Schema.ObjectId,
        ref: 'Action'
    },
    description: {
        type: String
    },
    tags: [{
        type: String
    }],
    // Figure out something better, more abstract, for urls
    url: {
        type: String
    },
    created: {
        type: Date,
        default: Date.now
    },
	user: {
		type: Schema.ObjectId,
		ref: 'User'
	},
    // default value
    taskDefault: {
        recurrence: {
            type: String,
            default: 'daily'
        },
        active: {
            type: Boolean,
            default: true
        }
    }
});

mongoose.model('Action', ActionSchema);