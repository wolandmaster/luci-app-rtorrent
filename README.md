# luci-app-rtorrent
rTorrent frontend for OpenWrt's LuCI web interface

## Install instructions

### Install rtorrent-rpc
```
opkg update
opkg install rtorrent-rpc screen
```
### Create rTorrent config file

#### Minimal _/root/.rtorrent.rc_ file (don't forget to update the paths!):
```
directory = /downloads/
session = /downloads/session/

scgi_port = 127.0.0.1:6000
```

### Create _/etc/init.d/rtorrent_ autostart script
```
#!/bin/sh /etc/rc.common

START=99
STOP=99

start() {
  HOME=/root screen -dmS rtorrent nice -19 rtorrent
}

boot() {
  start "$@"
}

stop() {
  killall rtorrent
}
```

### Start rtorrent
```
mkdir -p /downloads/session/
chmod +x /etc/init.d/rtorrent
/etc/init.d/rtorrent enable
/etc/init.d/rtorrent start
```
