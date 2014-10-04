/**
 * @ngdoc service
 * @name vxWamp.$wamp
 * @description
 */
angular.module('vxWamp', [])
    .provider('$wamp', function () {
        'use strict';
        var options;

        return {
            /**
             * $wampProvider
             * @param i
             */
            init: function (i) {
                options = i || {};
            },
            $get: ["$rootScope", "$q", function ($rootScope, $q) {
                var callbackQueue = [], connection;
                var onChallengeDeferred = $q.defer();

                var onchallenge = function (session, method, extra) {

                    $rootScope.$broadcast("$wamp.onchallenge", {
                        promise: onChallengeDeferred,
                        session: session,
                        method: method,
                        extra: extra
                    });

                    return onChallengeDeferred.promise;
                };

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
            }]
        };

    });