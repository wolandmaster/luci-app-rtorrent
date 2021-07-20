// Copyright 2014-2021 Sandor Balazsi <sandor.balazsi@gmail.com>
// This is free software, licensed under the Apache License, Version 2.0

'use strict';
'require view';
'require poll';
'require tools.rtorrent as tools';

return view.extend({
	render: function() {
		var table = E('table', { 'class': 'table' }, [
			E('tr', { 'class': 'tr table-titles' }, [
				E('th', { 'class': 'th' }, [ _('Name') ]),
				E('th', { 'class': 'th' }, [ _('Size') ]),
				E('th', { 'class': 'th' }, [ _('Status') ]),
				E('th', { 'class': 'th' }, [ _('Down Speed') ]),
				E('th', { 'class': 'th' }, [ _('Up Speed') ]),
				E('th', { 'class': 'th' }, [ _('Ratio') ])
			])
		]);

		poll.add(function() {
			tools.rtorrentCall('d.multicall2', '', 'default',
				'd.name=', 'd.size_bytes=', 'd.state=', 'd.down.rate=', 'd.up.rate=', 'd.ratio=')
				.then(data => cbi_update_table(table, data, E('em', _('No torrents added yet.'))));
		}, 10);

		return table;
	},
	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
