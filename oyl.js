// oyl.js


module.exports = {
	version : "0.1",
	up : function( event ){
		console.log("event: ", event);
		console.log("load client data");
		console.log("load user data");
		console.log("load analytic data");
	},
	schema : {
		"user" : {
			data : {
				name : String,
				handle : String,
				password : String
			}
		},
		"occurance" : {
			id: "o7e",
			description : "Model for something that happens",
			data : {
				repeats : "object"
			}
		},
		"daily" : {
			id : "d3y",
			description : "Model for daily o7es",
			data : {
				date : Date,
				occurance : "o7e",
				user : "user",
				status : Number
			}
		}
	}
};