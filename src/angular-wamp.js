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
            $get: function ($rootScope, $q) {
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

                options = angular.extend({onchallenge: onchallenge}, options);

                connection = new autobahn.Connection(options);
                connection.onopen = function (session) {
                    //Call any callbacks that were queued up before the connection was established
                    var call;
                    while (callbackQueue.length > 0) {
                        call = callbackQueue.shift();
                        call.method.apply(call.object, call.args);
                    }

                    console.log("Congrats!  You're connected to the WAMP server!");
                    $rootScope.$broadcast("$wamp.open", session);

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

                        if (!connection.isOpen) {
                            callbackQueue.push({object: this, method: this.subscribe, args: [topic, handler, options]});
                        } else {
                            return $q.when(connection.session.subscribe(topic, handler, options));
                        }

                        return $q.defer().promise;
                    },
                    unsubscribe: function (subscription) {

                        if (!connection.isOpen) {
                            callbackQueue.push({object: this, method: this.unsubscribe, args: [subscription]});
                        } else {
                            return $q.when(connection.session.unsubscribe(subscription));
                        }

                        return $q.defer().promise;
                    },
                    publish: function (topic, args, kwargs, options) {

                        if (!connection.isOpen) {
                            callbackQueue.push({
                                object: this,
                                method: this.publish,
                                args: [topic, args, kwargs, options]
                            });
                        } else {
                            return $q.when(connection.session.publish(topic, args, kwargs, options));
                        }

                        return $q.defer().promise;
                    },
                    register: function (procedure, endpoint, options) {

                        if (!connection.isOpen) {
                            callbackQueue.push({
                                object: this,
                                method: this.register,
                                args: [procedure, endpoint, options]
                            });
                        } else {
                            return $q.when(connection.session.register(procedure, endpoint, options));
                        }

                        return $q.defer().promise;
                    },
                    call: function (procedure, args, kwargs, options) {

                        if (!connection.isOpen) {
                            callbackQueue.push({
                                object: this,
                                method: this.call,
                                args: [procedure, args, kwargs, options]
                            });
                        } else {
                            return $q.when(connection.session.call(procedure, args, kwargs, options));
                        }

                        return $q.defer().promise;
                    }
                };
            }
        };

    });