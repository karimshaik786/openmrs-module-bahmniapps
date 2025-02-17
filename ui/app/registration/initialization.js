'use strict';

angular.module('bahmni.registration').factory('initialization',
    ['$rootScope', '$q', 'configurations', 'authenticator', 'appService', 'spinner', 'preferences', 'locationService', 'mergeService', '$translate',
        function ($rootScope, $q, configurations, authenticator, appService, spinner, preferences, locationService, mergeService, $translate) {
            var getConfigs = function () {
                var configNames = ['encounterConfig', 'patientAttributesConfig', 'identifierTypesConfig', 'addressLevels', 'genderMap', 'relationshipTypeConfig', 'relationshipTypeMap', 'loginLocationToVisitTypeMapping', 'registrationSMSToggle', 'helpDeskNumber', 'quickLogoutComboKey'];
                return configurations.load(configNames)
                    .then(loadPatientAttributeTypes)
                    .then(function (patientAttributeTypes) {
                        $rootScope.regEncounterConfiguration = angular.extend(new Bahmni.Registration.RegistrationEncounterConfig(), configurations.encounterConfig());
                        $rootScope.encounterConfig = angular.extend(new EncounterConfig(), configurations.encounterConfig());
                        $rootScope.patientConfiguration = new Bahmni.Registration.PatientConfig(patientAttributeTypes.attributeTypes,
                        configurations.identifierTypesConfig(), appService.getAppDescriptor().getConfigValue("patientInformation"));
                        $rootScope.regEncounterConfiguration.loginLocationToVisitTypeMap = configurations.loginLocationToVisitTypeMapping();

                        $rootScope.addressLevels = configurations.addressLevels();
                        $rootScope.fieldValidation = appService.getAppDescriptor().getConfigValue("fieldValidation");
                        $rootScope.genderMap = configurations.genderMap();
                        $rootScope.registrationSMSToggle = configurations.registrationSMSToggle();
                        if ($rootScope.registrationSMSToggle) {
                            $rootScope.helpDeskNumber = configurations.helpDeskNumber();
                        }
                        Bahmni.Common.Util.GenderUtil.translateGender($rootScope.genderMap, $translate);
                        $rootScope.relationshipTypeMap = configurations.relationshipTypeMap();
                        $rootScope.relationshipTypes = configurations.relationshipTypes();
                        $rootScope.quickLogoutComboKey = configurations.quickLogoutComboKey() || 'Escape';
                    });
            };

            var loadPatientAttributeTypes = function () {
                var mandatoryPersonAttributes = appService.getAppDescriptor().getConfigValue("mandatoryPersonAttributes");
                var patientAttributeTypes = new Bahmni.Common.Domain.AttributeTypeMapper().mapFromOpenmrsAttributeTypes(configurations.patientAttributesConfig(), mandatoryPersonAttributes, {}, $rootScope.currentUser.userProperties.defaultLocale);

                return Promise.all(patientAttributeTypes.attributeTypes.map(function (attribute) {
                    if (attribute.format !== "org.openmrs.Location") {
                        return Promise.resolve(attribute);
                    }
                    var locationTags = appService.getAppDescriptor().getConfigValue(attribute.name, []);
                    return locationService.getAllByTag(locationTags, "ANY").then(function (response) {
                        return Object.assign({}, attribute, {answers: response.data.results});
                    });
                })).then(function (attributeTypes) {
                    return {
                        attributeTypes: attributeTypes
                    };
                });
            };

            var loadValidators = function (baseUrl, contextPath) {
                var script = baseUrl + contextPath + '/fieldValidation.js';
                Bahmni.Common.Util.DynamicResourceLoader.includeJs(script, false);
            };

            var initApp = function () {
                return appService.initApp('registration', {'app': true, 'extension': true });
            };

            var getIdentifierPrefix = function () {
                preferences.identifierPrefix = appService.getAppDescriptor().getConfigValue("defaultIdentifierPrefix");
            };

            var initAppConfigs = function () {
                $rootScope.registration = $rootScope.registration || {};
                getIdentifierPrefix();
            };

            var mapRelationsTypeWithSearch = function () {
                var relationshipTypeMap = $rootScope.relationshipTypeMap || {};
                if (!relationshipTypeMap.provider) {
                    if (!relationshipTypeMap.patient) {
                        return "person";
                    }
                }
                $rootScope.relationshipTypes.forEach(function (relationshipType) {
                    relationshipType.searchType = (relationshipTypeMap.provider.indexOf(relationshipType.aIsToB) > -1) ? "provider" :
                        (relationshipTypeMap.person.indexOf(relationshipType.aIsToB) > -1) ? "person" : "patient";
                });
            };

            var loggedInLocation = function () {
                return locationService.getLoggedInLocation().then(function (location) {
                    $rootScope.loggedInLocation = location;
                });
            };

            var facilityVisitLocation = function () {
                return locationService.getFacilityVisitLocation().then(function (response) {
                    if (response.uuid) {
                        locationService.getByUuid(response.uuid).then(function (location) {
                            $rootScope.facilityVisitLocation = location;
                        });
                    }
                });
            };

            var mergeFormConditions = function () {
                var formConditions = Bahmni.ConceptSet.FormConditions;
                if (formConditions) {
                    formConditions.rules = mergeService.merge(formConditions.rules, formConditions.rulesOverride);
                }
            };

            var checkPrivilege = function () {
                return appService.checkPrivilege("app:registration");
            };

            return function () {
                return spinner.forPromise(authenticator.authenticateUser()
                .then(initApp)
                .then(checkPrivilege)
                .then(getConfigs)
                .then(initAppConfigs)
                .then(mapRelationsTypeWithSearch)
                .then(loggedInLocation)
                .then(facilityVisitLocation)
                .then(loadValidators(appService.configBaseUrl(), "registration"))
                .then(mergeFormConditions)
            );
            };
        }]
);
