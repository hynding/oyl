'use strict';

/**
 * Module dependencies.
 */
var mongoose = require('mongoose'),
	Schema = mongoose.Schema;

/**
 * Occurrence Schema
 */
var OccurrenceSchema = new Schema({
    task: {
        type: Schema.ObjectId,
        ref: 'Task',
        required: 'A task is required for marking an event'
    },
    value: {
        type: String
    },
    notes: {
        type: String
    },
    status: {
        type: String,
        enum: ['Incomplete', 'Completed', 'In Progress', 'Waiting', 'Ignored', 'Incomplete', 'N/A'],
        default: 'Incomplete'
    },
    completed: {
        type: Date
    },
    modified: {
        type: Date,
        default: Date.now
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

mongoose.model('Occurrence', OccurrenceSchema);