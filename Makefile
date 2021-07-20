# Copyright 2014-2021 Sandor Balazsi <sandor.balazsi@gmail.com>
# This is free software, licensed under the Apache License, Version 2.0

include $(TOPDIR)/rules.mk

LUCI_TITLE:=rTorrent frontend for LuCI interface
LUCI_DEPENDS:=+luasocket
LUCI_PKGARCH:=all

PKG_MAINTAINER:=Sandor Balazsi <sandor.balazsi@gmail.com>
PKG_LICENSE:=Apache-2.0

include ../../luci.mk

# call BuildPackage - OpenWrt buildroot signature
