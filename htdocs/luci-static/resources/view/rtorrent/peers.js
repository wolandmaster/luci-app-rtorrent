// Copyright 2014-2022 Sandor Balazsi <sandor.balazsi@gmail.com>
// This is free software, licensed under the Apache License, Version 2.0

'use strict';
'require baseclass';
'require poll';
'require ui';
'require tools.rtorrent as tools';

return baseclass.extend({
	'name': function() { return 'Peers'; },
	'update': function(hash, title) {
		if (title.textContent === tools.loadingText()) {
			tools.rtorrentCall('d.name', hash).then(name => title.textContent = name);
		}
	},
	'render': function(hash, tabs) {
		const title = E('h3', tools.loadingText());

		const table = E('h4', 'TODO');

		const actions = E('div', { 'class': 'right' }, [
			E('button', { 'class': 'btn', 'click': L.bind(this.dismiss, this) }, _('Dismiss'))
		]);

		this.pollFn = L.bind(this.update, this, hash, title);
		this.pollFn();
		poll.add(this.pollFn, 10);

		return E([], [title, tabs, table, actions]);
	},
	'dismiss': function() {
		ui.hideModal();
		if (this.pollFn) {
			poll.remove(this.pollFn);
			this.pollFn = null;
		}
	}
});
