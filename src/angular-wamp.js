'use strict';

/**
 * @ngdoc module
 * @name vxWamp
 * @description
 *
 * # vxWamp
 *
 * The `vxWamp` module provides seamless WAMPv2 integration, by wrapping AutobahnJS, for angular apps.
 *
 * ## Example
 * See {@link $wamp#example $wamp} for an example of configuring and using `vxWamp`.
 *
 *
 * <div doc-module-components="vxWamp"></div>
 */
/* global -vxWampModule */
var vxWampModule = angular.module('vxWamp', []).provider('$wamp', $WampProvider);


/**
 * @ngdoc provider
 * @name $wampProvider
 *
 * @description
 *
 * Used for accessing a WAMP resource.
 *
 * ## Example
 * See {@link $wamp#example $wamp} for an example of configuring and using `vxWamp`.
 *
 * ## Dependencies
 * Requires the {@link vxWamp `vxWamp`} module to be installed.
 */
function $WampProvider() {
    var options;

    /**
     * @ngdoc method
     * @name $wampProvider#init
     *
     * @param {Object} initOptions autobahnJS connection options
     *
     *    Object properties:
     *
     *      Required options:
     *
     *    - `url`: `{string=}` - the WebSocket URL of the WAMP router to connect to, e.g. ws://myserver.com:8080/ws
     *    - `realm`: `{string=}` - The WAMP realm to join, e.g. realm1
     *
     *    Optional options:
     *
     *      Options that control what kind of Deferreds to use:
     *
     *      - `use_es6_promises`: `{boolean=}` - use deferreds based on ES6 promises
     *      - `use_deferred`: `{callable=}` - if provided, use this deferred constructor, e.g. jQuery.Deferred or Q.defer
     *
     *      Options that control automatic reconnection:
     *
     *      - `max_retries`: `{integer=}` - Maximum number of reconnection attempts (default: 15)
     *      - `initial_retry_delay`: `{float=}` - Initial delay for reconnection attempt in seconds (default: 1.5).
     *      - `max_retry_delay`: `{float=}` - Maximum delay for reconnection attempts in seconds (default: 300).
     *      - `retry_delay_growth`: `{float=}` - The growth factor applied to the retry delay between reconnection attempts (default: 1.5).
     *      - `retry_delay_jitter`: `{float=}` - The standard deviation of a Gaussian to jitter the delay on each retry cycle as a fraction of the mean (default: 0.1).
     *
     * @description
     * Configures the AutobhanJS Service
     */
    this.init = function (initOptions) {
        options = initOptions || {};
    };

    this.$get = function ($rootScope, $q) {

        /**
         * @ngdoc service
         * @name $wamp
         *
         * @description
         * `$wamp` give you access to the autobahnJS methods, call, register, subscribe, unsubscribe and publish.
         *
         * Requires the {@link vxWamp `vxWamp`} module to be installed.
         *
         * You can configure the WAMP connection through {@link vxWamp.$wampProvider $wampProvider}'s API.
         *
         * @example
         *
         * app.config(function ($wampProvider) {
         *      $wampProvider.init({
         *          url: 'ws://127.0.0.1:9000/',
         *          realm: 'realm1'
         *      });
         * })
         *
         *  app.controller("MyCtrl", function($scope, $wamp) {
         *
         *      // 1) subscribe to a topic
         *      function onevent(args) {
         *          $scope.hello = args[0];
         *      }
         *      $wamp.subscribe('com.myapp.hello', onevent);
         *
         *      // 2) publish an event
         *      $wamp.publish('com.myapp.hello', ['Hello, world!']);
         *
         *      // 3) register a procedure for remoting
         *      function add2(args) {
         *          return args[0] + args[1];
         *      }
         *      $wamp.register('com.myapp.add2', add2);
         *
         *      // 4) call a remote procedure
         *      $wamp.call('com.myapp.add2', [2, 3]).then(
         *          function (res) {
         *          $scope.add2 = res;
         *      });
         * });
         *
         *
         * @todo write more docs
         */

        var callbackQueue = [], connection;
        var onChallengeDeferred = $q.defer();

        /**
         * @param session
         * @param method
         * @param extra
         * @returns {*}
         *
         * @description
         * Gets called when a Challenge Message is sent by the router
         */
        var onchallenge = function (session, method, extra) {

            $rootScope.$broadcast("$wamp.onchallenge", {
                promise: onChallengeDeferred,
                session: session,
                method: method,
                extra: extra
            });

            return onChallengeDeferred.promise;
        };

        /**
         * @param func
         * @returns {Function}
         *
         * @description
         * Wraps a callback with a function that calls scope.$apply(), so that the callback is added to the digest
         */
        function digestWrapper(func) {
            return function () {
                var cb = func.apply(this, arguments);
                $rootScope.$apply();
                return cb;
            };
        }

        options = angular.extend({onchallenge: onchallenge}, options);

        connection = new autobahn.Connection(options);
        connection.onopen = function (session) {
            console.log("Congrats!  You're connected to the WAMP server!");
            $rootScope.$broadcast("$wamp.open", session);

            //Call any callbacks that were queued up before the connection was established
            var call, resultPromise;

            while (callbackQueue.length > 0) {
                call = callbackQueue.shift();
                resultPromise = $q.when(session[call.method].apply(session, call.args));
                call.promise.resolve(resultPromise);
                console.log("processed queued " + call.method);
            }
        };

        connection.onclose = function (reason, details) {
            console.log("Connection Closed: ", reason);
            $rootScope.$broadcast("$wamp.close", {reason: reason, details: details});

        };


        return {
            connection: connection,
            session: connection.session,
            open: function () {
                connection.open();
            },
            close: function () {
                connection.close();
            },
            subscribe: function (topic, handler, options) {

                handler = digestWrapper(handler);
                if (!connection.isOpen) {
                    var deferred = $q.defer();
                    callbackQueue.push({
                        method: 'subscribe',
                        args: [topic, handler, options],
                        promise: deferred
                    });
                    console.log("connection not open, queuing subscribe");
                    return deferred.promise;
                }
                return $q.when(connection.session.subscribe(topic, handler, options));

            },
            unsubscribe: function (subscription) {

                if (!connection.isOpen) {
                    var deferred = $q.defer();
                    callbackQueue.push({method: 'unsubscribe', args: arguments, promise: deferred});
                    console.log("connection not open, queuing unsbuscribe");
                    return deferred.promise;
                }

                return $q.when(connection.session.unsubscribe(subscription));
            },
            publish: function (topic, args, kwargs, options) {

                if (!connection.isOpen) {
                    var deferred = $q.defer();
                    callbackQueue.push({method: 'publish', args: arguments, promise: deferred});
                    console.log("connection not open, queuing publish");
                    return deferred.promise;
                }

                return $q.when(connection.session.publish(topic, args, kwargs, options));
            },
            register: function (procedure, endpoint, options) {

                endpoint = digestWrapper(endpoint);
                if (!connection.isOpen) {
                    var deferred = $q.defer();
                    callbackQueue.push({
                        method: 'register',
                        args: [procedure, endpoint, options],
                        promise: deferred
                    });
                    console.log("connection not open, queuing register");
                    return deferred.promise;
                }

                return $q.when(connection.session.register(procedure, endpoint, options));
            },
            call: function (procedure, args, kwargs, options) {

                if (!connection.isOpen) {
                    var deferred = $q.defer();
                    callbackQueue.push({method: 'call', args: arguments, promise: deferred});
                    console.log("connection not open, queuing call");
                    return deferred.promise;
                }

                return $q.when(connection.session.call(procedure, args, kwargs, options));
            }
        };
    };

    return this;

}
