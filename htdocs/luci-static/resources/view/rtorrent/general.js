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
		return {
			'state': row.hashing > 0 ? 'hash' : row.state === 0 ? 'stop'
				: row.isActive === 0 ? 'pause' : 'start'
		}[row.key] || row[row.key];
	}]]);

const format = {
	'key': function(value) {
		return {
			'hash': _('Hash'),
			'customUrl': _('Torrent URL'),
			'timestampStarted': _('Download started'),
			'timestampFinished': _('Download finished'),
			'state': _('State'),
			'message': _('Message'),
			'custom1': _('Tags'),
			'customComment': _('Comment')
		}[value] || value;
	},
	'value': function(value, key, row) {
		const highlightChange = {
			'change': ev => ev.target.style.borderColor =
				(ev.target.value !== tools.urlDecode(ev.target.parentNode.dataset.raw)) ? '#4a4' : null
		};
		const optionAttr = (v, e) => (v === e) ? { 'value': v, 'selected': 'selected' } : { 'value': v };
		return {
			'customUrl': value
				? E('a', { 'href': tools.urlDecode(value) }, tools.urlDecode(value))
				: _('Unknown, added by an uploaded torrent file or magnet URI'),
			'timestampStarted': (value > 0) ? tools.humanDate(value) : _('not yet started'),
			'timestampFinished': (value > 0) ? tools.humanDate(value) : _('not yet finished'),
			'state': E('select', { ...highlightChange }, [
				E('option', optionAttr('start', value), _('Start')),
				E('option', optionAttr('pause', value), _('Pause')),
				E('option', optionAttr('stop', value), _('Stop')),
				E('option', optionAttr('hash', value), _('Check hash')),
				E('option', optionAttr('remove', value), _('Remove')),
				E('option', optionAttr('purge', value), _('Remove and delete from disk'))
			]),
			'custom1': E('input', { 'type': 'text', 'value': tools.urlDecode(value), ...highlightChange }),
			'customComment': E('textarea', {
				'rows': '5', 'style': 'width: 80%', ...highlightChange
			}, tools.urlDecode(value))
		}[row.key] || value;
	}
};

const action = {
	'custom1': function(hash, value) {
		return tools.rtorrentCall('d.custom1.set', hash, value).then(result => {
			if (result === value) tools.addNotification(E('h4', _('Torrent tags updated.')));
		});
	},
	'customComment': function(hash, value) {
		return tools.rtorrentCall('d.custom.set', hash, 'comment', tools.urlEncode(value)).then(result => {
			if (result === 0) tools.addNotification(E('h4', _('Torrent comment updated.')));
		});
	},
	'state': function(hash, value, pollFn, dismiss, torrentActions) {
		torrentActions[value]([hash]).then(() => {
			if (value === 'remove' || value === 'purge') { dismiss(); } else { pollFn(); }
		});
	}
};

return baseclass.extend({
	'name': function() { return 'General'; },
	'update': function(hash, title, table) {
		tools.rtorrentBatchcall(['d.hash=' + hash, 'd.name=' + hash], ['d.custom=' + hash + ',url'],
			['d.timestamp.started=' + hash], ['d.timestamp.finished=' + hash],
			['d.state=' + hash, 'd.hashing=' + hash, 'd.is_active=' + hash],
			['d.message=' + hash], ['d.custom1=' + hash], ['d.custom=' + hash + ',comment']
		).then(torrent => {
			if (title.textContent === tools.loadingText()) { title.textContent = torrent[0].name; }
			tools.updateTable(table,
				tools.computeValues(compute, torrent), tools.formatValues(format, torrent));
			tools.updateRowStyle(table);
		});
	},
	'render': function(hash, tabs, { torrentActions = '' } = {}) {
		const title = E('h3', tools.loadingText());

		const table = E('table', { 'class': 'table' }, [
			E('tr', { 'class': 'tr table-titles hidden' }, [
				E('th', { 'class': 'th', 'data-key': 'key' }),
				E('th', { 'class': 'th', 'data-key': 'value' })
			])
		]);

		this.pollFn = L.bind(this.update, this, hash, title, table);
		this.pollFn();
		poll.add(this.pollFn, 10);

		const actions = E('div', { 'class': 'cbi-page-actions' }, [
			E('input', {
				'class': 'btn cbi-button cbi-button-add', 'style': 'float: none',
				'type': 'button', 'value': _('Save'),
				'click': () => table.querySelectorAll('input, textarea, select').forEach(element => {
					if (element.value !== tools.urlDecode(element.parentNode.dataset.raw)) {
						action[element.closest('.tr').dataset.key](hash, element.value,
							this.pollFn, L.bind(this.dismiss, this), torrentActions);
					}
				})
			}), ' ',
			E('input', {
				'class': 'btn cbi-button', 'style': 'float: none',
				'type': 'button', 'value': _('Dismiss'),
				'click': L.bind(this.dismiss, this)
			})
		]);

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
