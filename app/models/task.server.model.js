'use strict';

/**
 * Module dependencies.
 */
var mongoose = require('mongoose'),
	Schema = mongoose.Schema;

/**
 * Task Schema
 */
var TaskSchema = new Schema({
    actions: [{
        type: Schema.Types.ObjectId,
        ref: 'Action',
        required: true
    }],
	name: {
		type: String,
		default: '',
		trim: true
	},
    frequency: {
        type: String,
        default: 'daily'
    },
    index: {
        type: Number,
        default: 1
    },
    active: {
        type: Boolean,
        default: true
    },
    starts: {
        type: Date,
        default: Date.now
    },
    ends: {
        type: Date
    },
    ignoreDate: {
        type: Boolean,
        default: false
    },
    ignoreTime: {
        type: Boolean,
        default: false
    },
	created: {
		type: Date,
		default: Date.now
	},
	user: {
		type: Schema.ObjectId,
		ref: 'User'
	}
});

TaskSchema.path('actions').validate(function(value){ return value.length; }, 'You must have at least one action assigned to a task');

mongoose.model('Task', TaskSchema);