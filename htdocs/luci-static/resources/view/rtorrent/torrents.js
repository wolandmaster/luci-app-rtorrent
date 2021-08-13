// Copyright 2014-2021 Sandor Balazsi <sandor.balazsi@gmail.com>
// This is free software, licensed under the Apache License, Version 2.0

'use strict';
'require view';
'require poll';
'require tools.rtorrent as tools';

const compute = new Map([[
	'key', function(key, row) { return row.hash; }], [
	'icon', function(key, row) { return row.customIcon; }], [
	'size', function(key, row) { return row.sizeBytes; }], [
	'expectedChunks', function(key, row) { return row.wantedChunks + row.completedChunks }], [
	'done', function(key, row) {
		if (row.expectedChunks == row.sizeChunks) {
			return 100 * row.bytesDone / row.sizeBytes;
		} else {
			return Math.min(100 * row.completedChunks / row.expectedChunks, 100);
		}
	}], [
	'status', function(key, row) {
		// 1: down, 2: stop, 3: pause, 4: hash, 5: seed
		if (row.hashing > 0) { return 4; }
		else if (row.state == 0) { return 2; }
		else if (row.isActive == 0) { return 3; }
		else if (row.wantedChunks > 0) { return 1; }
		else { return 5; }
	}], [
	'seeder', function(key, row) { return row.peersComplete; }], [
	'leecher', function(key, row) { return row.peersAccounted; }], [
	'download', function(key, row) { return row.downRate; }], [
	'upload', function(key, row) { return row.upRate; }], [
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
	}], [
	'check', function() { return 0; }], [
	'tags', function(key, row) {
		return 'all ' + (row.wantedChunks > 0 ? 'incomplete ' : '') + row.custom1;
	}]
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
		return E('div', { 'title': value + ' B' }, [tools.humanSize(value)]);
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
	'download': function(value) { return tools.humanSpeed(value); },
	'upload': function(value) { return tools.humanSpeed(value); },
	'eta': function(value, key, row) {
		const downloadStarted = (row.timestampStarted != 0)
			? tools.humanDate(row.timestampStarted) : _('not yet started');
		const downloadFinished = (row.timestampFinished != 0)
			? tools.humanDate(row.timestampFinished) : _('not yet finished');
		const text = (value == 0) ? '--' : (value == Infinity) ? '&#8734;' : tools.humanTime(value);
		return E('div', {
			'title': _('Download started') + ': ' + downloadStarted + '\n'
				+ _('Download finished') + ': ' + downloadFinished,
			'class': (value == Infinity || text === '&#8734;') ? 'red' : null
		}, text);
	},
	'check': function(value) {
		return E('input', {
			'class': 'action', 'type': 'checkbox', 'checked': (value == 1) ? 'checked' : null
		});
	}
};

const sort = {
	'name-asc': ['name-asc'],
	'name-desc': ['name-desc'],
	'size-asc': ['size-asc', 'name-asc'],
	'size-desc': ['size-desc', 'name-asc'],
	'done-asc': ['done-asc', 'name-asc'],
	'done-desc': ['done-desc', 'name-asc'],
	'status-asc': ['status-asc', 'download-desc', 'upload-desc', 'name-asc'],
	'status-desc': ['status-desc', 'download-desc', 'upload-desc', 'name-asc'],
	'seeder-asc': ['seeder-asc', 'leecher-asc', 'name-asc'],
	'seeder-desc': ['seeder-desc', 'leecher-desc', 'name-asc'],
	'leecher-asc': ['leecher-asc', 'seeder-asc', 'name-asc'],
	'leecher-desc': ['leecher-desc', 'seeder-desc', 'name-asc'],
	'download-asc': ['download-asc', 'upload-asc', 'name-asc'],
	'download-desc': ['download-desc', 'upload-desc', 'name-asc'],
	'upload-asc': ['upload-asc', 'download-asc', 'name-asc'],
	'upload-desc': ['upload-desc', 'download-desc', 'name-asc'],
	'ratio-asc': ['ratio-asc', 'name-asc'],
	'ratio-desc': ['ratio-desc', 'name-asc'],
	'eta-asc': ['eta-asc', 'name-asc'],
	'eta-desc': ['eta-desc', 'name-asc']
};

const total = {
	'name': function(key, data) {
		return _('TOTAL') + ': ' + data.reduce(count => count += 1, 0) + ' ' + _('pcs.');
	},
	'size':	function(key, data) { return format[key](data.reduce((sum, row) => sum += row[key], 0)); },
	'download': function(key, data) { return format[key](data.reduce((sum, row) => sum += row[key], 0)); },
	'upload': function(key, data) { return format[key](data.reduce((sum, row) => sum += row[key], 0)); }
};

return view.extend({
	'render': function() {
		const params = (new URL(document.location)).searchParams;

		const style = E('style', { 'type': 'text/css' }, [
			'.shrink { width: 1% }',
			'.wrap { word-break: break-all }',
			'.nowrap { white-space: pre }',
			'.red { color: #b20000 }',
			'.orange { color: #cc7000 }',
			'.green { color: #00a100 }',
			'.blue { color: #0000bf }',
			'.active { color: #0069d6 }',
			'.hidden { display: none }',
			'.table .th, .table .td { padding: 10px 6px 9px }',
			'.th:not(:empty) { cursor: pointer }',
			'.tr.table-total .td { font-weight: bold }',
			'.cbi-tab, .cbi-tab-disabled { padding: 4px 6px; cursor: pointer; user-select: none }'
		]);

		const title = E('h2', { 'name': 'content' }, _('Torrents'));

		const table = E('table', { 'class': 'table', 'data-sort': params.get('sort') || 'name-asc' }, [
			E('tr', { 'class': 'tr table-titles' }, [
				E('th', { 'class': 'th shrink', 'data-key': 'icon' }),
				E('th', { 'class': 'th wrap active', 'data-key': 'name', 'data-order': 'asc',
					  'title': 'Sort by name',
					  'click': ev => tools.changeSorting(ev.target, sort) }, [_('Name')]),
				E('th', { 'class': 'th shrink center nowrap', 'data-key': 'size',
					  'title': 'Sort by size', 'data-order': 'desc',
					  'click': ev => tools.changeSorting(ev.target, sort) }, [_('Size')]),
				E('th', { 'class': 'th shrink center', 'data-key': 'done',
					  'title': 'Sort by download percentage', 'data-order': 'desc',
					  'click': ev => tools.changeSorting(ev.target, sort) }, [_('Done')]),
				E('th', { 'class': 'th shrink center', 'data-key': 'status',
					  'title': 'Sort by status', 'data-order': 'asc',
					  'click': ev => tools.changeSorting(ev.target, sort) }, [_('Status')]),
				E('th', { 'class': 'th shrink center', 'data-key': 'seeder',
					  'title': 'Sort by seeder count', 'data-order': 'desc',
					  'click': ev => tools.changeSorting(ev.target, sort) }, '&#9660;'),
				E('th', { 'class': 'th shrink center', 'data-key': 'leecher',
					  'title': 'Sort by leecher count', 'data-order': 'desc',
					  'click': ev => tools.changeSorting(ev.target, sort) }, '&#9650;'),
				E('th', { 'class': 'th shrink center nowrap', 'data-key': 'download',
					  'title': 'Sort by download speed', 'data-order': 'desc',
					  'click': ev => tools.changeSorting(ev.target, sort) }, [_('Download')]),
				E('th', { 'class': 'th shrink center nowrap', 'data-key': 'upload',
					  'title': 'Sort by upload speed', 'data-order': 'desc',
					  'click': ev => tools.changeSorting(ev.target, sort) }, [_('Upload')]),
				E('th', { 'class': 'th shrink center', 'data-key': 'ratio',
					  'title': 'Sort by download/upload ratio', 'data-order': 'desc',
					  'click': ev => tools.changeSorting(ev.target, sort) }, [_('Ratio')]),
				E('th', { 'class': 'th shrink center nowrap', 'data-key': 'eta',
					  'title': 'Sort by Estimated Time of Arrival', 'data-order': 'desc',
					  'click': ev => tools.changeSorting(ev.target, sort) }, [_('ETA')]),
				E('th', { 'data-key': 'check', 'class': 'th shrink center' })
			])
		]);

		const tabs = E('ul', { 'class': 'cbi-tabmenu', 'data-filter': params.get('tab') || 'all' });

		poll.add(() => tools.rtorrentMulticall('d.', '', 'default',
			'hash', 'name', 'hashing', 'state', 'is_active', 'complete',
			'size_bytes', 'bytes_done', 'size_chunks', 'wanted_chunks', 'completed_chunks', 'chunk_size',
			'peers_accounted', 'peers_complete', 'down.rate', 'up.rate', 'ratio', 'up.total',
			'timestamp.started', 'timestamp.finished', 'custom1', 'custom=icon')
			.then(data => {
				tools.updateTable(table,
					tools.computeValues(data, compute),
					tools.formatValues(data, format), _('No torrents added yet.'));
				tools.updateTabs(table, data, tabs, total);
				tools.sortTable(table, sort);
			}), 10);

		return E([], [style, title, tabs, table]);
	},
	'handleSaveApply': null,
	'handleSave': null,
	'handleReset': null
});
