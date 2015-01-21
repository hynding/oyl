'use strict';

(function() {
	// Occurrences Controller Spec
	describe('Occurrences Controller Tests', function() {
		// Initialize global variables
		var OccurrencesController,
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

			// Initialize the Occurrences controller.
			OccurrencesController = $controller('OccurrencesController', {
				$scope: scope
			});
		}));

		it('$scope.find() should create an array with at least one Occurrence object fetched from XHR', inject(function(Occurrences) {
			// Create sample Occurrence using the Occurrences service
			var sampleOccurrence = new Occurrences({
				name: 'New Occurrence'
			});

			// Create a sample Occurrences array that includes the new Occurrence
			var sampleOccurrences = [sampleOccurrence];

			// Set GET response
			$httpBackend.expectGET('occurrences').respond(sampleOccurrences);

			// Run controller functionality
			scope.find();
			$httpBackend.flush();

			// Test scope value
			expect(scope.occurrences).toEqualData(sampleOccurrences);
		}));

		it('$scope.findOne() should create an array with one Occurrence object fetched from XHR using a occurrenceId URL parameter', inject(function(Occurrences) {
			// Define a sample Occurrence object
			var sampleOccurrence = new Occurrences({
				name: 'New Occurrence'
			});

			// Set the URL parameter
			$stateParams.occurrenceId = '525a8422f6d0f87f0e407a33';

			// Set GET response
			$httpBackend.expectGET(/occurrences\/([0-9a-fA-F]{24})$/).respond(sampleOccurrence);

			// Run controller functionality
			scope.findOne();
			$httpBackend.flush();

			// Test scope value
			expect(scope.occurrence).toEqualData(sampleOccurrence);
		}));

		it('$scope.create() with valid form data should send a POST request with the form input values and then locate to new object URL', inject(function(Occurrences) {
			// Create a sample Occurrence object
			var sampleOccurrencePostData = new Occurrences({
				name: 'New Occurrence'
			});

			// Create a sample Occurrence response
			var sampleOccurrenceResponse = new Occurrences({
				_id: '525cf20451979dea2c000001',
				name: 'New Occurrence'
			});

			// Fixture mock form input values
			scope.name = 'New Occurrence';

			// Set POST response
			$httpBackend.expectPOST('occurrences', sampleOccurrencePostData).respond(sampleOccurrenceResponse);

			// Run controller functionality
			scope.create();
			$httpBackend.flush();

			// Test form inputs are reset
			expect(scope.name).toEqual('');

			// Test URL redirection after the Occurrence was created
			expect($location.path()).toBe('/occurrences/' + sampleOccurrenceResponse._id);
		}));

		it('$scope.update() should update a valid Occurrence', inject(function(Occurrences) {
			// Define a sample Occurrence put data
			var sampleOccurrencePutData = new Occurrences({
				_id: '525cf20451979dea2c000001',
				name: 'New Occurrence'
			});

			// Mock Occurrence in scope
			scope.occurrence = sampleOccurrencePutData;

			// Set PUT response
			$httpBackend.expectPUT(/occurrences\/([0-9a-fA-F]{24})$/).respond();

			// Run controller functionality
			scope.update();
			$httpBackend.flush();

			// Test URL location to new object
			expect($location.path()).toBe('/occurrences/' + sampleOccurrencePutData._id);
		}));

		it('$scope.remove() should send a DELETE request with a valid occurrenceId and remove the Occurrence from the scope', inject(function(Occurrences) {
			// Create new Occurrence object
			var sampleOccurrence = new Occurrences({
				_id: '525a8422f6d0f87f0e407a33'
			});

			// Create new Occurrences array and include the Occurrence
			scope.occurrences = [sampleOccurrence];

			// Set expected DELETE response
			$httpBackend.expectDELETE(/occurrences\/([0-9a-fA-F]{24})$/).respond(204);

			// Run controller functionality
			scope.remove(sampleOccurrence);
			$httpBackend.flush();

			// Test array after successful delete
			expect(scope.occurrences.length).toBe(0);
		}));
	});
}());