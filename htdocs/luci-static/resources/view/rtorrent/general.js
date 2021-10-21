// Copyright 2014-2021 Sandor Balazsi <sandor.balazsi@gmail.com>
// This is free software, licensed under the Apache License, Version 2.0

'use strict';
'require baseclass';
'require poll';
'require ui';
'require tools.rtorrent as tools';

const compute = new Map([[
	'key', function(key, row) {
		return Object.keys(row)[0];
	}], [
	'value', function(key, row) {
		return row[row.key];
	}]
]);

const format = {
	'key': function(value) {
		return {
			'hash': _('Hash'),
			'customUrl': _('Torrent URL'),
			'timestampStarted': _('Download started'),
			'timestampFinished': _('Download finished'),
			'message': _('Message'),
			'custom1': _('Tags'),
			'customComment': _('Comment')
		}[value] || value;
	},
	'value': function(value, key, row) {
		return {
			'customUrl': value
				? E('a', { 'href': tools.urlDecode(value) }, tools.urlDecode(value))
				: _('Unknown, added by an uploaded torrent file or magnet URI'),
			'timestampStarted': value > 0 ? tools.humanDate(value) : _('not yet started'),
			'timestampFinished': value > 0 ? tools.humanDate(value) : _('not yet finished'),
			'custom1': E('input', { 'type': 'text', 'value': tools.urlDecode(value) }),
			'customComment': E('textarea', { 'rows': '5' }, tools.urlDecode(value))
		}[row.key] || value;
	}
};

const action = {
	'custom1': function(hash, value) {
		return tools.rtorrentCall('d.custom1.set', hash, value);
	},
	'customComment': function(hash, value) {
		return tools.rtorrentCall('d.custom.set', hash, 'comment', tools.urlEncode(value));
	}
};

return baseclass.extend({
	'name': function() {
		return 'General';
	},
	'update': function(hash, title, table) {
		tools.rtorrentBatchcall(['d.hash=' + hash, 'd.name=' + hash], ['d.custom=' + hash + ',url'],
			['d.timestamp.started=' + hash], ['d.timestamp.finished=' + hash], ['d.message=' + hash],
			['d.custom1=' + hash], ['d.custom=' + hash + ',comment']
		).then(torrent => {
			if (title.textContent === hash) {
				title.textContent = torrent[0].name;
			}
			tools.updateTable(table,
				tools.computeValues(torrent, compute), tools.formatValues(torrent, format));
			tools.updateRowStyle(table);
		});
	},
	'render': function(hash, tabs) {
		const style = E('style', { 'type': 'text/css' }, [
			'.hidden { display: none }',
			'input[type="text"] { width: 40% !important }',
			'textarea { width: 80% }'
		]);

		const title = E('h3', hash);

		const table = E('table', { 'class': 'table' }, [
			E('tr', { 'class': 'tr table-titles hidden' }, [
				E('th', { 'class': 'th', 'data-key': 'key' }),
				E('th', { 'class': 'th', 'data-key': 'value' })
			])
		]);

		const actions = E('div', { 'class': 'right' }, [
			E('input', {
				'class': 'btn cbi-button important cbi-button-save',
				'type': 'button', 'value': _('Save'),
				'click': () => table.querySelectorAll('input, textarea').forEach(element => {
					if (element.value !== tools.urlDecode(element.parentNode.dataset.raw)) {
						action[element.closest('.tr').dataset.key](hash, element.value);
					}
				})
			}), ' ',
			E('button', { 'class': 'btn', 'click': L.bind(this.dismiss, this) }, _('Dismiss'))
		]);

		this.pollFn = L.bind(this.update, this, hash, title, table);
		this.pollFn();
		poll.add(this.pollFn, 10);

		return E([], [style, title, tabs, table, actions]);
	},
	'dismiss': function() {
		ui.hideModal();
		if (this.pollFn) {
			poll.remove(this.pollFn);
			this.pollFn = null;
		}
	}
});
