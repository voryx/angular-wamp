(function () {
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
         *      - `use_deferred`: `{callable=}` - if provided, use this deferred constructor, e.g. jQuery.Deferred or Q.defer (default: $q.defer)
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

        this.$get = function ($rootScope, $q, $log) {

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
             *  Events
             *
             *  There are four events that $wamp can broadcast:
             *      1)  $wamp.open - is sent when the WAMP connection opens.
             *
             *              $scope.$on("$wamp.open", function (event, session) {
             *                  // Do something
             *              });
             *
             *      2)  $wamp.close - is sent when the WAMP connection closes.
             *
             *              $scope.$on("$wamp.close", function (event, info) {
             *                  // info.reason: wamp close reason
             *                  // info.details: wamp close details
             *              });
             *
             *      3)  $wamp.error - is sent when an error occurs while trying to make a call, publish or register
             *
             *              $scope.$on("$wamp.error", function (event, error) {
             *                  // error: Autobahn.Error object
             *              });
             *
             *      4)  $wamp.onchallenge
             *
             *              $scope.$on("$wamp.onchallenge", function (event, info) {
             *                  // info.promise: promise to return to wamp,
             *                  // info.session: wamp session,
             *                  // info.method: auth method,
             *                  // info.extra: extra
             *
             *                  //ie. wamp-cra
             *                  var key =  autobahn.auth_cra.derive_key("da_password", info.extra.salt);
             *                  return info.promise.resolve(autobahn.auth_cra.sign(key, info.extra.challenge));
             *              });
             *
             */

            var connection;
            var sessionDeferred = $q.defer();
            var sessionPromise = sessionDeferred.promise;

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

                var onChallengeDeferred = $q.defer();

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

            options = angular.extend({onchallenge: digestWrapper(onchallenge), use_deferred: $q.defer}, options);

            connection = new autobahn.Connection(options);
            connection.onopen = digestWrapper(function (session) {
                $log.debug("Congrats!  You're connected to the WAMP server!");
                $rootScope.$broadcast("$wamp.open", session);
                sessionDeferred.resolve();
            });

            connection.onclose = digestWrapper(function (reason, details) {
                $log.debug("Connection Closed: ", reason, details);
                $rootScope.$broadcast("$wamp.close", {reason: reason, details: details});
            });


            /**
             * Subscription object which self manages reconnections
             * @param topic
             * @param handler
             * @param options
             * @param subscribedCallback
             * @returns {{}}
             * @constructor
             */
            var Subscription = function (topic, handler, options, subscribedCallback) {

                var subscription = {}, unregister, onOpen, deferred = $q.defer();

                handler = digestWrapper(handler);

                onOpen = function () {
                    var p = connection.session.subscribe(topic, handler, options).then(
                        function (s) {
                            subscription = angular.extend(s, subscription);
                            deferred.resolve(subscription);
                            return s;
                        }
                    );
                    if (subscribedCallback) {
                        subscribedCallback(p);
                    }

                };

                if (connection.isOpen) {
                    onOpen();
                }

                unregister = $rootScope.$on("$wamp.open", onOpen);

                subscription.promise = deferred.promise;
                subscription.unsubscribe = function () {
                    unregister(); //Remove the event listener, so this object can get cleaned up by gc
                    return connection.session.unsubscribe(subscription);
                };

                return subscription;
            };

            return {
                connection: connection,
                open: function () {
                    //If using WAMP CRA we need to get the authid before the connection can be opened.
                    if (options.authmethods && options.authmethods.indexOf('wampcra') !== -1 && !options.authid) {
                        $log.debug("You're using WAMP CRA.  The authid must be set on $wamp before the connection can be opened, ie: $wamp.setAuthId('john.doe')");
                    } else {
                        connection.open();
                    }
                },
                setAuthId: function (authid, open) {
                    options.authid = authid;
                    if (open) connection.open();
                },
                close: function () {
                    connection.close();
                },
                subscribe: function (topic, handler, options, subscribedCallback) {
                    return Subscription(topic, handler, options, subscribedCallback).promise;
                },
                unsubscribe: function (subscription) {
                    return subscription.unsubscribe();
                },
                publish: function (topic, args, kwargs, options) {

                    var deferred = $q.defer();

                    sessionPromise.then(
                        function () {
                            var publishPromise = connection.session.publish(topic, args, kwargs, options);

                            if (publishPromise) {
                                publishPromise
                                    .then(function (publication) {
                                        deferred.resolve(publication);
                                    })
                                    .catch(function (error) {
                                        deferred.reject(error);
                                        $rootScope.$broadcast("$wamp.error", error);
                                        $log.error("$wamp.publish error", error);
                                    });
                            }
                            else {
                                deferred.resolve(true);
                            }
                        }
                    );

                    return deferred.promise;
                },
                register: function (procedure, endpoint, options) {

                    endpoint = digestWrapper(endpoint);

                    var deferred = $q.defer();

                    sessionPromise.then(function () {
                            connection.session.register(procedure, endpoint, options)
                                .then(function (registration) {
                                    deferred.resolve(registration);
                                })
                                .catch(function (error) {
                                    deferred.reject(error);
                                    $rootScope.$broadcast("$wamp.error", error);
                                    $log.error("$wamp.register error", error);
                                });
                        }
                    );

                    return deferred.promise;
                },
                call: function (procedure, args, kwargs, options) {

                    var deferred = $q.defer();

                    sessionPromise.then(function () {
                        connection.session.call(procedure, args, kwargs, options)
                            .then(function (result) {
                                deferred.resolve(result);
                            })
                            .catch(function (error) {
                                deferred.reject(error);
                                $rootScope.$broadcast("$wamp.error", error);
                                $log.error("$wamp.call error", error);
                            });
                    });

                    return deferred.promise;
                }
            };
        };

        return this;

    }
})();
