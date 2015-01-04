'use strict';

(function() {
	// Dailies Controller Spec
	describe('Dailies Controller Tests', function() {
		// Initialize global variables
		var DailiesController,
		scope,
		$httpBackend,
		$stateParams,
		$location;

		// The $resource service augments the response object with methods for updating and deleting the resource.
		// If we were to use the standard toEqual matcher, our tests would fail because the test values would not match
		// the responses exactly. To solve the problem, we define a new toEqualData Jasmine matcher.
		// When the toEqualData matcher compares two objects, it takes only object properties into
		// account and ignores methods.
		beforeEach(function() {
			jasmine.addMatchers({
				toEqualData: function(util, customEqualityTesters) {
					return {
						compare: function(actual, expected) {
							return {
								pass: angular.equals(actual, expected)
							};
						}
					};
				}
			});
		});

		// Then we can start by loading the main application module
		beforeEach(module(ApplicationConfiguration.applicationModuleName));

		// The injector ignores leading and trailing underscores here (i.e. _$httpBackend_).
		// This allows us to inject a service but then attach it to a variable
		// with the same name as the service.
		beforeEach(inject(function($controller, $rootScope, _$location_, _$stateParams_, _$httpBackend_) {
			// Set a new global scope
			scope = $rootScope.$new();

			// Point global variables to injected services
			$stateParams = _$stateParams_;
			$httpBackend = _$httpBackend_;
			$location = _$location_;

			// Initialize the Dailies controller.
			DailiesController = $controller('DailiesController', {
				$scope: scope
			});
		}));

		it('$scope.find() should create an array with at least one Daily object fetched from XHR', inject(function(Dailies) {
			// Create sample Daily using the Dailies service
			var sampleDaily = new Dailies({
				name: 'New Daily'
			});

			// Create a sample Dailies array that includes the new Daily
			var sampleDailies = [sampleDaily];

			// Set GET response
			$httpBackend.expectGET('dailies').respond(sampleDailies);

			// Run controller functionality
			scope.find();
			$httpBackend.flush();

			// Test scope value
			expect(scope.dailies).toEqualData(sampleDailies);
		}));

		it('$scope.findOne() should create an array with one Daily object fetched from XHR using a dailyId URL parameter', inject(function(Dailies) {
			// Define a sample Daily object
			var sampleDaily = new Dailies({
				name: 'New Daily'
			});

			// Set the URL parameter
			$stateParams.dailyId = '525a8422f6d0f87f0e407a33';

			// Set GET response
			$httpBackend.expectGET(/dailies\/([0-9a-fA-F]{24})$/).respond(sampleDaily);

			// Run controller functionality
			scope.findOne();
			$httpBackend.flush();

			// Test scope value
			expect(scope.daily).toEqualData(sampleDaily);
		}));

		it('$scope.create() with valid form data should send a POST request with the form input values and then locate to new object URL', inject(function(Dailies) {
			// Create a sample Daily object
			var sampleDailyPostData = new Dailies({
				name: 'New Daily'
			});

			// Create a sample Daily response
			var sampleDailyResponse = new Dailies({
				_id: '525cf20451979dea2c000001',
				name: 'New Daily'
			});

			// Fixture mock form input values
			scope.name = 'New Daily';

			// Set POST response
			$httpBackend.expectPOST('dailies', sampleDailyPostData).respond(sampleDailyResponse);

			// Run controller functionality
			scope.create();
			$httpBackend.flush();

			// Test form inputs are reset
			expect(scope.name).toEqual('');

			// Test URL redirection after the Daily was created
			expect($location.path()).toBe('/dailies/' + sampleDailyResponse._id);
		}));

		it('$scope.update() should update a valid Daily', inject(function(Dailies) {
			// Define a sample Daily put data
			var sampleDailyPutData = new Dailies({
				_id: '525cf20451979dea2c000001',
				name: 'New Daily'
			});

			// Mock Daily in scope
			scope.daily = sampleDailyPutData;

			// Set PUT response
			$httpBackend.expectPUT(/dailies\/([0-9a-fA-F]{24})$/).respond();

			// Run controller functionality
			scope.update();
			$httpBackend.flush();

			// Test URL location to new object
			expect($location.path()).toBe('/dailies/' + sampleDailyPutData._id);
		}));

		it('$scope.remove() should send a DELETE request with a valid dailyId and remove the Daily from the scope', inject(function(Dailies) {
			// Create new Daily object
			var sampleDaily = new Dailies({
				_id: '525a8422f6d0f87f0e407a33'
			});

			// Create new Dailies array and include the Daily
			scope.dailies = [sampleDaily];

			// Set expected DELETE response
			$httpBackend.expectDELETE(/dailies\/([0-9a-fA-F]{24})$/).respond(204);

			// Run controller functionality
			scope.remove(sampleDaily);
			$httpBackend.flush();

			// Test array after successful delete
			expect(scope.dailies.length).toBe(0);
		}));
	});
}());