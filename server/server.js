'use strict';

var loopback = require('loopback');
var boot = require('loopback-boot');

var app = module.exports = loopback();


var cfEnv = require('cfenv');
var appEnv = cfEnv.getAppEnv();
var port = appEnv.port || 3000;
var bind = appEnv.bind || '0.0.0.0'
var services = appEnv.services;
var redis_services = services["compose-for-redis"];
var credentials = redis_services[0].credentials;
var credentials1 = redis_services[1].credentials;

var instanceId = appEnv.app && appEnv.app != null ? appEnv.app.instance_id : undefined;
var applicationId = appEnv.app && appEnv.app != null ? appEnv.app.application_id : undefined;
app.get('/instanceId', function(req, res) {
  if(!instanceId) {
    res.writeHeader(204);
    res.end();
  } else {
    res.end(JSON.stringify({
      id : instanceId
    }));
  }
});

app.get('/applicationId', function(req, res) {
  if(!applicationId) {
    res.writeHeader(204);
    res.end();
  } else {
    res.end(JSON.stringify({
      id : applicationId
    }));
  }
});


var redis = require('redis');

var expressSession = require('express-session');
var cookieParser = require('cookie-parser');
var RedisStore = require('connect-redis')(expressSession);
var redisClient = redis.createClient(credentials1.uri);
app.use(cookieParser());
app.use(expressSession({ key: 'JSESSIONID', secret: 'whatever', store: new RedisStore({ client: redisClient})}));

var subscriber = redis.createClient(credentials.uri);
subscriber.on("error", function(err) {
 console.error('There was an error with the redis client ' + err);
});
var publisher = redis.createClient(credentials.uri);
publisher.on("error", function(err) {
 console.error('There was an error with the redis client ' + err);
});

subscriber.subscribe('averageTime');
subscriber.subscribe('bounceRate');


var opts = {};
var messageHubService = services['messagehub'][0];
opts.brokers = messageHubService.credentials.kafka_brokers_sasl;
opts.username = messageHubService.credentials.user;
opts.password = messageHubService.credentials.password;
opts.calocation = '/etc/ssl/certs';


var redis = require("redis")

app.start = function() {
  // start the web server
  return app.listen(port, bind, function() {
    app.emit('started');
    var baseUrl = app.get('url').replace(/\/$/, '');
    console.log('Web server listening at: %s', baseUrl);
    if (app.get('loopback-component-explorer')) {
      var explorerPath = app.get('loopback-component-explorer').mountPath;
      console.log('Browse your REST API at %s%s', baseUrl, explorerPath);
    }
  });
};


var producer;
var consumer;
var consumerLoop;

// Bootstrap the application, configure models, datasources and middleware.
// Sub-apps like REST API are mounted via boot scripts.
boot(app, __dirname, function(err) {
  if (err) throw err;

  // start the server if `$ node server.js`
  if (require.main === module) {

    app.io = require('socket.io')(app.start(), {'pingInterval': 1000, 'pingTimeout': 4000});

    subscriber.on('message', function(channel, msg) {
      app.io.sockets.emit(channel, msg);
    });

    app.io.on('connection', function (socket) {
      socket.on('connect', function(){
        console.log('user connected');
      });
      socket.on('disconnect', function(){
        console.log('user disconnected');
      });
    });
    var Kafka = require('node-rdkafka');
    var options = {
      'metadata.broker.list': opts.brokers,
      'security.protocol': 'sasl_ssl',
      'ssl.ca.location': opts.calocation,
      'sasl.mechanisms': 'PLAIN',
      'sasl.username': opts.username,
      'sasl.password': opts.password,
      'api.version.request': true
    };
    var consumer_opts = {
      'client.id': 'socket-io-message-viewer-consumer',
      'group.id': 'socket-io-message-viewer-group'
      //'debug': 'cgrp,topic,fetch'
    };
    var producer_opts = {
      'client.id': 'socket-io-message-viewer-producer',
      'dr_msg_cb': true
    };
    for (var key in options) {
      consumer_opts[key] = options[key];
      producer_opts[key] = options[key];
    }

    //var socketIOEmitter = require('socket.io-emitter')(credentials.uri);

    consumer = new Kafka.KafkaConsumer(consumer_opts);
    consumer.on('event.error', function(err) {
      console.error('Error from consumer:' + JSON.stringify(err));
    });
    consumer.on('ready', function() {
      consumer.subscribe(['averageTime', 'bounceRate']);
      consumer.consume();
    });
    consumer.on('data', function(data) {
      publisher.publish(data.topic, data.value.toString());
      //socketIOEmitter.emit(data.topic, data.value.toString());
    });
    consumer.connect();

    producer = new Kafka.Producer(producer_opts);
    producer.setPollInterval(100);
    producer.on('event.error', function(err) {
      console.error('Error from producer:' + JSON.stringify(err));
    });
    producer.on('delivery-report', function(err, dr) {
      if (err) {
        console.error('Delivery report: Failed sending message ' + dr.value);
        console.error(err);
      }
    });
    producer.on('ready', function() {
      var topicOpts = {
        'request.required.acks': -1,
        'produce.offset.report': true
      };
      var averageTimeTopic = producer.Topic('averageTime', topicOpts);
      var counter = 0;
      sendMessages(counter, averageTimeTopic, 0);
      var bounceRateTopic = producer.Topic('bounceRate', topicOpts);
      sendMessages(counter, bounceRateTopic, 0);
    });
    producer.connect();

  }
});


function sendMessages(counter, topic, partition){
  var randomNumber = Math.floor((Math.random() * 100) + 1);
  var message = new Buffer(randomNumber.toString());
  var key = 'Key';
  var timeout = 3000;
  try {
    producer.produce(topic, partition, message, key);
    counter++;
  } catch (err) {
    console.error('Failed sending message ' + message);
    console.error(err);
    timeout = 5000; // Longer wait before retrying
  }
  setTimeout(function () {
    if (producer.isConnected()) {
      sendMessages(counter, topic, partition);
    }
  }, timeout);
}

function shutdown(retcode) {
  if (producer && producer.isConnected()) {
    producer.disconnect();
  }
  if (consumer && consumer.isConnected()) {
    consumer.disconnect();
  }
  clearInterval(consumerLoop);
  process.exit(retcode);
}
