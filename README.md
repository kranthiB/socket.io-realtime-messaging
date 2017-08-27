# socket.io-realtime-messaging

![socket io](https://user-images.githubusercontent.com/20100300/29750280-78e582aa-8b5a-11e7-9423-bccb9fa7dea9.png)


# Why redis-store? (Pub / Sub)
* To handle multi-node instances of NodeJS servers
* Let's suppose , if emit the events directly through socket.io with out redis in-mid, only the connected clients of that particular instance will receive the events. 
* As redis ensures that the same message will get received by all subscribers , this will overcome the above specified problem.

# Issue while running the app in multiple instances
* To have high availabiltiy, requests between client and server will get handled by selecting one of instances of the cluster randomly based on load-balancing algorithm.
* As there will be repeated change of server instances, the socket.io-client connection will get re-connected frequently. If at this re-connection stage, subscriber emit the events, there will be possibilty that the corresponding client may loose the events.
* To overcome this, we need to maintain **session affinity or sticky session** 
    * ``` 
          var expressSession = require('express-session');
          var cookieParser = require('cookie-parser');
          var RedisStore = require('connect-redis')(expressSession);
          var redisClient = redis.createClient(redisConnectionUri);
          app.use(cookieParser());
          app.use(expressSession({ key: 'JSESSIONID', secret: 'whatever',
                                 store: new RedisStore({ client: redisClient})}));
      ```
      
# Sample output (after deploying the app in IBM-Bluemix - 2 instances)
![realtime-message-viewer](https://user-images.githubusercontent.com/20100300/29750858-e95879de-8b64-11e7-9a39-9452931ffa79.png)
