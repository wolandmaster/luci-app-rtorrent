// Copyright 2014-2021 Sandor Balazsi <sandor.balazsi@gmail.com>
// This is free software, licensed under the Apache License, Version 2.0

'use strict';
'require view';
'require poll';
'require ui';
'require tools.rtorrent as tools';
'require view.rtorrent.general as general';
'require view.rtorrent.files as files';

const tabViews = [general, files];

const compute = new Map([[
	'key', function(key, row) { return row.hash; }], [
	'icon', function(key, row) { return row.customIcon; }], [
	'size', function(key, row) { return row.sizeBytes; }], [
	'expectedChunks', function(key, row) { return row.wantedChunks + row.completedChunks; }], [
	'done', function(key, row) {
		if (row.expectedChunks === row.sizeChunks) {
			return 100 * row.bytesDone / row.sizeBytes;
		} else {
			return Math.min(100 * row.completedChunks / row.expectedChunks, 100);
		}
	}], [
	'status', function(key, row) {
		// 1: down, 2: stop, 3: pause, 4: hash, 5: seed
		if (row.hashing > 0) return 4;
		else if (row.state === 0) return 2;
		else if (row.isActive === 0) return 3;
		else if (row.wantedChunks > 0) return 1;
		else return 5;
	}], [
	'seeder', function(key, row) { return row.peersComplete; }], [
	'leecher', function(key, row) { return row.peersAccounted; }], [
	'download', function(key, row) { return row.downRate; }], [
	'upload', function(key, row) { return row.upRate; }], [
	'eta', function(key, row) {
		// 0: already done, Infinity: infinite
		if (row.wantedChunks === 0) {
			return 0;
		} else if (row.downRate > 0) {
			if (row.expectedChunks === row.sizeChunks) {
				return (row.sizeBytes - row.bytesDone) / row.downRate;
			} else {
				return row.wantedChunks * row.chunkSize / row.downRate;
			}
		} else {
			return Infinity;
		}
	}], [
	'checked', function() { return 0; }], [
	'tags', function(key, row) { return 'all ' + (row.wantedChunks > 0 ? 'incomplete ' : '') + row.custom1; }]
]);

const format = {
	'icon': function(value) {
		return E('img', {
			'src': L.resource('icons/loading.gif'), 'data-src': value,
			'onerror': 'this.src=\'' + L.resource('icons/unknown_tracker.svg') + '\'',
			'width': '16', 'height': '16', 'title': tools.getDomain(value)
		});
	},
	'name': function(value, key, row) {
		if (key) {
			return E('div', {
				'class': 'link', 'click': () => ui.showModal(null, general.render(row.hash,
					tools.buildTorrentTabs(row.hash, general.name, tabViews)))
			}, value);
		} else {
			return value;
		}
	},
	'size': function(value) { return E('div', { 'title': value + ' B' }, [tools.humanSize(value)]); },
	'done': function(value) { return value.toFixed(1) + '%'; },
	'status': function(value) {
		return {
			1: E('div', { 'class': 'green' }, _('down')),
			2: E('div', { 'class': 'red' }, _('stop')),
			3: E('div', { 'class': 'orange' }, _('pause')),
			4: E('div', { 'class': 'green' }, _('hash')),
			5: E('div', { 'class': 'blue' }, _('seed'))
		}[value] || E('div', {}, _('unknown'));
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
		const downloadStarted = (row.timestampStarted !== 0)
			? tools.humanDate(row.timestampStarted) : _('not yet started');
		const downloadFinished = (row.timestampFinished !== 0)
			? tools.humanDate(row.timestampFinished) : _('not yet finished');
		const text = (value === 0) ? '--' : (value === Infinity) ? '&#8734;' : tools.humanTime(value);
		return E('div', {
			'title': _('Download started') + ': ' + downloadStarted + '\n'
				+ _('Download finished') + ': ' + downloadFinished,
			'class': (value === Infinity || text === '&#8734;') ? 'red' : null
		}, text);
	},
	'checked': function(value) {
		return E('input', {
			'class': 'action', 'type': 'checkbox', 'checked': (value === 1) ? 'checked' : null,
			'change': ev => tools.updateCheckbox(ev.target)
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
		return _('TOTAL') + ': ' + data.reduce(count => count + 1, 0) + ' ' + _('pcs.');
	},
	'size': function(key, data) { return data.reduce((sum, row) => sum + row[key], 0); },
	'download': function(key, data) { return data.reduce((sum, row) => sum + row[key], 0); },
	'upload': function(key, data) { return data.reduce((sum, row) => sum + row[key], 0); },
	'checked': function() { return 0; }
};

const action = {
	'start': function(keys) {
		return tools.rtorrentBatchcall(...keys.map(hash => [
			'd.state=' + hash, 'd.is_active=' + hash
		])).then(statuses => tools.rtorrentBatchcall(...keys.reduce((commands, hash, i) => {
			if (statuses[i].state === 0) {
				commands.push(['d.name=' + hash, 'd.start=' + hash]);
			} else if (statuses[i].isActive === 0) {
				commands.push(['d.name=' + hash, 'd.resume=' + hash]);
			}
			return commands;
		}, [[]]))).then(results => results.forEach(result => {
			if (result.start === 0) {
				ui.addNotification(null, '<p>' + _('Started') + ' <i>' + result.name + '</i></p>');
			} else if (result.resume === 0) {
				ui.addNotification(null, '<p>' + _('Resumed') + ' <i>' + result.name + '</i></p>');
			}
		}));
	},
	'pause': function(keys) {
		return tools.rtorrentBatchcall([], ...keys.map(hash => [
			'd.name=' + hash, 'd.state=' + hash, 'd.is_active=' + hash,
			'd.start=' + hash, 'd.pause=' + hash
		])).then(results => results.forEach(result => {
			if ((result.state === 0 || result.isActive === 1) && result.start === 0 && result.pause === 0) {
				ui.addNotification(null, '<p>' + _('Paused') + ' <i>' + result.name + '</i></p>');
			}
		}));
	},
	'stop': function(keys) {
		return tools.rtorrentBatchcall([], ...keys.map(hash => [
			'd.name=' + hash, 'd.state=' + hash, 'd.stop=' + hash, 'd.close=' + hash
		])).then(results => results.forEach(result => {
			if (result.state === 1 && result.stop === 0 && result.close === 0) {
				ui.addNotification(null, '<p>' + _('Stopped') + ' <i>' + result.name + '</i></p>');
			}
		}));
	},
	'hash': function(keys) {
		return tools.rtorrentBatchcall([], ...keys.map(hash => [
			'd.name=' + hash, 'd.check_hash=' + hash
		])).then(results => results.forEach(result => {
			if (result.checkHash === 0) {
				ui.addNotification(null, '<p>' + _('Checking hashes of')
					+ ' <i>' + result.name + '</i></p>');
			}
		}));
	},
	'remove': function(keys) {
		return tools.rtorrentBatchcall([], ...keys.map(hash => [
			'd.name=' + hash, 'd.close=' + hash, 'd.erase=' + hash
		])).then(results => results.forEach(result => {
			if (result.close === 0 && result.erase === 0) {
				ui.addNotification(null, '<p>' + _('Removed') + ' <i>' + result.name + '</i></p>');
			}
		}));
	},
	'purge': function(keys) {
		return tools.rtorrentBatchcall([], ...keys.map(hash => [
			'd.name=' + hash, 'd.custom5.set=' + hash + ',1', 'd.close=' + hash, 'd.erase=' + hash
		])).then(results => results.forEach(result => {
			if (result.close === 0 && result.erase === 0) {
				ui.addNotification(null, '<p>' + _('Erased') + ' <i>' + result.name + '</i></p>');
			}
		}));
	}
};

return view.extend({
	'update': function(tabs, table) {
		tools.rtorrentMulticall('d.', '', 'default',
			'hash', 'name', 'hashing', 'state', 'is_active', 'complete',
			'size_bytes', 'bytes_done', 'size_chunks', 'wanted_chunks', 'completed_chunks', 'chunk_size',
			'peers_accounted', 'peers_complete', 'down.rate', 'up.rate', 'ratio', 'up.total',
			'timestamp.started', 'timestamp.finished', 'custom1', 'custom=icon')
			.then(data => {
				tools.updateTable(table,
					tools.computeValues(data, compute),
					tools.formatValues(data, format), _('No torrents added yet.'));
				tools.updateTabs(table, data, tabs, total, format);
				tools.sortTable(table, sort);
				tools.updateRowStyle(table);
			});
	},
	'render': function() {
		const params = tools.getParams('torrents');

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
			'.cbi-tab, .cbi-tab-disabled { padding: 4px 6px; cursor: pointer; user-select: none }',
			'.modal { max-width: 900px !important }',
			'div.link:hover { cursor: pointer; color: #0069d6 }'
		]);

		const title = E('h2', { 'name': 'content' }, _('Torrent List'));

		const tabs = E('ul', { 'class': 'cbi-tabmenu', 'data-filter': params.get('tab') || 'all' });

		const table = E('table', { 'class': 'table', 'data-sort': params.get('sort') || 'name-asc' }, [
			E('tr', { 'class': 'tr table-titles' }, [
				E('th', { 'class': 'th shrink', 'data-key': 'icon' }),
				E('th', {
					'class': 'th wrap active', 'data-key': 'name', 'data-order': 'asc',
					'title': _('Sort by name'),
					'click': ev => tools.changeSorting(ev.target, sort)
				}, _('Name')),
				E('th', {
					'class': 'th shrink center nowrap', 'data-key': 'size',
					'title': _('Sort by size'), 'data-order': 'desc',
					'click': ev => tools.changeSorting(ev.target, sort)
				}, _('Size')),
				E('th', {
					'class': 'th shrink center', 'data-key': 'done',
					'title': _('Sort by download percentage'), 'data-order': 'desc',
					'click': ev => tools.changeSorting(ev.target, sort)
				}, _('Done')),
				E('th', {
					'class': 'th shrink center', 'data-key': 'status',
					'title': _('Sort by status'), 'data-order': 'asc',
					'click': ev => tools.changeSorting(ev.target, sort)
				}, _('Status')),
				E('th', {
					'class': 'th shrink center', 'data-key': 'seeder',
					'title': _('Sort by seeder count'), 'data-order': 'desc',
					'click': ev => tools.changeSorting(ev.target, sort)
				}, '&#9660;'),
				E('th', {
					'class': 'th shrink center', 'data-key': 'leecher',
					'title': _('Sort by leecher count'), 'data-order': 'desc',
					'click': ev => tools.changeSorting(ev.target, sort)
				}, '&#9650;'),
				E('th', {
					'class': 'th shrink center nowrap', 'data-key': 'download',
					'title': _('Sort by download speed'), 'data-order': 'desc',
					'click': ev => tools.changeSorting(ev.target, sort)
				}, _('Download')),
				E('th', {
					'class': 'th shrink center nowrap', 'data-key': 'upload',
					'title': _('Sort by upload speed'), 'data-order': 'desc',
					'click': ev => tools.changeSorting(ev.target, sort)
				}, _('Upload')),
				E('th', {
					'class': 'th shrink center', 'data-key': 'ratio',
					'title': _('Sort by download/upload ratio'), 'data-order': 'desc',
					'click': ev => tools.changeSorting(ev.target, sort)
				}, _('Ratio')),
				E('th', {
					'class': 'th shrink center nowrap', 'data-key': 'eta',
					'title': _('Sort by Estimated Time of Arrival'), 'data-order': 'desc',
					'click': ev => tools.changeSorting(ev.target, sort)
				}, _('ETA')),
				E('th', {
					'class': 'th shrink center', 'data-key': 'checked'
				})
			])
		]);

		const actionsComboButton = new ui.ComboButton('start', {
			'start': _('Start'),
			'pause': _('Pause'),
			'stop': _('Stop'),
			'hash': _('Check hash'),
			'remove': _('Remove'),
			'purge': _('Remove and delete from disk')
		}, {
			'name': 'cbi.action',
			'sort': ['start', 'pause', 'stop', 'hash', 'remove', 'purge'],
			'classes': {
				'start': 'btn cbi-button important cbi-button-save',
				'pause': 'btn cbi-button important cbi-button-apply',
				'stop': 'btn cbi-button important cbi-button-apply',
				'hash': 'btn cbi-button important cbi-button-apply',
				'remove': 'btn cbi-button important cbi-button-negative',
				'purge': 'btn cbi-button important cbi-button-negative'
			},
			'click': (ev, choice) => {
				const checked = Array.from(table.querySelectorAll(
					'.tr[data-key]:not(.hidden) input[type=checkbox].action:checked'))
					.map(cb => cb.closest('.tr').dataset.key);
				if (checked.length === 0) {
					alert(_('No torrent selected!') + '\n'
						+ _('Please use the checkbox at the end of the torrents.'));
				} else {
					action[choice](checked).then(() => {
						this.update(tabs, table);
						actionsComboButton.setValue('start');
					});
				}
			}
		});
		const actions = E('div', { 'class': 'cbi-page-actions' }, [actionsComboButton.render(), ' ',
			E('input', {
				'class': 'cbi-button cbi-button-reset', 'type': 'reset', 'value': _('Reset'),
				'click': () => {
					table.querySelectorAll('input[type=checkbox].action')
						.forEach(cb => {
							cb.checked = false;
							cb.indeterminate = false;
						});
					actionsComboButton.setValue('start');
				}
			})
		]);

		poll.add(() => this.update(tabs, table), 10);
		document.addEventListener('keydown', (event) => {
			if (event.key === 'Escape') {
				tabViews.forEach(view => view.dismiss());
			}
		});

		return E([], [style, title, tabs, table, actions]);
	},
	'handleSaveApply': null,
	'handleSave': null,
	'handleReset': null
});
