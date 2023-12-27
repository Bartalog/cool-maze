import Pusher from 'pusher-js';

// See https://dashboard.pusher.com/apps/197093/keys
let coolMazePusherAppKey = 'e36002cfca53e4619c15';

let pusher, pusherChannel;

function initPusher() {
  pusher = new Pusher(coolMazePusherAppKey, {
    encrypted: true
  });
  pusherChannel = null;
}

function listenToPusherChannel(channelName, handler) {
  pusherChannel = pusher.subscribe(channelName);
  pusherChannel.bind('maze-scan', function(data) {
    console.debug('maze-scan');
    data.event = 'maze-scan';
    handler(data);
  });
  pusherChannel.bind('maze-pre-cast', function(data) {
    console.debug('maze-pre-cast');
    data.event = 'maze-pre-cast';
    handler(data);
  });
  pusherChannel.bind('maze-cast', function(data) {
    console.debug('maze-cast');
    data.event = 'maze-cast';
    handler(data);
  });
  pusherChannel.bind('maze-error', function(data) {
    console.debug('maze-error');
    data.event = 'maze-error';
    handler(data);
  });

    // Provide the "close channel" function
    return quitPusherChannel;
}

function quitPusherChannel() {
  console.debug("Closing Pusher channel");
  if( !pusher  )
    return;
  if( pusher.connection.state !== "connected" ) {
    console.debug("Not closing Pusher channel because Pusher state: " + pusher.connection.state);
    return;
  }
  pusher.disconnect();
}

export const Init = initPusher;
export const ListenToChannel = listenToPusherChannel;