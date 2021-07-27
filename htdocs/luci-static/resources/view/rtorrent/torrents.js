// Copyright 2014-2021 Sandor Balazsi <sandor.balazsi@gmail.com>
// This is free software, licensed under the Apache License, Version 2.0

'use strict';
'require view';
'require poll';
'require tools.rtorrent as tools';

document.querySelector('head').appendChild(E('link', {
	'rel': 'stylesheet',
	'type': 'text/css',
	'href': L.resource('view/rtorrent/rtorrent.css')
}));

const compute = new Map([[
	'key', function(key, row) { return row.hash; } ], [
	'icon', function(key, row) { return row.customIcon; } ], [
	'size', function(key, row) { return row.sizeBytes; } ], [
	'expectedChunks', function(key, row) { return row.wantedChunks + row.completedChunks } ], [
	'done', function(key, row) {
		if (row.expectedChunks == row.sizeChunks) {
			return 100 * row.bytesDone / row.sizeBytes;
		} else {
			return Math.min(100 * row.completedChunks / row.expectedChunks, 100);
		}
	} ], [
	'status', function(key, row) {
		// 1: down, 2: stop, 3: pause, 4: hash, 5: seed
		if (row.hashing > 0) { return 4; }
		else if (row.state == 0) { return 2; }
		else if (row.isActive == 0) { return 3; }
		else if (row.wantedChunks > 0) { return 1; }
		else { return 5; }
	} ], [
	'seeder', function(key, row) { return row.peersComplete; } ], [
	'leecher', function(key, row) { return row.peersAccounted; } ], [
	'download', function(key, row) { return row.downRate; } ], [
	'upload', function(key, row) { return row.upRate; } ], [
	'eta', function(key, row) {
		// 0: already done, Infinity: infinite
		if (row.wantedChunks == 0) {
			return 0;
		} else if (row.downRate > 0) {
			if (row.expectedChunks == row.sizeChunks) {
				return (row.sizeBytes - row.bytesDone) / row.downRate;
			} else {
				return row.wantedChunks * row.chunkSize / row.downRate;
			}
		} else {
			return Infinity;
		}
	} ], [
	'check', function(key, row) {
		return 0;
	} ]
])

const format = {
	'icon': function(value) {
		return E('img', {
			'src': L.resource('icons/loading.gif'), 'data-src': value,
			'onerror': "this.src='" + L.resource('icons/unknown_tracker.svg') + "'",
			'width': '16', 'height': '16', 'title': tools.getDomain(value)
		});
	},
	'size': function(value) {
		return E('div', { 'title': value + ' B' }, [ tools.humanSize(value) ]);
	},
	'done': function(value) { return value.toFixed(1) + '%'; },
	'status': function(value) {
		switch (value) {
			case 1: return E('div', { 'class': 'green' }, _('down'));
			case 2: return E('div', { 'class': 'red' }, _('stop'));
			case 3: return E('div', { 'class': 'orange' }, _('pause'));
			case 4: return E('div', { 'class': 'green' }, _('hash'));
			case 5: return E('div', { 'class': 'blue' }, _('seed'));
			default: return E('div', {}, _('unknown'));
		}
	},
	'ratio': function(value, key, row) {
		return E('div', {
			'class': value < 1000 ? 'red' : 'green',
			'title': _('Total uploaded') + ': ' + tools.humanSize(row.upTotal)
		}, (value / 1000).toFixed(2));
	},
	'download': function(value) { return (value / 1000).toFixed(2); },
	'upload': function(value) { return (value / 1000).toFixed(2); },
	'eta': function(value, key, row) {
		const downloadStarted = (row.timestampStarted != 0)
			? tools.humanDate(row.timestampStarted) : _('not yet started');
		const downloadFinished = (row.timestampFinished != 0)
			? tools.humanDate(row.timestampFinished) : _('not yet finished');
		const text = (value == 0) ? '--' : (value == Infinity) ? '&#8734;' : tools.humanTime(value);
		return E('div', {
			'title': _('Download started') + ': ' + downloadStarted + '\n'
				+ _('Download finished') + ': ' + downloadFinished,
			'class': (value == Infinity) ? 'red' : null
		}, text);
	},
	'check': function(value) {
		return E('input', { 'type': 'checkbox', 'checked': (value == 1) ? 'checked' : null });
	}
};

return view.extend({
	'render': function() {
		const table = E('table', { 'class': 'table' }, [
			E('tr', { 'class': 'tr table-titles' }, [
				E('th', { 'data-key': 'icon', 'class': 'th shrink' }),
				E('th', { 'data-key': 'name', 'class': 'th wrap' }, [ _('Name') ]),
				E('th', { 'data-key': 'size', 'class': 'th shrink center nowrap' }, [ _('Size') ]),
				E('th', { 'data-key': 'done', 'class': 'th shrink center' }, [ _('Done') ]),
				E('th', { 'data-key': 'status', 'class': 'th shrink center' }, [ _('Status') ]),
				E('th', { 'data-key': 'seeder', 'class': 'th shrink center' }, '&#9660;'),
				E('th', { 'data-key': 'leecher', 'class': 'th shrink center' }, '&#9650;'),
				E('th', { 'data-key': 'download', 'class': 'th shrink center' }, [ _('DL') ]),
				E('th', { 'data-key': 'upload', 'class': 'th shrink center' }, [ _('UL') ]),
				E('th', { 'data-key': 'ratio', 'class': 'th shrink center' }, [ _('Ratio') ]),
				E('th', { 'data-key': 'eta', 'class': 'th shrink nowrap center' }, [ _('ETA') ]),
				E('th', { 'data-key': 'check', 'class': 'th shrink center' })
			])
		]);

		poll.add(() => tools.rtorrentMulticall('d.', '', 'default',
			'hash', 'name', 'hashing', 'state', 'is_active', 'complete',
			'size_bytes', 'bytes_done', 'size_chunks', 'wanted_chunks', 'completed_chunks', 'chunk_size',
			'peers_accounted', 'peers_complete', 'down.rate', 'up.rate', 'ratio', 'up.total',
			'timestamp.started', 'timestamp.finished', 'custom1', 'custom=icon')
			.then(data => tools.updateTable(table,
				tools.computeValues(data, compute), tools.formatValues(data, format),
				_('No torrents added yet.'))), 10);

		return table;
	},
	'handleSaveApply': null,
	'handleSave': null,
	'handleReset': null
});
