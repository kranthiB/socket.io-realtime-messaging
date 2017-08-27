# socket.io-realtime-messaging

![socket io](https://user-images.githubusercontent.com/20100300/29750280-78e582aa-8b5a-11e7-9423-bccb9fa7dea9.png)


# Why redis-store? (Pub / Sub)
* To handle multi-node instances of NodeJS servers
* Let's suppose , if emit the events directly through socket.io with out redis in-mid, only the connected clients of that particular instance will receive the events. 
* As redis ensures that the same message will get received by all subscribers , this will overcome the above specified problem.

