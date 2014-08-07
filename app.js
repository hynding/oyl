var restify = require("restify");
	mongoose = require("mongoose"),
	oyl = require("./oyl.js"),
	db = mongoose.connection;

db.on( "error", console.error.bind(console, "con err"));
db.once( "open", oyl.up );

mongoose.connect("mongodb://localhost/oyl");