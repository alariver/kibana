define(function (require, module, exports) {
  var _ = require('lodash');

  require('directives/table');
  require('./field_chooser');
  require('services/saved_searches');
  require('utils/mixins');

  var app = require('modules').get('app/discover');

  var intervals = [
    { display: '', val: null },
    { display: 'Hourly', val: 'hourly' },
    { display: 'Daily', val: 'daily' },
    { display: 'Weekly', val: 'weekly' },
    { display: 'Monthly', val: 'monthly' },
    { display: 'Yearly', val: 'yearly' }
  ];

  app.controller('discover', function ($scope, config, $q, $routeParams, savedSearches, courier) {
    var source;
    if ($routeParams.id) {
      source = savedSearches.get($routeParams.id);
    } else {
      source = savedSearches.create();
    }

    $scope.opts = {
      // number of records to fetch, then paginate through
      sampleSize: 500,
      // max length for summaries in the table
      maxSummaryLength: 100
    };

    // stores the complete list of fields
    $scope.fields = null;

    // stores the fields we want to fetch
    $scope.columns = null;

    // index pattern interval options
    $scope.intervals = intervals;
    $scope.interval = $scope.intervals[0];

    // the index to use when they don't specify one
    config.$watch('discover.defaultIndex', function (val) {
      if (!val) return config.set('discover.defaultIndex', '_all');
      if (!$scope.index) {
        $scope.index = val;
        $scope.fetch();
      }
    });

    source
      .$scope($scope)
      .inherits(courier.rootSearchSource)
      .on('results', function (res) {
        if (!$scope.fields) getFields();

        $scope.rows = res.hits.hits;
      });

    $scope.sort = ['_score', 'desc'];

    $scope.getSort = function () {
      return $scope.sort;
    };

    $scope.setSort = function (field, order) {
      var sort = {};
      sort[field] = order;
      source.sort([sort]);
      $scope.sort = [field, order];
      $scope.fetch();
    };

    $scope.fetch = function () {
      if (!$scope.fields) getFields();
      source
        .size($scope.opts.sampleSize)
        .query(!$scope.query ? null : {
          query_string: {
            query: $scope.query
          }
        });

      if ($scope.index !== source.get('index')) {
        // set the index on the data source
        source.index($scope.index);
        // clear the columns and fields, then refetch when we do a search
        $scope.columns = $scope.fields = null;
      }

      // fetch just this datasource
      source.fetch();
    };

    var activeGetFields;
    function getFields() {
      var defer = $q.defer();

      if (activeGetFields) {
        activeGetFields.then(function () {
          defer.resolve();
        });
        return;
      }

      var currentState = _.transform($scope.fields || [], function (current, field) {
        current[field.name] = {
          display: field.display
        };
      }, {});

      source
        .getFields()
        .then(function (fields) {
          if (!fields) return;

          $scope.fields = [];
          $scope.columns = $scope.columns || [];

          _(fields)
            .keys()
            .sort()
            .each(function (name) {
              var field = fields[name];
              field.name = name;

              _.defaults(field, currentState[name]);
              $scope.fields.push(field);
            });

          refreshColumns();
          defer.resolve();
        }, defer.reject);

      return defer.promise.then(function () {
        activeGetFields = null;
      });
    }

    $scope.toggleField = function (name) {
      var field = _.find($scope.fields, { name: name });

      // toggle the display property
      field.display = !field.display;

      if ($scope.columns.length === 1 && $scope.columns[0] === '_source') {
        $scope.columns = [name];
      } else {
        $scope.columns = _.toggleInOut($scope.columns, name);
      }

      refreshColumns();
    };

    $scope.refreshFieldList = function () {
      source.clearFieldCache(function () {
        getFields(function () {
          $scope.fetch();
        });
      });
    };

    function refreshColumns() {
      // Get all displayed field names;
      var fields = _.pluck(_.filter($scope.fields, function (field) {
        return field.display;
      }), 'name');

      // Make sure there are no columns added that aren't in the displayed field list.
      $scope.columns = _.intersection($scope.columns, fields);

      // If no columns remain, use _source
      if (!$scope.columns.length) {
        $scope.columns.push('_source');
      }
    }

    $scope.$emit('application.load');
  });
});